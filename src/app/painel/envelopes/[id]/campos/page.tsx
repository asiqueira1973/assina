// [Remetente] Posicionar campos — épico 8.3. Carrega o rascunho da conta, os assinantes, os
// campos e uma URL assinada de 5 min para o pdf.js abrir o original. Ver o próprio rascunho no
// editor não registra "baixou_original" (não é download nem evidência; o evento é do GET
// …/arquivo, épico 8.7). Sem arquivo ou sem assinante volta para a edição; fora de rascunho, para
// a lista (princípio 2).
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { FieldEditor } from "@/features/envelopes/components/field-editor";
import { DOWNLOAD_URL_SEGUNDOS } from "@/lib/limits";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getEnvelope, getSigners } from "@/server/envelopes/drafts";
import { getFields } from "@/server/envelopes/fields";
import { storage } from "@/server/files/storage";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/painel/envelopes/[id]/campos">;

// Lê tudo do servidor e monta o editor.
async function Editor({ params }: Props) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const { id } = await params;
  const envelope = await getEnvelope(account.id, id);
  if (!envelope) notFound();
  if (envelope.status !== "rascunho") redirect("/painel");
  const signers = (await getSigners(account.id, id)).filter((s) => s.papel === "assinar");
  const pages = envelope.dimensoes_paginas as { l: number; a: number }[] | null;
  if (!envelope.arquivo_original_path || !pages?.length || signers.length === 0) redirect(`/painel/envelopes/${id}/editar`);

  const [fields, pdf] = await Promise.all([
    getFields(account.id, id),
    storage().createDownloadUrl(envelope.arquivo_original_path, DOWNLOAD_URL_SEGUNDOS),
  ]);

  return (
    <FieldEditor
      envelopeId={envelope.id}
      title={envelope.titulo}
      pdfUrl={pdf.url}
      pages={pages}
      signers={signers.map((s) => ({ id: s.id, nome: s.nome }))}
      initialFields={fields.map((f) => ({
        key: f.id,
        signatario_id: f.signatario_id,
        tipo: f.tipo,
        pagina: f.pagina,
        x: Number(f.x),
        y: Number(f.y),
        largura: Number(f.largura),
        altura: Number(f.altura),
        obrigatorio: f.obrigatorio,
        rotulo: f.rotulo ?? "",
      }))}
    />
  );
}

export default function CamposPage(props: Props) {
  return (
    <Suspense fallback={<div aria-busy="true" />}>
      <Editor {...props} />
    </Suspense>
  );
}
