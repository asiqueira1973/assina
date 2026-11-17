// Trilha em CSV — seção 14. UTF-8 com BOM (abre certo no Excel), separador ";", uma linha por
// evento, colunas na ordem do spec. Célula com ";", aspas ou quebra de linha vai entre aspas
// (aspas dobradas). Texto que começa com =, +, -, @ ou tabulação ganha um apóstrofo na frente,
// para a planilha não executar como fórmula um nome ou navegador forjado (injeção de CSV).
import "server-only";
import { copy } from "@/lib/copy";
import { formatDateTimeSeconds } from "@/lib/format";
import type { TrailEvent } from "./manage";

const HEADER = ["seq", "data_hora_brasilia", "data_hora_utc", "evento", "ator", "pessoa", "email", "ip", "navegador", "detalhes", "hash"];

// Uma célula de texto do CSV.
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Monta o CSV. Recebe: os eventos (getTrail). Devolve: o texto, já com o BOM.
export function trailCsv(events: TrailEvent[]): string {
  const lines = [HEADER.join(";")];
  for (const e of events) {
    lines.push(
      [
        csvCell(e.seq),
        csvCell(formatDateTimeSeconds(e.ocorrido_em)),
        csvCell(new Date(e.ocorrido_em).toISOString()),
        csvCell(copy.events[e.tipo]),
        csvCell(copy.trailActors[e.ator]),
        csvCell(e.pessoa),
        csvCell(e.email),
        csvCell(e.ip),
        csvCell(e.user_agent),
        csvCell(JSON.stringify(e.dados ?? {})),
        csvCell(e.hash),
      ].join(";"),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// Nome do arquivo (seção 14): trilha-{codigo_verificacao}.csv.
export function trailCsvFilename(codigo: string): string {
  return `trilha-${codigo}.csv`;
}
