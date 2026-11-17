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
