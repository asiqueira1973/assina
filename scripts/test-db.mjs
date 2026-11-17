// Roda os testes de banco (pgTAP) no Supabase local — seções 22 e 22.1.
// Recebe: nada. Devolve: código de saída 0 se todos os testes passarem.
// Sobe o Supabase local se ele não estiver rodando; sem testes em supabase/tests, apenas avisa.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const testsDir = "supabase/tests";
const hasTests = existsSync(testsDir) && readdirSync(testsDir, { recursive: true }).some((f) => String(f).endsWith(".sql"));
if (!hasTests) {
  console.log("test:db — nenhum teste em supabase/tests ainda (pulado).");
  process.exit(0);
}
// Código de verificação inventado no teste com I, L, O ou U (fora do base32 Crockford) quebra o
// check do banco longe do motivo; errei isso quatro vezes (CLAUDE.md, pegadinhas). Confere antes:
// toda string de 12 caracteres maiúsculos e dígitos com 4+ dígitos, logo depois de um "(" ou ",",
// na lista de valores de um insert em as_envelopes.
const bad = [];
for (const f of readdirSync(testsDir, { recursive: true }).map(String).filter((f) => f.endsWith(".sql"))) {
  const sql = readFileSync(`${testsDir}/${f}`, "utf8");
  for (const [, code] of sql.matchAll(/'([0-9A-Z]{12})'/g)) {
    if ((code.match(/[0-9]/g) ?? []).length >= 4 && /[ILOU]/.test(code)) bad.push(`${f}: ${code}`);
  }
}
if (bad.length) {
  console.error(`test:db — código de verificação com I, L, O ou U (base32 Crockford não aceita):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
try {
  execSync("supabase status", { stdio: "ignore" });
} catch {
  console.log("test:db — subindo Supabase local…");
  execSync("supabase start", { stdio: "inherit" });
}
// Aplica migrations pendentes sem apagar dados de desenvolvimento; os testes pgTAP rodam em
// transação com rollback.
execSync("supabase migration up --local", { stdio: "inherit" });
execSync("supabase test db", { stdio: "inherit" });
