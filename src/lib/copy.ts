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
  draft: {
    uploadTitle: "Novo envelope",
    dropzone: "Arraste o PDF aqui ou escolha um arquivo",
    dropzoneHint: "Até 10 MB e 100 páginas.",
    uploading: "Enviando o arquivo… {n}%",
    checking: "Conferindo o arquivo…",
    replace: "Trocar",
    pages: (n: number) => (n === 1 ? "1 página" : `${n} páginas`),
    fileErrors: {
      nao_e_pdf: "Isso não é um PDF.",
      grande_demais: "O arquivo passa de 10 MB.",
      paginas_demais: "O PDF tem mais de 100 páginas.",
      protegido_por_senha: "Este PDF está protegido por senha. Tire a senha e tente de novo.",
      pagina_grande_demais: "As páginas deste PDF são grandes demais (máximo de 50 × 50 cm).",
    },
    alreadySigned: "Este PDF já foi assinado eletronicamente. Essa assinatura deixa de valer depois das novas.",
    fieldsRemoved: "Os campos posicionados foram removidos.",
    title: "Título",
    message: "Mensagem (opcional)",
    recipients: "Quem recebe",
    name: "Nome",
    email: "E-mail",
    addPerson: "Adicionar pessoa",
    signs: "Assina",
    copy: "Recebe cópia",
    requireCpf: "Pedir CPF",
    inOrder: "Assinar em ordem",
    remove: "Remover",
    moveUp: "Subir",
    moveDown: "Descer",
    emailRepeated: "Esse e-mail já está na lista.",
    maxSigners: "Até 10 pessoas assinam um documento.",
    needSigner: "Adicione pelo menos uma pessoa para assinar.",
    deadline: "Prazo para assinar",
    deadlineDays: (n: number) => `${n} dias`,
    reminder: "Lembrete automático",
    reminderEvery: (n: number) => `A cada ${n} dias`,
    noReminder: "Sem lembrete",
    nextFields: "Próximo: posicionar campos",
    sendWithoutFields: "Enviar sem campos",
    saving: "Salvando…",
    saved: "Rascunho salvo.",
    saveFailed: "Não consegui salvar. Tente de novo.",
  },
  fields: {
    signerFields: (nome: string) => `Campos de ${nome}`,
    types: {
      assinatura: "Assinatura",
      rubrica: "Rubrica",
      data: "Data",
      nome: "Nome",
      texto: "Texto",
      caixa: "Caixa de seleção",
    },
    required: "Obrigatório",
    hint: "Dica para quem preenche",
    saveAndReview: "Salvar e revisar",
    back: "Voltar",
    useComputer: "Use um computador para posicionar campos.",
    loading: "Carregando o documento…",
    loadFailed: "Não consegui abrir o documento. Tente de novo.",
    howTo: "Arraste um campo para a página ou toque nele para pôr na página à vista.",
    pageOf: (n: number, total: number) => `Página ${n} de ${total}`,
    retry: "Tentar de novo",
    keyboardHelp: "Setas movem o campo, Shift e setas mudam o tamanho, Delete apaga.",
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
