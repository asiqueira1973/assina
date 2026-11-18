#!/bin/bash
# Testa os hooks de .claude/hooks/ provocando cada violação e conferindo os casos que devem passar.
# Implementa o épico 8.0 (critérios de aceite) e a seção 18.1 do spec: hook que não bloqueia dá falsa segurança.
# Uso: ./scripts/test-guardrails.sh  — termina com código 0 só se todos os casos derem o resultado esperado.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS="$ROOT/.claude/hooks"
falhas=0
total=0

# Monta o JSON que o Claude Code entrega ao hook (PreToolUse/PostToolUse de Write|Edit).
# Recebe: caminho absoluto do arquivo, conteúdo. Devolve: JSON no stdout.
payload() {
  jq -n --arg p "$1" --arg c "$2" '{tool_name:"Write", tool_input:{file_path:$p, content:$c}}'
}

# Roda um hook e compara o código de saída com o esperado (0 = libera, 2 = bloqueia).
# Recebe: descrição, hook, código esperado, caminho, conteúdo; usa CLAUDE_PROJECT_DIR do ambiente.
caso() {
  local desc="$1" hook="$2" esperado="$3" caminho="$4" conteudo="$5"
  total=$((total + 1))
  payload "$caminho" "$conteudo" | "$HOOKS/$hook" >/dev/null 2>&1
  local obtido=$?
  if [ "$obtido" -eq "$esperado" ]; then
    echo "ok    $hook: $desc"
  else
    echo "FALHA $hook: $desc (esperado $esperado, obtido $obtido)"
    falhas=$((falhas + 1))
  fi
}

export CLAUDE_PROJECT_DIR="$ROOT"
P="$ROOT"

# --- guard-secrets (seções 18 e 20.3) ---
caso "service role em página pública" guard-secrets.sh 2 "$P/src/app/(publico)/x.tsx" 'const k = process.env.SUPABASE_SERVICE_ROLE_KEY'
caso "P12 do selo em página pública" guard-secrets.sh 2 "$P/src/app/(publico)/x.tsx" 'const p = process.env.SELO_P12_BASE64'
caso "segredo do R2 em src/lib" guard-secrets.sh 2 "$P/src/lib/x.ts" 'process.env.R2_SECRET_ACCESS_KEY'
caso "NEXT_PUBLIC com KEY" guard-secrets.sh 2 "$P/src/features/x/y.tsx" 'process.env.NEXT_PUBLIC_ALGUMA_KEY'
caso "componente de cliente importando src/server" guard-secrets.sh 2 "$P/src/features/x/y.tsx" $'"use client";\nimport { db } from "@/server/db";'
caso "service role em src/server (permitido)" guard-secrets.sh 0 "$P/src/server/db/client.ts" 'process.env.SUPABASE_SERVICE_ROLE_KEY'
caso "P12 em rota de API (permitido)" guard-secrets.sh 0 "$P/src/app/api/x/route.ts" 'process.env.SELO_P12_BASE64'
caso "componente comum (permitido)" guard-secrets.sh 0 "$P/src/components/nav/Menu.tsx" 'export function Menu() {}'

# --- guard-audit (princípio 1, regra 11.6) ---
caso "update em as_eventos" guard-audit.sh 2 "$P/src/server/x.ts" "await db.from('as_eventos').update({ dados: {} })"
caso "delete em as_eventos" guard-audit.sh 2 "$P/src/server/x.ts" 'await db.from("as_eventos").delete()'
caso "insert direto em as_eventos" guard-audit.sh 2 "$P/src/server/x.ts" "db.from('as_eventos').insert({})"
caso "update quebrado em duas linhas (Prettier)" guard-audit.sh 2 "$P/src/server/x.ts" $'await db\n  .from(\'as_eventos\')\n  .update({ dados: {} })'
caso "registro pela função (permitido)" guard-audit.sh 0 "$P/src/server/audit/record.ts" "await db.rpc('as_fn_registra_evento', {})"
caso "leitura da trilha (permitido)" guard-audit.sh 0 "$P/src/server/x.ts" "db.from('as_eventos').select('*')"

# --- guard-copy (princípio 4, seção 15.3) ---
caso "certificado digital no copy.ts" guard-copy.sh 2 "$P/src/lib/copy.ts" 'export const copy = { x: "Assine com certificado digital" }'
caso "ICP-Brasil numa página" guard-copy.sh 2 "$P/src/app/page.tsx" '<p>Válido como ICP-Brasil</p>'
caso "100% válido em e-mail" guard-copy.sh 2 "$P/src/server/email/convite.tsx" 'Assinatura 100% válida'
caso "negativa dentro de LEGAL_NEGATIVAS (permitido)" guard-copy.sh 0 "$P/src/lib/copy.ts" $'export const LEGAL_NEGATIVAS = {\n  aviso: "Para escrituras e atos que exigem certificado ICP-Brasil, use um cartório."\n} as const;'
caso "comentário que cita LEGAL_NEGATIVAS não isenta o resto do arquivo" guard-copy.sh 2 "$P/src/lib/copy.ts" $'// negativas vão em LEGAL_NEGATIVAS\nexport const copy = {\n  x: "Assine com certificado digital",\n} as const;'
caso "texto proibido depois do bloco LEGAL_NEGATIVAS" guard-copy.sh 2 "$P/src/lib/copy.ts" $'export const LEGAL_NEGATIVAS = {\n  a: "Não é ICP-Brasil."\n} as const;\nexport const copy = {\n  x: "Assinatura digital garantida",\n} as const;'
caso "copy comum (permitido)" guard-copy.sh 0 "$P/src/lib/copy.ts" 'export const copy = { titulo: "Mande documentos para assinar." }'

# --- guard-migrations e guard-tests precisam de um repositório git próprio ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -C "$TMP" init -q
mkdir -p "$TMP/supabase/migrations" "$TMP/.claude" "$TMP/src/server"
echo "select 1;" > "$TMP/supabase/migrations/20261117000000_inicio.sql"
git -C "$TMP" add -A && git -C "$TMP" -c user.email=t@t -c user.name=t commit -q -m inicio
export CLAUDE_PROJECT_DIR="$TMP"

# --- guard-migrations (seção 7.6) ---
caso "editar migration versionada" guard-migrations.sh 2 "$TMP/supabase/migrations/20261117000000_inicio.sql" 'select 2;'
caso "migration nova (permitido)" guard-migrations.sh 0 "$TMP/supabase/migrations/20261118000000_nova.sql" 'select 2;'

# --- guard-tests (seção 22.1) ---
caso "teste editado sem fix-mode (permitido)" guard-tests.sh 0 "$TMP/src/server/x.test.ts" 'it("a", () => {})'
touch "$TMP/.claude/fix-mode"
caso "teste editado com fix-mode" guard-tests.sh 2 "$TMP/src/server/x.test.ts" 'it("a", () => {})'
caso "pgTAP editado com fix-mode" guard-tests.sh 2 "$TMP/supabase/tests/rls.sql" 'select plan(1);'
caso "código editado com fix-mode (permitido)" guard-tests.sh 0 "$TMP/src/server/x.ts" 'export const a = 1'

# --- remind-advisors (seções 7.6 e 20.3) ---
caso "migration escrita dispara o lembrete" remind-advisors.sh 2 "$TMP/supabase/migrations/20261118000000_nova.sql" 'select 2;'
caso "arquivo comum não dispara" remind-advisors.sh 0 "$TMP/src/server/x.ts" 'export const a = 1'

echo
echo "$((total - falhas)) de $total casos ok"
[ "$falhas" -eq 0 ]
