// Ajudantes dos testes de envelope (épico 8.2): subir PDF pela URL assinada do driver local.
import { NextRequest } from "next/server";
import { PUT as devPut } from "@/app/api/dev/arquivos/[...caminho]/route";

// Faz o PUT que o navegador faria na URL de upload. Recebe: a URL assinada e os bytes.
// Devolve: o status HTTP.
export async function uploadTo(url: string, bytes: Uint8Array): Promise<number> {
  const u = new URL(url);
  const caminho = u.pathname.replace(/^\/api\/dev\/arquivos\//, "").split("/").map(decodeURIComponent);
  const res = await devPut(new NextRequest(url, { method: "PUT", body: Buffer.from(bytes), headers: { "content-type": "application/pdf" } }), {
    params: Promise.resolve({ caminho }),
  });
  return res.status;
}
