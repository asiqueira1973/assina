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
