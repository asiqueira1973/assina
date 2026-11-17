// Modelos de e-mail — seção 15.2 (textos) e 16 (HTML simples, botão azul em pílula, rodapé
// discreto; versão em texto puro junto). O conteúdo do documento nunca entra, só o título que o
// remetente deu (regra 11.16). Todo valor vindo do usuário é escapado no HTML.
import "server-only";
import { copy } from "@/lib/copy";

// Escapa texto para HTML.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Moldura HTML comum. Recebe: título grande, parágrafos (já escapados) e o botão.
function layout(title: string, paragraphs: string[], button?: { label: string; url: string }): string {
  const btn = button
    ? `<p style="margin:28px 0"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#0071e3;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5">${p}</p>`).join("\n")}
${btn}
<p style="margin:40px 0 0;font-size:12px;color:#6e6e73">${esc(copy.email.footer)}</p>
</div></body></html>`;
}

export type RenderedEmail = { subject: string; html: string; text: string };

// Convite para assinar (seção 15.2, tipo convite).
export function inviteEmail(p: { remetente: string; titulo: string; mensagem: string | null; link: string; prazo: string }): RenderedEmail {
  const subject = copy.email.invite.subject(p.remetente, p.titulo);
  const title = copy.email.invite.title(p.remetente);
  const paragraphs = [`<strong>${esc(p.titulo)}</strong>`];
  if (p.mensagem) paragraphs.push(esc(p.mensagem).replace(/\n/g, "<br>"));
  paragraphs.push(esc(copy.email.invite.deadline(p.prazo)));
  const text = [title, "", p.titulo, ...(p.mensagem ? ["", p.mensagem] : []), "", copy.email.invite.deadline(p.prazo), "", `${copy.email.invite.button}: ${p.link}`, "", copy.email.footer].join("\n");
  return { subject, html: layout(title, paragraphs, { label: copy.email.invite.button, url: p.link }), text };
}

// Código de acesso (seção 15.2, tipo codigo). Sem link: o código basta (regra 11.4).
export function codeEmail(p: { codigo: string; remetente: string }): RenderedEmail {
  const subject = copy.emailNotices.code.subject(p.codigo);
  const body = copy.emailNotices.code.body(p.codigo, p.remetente);
  return {
    subject,
    html: layout(subject, [`<span style="font-size:32px;font-weight:700;letter-spacing:0.15em">${esc(p.codigo)}</span>`, esc(body)]),
    text: [subject, "", body, "", copy.email.footer].join("\n"),
  };
}

// Aviso ao remetente: alguém assinou (seção 15.2, tipo assinou_remetente).
export function signedNoticeEmail(p: { nome: string; titulo: string; assinaram: number; total: number; link: string }): RenderedEmail {
  const subject = copy.emailNotices.signed.subject(p.nome, p.titulo);
  const progress = copy.emailNotices.signed.progress(p.assinaram, p.total);
  return {
    subject,
    html: layout(subject, [esc(progress)], { label: copy.detail.open, url: p.link }),
    text: [subject, "", progress, "", p.link, "", copy.email.footer].join("\n"),
  };
}

// Aviso ao remetente: alguém recusou, com o motivo (tipo recusado_remetente).
export function declinedSenderEmail(p: { nome: string; titulo: string; motivo: string; link: string }): RenderedEmail {
  const subject = copy.emailNotices.declinedSender.subject(p.nome, p.titulo);
  return {
    subject,
    html: layout(subject, [esc(p.motivo).replace(/\n/g, "<br>")], { label: copy.detail.open, url: p.link }),
    text: [subject, "", p.motivo, "", p.link, "", copy.email.footer].join("\n"),
  };
}

// Aviso aos outros assinantes: o documento foi recusado (tipo recusado_destinatario).
export function declinedRecipientEmail(p: { titulo: string }): RenderedEmail {
  const subject = copy.emailNotices.declinedRecipient.subject(p.titulo);
  return {
    subject,
    html: layout(subject, [esc(copy.emailNotices.declinedRecipient.body)]),
    text: [subject, "", copy.emailNotices.declinedRecipient.body, "", copy.email.footer].join("\n"),
  };
}

// Conclusão (seção 15.2, tipos concluido_destinatario e concluido_remetente): PDF anexo ou o botão
// "Baixar documento assinado", o código de verificação e o SHA-256 final. Para o remetente, o
// botão leva ao detalhe do envelope.
export function completedEmail(p: { titulo: string; codigo: string; hashFinal: string; site: string; anexo: boolean; link: string | null; detail: boolean }): RenderedEmail {
  const c = copy.emailNotices.completed;
  const subject = c.subject(p.titulo);
  const title = c.title(p.titulo);
  const lines = [
    ...(p.anexo ? [c.attached] : []),
    `${c.code}: ${p.codigo}`,
    `${c.hash}: ${p.hashFinal}`,
    c.verify(p.site),
  ];
  const button = p.link ? { label: p.detail ? c.detail : c.download, url: p.link } : undefined;
  return {
    subject,
    html: layout(title, lines.map((l) => esc(l).replace(/: ([0-9a-f]{64})$/, ': <span style="font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all">$1</span>')), button),
    text: [title, "", ...lines, ...(button ? ["", `${button.label}: ${button.url}`] : []), "", copy.email.footer].join("\n"),
  };
}

// Alerta ao admin (seção 15.2, tipo finalizacao_falhou_admin): id e erro técnico, sem dado pessoal.
export function finalizationFailedEmail(p: { envelopeId: string; erro: string }): RenderedEmail {
  const subject = copy.emailNotices.finalizationFailed.subject;
  const body = copy.emailNotices.finalizationFailed.body(p.envelopeId, p.erro);
  return {
    subject,
    html: layout(subject, body.split("\n").map(esc)),
    text: [subject, "", body].join("\n"),
  };
}
