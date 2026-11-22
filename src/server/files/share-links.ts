// Link de compartilhamento → download direto — regra 11.18 (arquivo_url da API e do MCP).
// O link "Compartilhar" do Google Drive (/file/d/{id}/view) e o do Dropbox (?dl=0) abrem uma
// página HTML de visualização, não o PDF. Aqui viram o endereço que entrega o arquivo. O fetch
// continua sendo o protegido contra SSRF (fetch-remote.ts), com redirecionamentos conferidos.
import "server-only";

const DRIVE_HOSTS = new Set(["drive.google.com"]);
const DROPBOX_HOSTS = new Set(["www.dropbox.com", "dropbox.com"]);

// Recebe: a URL informada. Devolve: a URL de download direto, ou a mesma se não for desses serviços.
export function directDownloadUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (DRIVE_HOSTS.has(url.hostname)) {
    const id = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? (/^\/(open|uc)$/.test(url.pathname) ? url.searchParams.get("id") : null);
    // confirm=t pula o aviso de "não verificamos vírus", que o Drive mostra em arquivos grandes.
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    return raw;
  }
  if (DROPBOX_HOSTS.has(url.hostname)) {
    url.searchParams.set("dl", "1");
    return url.toString();
  }
  return raw;
}
