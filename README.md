# Assina

Assinatura eletrônica de documentos PDF, grátis e em português: suba um PDF, diga quem assina e receba de volta o documento assinado, selado e com a trilha de auditoria. Com API REST e servidor MCP para sistemas e agentes. Um produto [DabLab](https://dablab.com.br) em [assina.app.br](https://assina.app.br).

**Status:** em implementação. Épicos 8.0 (guardrails) e 8.1 (fundação: banco, login com Google, boas-vindas) prontos; ver `plans/`.

| Arquivo | O que é |
|---|---|
| [`spec.md`](spec.md) | Especificação completa (fonte única de verdade) |
| [`DOCUMENTACAO-TECNICA.md`](DOCUMENTACAO-TECNICA.md) | O que está implementado de fato |
| [`CLAUDE.md`](CLAUDE.md) | Guia para sessões do Claude Code neste repositório |
| [`modelo-assina.dbml`](modelo-assina.dbml) | Modelo de dados para o dbdiagram.io |
| [`prompt-design-assina.md`](prompt-design-assina.md) | Prompt das telas para o Claude Design |

## Rodar localmente

Pré-requisitos: Node 22, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli) e `jq` (os hooks do Claude Code usam).

```bash
npm install
supabase start                 # sobe o Postgres local nas portas 555xx e aplica as migrations
cp .env.example .env.local     # e preencha (ver abaixo)
npm run dev                    # http://localhost:3030
```

Em `.env.local`:

- `SUPABASE_SERVICE_ROLE_KEY`: valor `SERVICE_ROLE_KEY` de `supabase status -o env`.
- `SESSION_SECRET`, `CHAVES_ENC_KEY`, `CRON_SECRET`: cada um com `openssl rand -base64 32`.
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`: ver "Google Cloud" abaixo.

Se o Postgres local travar ou cancelar por timeout (`57014`), confira se outro Supabase local está ligado (`docker ps`) e pare-o: dois ao mesmo tempo sufocam o Docker.

## Verificação

```bash
npm run verify   # typecheck, lint, guardrails, pgTAP, Vitest, build e npm audit
```

Saída saudável: `27 de 27 casos ok` (guardrails), `Result: PASS` (pgTAP), `Tests N passed` (Vitest), a tabela de rotas do `next build` e `found 0 vulnerabilities`.

Outros comandos: `npm run db:types` (tipos do banco a partir do local) e `npm run db:schema` (regenera `supabase/schema.sql`).

## Banco

Projeto Supabase **compartilhado** com outros apps da DabLab (`jeesdmfcrmhyufwzwzwt`): todo objeto do Assina leva o prefixo `as_`. Migrations ficam em `supabase/migrations/` e vão ao remoto pelo MCP do Supabase (`apply_migration`, mesmo SQL do arquivo), **nunca** por `supabase db push`, que tentaria sincronizar o projeto inteiro. Depois de cada migration: advisors de segurança e performance filtrados a `as_*` e `npm run db:schema`.

## Google Cloud (login)

O Assina pede só `openid email profile`: escopos não sensíveis, sem verificação do Google. Fica num **projeto próprio "Assina"** na conta da DabLab, para a tela de consentimento mostrar o nome certo.

1. [console.cloud.google.com](https://console.cloud.google.com) → seletor de projeto → **Novo projeto** → nome `Assina` → Criar.
2. **APIs e serviços → Tela de consentimento OAuth** (Google Auth Platform) → **Começar**:
   - Nome do app: `Assina`; e-mail de suporte: `alexandre@dablab.com.br`.
   - Público: **Externo**.
   - Contato do desenvolvedor: `alexandre@dablab.com.br`.
3. **Marca** (Branding): página inicial `https://assina.app.br`, política de privacidade `https://assina.app.br/privacidade`, termos `https://assina.app.br/termos`, domínio autorizado `assina.app.br`. Essas páginas chegam no épico 8.12; até lá, deixe para depois a verificação da marca.
4. **Acesso a dados** (escopos): só `openid`, `.../auth/userinfo.email` e `.../auth/userinfo.profile`. Nenhum escopo sensível.
5. **Público** → **Publicar app** (status "Em produção"). Com escopos básicos não há revisão do Google nem limite de 100 usuários de teste.
6. **Clientes** → **Criar cliente** → tipo **Aplicativo da Web**, nome `Assina web`:
   - Origens JavaScript autorizadas: `http://localhost:3030` e `https://assina.app.br`.
   - URIs de redirecionamento autorizados: `http://localhost:3030/api/auth/google/callback` e `https://assina.app.br/api/auth/google/callback`.
