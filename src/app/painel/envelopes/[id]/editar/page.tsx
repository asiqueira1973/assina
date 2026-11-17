// [Remetente] Editar rascunho — épico 8.2, passos 4 a 7: arquivo, título, mensagem, quem recebe,
// ordem, prazo e lembrete, com salvamento automático. Lê só o envelope da conta da sessão
// (outra conta → 404). Envelope que já saiu de rascunho não se edita (princípio 2): volta à lista
// até o detalhe existir (8.7).
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DraftEditor } from "@/features/envelopes/components/draft-editor";
import draft from "@/features/envelopes/components/draft.module.css";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getEnvelope, getSigners } from "@/server/envelopes/drafts";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/painel/envelopes/[id]/editar">;

// Carrega o rascunho e os destinatários e monta o editor.
async function Editor({ params, searchParams }: Props) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const { id } = await params;
  const envelope = await getEnvelope(account.id, id);
  if (!envelope) notFound();
  if (envelope.status !== "rascunho") redirect("/painel");
  const signers = await getSigners(account.id, id);
  const { aviso } = await searchParams;

  return (
    <DraftEditor
      envelopeId={envelope.id}
      initialSettings={{
        titulo: envelope.titulo,
        mensagem: envelope.mensagem ?? "",
        em_ordem: envelope.em_ordem,
        prazo_dias: envelope.prazo_dias,
        lembrete_cada_dias: envelope.lembrete_cada_dias,
      }}
      initialFile={envelope.paginas ? { nome: envelope.nome_arquivo ?? "", paginas: envelope.paginas, tamanho: envelope.tamanho_bytes ?? 0 } : null}
      initialSigners={signers.map((s) => ({ key: s.id, nome: s.nome, email: s.email, papel: s.papel, exigir_cpf: s.exigir_cpf }))}
      alreadySigned={aviso === "ja_assinado"}
    />
  );
}

export default function EditarEnvelopePage(props: Props) {
  return (
    <div className={draft.page}>
      <Suspense fallback={<div className={draft.fileCard} aria-busy="true" />}>
        <Editor {...props} />
      </Suspense>
    </div>
  );
}
