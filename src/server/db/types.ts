// Gerado por `npm run db:types` (supabase gen types). Não editar à mão.
import "server-only";


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "as_campos": {
                  Row: {
                    "altura": number,"envelope_id": string,"id": string,"largura": number,"obrigatorio": boolean,"pagina": number,"rotulo": string | null,"signatario_id": string,"tipo": Database["public"]['Enums']["as_tipo_campo"],"valor": string | null,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "altura": number,"envelope_id": string,"id"?: string,"largura": number,"obrigatorio"?: boolean,"pagina": number,"rotulo"?: string | null,"signatario_id": string,"tipo": Database["public"]['Enums']["as_tipo_campo"],"valor"?: string | null,"x": number,"y": number
                  }
                  Update: {
                    "altura"?: number,"envelope_id"?: string,"id"?: string,"largura"?: number,"obrigatorio"?: boolean,"pagina"?: number,"rotulo"?: string | null,"signatario_id"?: string,"tipo"?: Database["public"]['Enums']["as_tipo_campo"],"valor"?: string | null,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_campos_envelope_id_fkey"
      columns: ["envelope_id"]
isOneToOne: false
      referencedRelation: "as_envelopes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_campos_signatario_id_fkey"
      columns: ["signatario_id"]
isOneToOne: false
      referencedRelation: "as_signatarios"
      referencedColumns: ["id"]
    }
                  ]
                },"as_contas": {
                  Row: {
                    "atualizado_em": string,"criado_em": string,"email": string,"google_sub": string,"id": string,"nivel": number,"nome": string,"suspensa_em": string | null,"termos_aceitos_em": string | null,"webhook_segredo_cifrado": string | null,"webhook_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"criado_em"?: string,"email": string,"google_sub": string,"id"?: string,"nivel"?: number,"nome": string,"suspensa_em"?: string | null,"termos_aceitos_em"?: string | null,"webhook_segredo_cifrado"?: string | null,"webhook_url"?: string | null
                  }
                  Update: {
                    "atualizado_em"?: string,"criado_em"?: string,"email"?: string,"google_sub"?: string,"id"?: string,"nivel"?: number,"nome"?: string,"suspensa_em"?: string | null,"termos_aceitos_em"?: string | null,"webhook_segredo_cifrado"?: string | null,"webhook_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"as_credenciais": {
                  Row: {
                    "conta_id": string,"criado_em": string,"id": string,"nome": string,"oauth_cliente_id": string | null,"prefixo": string,"revogada_em": string | null,"tipo": Database["public"]['Enums']["as_tipo_credencial"],"ultimo_uso_em": string | null,"valor_cifrado": string | null,"valor_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conta_id": string,"criado_em"?: string,"id"?: string,"nome": string,"oauth_cliente_id"?: string | null,"prefixo": string,"revogada_em"?: string | null,"tipo": Database["public"]['Enums']["as_tipo_credencial"],"ultimo_uso_em"?: string | null,"valor_cifrado"?: string | null,"valor_hash": string
                  }
                  Update: {
                    "conta_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"oauth_cliente_id"?: string | null,"prefixo"?: string,"revogada_em"?: string | null,"tipo"?: Database["public"]['Enums']["as_tipo_credencial"],"ultimo_uso_em"?: string | null,"valor_cifrado"?: string | null,"valor_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_credenciais_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_credenciais_oauth_cliente_id_fkey"
      columns: ["oauth_cliente_id"]
isOneToOne: false
      referencedRelation: "as_oauth_clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"as_entregas_webhook": {
                  Row: {
                    "conta_id": string,"corpo": NonNullable<Json>,"criado_em": string,"entregue_em": string | null,"envelope_id": string,"evento": string,"id": string,"status": Database["public"]['Enums']["as_status_entrega"],"tentativas": number,"ultimo_status_http": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "conta_id": string,"corpo": NonNullable<Json>,"criado_em"?: string,"entregue_em"?: string | null,"envelope_id": string,"evento": string,"id"?: string,"status"?: Database["public"]['Enums']["as_status_entrega"],"tentativas"?: number,"ultimo_status_http"?: number | null
                  }
                  Update: {
                    "conta_id"?: string,"corpo"?: NonNullable<Json>,"criado_em"?: string,"entregue_em"?: string | null,"envelope_id"?: string,"evento"?: string,"id"?: string,"status"?: Database["public"]['Enums']["as_status_entrega"],"tentativas"?: number,"ultimo_status_http"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_entregas_webhook_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_entregas_webhook_envelope_id_fkey"
      columns: ["envelope_id"]
isOneToOne: false
      referencedRelation: "as_envelopes"
      referencedColumns: ["id"]
    }
                  ]
                },"as_envelopes": {
                  Row: {
                    "arquivo_final_path": string | null,"arquivo_original_path": string | null,"arquivos_expurgados_em": string | null,"atualizado_em": string,"chave_idempotencia": string | null,"codigo_verificacao": string,"concluido_em": string | null,"conta_id": string,"criado_em": string,"dimensoes_paginas": Json | null,"em_ordem": boolean,"encerrado_em": string | null,"enviado_em": string | null,"hash_final": string | null,"hash_original": string | null,"id": string,"lembrete_cada_dias": number | null,"mensagem": string | null,"motivo_cancelamento": string | null,"nome_arquivo": string | null,"origem": Database["public"]['Enums']["as_origem"],"paginas": number | null,"prazo_dias": number,"prazo_em": string | null,"selo": string | null,"status": Database["public"]['Enums']["as_status_envelope"],"tamanho_bytes": number | null,"tentativas_finalizacao": number,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_final_path"?: string | null,"arquivo_original_path"?: string | null,"arquivos_expurgados_em"?: string | null,"atualizado_em"?: string,"chave_idempotencia"?: string | null,"codigo_verificacao": string,"concluido_em"?: string | null,"conta_id": string,"criado_em"?: string,"dimensoes_paginas"?: Json | null,"em_ordem"?: boolean,"encerrado_em"?: string | null,"enviado_em"?: string | null,"hash_final"?: string | null,"hash_original"?: string | null,"id"?: string,"lembrete_cada_dias"?: number | null,"mensagem"?: string | null,"motivo_cancelamento"?: string | null,"nome_arquivo"?: string | null,"origem": Database["public"]['Enums']["as_origem"],"paginas"?: number | null,"prazo_dias"?: number,"prazo_em"?: string | null,"selo"?: string | null,"status"?: Database["public"]['Enums']["as_status_envelope"],"tamanho_bytes"?: number | null,"tentativas_finalizacao"?: number,"titulo": string
                  }
                  Update: {
                    "arquivo_final_path"?: string | null,"arquivo_original_path"?: string | null,"arquivos_expurgados_em"?: string | null,"atualizado_em"?: string,"chave_idempotencia"?: string | null,"codigo_verificacao"?: string,"concluido_em"?: string | null,"conta_id"?: string,"criado_em"?: string,"dimensoes_paginas"?: Json | null,"em_ordem"?: boolean,"encerrado_em"?: string | null,"enviado_em"?: string | null,"hash_final"?: string | null,"hash_original"?: string | null,"id"?: string,"lembrete_cada_dias"?: number | null,"mensagem"?: string | null,"motivo_cancelamento"?: string | null,"nome_arquivo"?: string | null,"origem"?: Database["public"]['Enums']["as_origem"],"paginas"?: number | null,"prazo_dias"?: number,"prazo_em"?: string | null,"selo"?: string | null,"status"?: Database["public"]['Enums']["as_status_envelope"],"tamanho_bytes"?: number | null,"tentativas_finalizacao"?: number,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_envelopes_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    }
                  ]
                },"as_envios": {
                  Row: {
                    "conta_id": string,"enviado_em": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conta_id": string,"enviado_em"?: string,"id"?: string
                  }
                  Update: {
                    "conta_id"?: string,"enviado_em"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_envios_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    }
                  ]
                },"as_eventos": {
                  Row: {
                    "ator": Database["public"]['Enums']["as_ator"],"dados": NonNullable<Json>,"envelope_id": string,"hash": string,"hash_anterior": string,"id": string,"ip": unknown,"ocorrido_em": string,"seq": number,"signatario_id": string | null,"tipo": Database["public"]['Enums']["as_tipo_evento"],"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ator": Database["public"]['Enums']["as_ator"],"dados"?: NonNullable<Json>,"envelope_id": string,"hash": string,"hash_anterior": string,"id"?: string,"ip"?: unknown,"ocorrido_em"?: string,"seq": number,"signatario_id"?: string | null,"tipo": Database["public"]['Enums']["as_tipo_evento"],"user_agent"?: string | null
                  }
                  Update: {
                    "ator"?: Database["public"]['Enums']["as_ator"],"dados"?: NonNullable<Json>,"envelope_id"?: string,"hash"?: string,"hash_anterior"?: string,"id"?: string,"ip"?: unknown,"ocorrido_em"?: string,"seq"?: number,"signatario_id"?: string | null,"tipo"?: Database["public"]['Enums']["as_tipo_evento"],"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_eventos_envelope_id_fkey"
      columns: ["envelope_id"]
isOneToOne: false
      referencedRelation: "as_envelopes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_eventos_signatario_id_fkey"
      columns: ["signatario_id"]
isOneToOne: false
      referencedRelation: "as_signatarios"
      referencedColumns: ["id"]
    }
                  ]
                },"as_notificacoes": {
                  Row: {
                    "chave": string,"conta_id": string,"criado_em": string,"envelope_id": string | null,"enviada_em": string | null,"erro": string | null,"id": string,"resend_id": string | null,"reservada_em": string | null,"signatario_id": string | null,"status": Database["public"]['Enums']["as_status_notificacao"],"tentativas": number,"tipo": Database["public"]['Enums']["as_tipo_notificacao"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"conta_id": string,"criado_em"?: string,"envelope_id"?: string | null,"enviada_em"?: string | null,"erro"?: string | null,"id"?: string,"resend_id"?: string | null,"reservada_em"?: string | null,"signatario_id"?: string | null,"status"?: Database["public"]['Enums']["as_status_notificacao"],"tentativas"?: number,"tipo": Database["public"]['Enums']["as_tipo_notificacao"]
                  }
                  Update: {
                    "chave"?: string,"conta_id"?: string,"criado_em"?: string,"envelope_id"?: string | null,"enviada_em"?: string | null,"erro"?: string | null,"id"?: string,"resend_id"?: string | null,"reservada_em"?: string | null,"signatario_id"?: string | null,"status"?: Database["public"]['Enums']["as_status_notificacao"],"tentativas"?: number,"tipo"?: Database["public"]['Enums']["as_tipo_notificacao"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_notificacoes_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_notificacoes_envelope_id_fkey"
      columns: ["envelope_id"]
isOneToOne: false
      referencedRelation: "as_envelopes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_notificacoes_signatario_id_fkey"
      columns: ["signatario_id"]
isOneToOne: false
      referencedRelation: "as_signatarios"
      referencedColumns: ["id"]
    }
                  ]
                },"as_oauth_clientes": {
                  Row: {
                    "criado_em": string,"id": string,"nome": string,"redirect_uris": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"id"?: string,"nome": string,"redirect_uris": (string)[]
                  }
                  Update: {
                    "criado_em"?: string,"id"?: string,"nome"?: string,"redirect_uris"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"as_oauth_codigos": {
                  Row: {
                    "cliente_id": string,"code_challenge": string,"codigo_hash": string,"conta_id": string,"expira_em": string,"redirect_uri": string,"usado_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"code_challenge": string,"codigo_hash": string,"conta_id": string,"expira_em": string,"redirect_uri": string,"usado_em"?: string | null
                  }
                  Update: {
                    "cliente_id"?: string,"code_challenge"?: string,"codigo_hash"?: string,"conta_id"?: string,"expira_em"?: string,"redirect_uri"?: string,"usado_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_oauth_codigos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "as_oauth_clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_oauth_codigos_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    }
                  ]
                },"as_signatarios": {
                  Row: {
                    "assinado_em": string | null,"assinatura_imagem_path": string | null,"assinatura_texto": string | null,"codigo_expira_em": string | null,"codigo_hash": string | null,"codigo_tentativas": number,"codigos_enviados_hora": number,"consentimento_versao": string | null,"conta_id": string,"cpf": string | null,"criado_em": string,"email": string,"envelope_id": string,"exigir_cpf": boolean,"id": string,"ip_assinatura": unknown,"janela_codigos_desde": string | null,"lembretes_enviados": number,"metodo_assinatura": Database["public"]['Enums']["as_metodo_assinatura"] | null,"motivo_recusa": string | null,"nome": string,"notificado_em": string | null,"ordem": number,"papel": Database["public"]['Enums']["as_papel"],"recusado_em": string | null,"rubrica_imagem_path": string | null,"rubrica_texto": string | null,"status": Database["public"]['Enums']["as_status_signatario"],"token_hash": string,"ultimo_lembrete_em": string | null,"user_agent_assinatura": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assinado_em"?: string | null,"assinatura_imagem_path"?: string | null,"assinatura_texto"?: string | null,"codigo_expira_em"?: string | null,"codigo_hash"?: string | null,"codigo_tentativas"?: number,"codigos_enviados_hora"?: number,"consentimento_versao"?: string | null,"conta_id": string,"cpf"?: string | null,"criado_em"?: string,"email": string,"envelope_id": string,"exigir_cpf"?: boolean,"id"?: string,"ip_assinatura"?: unknown,"janela_codigos_desde"?: string | null,"lembretes_enviados"?: number,"metodo_assinatura"?: Database["public"]['Enums']["as_metodo_assinatura"] | null,"motivo_recusa"?: string | null,"nome": string,"notificado_em"?: string | null,"ordem"?: number,"papel"?: Database["public"]['Enums']["as_papel"],"recusado_em"?: string | null,"rubrica_imagem_path"?: string | null,"rubrica_texto"?: string | null,"status"?: Database["public"]['Enums']["as_status_signatario"],"token_hash": string,"ultimo_lembrete_em"?: string | null,"user_agent_assinatura"?: string | null
                  }
                  Update: {
                    "assinado_em"?: string | null,"assinatura_imagem_path"?: string | null,"assinatura_texto"?: string | null,"codigo_expira_em"?: string | null,"codigo_hash"?: string | null,"codigo_tentativas"?: number,"codigos_enviados_hora"?: number,"consentimento_versao"?: string | null,"conta_id"?: string,"cpf"?: string | null,"criado_em"?: string,"email"?: string,"envelope_id"?: string,"exigir_cpf"?: boolean,"id"?: string,"ip_assinatura"?: unknown,"janela_codigos_desde"?: string | null,"lembretes_enviados"?: number,"metodo_assinatura"?: Database["public"]['Enums']["as_metodo_assinatura"] | null,"motivo_recusa"?: string | null,"nome"?: string,"notificado_em"?: string | null,"ordem"?: number,"papel"?: Database["public"]['Enums']["as_papel"],"recusado_em"?: string | null,"rubrica_imagem_path"?: string | null,"rubrica_texto"?: string | null,"status"?: Database["public"]['Enums']["as_status_signatario"],"token_hash"?: string,"ultimo_lembrete_em"?: string | null,"user_agent_assinatura"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "as_signatarios_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "as_contas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "as_signatarios_envelope_id_fkey"
      columns: ["envelope_id"]
isOneToOne: false
      referencedRelation: "as_envelopes"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "as_fn_anexa_arquivo":
{ Args: { "p_caminho": string,"p_conta_id": string,"p_dimensoes": Json,"p_envelope_id": string,"p_nome": string,"p_paginas": number,"p_tamanho": number }; Returns: {
              "caminho_anterior": string,"campos_removidos": boolean
            }[]
                           },
"as_fn_assina":
{ Args: { "p_assinatura_path": string,"p_assinatura_texto": string,"p_campos": Json,"p_consentimento": string,"p_cpf": string,"p_ip"?: unknown,"p_metodo": Database["public"]['Enums']["as_metodo_assinatura"],"p_rubrica_path": string,"p_rubrica_texto": string,"p_signatario_id": string,"p_token_hash": string,"p_user_agent"?: string }; Returns: {
              "envelope_status": Database["public"]['Enums']["as_status_envelope"],"proximo_id": string
            }[]
                           },
"as_fn_cria_rascunho":
{ Args: { "p_ator": Database["public"]['Enums']["as_ator"],"p_codigo_verificacao": string,"p_conta_id": string,"p_ip"?: unknown,"p_origem": Database["public"]['Enums']["as_origem"],"p_titulo": string,"p_user_agent"?: string }; Returns: {
              "arquivo_final_path": string | null,
"arquivo_original_path": string | null,
"arquivos_expurgados_em": string | null,
"atualizado_em": string,
"chave_idempotencia": string | null,
"codigo_verificacao": string,
"concluido_em": string | null,
"conta_id": string,
"criado_em": string,
"dimensoes_paginas": Json | null,
"em_ordem": boolean,
"encerrado_em": string | null,
"enviado_em": string | null,
"hash_final": string | null,
"hash_original": string | null,
"id": string,
"lembrete_cada_dias": number | null,
"mensagem": string | null,
"motivo_cancelamento": string | null,
"nome_arquivo": string | null,
"origem": Database["public"]['Enums']["as_origem"],
"paginas": number | null,
"prazo_dias": number,
"prazo_em": string | null,
"selo": string | null,
"status": Database["public"]['Enums']["as_status_envelope"],
"tamanho_bytes": number | null,
"tentativas_finalizacao": number,
"titulo": string
            }
                          SetofOptions: {
        from: "*"
        to: "as_envelopes"
        isOneToOne: true
        isSetofReturn: false
      } },
"as_fn_entra_conta":
{ Args: { "p_chave_cifrada": string,"p_chave_hash": string,"p_chave_prefixo": string,"p_email": string,"p_google_sub": string,"p_nome": string }; Returns: {
              "conta_id": string,"nova": boolean,"suspensa": boolean
            }[]
                           },
"as_fn_envia_envelope":
{ Args: { "p_ator": Database["public"]['Enums']["as_ator"],"p_caminho": string,"p_conta_id": string,"p_envelope_id": string,"p_hash": string,"p_ip"?: unknown,"p_limite_diario": number,"p_limites_nivel": (number)[],"p_tokens": Json,"p_user_agent"?: string }; Returns: {
              "assinado_em": string | null,
"assinatura_imagem_path": string | null,
"assinatura_texto": string | null,
"codigo_expira_em": string | null,
"codigo_hash": string | null,
"codigo_tentativas": number,
"codigos_enviados_hora": number,
"consentimento_versao": string | null,
"conta_id": string,
"cpf": string | null,
"criado_em": string,
"email": string,
"envelope_id": string,
"exigir_cpf": boolean,
"id": string,
"ip_assinatura": unknown,
"janela_codigos_desde": string | null,
"lembretes_enviados": number,
"metodo_assinatura": Database["public"]['Enums']["as_metodo_assinatura"] | null,
"motivo_recusa": string | null,
"nome": string,
"notificado_em": string | null,
"ordem": number,
"papel": Database["public"]['Enums']["as_papel"],
"recusado_em": string | null,
"rubrica_imagem_path": string | null,
"rubrica_texto": string | null,
"status": Database["public"]['Enums']["as_status_signatario"],
"token_hash": string,
"ultimo_lembrete_em": string | null,
"user_agent_assinatura": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "as_signatarios"
        isOneToOne: false
        isSetofReturn: true
      } },
"as_fn_evento_canonico":
{ Args: { "p_ator": Database["public"]['Enums']["as_ator"],"p_dados": Json,"p_envelope_id": string,"p_ip": unknown,"p_ocorrido_em": string,"p_seq": number,"p_signatario_id": string,"p_tipo": Database["public"]['Enums']["as_tipo_evento"],"p_user_agent": string }; Returns: string
                           },
"as_fn_novo_codigo":
{ Args: { "p_codigo_hash": string,"p_intervalo_s": number,"p_max_hora": number,"p_signatario_id": string,"p_validade_s": number }; Returns: string
                           },
"as_fn_recusa":
{ Args: { "p_ip"?: unknown,"p_motivo": string,"p_signatario_id": string,"p_token_hash": string,"p_user_agent"?: string }; Returns: string
                           },
"as_fn_registra_evento":
{ Args: { "p_ator": Database["public"]['Enums']["as_ator"],"p_dados"?: Json,"p_envelope_id": string,"p_ip"?: unknown,"p_signatario_id"?: string,"p_tipo": Database["public"]['Enums']["as_tipo_evento"],"p_user_agent"?: string }; Returns: {
              "ator": Database["public"]['Enums']["as_ator"],
"dados": NonNullable<Json>,
"envelope_id": string,
"hash": string,
"hash_anterior": string,
"id": string,
"ip": unknown,
"ocorrido_em": string,
"seq": number,
"signatario_id": string | null,
"tipo": Database["public"]['Enums']["as_tipo_evento"],
"user_agent": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "as_eventos"
        isOneToOne: true
        isSetofReturn: false
      } },
"as_fn_reserva_notificacao":
{ Args: { "p_id": string,"p_max_tentativas": number }; Returns: boolean
                           },
"as_fn_substitui_campos":
{ Args: { "p_conta_id": string,"p_envelope_id": string,"p_lista": Json }; Returns: {
              "altura": number,
"envelope_id": string,
"id": string,
"largura": number,
"obrigatorio": boolean,
"pagina": number,
"rotulo": string | null,
"signatario_id": string,
"tipo": Database["public"]['Enums']["as_tipo_campo"],
"valor": string | null,
"x": number,
"y": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "as_campos"
        isOneToOne: false
        isSetofReturn: true
      } },
"as_fn_substitui_signatarios":
{ Args: { "p_conta_id": string,"p_envelope_id": string,"p_lista": Json }; Returns: {
              "assinado_em": string | null,
"assinatura_imagem_path": string | null,
"assinatura_texto": string | null,
"codigo_expira_em": string | null,
"codigo_hash": string | null,
"codigo_tentativas": number,
"codigos_enviados_hora": number,
"consentimento_versao": string | null,
"conta_id": string,
"cpf": string | null,
"criado_em": string,
"email": string,
"envelope_id": string,
"exigir_cpf": boolean,
"id": string,
"ip_assinatura": unknown,
"janela_codigos_desde": string | null,
"lembretes_enviados": number,
"metodo_assinatura": Database["public"]['Enums']["as_metodo_assinatura"] | null,
"motivo_recusa": string | null,
"nome": string,
"notificado_em": string | null,
"ordem": number,
"papel": Database["public"]['Enums']["as_papel"],
"recusado_em": string | null,
"rubrica_imagem_path": string | null,
"rubrica_texto": string | null,
"status": Database["public"]['Enums']["as_status_signatario"],
"token_hash": string,
"ultimo_lembrete_em": string | null,
"user_agent_assinatura": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "as_signatarios"
        isOneToOne: false
        isSetofReturn: true
      } },
"as_fn_transicao_envelope":
{ Args: { "p_de": Database["public"]['Enums']["as_status_envelope"],"p_envelope_id": string,"p_para": Database["public"]['Enums']["as_status_envelope"] }; Returns: boolean
                           },
"as_fn_valida_codigo":
{ Args: { "p_codigo_hash": string,"p_ip"?: unknown,"p_max_tentativas": number,"p_signatario_id": string,"p_user_agent"?: string }; Returns: {
              "restantes": number,"resultado": string
            }[]
                           },
"as_fn_verifica_trilha":
{ Args: { "p_envelope_id": string }; Returns: number
                           }
          }
          Enums: {
            "as_ator": "remetente"|"signatario"|"sistema"|"api"|"mcp","as_metodo_assinatura": "digitada"|"desenhada","as_origem": "painel"|"api"|"mcp","as_papel": "assinar"|"copia","as_status_entrega": "pendente"|"entregue"|"falhou","as_status_envelope": "rascunho"|"enviado"|"finalizando"|"concluido"|"recusado"|"cancelado"|"expirado","as_status_notificacao": "pendente"|"enviada"|"falhou","as_status_signatario": "pendente"|"aguardando"|"assinou"|"recusou","as_tipo_campo": "assinatura"|"rubrica"|"data"|"nome"|"texto"|"caixa","as_tipo_credencial": "api"|"mcp","as_tipo_evento": "criado"|"enviado"|"convite_enviado"|"codigo_enviado"|"codigo_validado"|"codigo_recusado"|"visualizou"|"consentiu"|"assinou"|"recusou"|"lembrete_enviado"|"finalizado"|"concluido"|"cancelado"|"expirado"|"baixou_original"|"baixou_final","as_tipo_notificacao": "convite"|"codigo"|"lembrete"|"concluido_destinatario"|"concluido_remetente"|"assinou_remetente"|"recusado_remetente"|"recusado_destinatario"|"cancelado_destinatario"|"expirado_remetente"|"finalizacao_falhou_admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "as_ator": ["remetente", "signatario", "sistema", "api", "mcp"],"as_metodo_assinatura": ["digitada", "desenhada"],"as_origem": ["painel", "api", "mcp"],"as_papel": ["assinar", "copia"],"as_status_entrega": ["pendente", "entregue", "falhou"],"as_status_envelope": ["rascunho", "enviado", "finalizando", "concluido", "recusado", "cancelado", "expirado"],"as_status_notificacao": ["pendente", "enviada", "falhou"],"as_status_signatario": ["pendente", "aguardando", "assinou", "recusou"],"as_tipo_campo": ["assinatura", "rubrica", "data", "nome", "texto", "caixa"],"as_tipo_credencial": ["api", "mcp"],"as_tipo_evento": ["criado", "enviado", "convite_enviado", "codigo_enviado", "codigo_validado", "codigo_recusado", "visualizou", "consentiu", "assinou", "recusou", "lembrete_enviado", "finalizado", "concluido", "cancelado", "expirado", "baixou_original", "baixou_final"],"as_tipo_notificacao": ["convite", "codigo", "lembrete", "concluido_destinatario", "concluido_remetente", "assinou_remetente", "recusado_remetente", "recusado_destinatario", "cancelado_destinatario", "expirado_remetente", "finalizacao_falhou_admin"]
          }
        }
} as const
