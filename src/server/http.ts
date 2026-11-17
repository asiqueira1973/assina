// Utilidades HTTP das rotas (seção 13): metadados de quem pediu e tradução dos erros de negócio
// para o formato { codigo, mensagem? } da API. Nunca devolve detalhe interno em 500.
import "server-only";
import type { NextRequest } from "next/server";
import { DraftError, type RequestMeta } from "@/server/envelopes/drafts";

const PDF_CODES = new Set(["nao_e_pdf", "grande_demais", "paginas_demais", "protegido_por_senha", "pagina_grande_demais", "arquivo_ausente"]);

// IP e user agent de quem pediu, para a trilha (regra 11.6). IP do primeiro x-forwarded-for
// (Vercel), sem validar além do formato que o banco aceita (inet).
export function requestMeta(req: NextRequest): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{2,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null };
}

// Lê o corpo JSON sem lançar. Devolve: o objeto ou null se não for JSON.
export async function readJson(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null);
}

// Resposta 400 de dados inválidos.
export function invalidData(): Response {
  return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
}

// Traduz um erro para HTTP. DraftError vira 404/409/400 com o código; o resto, 500 genérico
// (registrado sem dado pessoal).
export function errorResponse(e: unknown): Response {
  if (e instanceof DraftError) {
    if (e.code === "nao_encontrado") return Response.json({ codigo: "nao_encontrado" }, { status: 404 });
    if (e.code === "envelope_congelado" || e.code === "status_mudou" || e.code === "envelope_mudou" || e.code === "convite_indisponivel") {
      return Response.json({ codigo: e.code }, { status: 409 });
    }
    // Seção 13.2: limites respondem 429.
    if (e.code === "limite_diario" || e.code === "limite_do_nivel") return Response.json({ codigo: e.code }, { status: 429 });
    if (PDF_CODES.has(e.code)) return Response.json({ codigo: "arquivo_invalido", motivo: e.code }, { status: 400 });
    return Response.json({ codigo: e.code }, { status: 400 });
  }
  console.error("erro_interno", e instanceof Error ? e.message : "erro");
  return Response.json({ codigo: "erro_interno" }, { status: 500 });
}
