// Números do produto, num lugar só (seção 18): cada constante cita a regra do spec que a define.
// Nada aqui é segredo; o arquivo roda no servidor e no cliente.

// Regra 11.20: documentos guardados por nível de conta.
export const LIMITE_POR_NIVEL = { 1: 50, 2: 500, 3: 5000 } as const;
export type Nivel = keyof typeof LIMITE_POR_NIVEL;

// Regra 11.12: freio de cadastro (padrão quando CONTAS_NOVAS_POR_DIA não está definida).
export const CONTAS_NOVAS_POR_DIA_PADRAO = 50;

// Seção 6.1: sessão do remetente — 30 dias, renovada depois de 7.
export const SESSAO_DIAS = 30;
export const SESSAO_RENOVAR_DEPOIS_DIAS = 7;

// Seção 6.1: o state e o PKCE do login com Google valem 10 minutos.
export const OAUTH_GOOGLE_MINUTOS = 10;

// Regra 11.1: arquivo aceito.
export const LIMITE_ARQUIVO_BYTES = 10_485_760;
export const MIN_PAGINAS = 1;
export const MAX_PAGINAS = 100;
export const MAX_LADO_PAGINA_PT = 1440;

// Regra 11.2: destinatários por envelope.
export const MAX_ASSINANTES = 10;
export const MAX_COPIAS = 5;

// Seção 7.3 (as_envelopes): faixas das configurações do envelope.
export const PRAZO_DIAS_PADRAO = 30;
export const PRAZO_DIAS_MIN = 1;
export const PRAZO_DIAS_MAX = 90;
export const LEMBRETES_PERMITIDOS = [2, 3, 7] as const;
export const LEMBRETE_PADRAO = 3;
export const TITULO_MAX = 120;
export const NOME_MAX = 100;
export const NOME_ARQUIVO_MAX = 200;
// Opções de prazo oferecidas na tela (o banco aceita qualquer valor de 1 a 90, seção 7.3).
export const PRAZOS_SUGERIDOS = [7, 15, 30, 45, 60, 90] as const;
export const MENSAGEM_MAX = 1000;

// Épico 8.2: a URL de upload vale 2 h; a de download, 5 min (13.1).
export const UPLOAD_URL_SEGUNDOS = 2 * 60 * 60;
export const DOWNLOAD_URL_SEGUNDOS = 5 * 60;

// Épico 8.2: salvamento automático do rascunho.
export const AUTOSAVE_MS = 800;

// Regra 11.3: campos.
export const MAX_CAMPOS_POR_ASSINANTE = 50;
// Página A4 em pontos: base dos tamanhos padrão dos campos.
export const A4_PT = { l: 595.28, a: 841.89 } as const;
// Menor campo possível, em fração da página (abaixo disso não se clica nem se lê).
export const CAMPO_MIN = 0.01;
// Passo do teclado no editor (critério 8.3: setas movem 1%).
export const PASSO_TECLADO = 0.01;

// Regra 11.12: envelopes enviados por conta a cada 24 h (anti-abuso, qualquer nível).
export const LIMITE_ENVIOS_24H = 30;
// Regra 11.16: tentativas de cada e-mail (a imediata + as da faxina).
export const MAX_TENTATIVAS_EMAIL = 5;
// Regra 11.20: a partir de que fração do limite o uso aparece em laranja.
export const ALERTA_USO_NIVEL = 0.8;
// Seção 6.2: bytes aleatórios do token do link do signatário.
export const TOKEN_SIGNATARIO_BYTES = 32;
// Convite "pendente" há mais que isto aparece no detalhe como problema (servidor caiu no envio).
export const CONVITE_PARADO_MS = 5 * 60 * 1000;
// Timeout de uma chamada ao Resend.
export const EMAIL_TIMEOUT_MS = 10_000;
