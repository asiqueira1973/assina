#!/bin/bash
# Impede copy que promete o que o Assina não é (princípio 4, seção 15.3).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */src/lib/copy.ts|*/src/server/email/*|*/src/server/pdf/manifest.ts|*/src/app/*.tsx|*/src/features/*.tsx) ;;
  *) exit 0 ;;
esac
# Linhas dentro do bloco LEGAL_NEGATIVAS (textos que explicam o que o Assina NÃO é) ficam de fora.
# Só a declaração abre o bloco: um comentário ou uma referência ao nome não isenta nada.
filtered=$(echo "$content" | awk '/^export const LEGAL_NEGATIVAS/{skip=1} skip&&/^\}/{skip=0;next} !skip')
if echo "$filtered" | grep -qiE 'certificado digital|icp-brasil|assinatura qualificada|assinatura digital|firma reconhecida|100% v(a|á)lid|validade garantida'; then
  echo "Bloqueado: copy promete o que o Assina não é (princípio 4, seção 15.3). Use a base legal da seção 20.1 (art. 10, § 2º, MP 2.200-2/2001). Se o texto explica o que o Assina NÃO é, coloque-o em LEGAL_NEGATIVAS no copy.ts." >&2
  exit 2
fi
exit 0
