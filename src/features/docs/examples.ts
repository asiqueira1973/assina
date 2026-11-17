// Exemplos da documentação da API (critério 8.9): o fluxo por curl e a verificação da assinatura
// do webhook em Node. Usados pela página /docs/api e copiados no README. Código, não copy.

export const CURL_FLOW = (site: string) => `# 1. Criar com o PDF numa URL https (ou sem arquivo_url, para receber a upload_url)
curl -s -X POST ${site}/api/v1/envelopes \\
  -H "Authorization: Bearer $ASSINA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-123" \\
  -d '{"titulo":"Contrato","arquivo_url":"https://exemplo.com.br/contrato.pdf",
       "signatarios":[{"nome":"Ana Souza","email":"ana@exemplo.com.br"}],
       "campos":[{"signatario_email":"ana@exemplo.com.br","tipo":"assinatura","pagina":1,"x":0.1,"y":0.8}]}'

# 1b. Sem arquivo_url: suba o PDF na upload_url e confirme
curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: application/pdf" --data-binary @contrato.pdf
curl -s -X POST ${site}/api/v1/envelopes/$ID/arquivo -H "Authorization: Bearer $ASSINA_CHAVE"

# 2. Enviar
curl -s -X POST ${site}/api/v1/envelopes/$ID/enviar -H "Authorization: Bearer $ASSINA_CHAVE"

# 3. Consultar (e a trilha)
curl -s ${site}/api/v1/envelopes/$ID -H "Authorization: Bearer $ASSINA_CHAVE"
curl -s ${site}/api/v1/envelopes/$ID/eventos -H "Authorization: Bearer $ASSINA_CHAVE"

# 4. Depois do webhook envelope.concluido, baixar o assinado (URL de 5 minutos)
curl -s "${site}/api/v1/envelopes/$ID/arquivo?versao=final" -H "Authorization: Bearer $ASSINA_CHAVE"`;

export const NODE_WEBHOOK = `// Conferir o webhook do Assina (Node 18+, sem dependências).
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SEGREDO = process.env.ASSINA_WEBHOOK_SEGREDO; // whsec_… (tela Integrações)

createServer((req, res) => {
  const partes = [];
  req.on("data", (p) => partes.push(p));
  req.on("end", () => {
    const corpo = Buffer.concat(partes).toString("utf8"); // o corpo cru, antes do JSON.parse
    const cab = String(req.headers["assina-assinatura"] ?? "");
    const t = /t=(\\d+)/.exec(cab)?.[1];
    const v1 = /v1=([0-9a-f]{64})/.exec(cab)?.[1];
    const esperado = createHmac("sha256", SEGREDO).update(\`\${t}.\${corpo}\`).digest("hex");
    const recente = Math.abs(Date.now() / 1000 - Number(t)) < 300; // contra reenvio antigo
    if (!t || !v1 || !recente || !timingSafeEqual(Buffer.from(v1), Buffer.from(esperado))) {
      res.writeHead(401).end();
      return;
    }
    const evento = JSON.parse(corpo); // { evento, envelope, signatario?, ocorrido_em }
    console.log(req.headers["assina-entrega"], evento.evento, evento.envelope.id);
    res.writeHead(200).end(); // 2xx = entregue; qualquer outra resposta será retentada
  });
}).listen(3000);`;
