// /api/dev/arquivos/{caminho} — par do driver local do ArquivoStorage (dev e testes, pendência P2).
// PUT grava e GET lê, só com a assinatura HMAC válida e dentro da validade (o mesmo contrato das
// URLs pré-assinadas do R2). Em produção, ou com o R2 configurado, responde 404.
import type { NextRequest } from "next/server";
import { isR2Configured, storage } from "@/server/files/storage";
import { verifyLocal } from "@/server/files/local";
import { LIMITE_ARQUIVO_BYTES } from "@/lib/limits";

type Ctx = { params: Promise<{ caminho: string[] }> };

// Diz se a rota de dev está ligada: fora de produção e sem R2 (mesma regra de storage()).
function devStorageEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !isR2Configured();
}

// Lê e confere a assinatura. Devolve: o caminho, ou uma Response de erro.
async function authorize(req: NextRequest, ctx: Ctx, op: "put" | "get"): Promise<string | Response> {
  if (!devStorageEnabled()) return new Response(null, { status: 404 });
  const path = (await ctx.params).caminho.join("/");
  const q = req.nextUrl.searchParams;
  if (q.get("op") !== op || !verifyLocal(op, path, Number(q.get("exp")), q.get("sig") ?? "")) {
    return new Response(null, { status: 403 });
  }
  return path;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const path = await authorize(req, ctx, "put");
  if (path instanceof Response) return path;
  const bytes = new Uint8Array(await req.arrayBuffer());
  // Mesmo teto que o R2 teria pelo limite do produto (11.1); acima disso nem grava.
  if (bytes.length > LIMITE_ARQUIVO_BYTES + 1024 * 1024) return new Response(null, { status: 413 });
  await storage().write(path, bytes, req.headers.get("content-type") ?? "application/octet-stream");
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const path = await authorize(req, ctx, "get");
  if (path instanceof Response) return path;
  const bytes = await storage().read(path, LIMITE_ARQUIVO_BYTES * 2);
  if (!bytes) return new Response(null, { status: 404 });
  const nome = req.nextUrl.searchParams.get("nome");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": path.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      ...(nome ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}` } : {}),
    },
  });
}
