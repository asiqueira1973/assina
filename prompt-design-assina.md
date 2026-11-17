# Prompt para o Claude Design — Assina

Cole o bloco abaixo no Claude Design. Fonte: `spec.md` v0.1, seções 5, 8, 9, 10, 15 e 16.

```
Crie todas as telas do Assina, um app web gratuito em português para mandar PDFs para assinatura eletrônica (uma versão enxuta do DocuSign). Desenhe cada tela em desktop (1280 px) e celular (375 px), em modo claro e escuro. Use a copy abaixo literalmente: ela é texto final. Não invente telas além das listadas.

## Identidade visual (mesma família do app Reunião, reuniao.app.br)
- Tipografia de sistema Apple (-apple-system, SF Pro Display/Text, Helvetica Neue). Títulos de página grandes e pesados (~34 px, 700, tracking negativo). Datas e contadores com números tabulares.
- Único destaque de marca: azul #0071e3 (escuro #0a84ff). Vai em botões primários em pílula com ícone "+" no canto superior direito, alinhado ao título da página (ex.: "+ Novo envelope"), em links, no item ativo do menu e no foco. O azul nunca indica status.
- Fundo branco ou preto. Menu lateral e cartões de lista em cinza #f5f5f7 (escuro #1c1c1e). Texto secundário #6e6e73 / #98989d. Hairlines de 1 px, sem sombra pesada e muito espaço em branco.
- Pílulas de status com fundo da cor a 12% e texto na cor: verde #34c759 = Concluído/Assinou; laranja #ff9500 = Aguardando/atenção; vermelho #ff3b30 = Recusado/Cancelado/erro; cinza #8e8e93 = Rascunho/Expirado; azul-acinzentado neutro = Finalizando.
- Listas: cada item é um cartão cinza de cantos de 16–18 px, sem borda, com título em semibold, uma linha secundária menor e, à direita, a pílula de status e botões brancos em pílula ("Copiar link", ícone de abrir). Espaço de 12 px entre os cartões.
- Ícones de traço fino (estilo lucide). Toque mínimo de 44 px.

## Navegação do painel: menu lateral estilo App Store Connect
- Coluna fixa à esquerda (~250 px), fundo cinza claro, "Assina" no topo em negrito.
- Grupos com título em negrito escuro e caixa normal (nunca maiúsculas): **Documentos** (Envelopes, Novo envelope) e **Configurar** (Integrações, Conta).
- Itens indentados sob o grupo, sem marcador. Hairline entre os grupos.
- Um item ativo por vez: texto azul #0071e3 com pílula azul clara ao fundo.
- Rodapé separado por hairline: nome e e-mail da conta e o link azul "Verificar documento".
- Abaixo de 1024 px, o menu vira gaveta aberta por um botão no topo.

## Perfis
- Remetente: logado com Google. Vê e age só nos próprios envelopes.
- Signatário: sem conta, chega por um link de e-mail. Só vê o próprio envelope, e o conteúdo do PDF só aparece depois que ele digita o código recebido por e-mail. Nunca vê e-mail nem CPF dos outros, só os nomes.
- Público: só a página de verificação e as páginas institucionais.

## Fluxo principal
Remetente: Envelopes → Novo envelope (upload, destinatários, configurações) → Posicionar campos → Revisar e enviar → Detalhe do envelope.
Signatário: e-mail → Assinar (identificação → código → consentimento → documento com campos → folha de assinatura → "Documento assinado.") → e-mail com o PDF final.
Qualquer pessoa: Verificar (arrasta o PDF ou digita o código do manifesto).

## Telas

### Públicas
1. Página inicial (/): título "Mande documentos para assinar.", subtítulo "Suba um PDF, diga quem assina e receba de volta o documento assinado, com a trilha de auditoria. Grátis.", botões "Entrar com Google" (primário) e "Verificar um documento" (secundário), aviso discreto "Para escrituras e atos que exigem certificado ICP-Brasil, use um cartório ou certificado próprio." e rodapé "Privacidade · Termos · Código aberto no GitHub · Um produto DabLab". Ilustração mínima ou nenhuma.
2. Entrar (/entrar): cartão centralizado de ~352 px com "Assina" e o botão "Entrar com Google". Estados de erro: "Este e-mail não tem acesso." / "Esta conta está suspensa." / "Cadastros pausados por hoje. Tente amanhã."
3. Verificar (/verificar e /verificar/{codigo}): título "Verificar um documento", texto "Arraste o PDF assinado ou digite o código que aparece no manifesto. O arquivo não sai do seu computador.", área de arrastar e campo de código no formato XXXX-XXXX-XXXX. Resultados:
   - verde "Documento assinado e íntegro.", com o título, enviado em, concluído em, a lista de assinantes (nome + data e hora da assinatura) e o tipo do selo;
   - neutro "Este é o documento original, antes das assinaturas.";
   - laranja "Este envelope ainda não foi concluído.";
   - vermelho "Não encontramos este documento. Ele pode ter sido alterado depois de assinado ou excluído pelo remetente."
4. Documentação da API (/docs/api): página de leitura com índice lateral, blocos de código (curl) e a seção de webhooks.
5. Privacidade e Termos: página de texto longo, coluna de leitura de ~680 px.

### [Remetente]
6. Boas-vindas: "Boas-vindas ao Assina.", caixa de seleção "Li e aceito os Termos de uso e a Política de privacidade." e "Continuar" (desabilitado até marcar).
7. Envelopes (/painel): título "Envelopes" + botão "+ Novo envelope". Filtros em controle segmentado: "Todos", "Aguardando", "Concluídos", "Rascunhos", "Encerrados". Linha discreta de uso acima da lista: "12 de 50 documentos · Nível 1" (laranja a partir de 80%; ao atingir o limite: "Você chegou ao limite de 50 documentos do seu nível. Exclua envelopes antigos para liberar espaço."). Campo de busca. Cada linha é um cartão com o título, a linha secundária "2 de 3 assinaram · enviado em 12/11" e a pílula de status ("Rascunho", "Aguardando", "Finalizando", "Concluído", "Recusado", "Cancelado", "Expirado"). Estados:
   - carregando: esqueleto com a forma dos cartões;
   - vazio em Todos: "Nenhum envelope ainda." com o botão "Mandar o primeiro";
   - vazio num filtro: "Nada por aqui."
8. Novo envelope (/painel/envelopes/novo): uma coluna de até ~760 px.
   - Área de upload "Arraste o PDF aqui ou escolha um arquivo" / "Até 10 MB e 100 páginas.", com estado de progresso e estados de erro ("Isso não é um PDF.", "O arquivo passa de 10 MB.", "O PDF tem mais de 100 páginas.", "Este PDF está protegido por senha. Tire a senha e tente de novo."). Depois do upload, vira um cartão com o nome do arquivo, o número de páginas e "Trocar".
   - Campos Título e Mensagem (opcional).
   - Seção "Quem recebe": linhas com Nome, E-mail, seletor "Assina"/"Recebe cópia", interruptor "Pedir CPF", alça de arrastar (visível quando "Assinar em ordem" está ligado, com o número da ordem) e "Adicionar pessoa". Erros: "Esse e-mail já está na lista." / "Até 10 pessoas assinam um documento." / "Adicione pelo menos uma pessoa para assinar."
   - Seção de configurações: "Prazo para assinar" ("30 dias") e "Lembrete automático" ("A cada 2 dias", "A cada 3 dias", "A cada 7 dias", "Sem lembrete").
   - Rodapé: "Enviar sem campos" (secundário) e "Próximo: posicionar campos" (primário).
9. Posicionar campos (/painel/envelopes/{id}/campos), só desktop:
   - À esquerda, a lista de assinantes, cada um com um ponto colorido (cores na ordem: #af52de, #ff9500, #30b0c7, #ff2d55, #a2845e, #34c759, #5856d6, #ffcc00, #00c7be, #8e8e93), e abaixo a paleta de campos ("Assinatura", "Rubrica", "Data", "Nome", "Texto", "Caixa de seleção").
   - No centro, as páginas do PDF em fundo cinza, com os campos como retângulos na cor do assinante, com rótulo, alças de redimensionar e ícone de apagar.
   - À direita, o painel do campo selecionado ("Obrigatório", "Dica para quem preenche").
   - No topo, "Campos de {nome}" e o botão "Salvar e revisar".
   - No celular, só a mensagem "Use um computador para posicionar campos." e o botão "Enviar sem campos".
10. Revisar e enviar: "Revise antes de enviar". Resumo com título, mensagem, destinatários na ordem com a contagem de campos de cada um, prazo e lembrete. Aviso laranja quando aplicável: "{nome} não tem campo de assinatura. Ele vai assinar só no manifesto." Nota "Depois de enviado, o documento não pode ser alterado." Botão "Enviar para assinatura". Confirmação "Enviado."
11. Detalhe do envelope (/painel/envelopes/{id}):
   - Cabeçalho com título, pílula de status, código de verificação e ações ("Baixar original", "Baixar assinado", "Exportar trilha", "Cancelar envelope", "Excluir").
   - Faixa laranja quando um e-mail falhou: "Não consegui enviar o convite para {email}." com "Tentar de novo".
   - Destinatários em cartões: nome, e-mail, ordem, status ("Aguardando a vez", "Aguardando", "Assinou em {data}", "Recusou em {data}", "Recebe cópia"), botões "Lembrar" e "Copiar link de assinatura" (que confirma com "Link copiado. O link anterior deixa de funcionar."). Aviso "Lembrete enviado há menos de 24 horas."
   - Trilha de auditoria em linha do tempo vertical: data e hora de Brasília, ator, evento ("Envelope criado", "Enviado para assinatura", "Convite enviado", "Código de acesso enviado", "Código de acesso confirmado", "Código de acesso incorreto", "Documento aberto", "Concordou em assinar eletronicamente", "Assinou", "Recusou", "Lembrete enviado", "Documento final gerado e selado", "Concluído", "Cancelado", "Prazo encerrado", "Original baixado", "Documento assinado baixado") e IP. Selo no topo da trilha: verde "Trilha íntegra" ou vermelho "Trilha com divergência no evento {n}".
   - Modais: Cancelar ("Cancelar este envelope?" / "Quem ainda não assinou não vai mais conseguir. Motivo (opcional)" / "Cancelar envelope") e Excluir ("Excluir para sempre?" / "O documento, as assinaturas e a trilha serão apagados. A verificação deixa de encontrá-lo. Para confirmar, digite o título.").
   - Estado "Este envelope mudou de situação. Atualize a página."
12. Integrações (/painel/integracoes):
   - Cartão "Chave de API": chave mascarada com "Mostrar" e "Copiar", e "Gerar nova chave" com a confirmação "A chave atual para de funcionar na hora. Continuar?".
   - Cartão "Webhook": campo da URL, "Enviar teste" e "Segredo do webhook" (mostrar e copiar).
   - Cartão "Conectar ao Claude ou ao ChatGPT" com dois caminhos em passos numerados: "Pelo aplicativo" (copiar a URL https://assina.app.br/mcp e colar em "Adicionar conector") e "Por arquivo" (bloco JSON copiável).
   - Lista "Conexões autorizadas" (nome do cliente, criada em, último uso e "Revogar"). Vazio: "Nenhuma conexão ainda."
13. Conta (/painel/conta): nome (editável), e-mail, nível e uso ("12 de 50 documentos · Nível 1", com barra fina que fica laranja a partir de 80%), "Sair", e a zona de perigo "Excluir minha conta" com a confirmação "Todos os envelopes, documentos e trilhas serão apagados. Baixe o que precisar antes. Para confirmar, digite seu e-mail."
14. Autorizar conexão (/oauth/autorizar): cartão centralizado com "{cliente} quer acessar seu Assina.", a lista "Vai poder: ver seus envelopes, criar rascunhos, enviar, lembrar e cancelar envelopes.", a lista "Não vai poder: excluir envelopes nem ver sua chave de API." e os botões "Permitir" (primário) e "Cancelar".

### [Signatário] Assinar (/assinar/{token}), pensada primeiro para o celular
15a. Identificação: cartão centralizado de até 440 px com "{remetente} enviou um documento para você assinar.", o título em destaque, "Para abrir, vamos mandar um código para a***@dominio.com." e o botão "Enviar código". Erro: "Não consegui enviar o código agora. Tente de novo em instantes."
15b. Código: "Digite o código de 6 dígitos" (seis caixas), "Reenviar código" com contagem ("Reenviar em 42 s"). Erros: "Código errado. Restam {n} tentativas.", "Código bloqueado. Peça um novo.", "Código expirado. Peça um novo.", "Muitos códigos pedidos. Tente em uma hora."
15c. Consentimento: caixa de seleção com o texto "Concordo em assinar este documento eletronicamente. Entendo que minha assinatura será registrada com meu nome, e-mail, endereço IP, data e hora, e que tem validade jurídica entre as partes que aceitam este meio, nos termos do art. 10, § 2º, da MP 2.200-2/2001."
15d. Documento: páginas do PDF na largura toda, sobre fundo cinza. Os campos a preencher têm contorno tracejado na cor do signatário; os preenchidos, fundo verde claro. Barra inferior fixa com "Campos: 2 de 5", "Próximo campo" e o botão primário "Assinar" (desabilitado até completar). Link "Recusar".
15e. Folha "Sua assinatura" (bottom sheet no celular, modal no desktop) com as abas "Digitar" (nome em fonte cursiva, editável) e "Desenhar" (canvas com "Limpar"), o campo "CPF" quando exigido (erro "CPF inválido.") e o botão "Usar esta assinatura".
15f. Recusar: "Recusar este documento?" / "Conte o motivo para {remetente}." (campo obrigatório) / "Recusar".
15g. Estados finais, cada um com ícone e frase:
   - "Documento assinado." / "Quando todos assinarem, você recebe o documento final por e-mail."
   - "Você recusou este documento. Avisamos {remetente}."
   - "Ainda não é a sua vez. Avisaremos por e-mail."
   - "Você já assinou este documento.", com a lista de nomes e status
   - "Este documento foi recusado por {nome}."
   - "Este documento foi cancelado por {remetente}."
   - "O prazo para assinar terminou."
   - "Documento concluído." com "Baixar documento assinado"
   - "Peça o documento a {remetente}."
   - "Este link não é válido."
   - "Este documento não está disponível."

### E-mails (layout único)
16. Modelo de e-mail HTML: fundo branco, título grande, parágrafo, botão azul em pílula ("Revisar e assinar" / "Baixar documento assinado") e rodapé discreto "Enviado pelo Assina, um produto DabLab". Mostrar o convite e o e-mail com o código ("Seu código: 482913").

### Documento gerado
17. Manifesto de assinaturas (página A4 em PDF, sempre branca):
   - cabeçalho com "Assina" em azul e o QR à direita;
   - título "Manifesto de assinaturas";
   - título do documento, remetente, código de verificação e SHA-256 do original em fonte monoespaçada pequena;
   - enviado e concluído em horário de Brasília;
   - por assinante, um bloco com nome, e-mail mascarado, CPF mascarado, a imagem ou o nome cursivo da assinatura, "Autenticado por código enviado ao e-mail", IP, data e hora;
   - tabela da trilha;
   - rodapé com o texto legal: "Documento assinado eletronicamente pela plataforma Assina (DabLab). As assinaturas acima foram feitas por pessoas que comprovaram o acesso ao próprio e-mail por código de uso único, nos termos do art. 10, § 2º, da Medida Provisória 2.200-2/2001. A integridade deste arquivo é protegida por selo eletrônico da plataforma e pode ser conferida em assina.app.br/verificar."

## Livre para você propor
Ícones, microanimações discretas, o desenho exato do canvas de assinatura e a escolha da fonte cursiva (licença OFL, ex.: Dancing Script ou Caveat).
```