7. Copie o **ID do cliente** e a **Chave secreta** para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` (e, no deploy, nas variáveis da Vercel).

## Cloudflare R2 (arquivos, a partir do épico 8.2)

1. Painel da Cloudflare (conta DabLab) → **R2** → **Criar bucket** → nome `assina-documentos`, sem acesso público e sem domínio `r2.dev`.
2. No bucket → **Configurações → Política de CORS**:

   ```json
   [{ "AllowedOrigins": ["https://assina.app.br", "http://localhost:3030"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```

3. **R2 → Gerenciar tokens de API → Criar token**: permissão **Leitura e gravação de objetos**, restrito ao bucket `assina-documentos`.
4. Copie para `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`.

## Selo do PDF final (épico 8.6)

O PDF final leva um selo PAdES da plataforma (regra 11.10). O selo só garante a integridade do arquivo; não é a assinatura de quem assinou.

1. **Certificado.** Para dev (e para o MVP, até a decisão 25.2): `npm run selo:gerar`. O comando imprime `SELO_P12_BASE64=…` e `SELO_P12_SENHA=…` e não grava nenhum arquivo. Cole as duas linhas no `.env.local`, ou, em produção, nas variáveis da Vercel. Com o certificado autoassinado, o Adobe Reader mostra "identidade desconhecida", o que é esperado.
2. **Carimbo do tempo (opcional).** `SELO_TSA_URL` com uma TSA RFC 3161 gratuita. Em 17/11/2026 responderam em cerca de 0,5 s: `http://timestamp.digicert.com`, `https://freetsa.org/tsr` e `http://timestamp.sectigo.com`. Com resposta em até 5 s, o selo é `B-T`; sem resposta, `B-B`, e o envelope conclui do mesmo jeito.
3. **Alerta.** `ADMIN_EMAIL` recebe o "[Assina] Finalização falhou 3 vezes".
4. **Conferir um PDF selado.** Basta abrir no Adobe Reader. Pela linha de comando:

   ```bash
   python3 -c "import re,sys;b=open(sys.argv[1],'rb').read();a,l,c,d=map(int,list(re.finditer(rb'/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)',b))[-1].groups());open('c.bin','wb').write(b[a:a+l]+b[c:c+d]);open('s.der','wb').write(bytes.fromhex(b[a+l+1:c-1].decode()))" final.pdf
   openssl cms -verify -binary -inform DER -in s.der -content c.bin -noverify -purpose any -out /dev/null
   ```

## API REST v1 e webhooks (épico 8.9)

A documentação legível fica em `/docs/api`, e o contrato em `/api/v1/openapi.json` (OpenAPI 3.1). A chave de API de cada conta está em **Integrações** (`Authorization: Bearer assina_…`). Gerar uma nova chave revoga a anterior na hora.

Fluxo completo por `curl`:

```bash
# 1. Criar com o PDF numa URL https (ou sem arquivo_url, para receber a upload_url)
curl -s -X POST https://assina.app.br/api/v1/envelopes \
  -H "Authorization: Bearer $ASSINA_CHAVE" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pedido-123" \
  -d '{"titulo":"Contrato","arquivo_url":"https://exemplo.com.br/contrato.pdf",
       "signatarios":[{"nome":"Ana Souza","email":"ana@exemplo.com.br"}],
       "campos":[{"signatario_email":"ana@exemplo.com.br","tipo":"assinatura","pagina":1,"x":0.1,"y":0.8}]}'

# 1b. Sem arquivo_url: suba o PDF na upload_url e confirme
curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: application/pdf" --data-binary @contrato.pdf
curl -s -X POST https://assina.app.br/api/v1/envelopes/$ID/arquivo -H "Authorization: Bearer $ASSINA_CHAVE"

# 2. Enviar
curl -s -X POST https://assina.app.br/api/v1/envelopes/$ID/enviar -H "Authorization: Bearer $ASSINA_CHAVE"

# 3. Consultar (e a trilha)
curl -s https://assina.app.br/api/v1/envelopes/$ID -H "Authorization: Bearer $ASSINA_CHAVE"
curl -s https://assina.app.br/api/v1/envelopes/$ID/eventos -H "Authorization: Bearer $ASSINA_CHAVE"

# 4. Depois do webhook envelope.concluido, baixar o assinado (URL de 5 minutos)
curl -s "https://assina.app.br/api/v1/envelopes/$ID/arquivo?versao=final" -H "Authorization: Bearer $ASSINA_CHAVE"
```

Os webhooks chegam por `POST` na URL https configurada em Integrações, com os cabeçalhos `Assina-Assinatura` (`t={epoch},v1={hmac_sha256(segredo, t + "." + corpo)}`), `Assina-Entrega` e `Assina-Evento`. Responda 2xx; sem isso, o Assina tenta de novo, até 6 vezes (a faxina diária retenta). Exemplo de verificação em Node:

```js
// Conferir o webhook do Assina (Node 18+, sem dependências).
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SEGREDO = process.env.ASSINA_WEBHOOK_SEGREDO; // whsec_… (tela Integrações)

createServer((req, res) => {
  const partes = [];
  req.on("data", (p) => partes.push(p));
  req.on("end", () => {
    const corpo = Buffer.concat(partes).toString("utf8"); // o corpo cru, antes do JSON.parse
    const cab = String(req.headers["assina-assinatura"] ?? "");
    const t = /t=(\d+)/.exec(cab)?.[1];
    const v1 = /v1=([0-9a-f]{64})/.exec(cab)?.[1];
    const esperado = createHmac("sha256", SEGREDO).update(`${t}.${corpo}`).digest("hex");
    const recente = Math.abs(Date.now() / 1000 - Number(t)) < 300; // contra reenvio antigo
    if (!t || !v1 || !recente || !timingSafeEqual(Buffer.from(v1), Buffer.from(esperado))) {
      res.writeHead(401).end();
      return;
    }
    const evento = JSON.parse(corpo); // { evento, envelope, signatario?, ocorrido_em }
    console.log(req.headers["assina-entrega"], evento.evento, evento.envelope.id);
    res.writeHead(200).end(); // 2xx = entregue; qualquer outra resposta será retentada
  });
}).listen(3000);
```

## Vercel Firewall (limites por IP)

O app não conta requisições por IP: quem limita é o Vercel Firewall, configurado no painel da Vercel (projeto → **Firewall** → **Configure** → **New Rule**). Cada regra usa a condição **Request Path starts with**, a ação **Rate Limit** e a janela fixa de 60 s por IP. Acima do limite, a resposta é **429**.

| Caminho | Limite | Por quê |
|---|---|---|
| `/api/verificar` e `/verificar/` | 30 por minuto | critério 8.8: a consulta é pública (a página do código também consulta o banco) |
| `/api/assinar/` | 20 por minuto | página do signatário (código por e-mail) |
| `/api/v1/` e `/mcp` | 120 por minuto | integrações (épicos 8.9 e 8.10) |

Para conferir depois de criar, rode `for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code} " "https://assina.app.br/api/verificar?codigo=AAAAAAAAAAAA"; done`: as primeiras 30 respostas são 200 e as seguintes, 429.

## Licença

MIT. Referência funcional: [SignuDoc](https://github.com/NYLLON-SOFTWARE/signudoc) (MIT); todo código adaptado dele leva atribuição em `THIRD_PARTY_NOTICES.md`.
