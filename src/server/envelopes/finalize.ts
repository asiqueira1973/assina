// Finalização do envelope — critério 8.6 e regra 11.10. Roda quando o envelope entra em
// 'finalizando' (logo depois da última assinatura) e na faxina (retentativas, rota no 8.13):
//  1. reserva o envelope no banco (um finalizador por vez; a tentativa conta aqui, então uma
//     finalização que cai ou estoura o tempo também conta — regra 11.10);
//  2. lê o original e confere o SHA-256 contra hash_original (senão: 'integridade_violada',
//     falha definitiva com alerta ao admin, e o envelope não conclui);
//  3. grava os campos (11.3), anexa o manifesto (11.9) e sela (11.10, B-T ou B-B);
//  4. calcula o hash_final, sobe {conta}/{envelope}/final-{reserva}.pdf (caminho da tentativa: um
//     finalizador atrasado nunca grava por cima do final de outro);
//  5. as_fn_conclui_envelope: concluido, eventos finalizado e concluido, e-mails e webhook na
//     mesma transação;
//  6. depois do commit, manda os e-mails de conclusão.
// Qualquer exceção vira as_fn_falha_finalizacao (só para a própria reserva); na 3ª tentativa,
// sai o alerta ao admin.
// Nada de nome, e-mail ou título em log: só o código do erro.
import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { copy } from "@/lib/copy";
import { ASSINATURA_PNG_MAX_BYTES, FINALIZACAO_TENTATIVAS, LIMITE_ARQUIVO_BYTES } from "@/lib/limits";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";
import { storage } from "@/server/files/storage";
import { sendNotice } from "@/server/notifications/notices";
import { embedFonts } from "@/server/pdf/fonts";
import { appendManifest, type ManifestData } from "@/server/pdf/manifest";
import { sealCredentialsFromEnv, sealPdf } from "@/server/pdf/seal";
import { stampFields, type SignerMarks, type StampField } from "@/server/pdf/stamp";

export type FinalizeResult = "concluido" | "falhou" | "ocupado";

