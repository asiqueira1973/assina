// GET /api/v1/openapi.json — seção 13.2: o contrato OpenAPI 3.1, sem autenticação.
import { openApiDocument } from "@/server/api/openapi";

export function GET() {
  return Response.json(openApiDocument(), { headers: { "access-control-allow-origin": "*" } });
}
