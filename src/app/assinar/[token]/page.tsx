// [Signatário] Assinar — épico 8.5 e seção 6.2. O servidor resolve o link e o estado:
// - inválido ("Este link não é válido.") ou de conta suspensa ("Este documento não está disponível.");
// - estados finais da seção 15 (recusado, cancelado, prazo terminou, concluído com download
//   até 30 dias, já assinou com o status dos outros, ainda não é a vez);
// - ativo: o fluxo do cliente (código → consentimento → documento). O conteúdo do PDF só vem
//   depois do código (o cliente só pede /documento com a sessão).
// noindex e no-referrer vêm de next.config.ts (seção 6.2).
import { Suspense } from "react";
import { cookies } from "next/headers";
import { SignerFlow } from "@/features/signing/components/signer-flow";
import styles from "@/features/signing/components/signing.module.css";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { maskEmail } from "@/lib/mask";
import { signerCookieName, verifySignerSession } from "@/server/auth/signer-session";
import { db } from "@/server/db/client";
import { loadSignerByToken } from "@/server/signing/context";
import { signerPageState } from "@/server/signing/state";

type Props = PageProps<"/assinar/[token]">;

// Cartão de estado final: título e, opcionalmente, um texto e um botão.
function StateCard({ title, text, action, children }: { title: string; text?: string; action?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>{copy.appName}</p>
        <h1 className={styles.stateTitle}>{title}</h1>
        {text ? <p className={styles.muted}>{text}</p> : null}
        {children}
        {action ? (
          // Download por rota de API (302 para a URL assinada): <a> de propósito.
          <a className={styles.primary} href={action.href}>
            {action.label}
          </a>
        ) : null}
      </div>
    </main>
  );
}

async function Signer({ params }: Props) {
  const { token } = await params;
  const ctx = await loadSignerByToken(token);
  const state = await signerPageState(ctx);
  switch (state.kind) {
    case "invalido":
      return <StateCard title={copy.signer.invalidLink} />;
    case "indisponivel":
      return <StateCard title={copy.signer.unavailable} />;
    case "concluido":
      return state.download ? (
        <StateCard title={copy.signer.completed} action={{ href: `/api/assinar/${token}/documento?versao=final`, label: copy.signer.download }} />
      ) : (
        <StateCard title={copy.signer.completed} text={copy.signer.askSender(ctx!.sender.nome)} />
      );
    case "cancelado":
      return <StateCard title={copy.signer.canceledBy(ctx!.sender.nome)} />;
    case "recusado_por_mim":
      return <StateCard title={copy.signer.declined(ctx!.sender.nome)} />;
    case "recusado":
      return <StateCard title={copy.signer.declinedBy(state.nome)} />;
    case "expirado":
      return <StateCard title={copy.signer.expired} />;
    case "ja_assinou":
      return (
        <StateCard title={copy.signer.alreadySigned} text={copy.signer.signedNext}>
          <ul className={styles.others}>
            {state.others.map((o) => (
              <li key={o.id}>
                <span>{o.nome}</span>
                <span className={styles.muted}>{o.status === "assinou" && o.assinado_em ? copy.status.signerSigned(formatDateTime(o.assinado_em)) : copy.status.signerWaiting}</span>
              </li>
            ))}
          </ul>
        </StateCard>
      );
    case "pendente":
      return <StateCard title={copy.signer.notYourTurn} />;
  }
  // Estado "ativo" só sai com contexto válido (signerPageState devolve "invalido" sem ele).
  const { signer, envelope, sender, tokenHash } = ctx!;

  // Ativo: o cliente conduz. Só o necessário para os passos; nada do conteúdo do documento.
  const jar = await cookies();
  const hasSession = !!(await verifySignerSession(jar.get(signerCookieName(signer.id))?.value, signer.id, tokenHash));
  const { data: fields } = await db().from("as_campos").select("id, tipo, pagina, x, y, largura, altura, obrigatorio, rotulo").eq("signatario_id", signer.id).order("pagina").order("y");
  const { data: order } = await db().from("as_signatarios").select("id").eq("envelope_id", envelope.id).eq("papel", "assinar").order("ordem");
  const colorIndex = Math.max(0, (order ?? []).findIndex((s) => s.id === signer.id));

  return (
    <SignerFlow
      token={token}
      senderName={sender.nome}
      title={envelope.titulo}
      maskedEmail={maskEmail(signer.email)}
      signerName={signer.nome}
      requireCpf={signer.exigir_cpf}
      hasSession={hasSession}
      colorIndex={colorIndex}
      pages={(envelope.dimensoes_paginas as { l: number; a: number }[] | null) ?? []}
      fields={(fields ?? []).map((f) => ({ ...f, x: Number(f.x), y: Number(f.y), largura: Number(f.largura), altura: Number(f.altura) }))}
    />
  );
}

export default function AssinarPage(props: Props) {
  return (
    <Suspense fallback={<main className={styles.page} aria-busy="true" />}>
      <Signer {...props} />
    </Suspense>
  );
}
