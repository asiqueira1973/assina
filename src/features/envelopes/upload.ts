// Envio do PDF do navegador (épico 8.2): cria o rascunho ou pede URL nova, faz o PUT direto no
// armazenamento (R2 ou driver local) com progresso, e pede ao servidor para validar (regra 11.1).
// Roda no cliente; não conhece segredo nenhum, só as URLs assinadas que o servidor devolveu.
import { copy } from "@/lib/copy";
import { LIMITE_ARQUIVO_BYTES } from "@/lib/limits";

/** Dados do arquivo como o servidor validou e gravou (não o que o navegador mandou). */
export type AttachedFile = { nome: string; paginas: number; tamanho: number };
export type AttachResult = { envelopeId: string; fieldsRemoved: boolean; alreadySigned: boolean; file: AttachedFile };
export class UploadError extends Error {}

type FileErrorCode = keyof typeof copy.draft.fileErrors;

// PUT com progresso (fetch não informa progresso de envio). Recebe: URL, arquivo e callback 0–100.
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", "application/pdf");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(copy.errors.generic)));
    xhr.onerror = () => reject(new UploadError(copy.errors.generic));
    xhr.send(file);
  });
}

// Sobe e valida um PDF. Sem envelopeId, cria o rascunho; com ele, troca o arquivo.
// Recebe: arquivo, envelope (opcional), callbacks de progresso e de "conferindo".
// Devolve: id do envelope e os avisos. Lança UploadError com a frase da seção 15.
export async function uploadPdf(
  file: File,
  opts: { envelopeId?: string; retitle?: boolean; onProgress: (pct: number) => void; onChecking: () => void },
): Promise<AttachResult> {
  // Recusa no navegador o que nem precisa subir (o servidor confere de novo).
  if (file.size > LIMITE_ARQUIVO_BYTES) throw new UploadError(copy.draft.fileErrors.grande_demais);

  let envelopeId = opts.envelopeId;
  let uploadUrl: string;
  if (envelopeId) {
    const res = await fetch(`/api/painel/envelopes/${envelopeId}/upload`, { method: "POST" });
    if (!res.ok) throw new UploadError(copy.errors.generic);
    uploadUrl = (await res.json()).upload_url;
  } else {
    const res = await fetch("/api/painel/envelopes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome_arquivo: file.name }),
    });
    if (!res.ok) throw new UploadError(copy.errors.generic);
    const body = await res.json();
    envelopeId = body.envelope.id as string;
    uploadUrl = body.upload_url;
  }

  await putWithProgress(uploadUrl, file, opts.onProgress);
  opts.onChecking();

  const res = await fetch(`/api/painel/envelopes/${envelopeId}/arquivo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nome_arquivo: file.name, ...(opts.retitle ? { renomear: true } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const motivo = body.motivo as FileErrorCode | undefined;
    const message = motivo && motivo in copy.draft.fileErrors ? copy.draft.fileErrors[motivo] : copy.errors.generic;
    const err = new UploadError(message);
    (err as UploadError & { envelopeId?: string }).envelopeId = envelopeId;
    throw err;
  }
  return {
    envelopeId: envelopeId!,
    fieldsRemoved: body.campos_removidos,
    alreadySigned: body.ja_assinado,
    file: { nome: body.envelope.nome_arquivo, paginas: body.envelope.paginas, tamanho: body.envelope.tamanho_bytes },
  };
}
