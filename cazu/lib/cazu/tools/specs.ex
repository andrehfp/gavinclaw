defmodule Cazu.Tools.Specs do
  @moduledoc false

  def spec_for(tool_name) when is_binary(tool_name) do
    Map.get(specs(), tool_name, default_spec(tool_name))
  end

  defp default_spec(tool_name) do
    %{
      "description" => "Execute #{tool_name} in Conta Azul",
      "parameters" => open_object()
    }
  end

  defp open_object(extra \\ %{}) do
    Map.merge(
      %{
        "type" => "object",
        "properties" => %{},
        "required" => [],
        "additionalProperties" => true
      },
      extra
    )
  end

  defp id_alias_params(keys) do
    open_object(%{
      "properties" =>
        Map.new(keys, fn key ->
          {key,
           %{
             "type" => ["string", "integer"],
             "description" => "Identifier for #{key}"
           }}
        end)
    })
  end

  defp acquittance_payment_method_enum do
    [
      "DINHEIRO",
      "CARTAO_CREDITO",
      "BOLETO_BANCARIO",
      "CARTAO_CREDITO_VIA_LINK",
      "CHEQUE",
      "CARTAO_DEBITO",
      "TRANSFERENCIA_BANCARIA",
      "OUTRO",
      "CARTEIRA_DIGITAL",
      "CASHBACK",
      "CREDITO_LOJA",
      "CREDITO_VIRTUAL",
      "DEPOSITO_BANCARIO",
      "PIX_PAGAMENTO_INSTANTANEO"
    ]
  end

  defp finance_creation_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "valor" => %{
          "type" => "number",
          "description" =>
            "Monetary value as number only. Example: 2000.0 (do not send \"2k\" or currency string)."
        },
        "valor_liquido" => %{
          "type" => "number",
          "description" =>
            "Optional net amount. If omitted, the integration assumes valor_liquido = valor. Example: 2000.0."
        },
        "competenceDate" => %{
          "type" => "string",
          "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
          "description" => "Competence date in YYYY-MM-DD. Example: 2026-03-05."
        },
        "rateio" => %{
          "type" => "array",
          "minItems" => 1,
          "items" => %{
            "type" => "object",
            "additionalProperties" => true,
            "properties" => %{
              "valor" => %{
                "type" => "number",
                "description" => "Allocated amount. Example: 2000.0."
              },
              "categoria_financeira" => %{
                "type" => "object",
                "additionalProperties" => true,
                "properties" => %{
                  "id" => %{
                    "type" => ["string", "integer"],
                    "description" => "Financial category id. Example: 12345."
                  }
                },
                "required" => ["id"],
                "description" => "Financial category reference. Example: {\"id\": 12345}."
              }
            },
            "required" => ["valor", "categoria_financeira"]
          },
          "description" =>
            "At least one financial allocation item. Example: [{\"valor\": 2000.0, \"categoria_financeira\": {\"id\": 12345}}]."
        },
        "opcao_condicao_pagamento" => %{
          "type" => "string",
          "description" =>
            "Optional payment condition option. Examples: \"À vista\", \"3x\", \"30,60,90\". If omitted, defaults to \"À vista\"."
        },
        "condicao_pagamento" => %{
          "type" => "object",
          "additionalProperties" => false,
          "properties" => %{
            "opcao_condicao_pagamento" => %{
              "type" => "string",
              "description" =>
                "Optional payment condition option. Examples: \"À vista\", \"3x\", \"30,60,90\"."
            },
            "parcelas" => %{
              "type" => "array",
              "minItems" => 1,
              "items" => %{
                "type" => "object",
                "additionalProperties" => true,
                "properties" => %{
                  "descricao" => %{"type" => "string"},
                  "data_vencimento" => %{
                    "type" => "string",
                    "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
                  },
                  "nota" => %{"type" => "string"},
                  "conta_financeira" => %{
                    "type" => ["string", "object"],
                    "description" => "Financial account id or object with id."
                  },
                  "valor" => %{"type" => "number"},
                  "valor_liquido" => %{
                    "type" => "number",
                    "description" =>
                      "Optional installment net amount. If omitted, defaults to installment valor."
                  },
                  "detalhe_valor" => %{
                    "type" => "object",
                    "additionalProperties" => true,
                    "properties" => %{
                      "valor_bruto" => %{"type" => "number"},
                      "valor_liquido" => %{"type" => "number"}
                    }
                  }
                }
              }
            }
          },
          "description" =>
            "Optional payment condition details. Use parcelas to explicitly control installments."
        },
        "descricao" => %{
          "type" => "string",
          "description" => "Description/history for the entry. Example: aluguel."
        },
        "data_vencimento" => %{
          "type" => "string",
          "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
          "description" => "Due date in YYYY-MM-DD when applicable. Example: 2026-03-05."
        },
        "conta_financeira" => %{
          "type" => ["string", "object"],
          "description" =>
            "Financial account id (UUID) or object with id. Required by Conta Azul finance creation endpoints."
        },
        "contato" => %{
          "type" => "object",
          "additionalProperties" => true,
          "properties" => %{
            "id" => %{
              "type" => ["string", "integer"],
              "description" => "Contact id in Conta Azul (cliente/fornecedor)."
            }
          },
          "required" => ["id"],
          "description" =>
            "Linked contact/client/supplier. Required to map id_cliente/id_fornecedor in the official API."
        },
        "observacoes" => %{"type" => "string"}
      },
      "required" => ["valor", "competenceDate", "rateio", "conta_financeira", "contato"]
    })
  end

  defp person_profile_schema do
    %{
      "type" => "object",
      "additionalProperties" => false,
      "required" => ["tipo_perfil"],
      "properties" => %{
        "tipo_perfil" => %{
          "type" => "string",
          "description" => "Tipo de perfil da pessoa.",
          "enum" => ["Cliente", "Fornecedor", "Transportadora"],
          "examples" => ["Cliente", "Fornecedor"]
        }
      }
    }
  end

  defp crm_person_properties do
    %{
      "nome" => %{"type" => "string"},
      "email" => %{"type" => "string"},
      "telefone_celular" => %{"type" => "string"},
      "telefone_comercial" => %{"type" => "string"},
      "telefone" => %{
        "type" => "string",
        "description" => "Alias aceito e normalizado para telefone_comercial."
      },
      "documento" => %{
        "type" => "string",
        "description" => "Alias aceito. Será normalizado para CPF/CNPJ conforme tipo_pessoa."
      },
      "cpf" => %{"type" => "string"},
      "cnpj" => %{"type" => "string"},
      "tipo_pessoa" => %{
        "type" => "string",
        "description" =>
          "Tipo da pessoa. Use exatamente um dos valores permitidos: Física, Jurídica, Estrangeira.",
        "enum" => ["Física", "Jurídica", "Estrangeira"],
        "examples" => ["Física", "Jurídica"]
      },
      "perfis" => %{
        "type" => "array",
        "description" =>
          "Lista de perfis da pessoa. Deve ser uma lista de objetos com tipo_perfil.",
        "minItems" => 1,
        "items" => person_profile_schema()
      },
      "endereco" => %{
        "type" => ["object", "string"],
        "description" => "Alias aceito e normalizado para enderecos."
      },
      "enderecos" => %{
        "type" => "array",
        "items" => %{"type" => "object"}
      },
      "inscricao_estadual" => %{
        "type" => "string",
        "description" => "Alias aceito e normalizado para inscricoes."
      },
      "inscricao_municipal" => %{
        "type" => "string",
        "description" => "Alias aceito e normalizado para inscricoes."
      },
      "inscricoes" => %{
        "type" => "array",
        "items" => %{"type" => "object"}
      },
      "nome_fantasia" => %{"type" => "string"},
      "codigo" => %{"type" => "string"},
      "observacao" => %{"type" => "string"},
      "rg" => %{"type" => "string"},
      "data_nascimento" => %{"type" => "string"}
    }
  end

  defp crm_person_base do
    open_object(%{
      "properties" => crm_person_properties(),
      "required" => ["nome", "tipo_pessoa", "perfis"]
    })
  end

  defp crm_person_with_id_params do
    base = id_alias_params(["id", "person_id"])

    Map.merge(base, %{
      "properties" => Map.merge(base["properties"], crm_person_properties())
    })
  end

  defp crm_people_batch_params do
    open_object(%{
      "properties" => %{
        "uuids" => %{
          "type" => "array",
          "minItems" => 1,
          "maxItems" => 10,
          "items" => %{"type" => "string"},
          "description" => "Lista de UUIDs das pessoas."
        },
        "ids" => %{
          "type" => "array",
          "items" => %{"type" => ["string", "integer"]},
          "description" => "Alias aceito e normalizado para uuids."
        },
        "pessoas" => %{
          "type" => "array",
          "items" => %{"type" => "object"},
          "description" => "Alias aceito para extrair uuids/id dos itens."
        }
      },
      "required" => ["uuids"]
    })
  end

  defp finance_event_search_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "from" => %{"type" => "string", "description" => "Alias for data_vencimento_de."},
        "to" => %{"type" => "string", "description" => "Alias for data_vencimento_ate."},
        "pagina" => %{"type" => "integer", "minimum" => 1, "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "minimum" => 1, "default" => 10},
        "campo_ordenado_ascendente" => %{"type" => "string"},
        "campo_ordenado_descendente" => %{"type" => "string"},
        "descricao" => %{"type" => "string"},
        "data_vencimento_de" => %{"type" => "string", "format" => "date"},
        "data_vencimento_ate" => %{"type" => "string", "format" => "date"},
        "data_competencia_de" => %{"type" => "string", "format" => "date"},
        "data_competencia_ate" => %{"type" => "string", "format" => "date"},
        "data_pagamento_de" => %{"type" => "string", "format" => "date"},
        "data_pagamento_ate" => %{"type" => "string", "format" => "date"},
        "data_alteracao_de" => %{"type" => "string", "format" => "date-time"},
        "data_alteracao_ate" => %{"type" => "string", "format" => "date-time"},
        "valor_de" => %{"type" => "string", "pattern" => "^[0-9]+(\\.[0-9]{1,2})?$"},
        "valor_ate" => %{"type" => "string", "pattern" => "^[0-9]+(\\.[0-9]{1,2})?$"},
        "status" => %{
          "type" => "array",
          "items" => %{
            "type" => "string",
            "enum" => [
              "PERDIDO",
              "RECEBIDO",
              "EM_ABERTO",
              "RENEGOCIADO",
              "RECEBIDO_PARCIAL",
              "ATRASADO"
            ]
          }
        },
        "ids_contas_financeiras" => %{"type" => "array", "items" => %{"type" => "string"}},
        "ids_categorias" => %{"type" => "array", "items" => %{"type" => "string"}},
        "ids_centros_de_custo" => %{"type" => "array", "items" => %{"type" => "string"}},
        "ids_clientes" => %{"type" => "array", "items" => %{"type" => "string"}},
        "ids_fornecedores" => %{"type" => "array", "items" => %{"type" => "string"}}
      },
      "required" => ["data_vencimento_de", "data_vencimento_ate"]
    })
  end

  defp finance_list_categories_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "minimum" => 1, "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "minimum" => 1, "default" => 10},
        "busca" => %{"type" => "string", "description" => "Busca textual por nome/código."},
        "tipo" => %{"type" => "string", "enum" => ["RECEITA", "DESPESA"]},
        "nome" => %{"type" => "string"},
        "apenas_filhos" => %{"type" => "boolean"},
        "permite_apenas_filhos" => %{"type" => "boolean"},
        "campo_ordenado_ascendente" => %{"type" => "string", "enum" => ["NOME", "TIPO"]},
        "campo_ordenado_descendente" => %{"type" => "string", "enum" => ["NOME", "TIPO"]}
      }
    })
  end

  defp finance_list_cost_centers_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "minimum" => 1, "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "minimum" => 1, "default" => 10},
        "busca" => %{"type" => "string"},
        "filtro_rapido" => %{"type" => "string", "enum" => ["ATIVO", "INATIVO", "TODOS"]},
        "campo_ordenado_ascendente" => %{"type" => "string"},
        "campo_ordenado_descendente" => %{"type" => "string"}
      }
    })
  end

  defp finance_list_financial_accounts_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "minimum" => 1, "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "minimum" => 1, "default" => 10},
        "tipos" => %{
          "type" => "array",
          "items" => %{
            "type" => "string",
            "enum" => [
              "APLICACAO",
              "CAIXINHA",
              "CONTA_CORRENTE",
              "CARTAO_CREDITO",
              "INVESTIMENTO",
              "OUTROS",
              "MEIOS_RECEBIMENTO",
              "POUPANCA",
              "COBRANCAS_CONTA_AZUL",
              "RECEBA_FACIL_CARTAO"
            ]
          }
        },
        "nome" => %{"type" => "string"},
        "apenas_ativo" => %{"type" => "boolean"},
        "esconde_conta_digital" => %{"type" => "boolean"},
        "mostrar_caixinha" => %{"type" => "boolean"}
      }
    })
  end

  defp crm_list_people_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "busca" => %{"type" => "string"},
        "name" => %{"type" => "string", "description" => "Alias for busca."},
        "nome" => %{"type" => "string", "description" => "Alias for busca."},
        "query" => %{"type" => "string", "description" => "Alias for busca."},
        "search" => %{"type" => "string", "description" => "Alias for busca."},
        "pagina" => %{"type" => "integer", "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "default" => 10},
        "tipo_ordenacao" => %{"type" => "string"},
        "ordem_ordenacao" => %{"type" => "string", "enum" => ["ASC", "DESC"]},
        "ids" => %{"type" => "string"},
        "documentos" => %{"type" => "string"},
        "paises" => %{"type" => "string"},
        "cidades" => %{"type" => "string"},
        "ufs" => %{"type" => "string"},
        "codigos_pessoa" => %{"type" => "string"},
        "emails" => %{"type" => "string"},
        "tipos_pessoa" => %{"type" => "string"},
        "nomes" => %{"type" => "string"},
        "telefones" => %{"type" => "string"},
        "data_criacao_inicio" => %{"type" => "string"},
        "data_criacao_fim" => %{"type" => "string"},
        "data_alteracao_de" => %{"type" => "string"},
        "data_alteracao_ate" => %{"type" => "string"},
        "tipo_perfil" => %{
          "type" => "string",
          "enum" => ["Cliente", "Fornecedor", "Transportadora"]
        },
        "perfil" => %{"type" => "string", "description" => "Alias for tipo_perfil."},
        "com_endereco" => %{"type" => "boolean"}
      }
    })
  end

  defp inventory_create_product_params do
    open_object(%{
      "additionalProperties" => true,
      "properties" => %{
        "nome" => %{"type" => "string"},
        "status" => %{"type" => "string", "enum" => ["ATIVO", "INATIVO"]},
        "ativo" => %{"type" => "boolean"},
        "descricao" => %{"type" => "string"},
        "codigo_sku" => %{"type" => "string", "maxLength" => 20},
        "codigo_ean" => %{"type" => "string"},
        "id_centro_custo" => %{"type" => "string"},
        "formato" => %{"type" => "string", "enum" => ["SIMPLES", "VARIACAO"]},
        "categoria" => %{"type" => "object", "additionalProperties" => true},
        "estoque" => %{"type" => "object", "additionalProperties" => true},
        "fiscal" => %{"type" => "object", "additionalProperties" => true},
        "ecommerce" => %{"type" => "object", "additionalProperties" => true},
        "pesos_dimensoes" => %{"type" => "object", "additionalProperties" => true},
        "variacao" => %{"type" => "object", "additionalProperties" => true},
        "unidade_medida" => %{"type" => "object", "additionalProperties" => true},
        "conversoes_unidade_medida" => %{
          "type" => "array",
          "items" => %{"type" => "object", "additionalProperties" => true}
        },
        "detalhe_kit" => %{"type" => "object", "additionalProperties" => true},
        "codigo" => %{"type" => "string", "description" => "Legacy alias."},
        "valor_venda" => %{"type" => ["number", "string"], "description" => "Legacy alias."}
      },
      "required" => ["nome"]
    })
  end

  defp inventory_list_products_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "default" => 1},
        "tamanho_pagina" => %{
          "type" => "integer",
          "enum" => [10, 20, 50, 100, 200, 500, 1000],
          "default" => 10
        },
        "campo_ordenacao" => %{"type" => "string", "enum" => ["NOME", "CODIGO", "VALOR_VENDA"]},
        "direcao_ordenacao" => %{"type" => "string", "enum" => ["ASC", "DESC"]},
        "busca" => %{"type" => "string"},
        "status" => %{"type" => "string", "enum" => ["ATIVO", "INATIVO"]},
        "integracao_ecommerce_ativo" => %{"type" => "boolean"},
        "produtos_kit_ativo" => %{"type" => "boolean"},
        "valor_venda_inicial" => %{"type" => "number"},
        "valor_venda_final" => %{"type" => "number"},
        "sku" => %{"type" => "string"},
        "data_alteracao_de" => %{"type" => "string"},
        "data_alteracao_ate" => %{"type" => "string"}
      }
    })
  end

  defp invoice_list_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "data_inicial" => %{"type" => "string", "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},
        "data_final" => %{"type" => "string", "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},
        "pagina" => %{"type" => "integer", "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "default" => 10},
        "documento_tomador" => %{"type" => "string"},
        "numero_nota" => %{"type" => "string"},
        "id_venda" => %{"type" => "string"}
      },
      "required" => ["data_inicial", "data_final"]
    })
  end

  defp invoice_list_service_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "minimum" => 1, "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "enum" => [10, 20, 50, 100], "default" => 10},
        "data_competencia_de" => %{
          "type" => "string",
          "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
        },
        "data_competencia_ate" => %{
          "type" => "string",
          "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
        },
        "ids" => %{"type" => "array", "items" => %{"type" => "string"}},
        "id_cliente" => %{"type" => "array", "items" => %{"type" => "string"}},
        "numero_venda" => %{"type" => "integer"},
        "numero_nfse_inicial" => %{"type" => "integer"},
        "numero_nfse_final" => %{"type" => "integer"},
        "numero_rps_inicial" => %{"type" => "integer"},
        "numero_rps_final" => %{"type" => "integer"},
        "status" => %{"type" => "array", "items" => %{"type" => "string"}},
        "tipo_negociacao" => %{"type" => "string", "enum" => ["VENDA", "CONTRATO"]}
      },
      "required" => ["data_competencia_de", "data_competencia_ate"]
    })
  end

  defp invoice_link_mdfe_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "chaves_acesso" => %{"type" => "array", "items" => %{"type" => "string"}},
        "identificador" => %{"type" => "string"},
        "status" => %{"type" => "string", "enum" => ["ENCERRADO", "EM_DIGITACAO", "AUTORIZADO"]}
      },
      "required" => ["chaves_acesso", "identificador"]
    })
  end

  defp service_list_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "pagina" => %{"type" => "integer", "default" => 1},
        "tamanho_pagina" => %{"type" => "integer", "default" => 10},
        "busca_textual" => %{"type" => "string"}
      }
    })
  end

  defp service_create_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "codigo" => %{"type" => "string", "maxLength" => 20},
        "descricao" => %{"type" => "string", "maxLength" => 100, "minLength" => 1},
        "custo" => %{"type" => "number"},
        "preco" => %{"type" => "number"},
        "status" => %{"type" => "string", "enum" => ["ATIVO", "INATIVO"]},
        "tipo_servico" => %{"type" => "string", "enum" => ["PRESTADO", "TOMADO", "AMBOS"]}
      },
      "required" => ["descricao"]
    })
  end

  defp service_delete_batch_params do
    open_object(%{
      "additionalProperties" => false,
      "properties" => %{
        "ids" => %{
          "type" => "array",
          "items" => %{"type" => "integer"},
          "minItems" => 1
        }
      },
      "required" => ["ids"]
    })
  end

  defp service_update_params do
    base = id_alias_params(["id", "service_id"])

    Map.merge(base, %{
      "additionalProperties" => false,
      "properties" =>
        Map.merge(base["properties"], %{
          "codigo" => %{"type" => "string", "maxLength" => 20},
          "descricao" => %{"type" => "string", "maxLength" => 100},
          "custo" => %{"type" => "number", "minimum" => 0},
          "preco" => %{"type" => "number", "minimum" => 0},
          "tipo_servico" => %{"type" => "string", "enum" => ["PRESTADO", "TOMADO", "AMBOS"]}
        })
    })
  end

  defp specs do
    %{
      "acquittance.create" => %{
        "description" => "Create a baixa for a specific installment.",
        "parameters" =>
          open_object(%{
            "additionalProperties" => true,
            "properties" => %{
              "parcela_id" => %{
                "type" => ["string", "integer"],
                "description" => "Installment id to receive the baixa."
              },
              "id_parcela" => %{
                "type" => ["string", "integer"],
                "description" => "Alias for parcela_id."
              },
              "installment_id" => %{
                "type" => ["string", "integer"],
                "description" => "Alias for parcela_id."
              },
              "data_pagamento" => %{
                "type" => "string",
                "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
              },
              "conta_financeira" => %{"type" => ["string", "integer"]},
              "composicao_valor" => %{
                "type" => "object",
                "additionalProperties" => true,
                "properties" => %{
                  "valor_bruto" => %{"type" => "number"},
                  "multa" => %{"type" => "number"},
                  "juros" => %{"type" => "number"},
                  "desconto" => %{"type" => "number"},
                  "taxa" => %{"type" => "number"}
                },
                "required" => ["valor_bruto"]
              },
              "metodo_pagamento" => %{
                "type" => "string",
                "enum" => acquittance_payment_method_enum(),
                "description" =>
                  "Payment method enum. Common aliases (e.g. pix, depósito, cartão) are normalized by the tool."
              },
              "observacao" => %{"type" => "string"},
              "nsu" => %{"type" => "string"}
            },
            "required" => ["parcela_id", "data_pagamento", "conta_financeira", "composicao_valor"]
          })
      },
      "acquittance.list" => %{
        "description" => "List baixas for a specific installment.",
        "parameters" => id_alias_params(["parcela_id", "id_parcela", "installment_id", "id"])
      },
      "acquittance.get" => %{
        "description" => "Get a single baixa by id.",
        "parameters" => id_alias_params(["baixa_id", "acquittance_id", "id"])
      },
      "acquittance.update" => %{
        "description" => "Update a baixa by id.",
        "parameters" =>
          open_object(%{
            "additionalProperties" => true,
            "properties" => %{
              "baixa_id" => %{"type" => ["string", "integer"]},
              "acquittance_id" => %{"type" => ["string", "integer"]},
              "id" => %{"type" => ["string", "integer"]},
              "versao" => %{"type" => "integer"},
              "data_pagamento" => %{
                "type" => "string",
                "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
              },
              "conta_financeira" => %{"type" => ["string", "integer"]},
              "composicao_valor" => %{
                "type" => "object",
                "additionalProperties" => true,
                "properties" => %{
                  "valor_bruto" => %{"type" => "number"},
                  "multa" => %{"type" => "number"},
                  "juros" => %{"type" => "number"},
                  "desconto" => %{"type" => "number"},
                  "taxa" => %{"type" => "number"}
                }
              },
              "metodo_pagamento" => %{
                "type" => "string",
                "enum" => acquittance_payment_method_enum(),
                "description" =>
                  "Payment method enum. Common aliases (e.g. pix, depósito, cartão) are normalized by the tool."
              },
              "observacao" => %{"type" => "string"},
              "nsu" => %{"type" => "string"}
            },
            "required" => ["baixa_id", "versao"]
          })
      },
      "acquittance.delete" => %{
        "description" => "Delete a baixa by id.",
        "parameters" => id_alias_params(["baixa_id", "acquittance_id", "id"])
      },
      "charge.create" => %{
        "description" => "Generate a receivable charge in Conta Azul.",
        "parameters" =>
          open_object(%{
            "additionalProperties" => true,
            "properties" => %{
              "conta_bancaria" => %{
                "type" => ["string", "integer"],
                "description" => "Bank account id used to generate the charge."
              },
              "descricao_fatura" => %{"type" => "string"},
              "id_parcela" => %{"type" => ["string", "integer"]},
              "parcela_id" => %{
                "type" => ["string", "integer"],
                "description" => "Alias for id_parcela."
              },
              "data_vencimento" => %{
                "type" => "string",
                "pattern" => "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
              },
              "tipo" => %{
                "type" => "string",
                "enum" => ["LINK_PAGAMENTO", "PIX_COBRANCA", "BOLETO"]
              },
              "atributos" => %{"type" => "object", "additionalProperties" => true}
            },
            "required" => [
              "conta_bancaria",
              "descricao_fatura",
              "id_parcela",
              "data_vencimento",
              "tipo"
            ]
          })
      },
      "charge.get" => %{
        "description" => "Get charge details by id.",
        "parameters" => id_alias_params(["id_cobranca", "charge_id", "id"])
      },
      "charge.delete" => %{
        "description" => "Delete/cancel charge by id.",
        "parameters" => id_alias_params(["id_cobranca", "charge_id", "id"])
      },
      "contracts.list" => %{
        "description" => "List contracts.",
        "parameters" => open_object()
      },
      "contracts.create" => %{
        "description" => "Create a contract.",
        "parameters" =>
          open_object(%{
            "properties" => %{
              "numero" => %{"type" => ["string", "integer"]},
              "descricao" => %{"type" => "string"},
              "cliente" => %{"type" => ["object", "string", "integer"]}
            }
          })
      },
      "contracts.next_number" => %{
        "description" => "Get next contract number.",
        "parameters" => open_object()
      },
      "finance.create_receivable" => %{
        "description" => "Create a receivable financial event.",
        "parameters" => finance_creation_params()
      },
      "finance.create_payable" => %{
        "description" => "Create a payable financial event.",
        "parameters" => finance_creation_params()
      },
      "finance.list_installments" => %{
        "description" => "List installments for receivables or payables.",
        "parameters" =>
          Map.merge(finance_event_search_params(), %{
            "properties" =>
              Map.merge(finance_event_search_params()["properties"], %{
                "type" => %{
                  "type" => "string",
                  "enum" => ["receivable", "payable"],
                  "description" => "Installment type scope."
                }
              })
          })
      },
      "finance.acquit_installment" => %{
        "description" => "Settle (acquit) one installment by id.",
        "parameters" => id_alias_params(["id", "installment_id", "receipt_id", "parcela_id"])
      },
      "finance.get_receipt" => %{
        "description" => "Get one installment/receipt by id.",
        "parameters" => id_alias_params(["id", "installment_id", "receipt_id", "parcela_id"])
      },
      "finance.get_statement" => %{
        "description" => "Get statement/listing of installments by type and period.",
        "parameters" =>
          Map.merge(finance_event_search_params(), %{
            "properties" =>
              Map.merge(finance_event_search_params()["properties"], %{
                "type" => %{
                  "type" => "string",
                  "enum" => ["receivable", "payable"]
                }
              })
          })
      },
      "finance.list_receivables" => %{
        "description" => "List receivable financial events by period and filters.",
        "parameters" => finance_event_search_params()
      },
      "finance.list_payables" => %{
        "description" => "List payable financial events by period and filters.",
        "parameters" => finance_event_search_params()
      },
      "finance.get_installment" => %{
        "description" => "Get installment details by id.",
        "parameters" => id_alias_params(["id", "installment_id", "receipt_id", "parcela_id"])
      },
      "finance.update_installment" => %{
        "description" => "Update one installment by id.",
        "parameters" =>
          Map.merge(id_alias_params(["id", "installment_id", "receipt_id", "parcela_id"]), %{
            "properties" =>
              Map.merge(
                id_alias_params(["id", "installment_id", "receipt_id", "parcela_id"])[
                  "properties"
                ],
                %{
                  "version" => %{"type" => "integer"},
                  "versao" => %{"type" => "integer"}
                }
              )
          })
      },
      "finance.list_event_installments" => %{
        "description" => "List all installments for a financial event id.",
        "parameters" => id_alias_params(["id_evento", "event_id", "financial_event_id", "id"])
      },
      "finance.list_categories" => %{
        "description" =>
          "List finance categories. Use tipo=RECEITA for receivable workflows and tipo=DESPESA for payable workflows.",
        "parameters" => finance_list_categories_params()
      },
      "finance.list_dre_categories" => %{
        "description" => "List DRE categories.",
        "parameters" => open_object(%{"additionalProperties" => false, "properties" => %{}})
      },
      "finance.list_cost_centers" => %{
        "description" => "List cost centers.",
        "parameters" => finance_list_cost_centers_params()
      },
      "finance.create_cost_center" => %{
        "description" => "Create a cost center.",
        "parameters" =>
          open_object(%{
            "additionalProperties" => false,
            "properties" => %{
              "nome" => %{"type" => "string"},
              "codigo" => %{"type" => "string"},
              "descricao" => %{
                "type" => "string",
                "description" => "Alias; API canonical key is codigo/nome."
              }
            },
            "required" => ["nome"]
          })
      },
      "finance.list_financial_accounts" => %{
        "description" => "List financial accounts.",
        "parameters" => finance_list_financial_accounts_params()
      },
      "finance.get_financial_account_balance" => %{
        "description" => "Get current balance by financial account id.",
        "parameters" =>
          id_alias_params([
            "id_conta_financeira",
            "financial_account_id",
            "account_id",
            "id"
          ])
      },
      "crm.create_client" => %{
        "description" => "Create a CRM client/person.",
        "parameters" => crm_person_base()
      },
      "crm.create_person" => %{
        "description" => "Create a CRM person.",
        "parameters" => crm_person_base()
      },
      "crm.list_people" => %{
        "description" => "Search/list CRM people.",
        "parameters" => crm_list_people_params()
      },
      "crm.get_person" => %{
        "description" => "Get CRM person by id.",
        "parameters" => id_alias_params(["id", "person_id"])
      },
      "crm.get_person_by_legacy_id" => %{
        "description" => "Get CRM person by legacy id.",
        "parameters" => id_alias_params(["id", "legacy_id", "person_legacy_id", "uuid_legado"])
      },
      "crm.update_person" => %{
        "description" => "Update CRM person (PUT) by id.",
        "parameters" => crm_person_with_id_params()
      },
      "crm.patch_person" => %{
        "description" => "Patch CRM person by id.",
        "parameters" => crm_person_with_id_params()
      },
      "crm.activate_people" => %{
        "description" => "Activate people in CRM.",
        "parameters" => crm_people_batch_params()
      },
      "crm.inactivate_people" => %{
        "description" => "Inactivate people in CRM.",
        "parameters" => crm_people_batch_params()
      },
      "crm.delete_people" => %{
        "description" => "Delete people in CRM.",
        "parameters" => crm_people_batch_params()
      },
      "inventory.create_product" => %{
        "description" => "Create an inventory product.",
        "parameters" => inventory_create_product_params()
      },
      "inventory.list_products" => %{
        "description" => "Search/list products.",
        "parameters" => inventory_list_products_params()
      },
      "inventory.deactivate_products" => %{
        "description" => "Deactivate products.",
        "parameters" =>
          open_object(%{
            "properties" => %{
              "ids" => %{"type" => "array", "items" => %{"type" => ["string", "integer"]}},
              "produtos" => %{"type" => "array", "items" => %{"type" => "object"}}
            }
          })
      },
      "inventory.delete_product" => %{
        "description" => "Delete product by id.",
        "parameters" => id_alias_params(["id", "product_id"])
      },
      "invoice.list" => %{
        "description" => "List invoices.",
        "parameters" => invoice_list_params()
      },
      "invoice.list_service" => %{
        "description" => "List service invoices.",
        "parameters" => invoice_list_service_params()
      },
      "invoice.link_mdfe" => %{
        "description" => "Link invoice to MDFe.",
        "parameters" => invoice_link_mdfe_params()
      },
      "invoice.get_by_key" => %{
        "description" => "Get invoice by key.",
        "parameters" => id_alias_params(["chave", "key", "id"])
      },
      "protocol.get" => %{
        "description" => "Get protocol by id.",
        "parameters" => id_alias_params(["id", "protocol_id"])
      },
      "sales.create" => %{
        "description" => "Create sale.",
        "parameters" => open_object()
      },
      "sales.search" => %{
        "description" => "Search sales.",
        "parameters" => open_object()
      },
      "sales.delete_batch" => %{
        "description" => "Delete sales in batch.",
        "parameters" => open_object()
      },
      "sales.next_number" => %{
        "description" => "Get next sale number.",
        "parameters" => open_object()
      },
      "sales.list_sellers" => %{
        "description" => "List sellers.",
        "parameters" => open_object()
      },
      "sales.get_items" => %{
        "description" => "Get sale items by sale id.",
        "parameters" => id_alias_params(["id_venda", "sale_id", "id"])
      },
      "sales.get" => %{
        "description" => "Get sale by id.",
        "parameters" => id_alias_params(["id", "sale_id", "id_venda"])
      },
      "sales.update" => %{
        "description" => "Update sale by id.",
        "parameters" => id_alias_params(["id", "sale_id", "id_venda"])
      },
      "sales.print_pdf" => %{
        "description" => "Generate sale PDF by id.",
        "parameters" => id_alias_params(["id", "sale_id", "id_venda"])
      },
      "service.list" => %{
        "description" => "List services.",
        "parameters" => service_list_params()
      },
      "service.create" => %{
        "description" => "Create service.",
        "parameters" => service_create_params()
      },
      "service.delete_batch" => %{
        "description" => "Delete services in batch.",
        "parameters" => service_delete_batch_params()
      },
      "service.get" => %{
        "description" => "Get service by id.",
        "parameters" => id_alias_params(["id", "service_id"])
      },
      "service.update" => %{
        "description" => "Update service by id.",
        "parameters" => service_update_params()
      }
    }
  end
end
