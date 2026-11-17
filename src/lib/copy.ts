// Copy do Assina — seção 15 do spec. Texto final: não reescrever, não melhorar, sem exclamação.
// Cada épico acrescenta o seu bloco. Palavras proibidas (princípio 4) ficam fora daqui; textos que
// explicam o que o Assina NÃO é vão em LEGAL_NEGATIVAS, o único bloco que o guard-copy ignora.

export const copy = {
  appName: "Assina",
  login: {
    button: "Entrar com Google",
    errors: {
      sem_acesso: "Este e-mail não tem acesso.",
      suspensa: "Esta conta está suspensa.",
      cadastros_pausados: "Cadastros pausados por hoje. Tente amanhã.",
      falha: "Algo deu errado. Nada foi alterado. Tente de novo.",
    },
  },
  welcome: {
    title: "Boas-vindas ao Assina.",
    accept: "Li e aceito os Termos de uso e a Política de privacidade.",
    terms: "Termos de uso",
    privacy: "Política de privacidade",
    button: "Continuar",
  },
  nav: {
    groups: { documentos: "Documentos", configurar: "Configurar" },
    envelopes: "Envelopes",
    newEnvelope: "Novo envelope",
    integrations: "Integrações",
    account: "Conta",
    verify: "Verificar documento",
    // Rótulos de acessibilidade da gaveta (não aparecem como texto na tela).
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
  },
  envelopes: {
    title: "Envelopes",
    newButton: "Novo envelope",
    emptyAll: "Nenhum envelope ainda.",
    emptyAllAction: "Mandar o primeiro",
  },
  account: {
    title: "Conta",
    signOut: "Sair",
  },
  errors: {
    generic: "Algo deu errado. Nada foi alterado. Tente de novo.",
  },
} as const;

export type LoginErrorCode = keyof typeof copy.login.errors;

// Diz se um valor de ?erro= é um código de erro de login conhecido.
export function isLoginErrorCode(value: unknown): value is LoginErrorCode {
  return typeof value === "string" && Object.hasOwn(copy.login.errors, value);
}

// Textos que explicam o que o Assina NÃO é (seção 20.1). Preenchido nos épicos 8.12 em diante.
export const LEGAL_NEGATIVAS = {
} as const;