// Erro de finalização com código estável; "definitiva" pula as retentativas.
class FinalizeError extends Error {
  constructor(public code: string, public definitive = false) {
    super(code);
  }
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// Lê uma imagem de assinatura do armazenamento. Devolve: os bytes ou undefined (sem caminho).
async function readMark(path: string | null): Promise<Uint8Array | undefined> {
  if (!path) return undefined;
  const bytes = await storage().read(path, ASSINATURA_PNG_MAX_BYTES);
  if (!bytes) throw new FinalizeError("imagem_ausente");
  return bytes;
}

// Monta o PDF final (passos 2 a 4). Recebe: o envelope. Devolve: bytes, nível do selo, hash,
// caminho e o momento da conclusão impresso no manifesto.
async function buildFinal(envelopeId: string, reserva: string) {
  const { data: e, error } = await db()
    .from("as_envelopes")
    .select("id, conta_id, titulo, status, arquivo_original_path, hash_original, codigo_verificacao, enviado_em, as_contas!inner(nome, email)")
    .eq("id", envelopeId)
    .single();
  if (error) throw error;
  if (e.status !== "finalizando") throw new FinalizeError("status_mudou");
  if (!e.arquivo_original_path || !e.hash_original || !e.enviado_em) throw new FinalizeError("integridade_violada", true);

  // Passo 1: o original tem de ser exatamente o que foi enviado.
  const original = await storage().read(e.arquivo_original_path, LIMITE_ARQUIVO_BYTES);
  if (!original || sha256(original) !== e.hash_original) throw new FinalizeError("integridade_violada", true);

  const [{ data: signers, error: sErr }, { data: fields, error: fErr }, { data: events, error: evErr }] = await Promise.all([
    db()
      .from("as_signatarios")
      .select("id, papel, ordem, nome, email, status, cpf, ip_assinatura, assinado_em, assinatura_texto, assinatura_imagem_path, rubrica_texto, rubrica_imagem_path")
      .eq("envelope_id", e.id)
      .order("ordem")
      .order("criado_em"),
    db().from("as_campos").select("tipo, pagina, x, y, largura, altura, valor, signatario_id").eq("envelope_id", e.id),
    db().from("as_eventos").select("seq, tipo, ator, signatario_id, ip, ocorrido_em").eq("envelope_id", e.id).order("seq"),
  ]);
  if (sErr || fErr || evErr) throw sErr ?? fErr ?? evErr;
  const assinantes = signers!.filter((s) => s.papel === "assinar");
  if (!assinantes.length || assinantes.some((s) => s.status !== "assinou" || !s.assinado_em)) throw new FinalizeError("assinatura_pendente", true);

  // Marcas de cada assinante: imagem desenhada ou texto em cursiva.
  const marks: SignerMarks = new Map();
  for (const s of assinantes) {
    marks.set(s.id, {
      assinatura: { texto: s.assinatura_texto ?? undefined, png: await readMark(s.assinatura_imagem_path) },
      rubrica: { texto: s.rubrica_texto ?? undefined, png: await readMark(s.rubrica_imagem_path) },
    });
  }

  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const fonts = await embedFonts(doc);
  await stampFields(doc, fields!.map((f) => ({ ...f, x: Number(f.x), y: Number(f.y), largura: Number(f.largura), altura: Number(f.altura) })) as StampField[], marks, fonts);

  const byId = new Map(signers!.map((s) => [s.id, s]));
  const quem = (ev: { ator: string; signatario_id: string | null }) => {
    if (ev.signatario_id) return byId.get(ev.signatario_id)?.nome ?? copy.manifest.none;
    if (ev.ator === "remetente") return e.as_contas.nome;
    return ev.ator === "api" ? copy.manifest.actors.api : ev.ator === "mcp" ? copy.manifest.actors.mcp : copy.manifest.actors.sistema;
  };
  const concluidoEm = new Date();
  const data: ManifestData = {
    titulo: e.titulo,
    remetente: { nome: e.as_contas.nome, email: e.as_contas.email },
    codigo: e.codigo_verificacao,
    hash_original: e.hash_original,
    enviado_em: e.enviado_em,
    concluido_em: concluidoEm.toISOString(),
    assinantes: assinantes.map((s) => ({
      nome: s.nome,
      email: s.email,
      cpf: s.cpf,
      ip: s.ip_assinatura as string | null,
      assinado_em: s.assinado_em!,
      assinatura: marks.get(s.id)!.assinatura,
    })),
    copias: signers!.filter((s) => s.papel === "copia").map((s) => ({ nome: s.nome, email: s.email })),
    eventos: events!.map((ev) => ({ ocorrido_em: ev.ocorrido_em, tipo: ev.tipo as keyof typeof copy.events, quem: quem(ev), ip: ev.ip as string | null })),
    site: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  };
  await appendManifest(doc, data, fonts);

  const { bytes, level } = await sealPdf(doc, sealCredentialsFromEnv(), process.env.SELO_TSA_URL);
  return { bytes, level, hash: sha256(bytes), path: `${e.conta_id}/${e.id}/final-${reserva}.pdf`, concluidoEm };
}

// Finaliza o envelope (critério 8.6). Recebe: o id. Devolve: "concluido", "falhou" (falha
// registrada) ou "ocupado" (outro finalizador está nele, não está em finalizando, ou acabaram as
// tentativas). Nunca lança: a falha fica no banco e a faxina retenta.
export async function finalizeEnvelope(envelopeId: string): Promise<FinalizeResult> {
  const { data: claim, error: rErr } = await db()
    .rpc("as_fn_reserva_finalizacao", { p_envelope_id: envelopeId, p_max_tentativas: FINALIZACAO_TENTATIVAS })
    .single();
  if (rErr) {
    console.error("finalizacao_reserva_falhou", errorCode(rErr));
    return "falhou";
  }
  const { resultado, reserva } = claim as { resultado: string; reserva: string | null };
  // A última tentativa caiu sem registrar falha (timeout, queda): o alerta sai agora.
  if (resultado === "esgotado_alerta") await safeNotice(`finalizacao_falhou_admin:${envelopeId}`);
  if (resultado !== "ok" || !reserva) return "ocupado";

  let written: string | null = null;
  try {
    const final = await buildFinal(envelopeId, reserva);
    await storage().write(final.path, final.bytes, "application/pdf");
    written = final.path;
    const { error } = await db().rpc("as_fn_conclui_envelope", {
      p_envelope_id: envelopeId,
      p_reserva: reserva,
      p_caminho: final.path,
      p_hash_final: final.hash,
      p_selo: final.level,
      p_concluido_em: final.concluidoEm.toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    const code = errorCode(e);
    console.error("finalizacao_falhou", code);
    // O arquivo desta tentativa não vale. Exceção: a conclusão gravou no banco e só a resposta se
    // perdeu — aí o arquivo é o do envelope concluído e fica (achado do verifier, 2ª rodada).
    if (written) {
      const { data: now } = await db().from("as_envelopes").select("arquivo_final_path").eq("id", envelopeId).maybeSingle();
      if (now && now.arquivo_final_path !== written) await storage().delete(written).catch(() => undefined);
    }
    const { data, error } = await db()
      .rpc("as_fn_falha_finalizacao", {
        p_envelope_id: envelopeId,
        p_reserva: reserva,
        p_erro: code,
        p_max_tentativas: FINALIZACAO_TENTATIVAS,
        p_definitiva: e instanceof FinalizeError && e.definitive,
      })
      .single();
    if (error) console.error("finalizacao_falha_nao_registrada", errorCode(error));
    else if ((data as { alerta: boolean }).alerta) await safeNotice(`finalizacao_falhou_admin:${envelopeId}`);
    return "falhou";
  }

  // Depois do commit: os e-mails de conclusão. Falha aqui não desfaz nada; a faxina retenta.
  const { data: notes } = await db().from("as_notificacoes").select("chave").eq("envelope_id", envelopeId).in("tipo", ["concluido_destinatario", "concluido_remetente"]);
  for (const n of notes ?? []) await safeNotice(n.chave);
  return "concluido";
}

async function safeNotice(chave: string) {
  try {
    await sendNotice(chave);
  } catch (e) {
    console.error("aviso_pos_commit_falhou", errorCode(e));
  }
}

// Retenta as finalizações paradas (faxina, regra 11.10; rota do cron no 8.13): todo envelope em
// 'finalizando'. A reserva decide: tenta se há tentativa sobrando, ou manda o alerta que faltou
// quando a última caiu sem registrar falha. Recebe: contas a limitar (testes). Devolve: quantos concluíram.
export async function retryFinalizations(opts: { contaIds?: string[] } = {}): Promise<number> {
  let q = db().from("as_envelopes").select("id").eq("status", "finalizando");
  if (opts.contaIds) q = q.in("conta_id", opts.contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let done = 0;
  for (const row of data ?? []) if ((await finalizeEnvelope(row.id)) === "concluido") done++;
  return done;
}
