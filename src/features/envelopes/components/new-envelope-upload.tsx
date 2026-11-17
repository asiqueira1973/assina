"use client";
// Passo do upload do novo envelope (épico 8.2): ao validar o PDF, vai para a edição do rascunho,
// levando os avisos (já assinado) na URL para a tela mostrar uma vez.
import { useRouter } from "next/navigation";
import { Dropzone } from "./dropzone";

export function NewEnvelopeUpload() {
  const router = useRouter();
  return (
    <Dropzone
      onDone={(result) => {
        const aviso = result.alreadySigned ? "?aviso=ja_assinado" : "";
        router.push(`/painel/envelopes/${result.envelopeId}/editar${aviso}`);
      }}
    />
  );
}
