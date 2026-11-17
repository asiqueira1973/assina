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

// Regra 11.4: código de acesso do signatário.
export const CODIGO_VALIDADE_S = 10 * 60;
export const CODIGO_INTERVALO_S = 60;
export const CODIGOS_POR_HORA = 5;
export const CODIGO_TENTATIVAS = 5;
// Seção 6.2: sessão do signatário depois do código.
export const SESSAO_SIGNATARIO_S = 2 * 60 * 60;
// Critério 8.5: assinatura desenhada, só PNG, até 200 KB.
export const ASSINATURA_PNG_MAX_BYTES = 200 * 1024;
// Seção 7.3 (as_signatarios.motivo_recusa) e texto de campo (regra 11.3).
export const MOTIVO_MAX = 500;
export const TEXTO_CAMPO_MAX = 200;
// Entrada crua do formulário do signatário, antes de limpar (seção 8.5): PNG em base64 cresce 4/3
// e leva o prefixo da data URL; CPF com pontuação; motivo com espaços sobrando.
export const ASSINATURA_DATAURL_MAX = Math.ceil((ASSINATURA_PNG_MAX_BYTES * 4) / 3) + 64;
export const CPF_ENTRADA_MAX = 20;
export const MOTIVO_ENTRADA_MAX = MOTIVO_MAX * 2;
// Regra 11.14: o signatário baixa o final pelo link até 30 dias depois da conclusão.
export const DOWNLOAD_FINAL_DIAS = 30;
// Seção 15: versão do texto de consentimento em vigor.
export const CONSENTIMENTO_VERSAO = "2026-11-17";

// Finalização (épico 8.6, regras 11.3, 11.10 e seção 15.2).
export const SELO_PLACEHOLDER_BYTES = 24 * 1024; // regra 11.10
export const TSA_TIMEOUT_MS = 5000; // regra 11.10
export const FINALIZACAO_TENTATIVAS = 3; // regra 11.10: a do momento + 2 da faxina
export const ANEXO_EMAIL_MAX_BYTES = 7 * 1024 * 1024; // critério 8.6: PDF anexo até 7 MB
export const CAMPO_TEXTO_PT = 10; // regra 11.3: texto em Helvetica 10 pt

// Painel (épico 8.7, regras 11.5 e seção 8.7).
export const ENVELOPES_POR_PAGINA = 30; // critério 8.7
export const LEMBRETE_MANUAL_INTERVALO_H = 24; // regra 11.5
export const MAX_LEMBRETES = 10; // regra 11.5
export const BUSCA_MAX = 100; // tamanho da busca da lista
export const MOTIVO_CANCELAMENTO_MAX = 500; // coluna motivo_cancelamento
