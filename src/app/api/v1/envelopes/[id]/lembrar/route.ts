// POST /api/v1/envelopes/{id}/lembrar — seção 13.2 e regra 11.5: {signatario_id?} → {lembrados: n}.
// Com signatario_id, lembra só ele (e os erros dele valem: 429 lembrete_recente, 409…). Sem ele,
// lembra todos os que estão aguardando e conta os que saíram (quem recebeu lembrete há menos de
// 24 h ou já tem 10 fica de fora, sem erro).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, invalidFields } from "@/server/api/v1";
import { DraftError, getEnvelope, getSigners } from "@/server/envelopes/drafts";
import { remindSigner } from "@/server/envelopes/manage";
import { readJson, requestMeta } from "@/server/http";

const Body = z.object({ signatario_id: z.uuid().optional() }).strict();
const SKIP = new Set(["lembrete_recente", "limite_lembretes", "status_mudou"]);

export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/lembrar">) {
  return apiRoute(req, async ({ account }) => {
    const parsed = Body.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return invalidFields(parsed.error);
    const { id } = await ctx.params;
    const meta = requestMeta(req);
    if (parsed.data.signatario_id) {
      await remindSigner(account.id, id, parsed.data.signatario_id, meta, "api");
      return Response.json({ lembrados: 1 });
    }
    const envelope = await getEnvelope(account.id, id);
    if (!envelope) throw new DraftError("nao_encontrado");
    if (envelope.status !== "enviado") throw new DraftError("status_mudou");
    let n = 0;
    for (const s of (await getSigners(account.id, id)).filter((x) => x.papel === "assinar" && x.status === "aguardando")) {
      try {
        await remindSigner(account.id, id, s.id, meta, "api");
        n++;
      } catch (e) {
        if (!(e instanceof DraftError && SKIP.has(e.code))) throw e;
      }
    }
    return Response.json({ lembrados: n });
  });
}
