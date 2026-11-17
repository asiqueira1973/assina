#!/bin/bash
# A trilha de auditoria só aceita inserção pela função as_fn_registra_evento (princípio 1, regra 11.6).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */src/*|*/scripts/*) ;;
  *) exit 0 ;;
esac
# Junta as linhas: o Prettier quebra .from(...) e .update( em linhas separadas.
flat=$(echo "$content" | tr "\n" " ")
if echo "$flat" | grep -qE "from\(['\"]as_eventos['\"]\)[[:space:]]*\.(insert|update|upsert|delete)"; then
  echo "Bloqueado: escrita direta em as_eventos (princípio 1, regra 11.6). Registre eventos só com rpc('as_fn_registra_evento', …) dentro da mesma transação da mudança de estado; eventos nunca se alteram nem se apagam." >&2
  exit 2
fi
exit 0
