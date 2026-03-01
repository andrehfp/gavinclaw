defmodule Cazu.Tools.OpenAPIContracts do
  @moduledoc """
  Canonical mapping between Cazu tool names and Conta Azul OpenAPI operations.

  Paths include the `/v1` prefix exactly as published in Conta Azul JSON bundles.
  """

  @bundle_files [
    "docs/contaazul/_bundle/docs/acquittance-apis-openapi.json",
    "docs/contaazul/_bundle/docs/charge-apis-openapi.json",
    "docs/contaazul/_bundle/docs/contracts-apis-openapi.json",
    "docs/contaazul/_bundle/docs/financial-apis-openapi.json",
    "docs/contaazul/_bundle/docs/sales-apis-openapi.json",
    "docs/contaazul/_bundle/open-api-docs/open-api-inventory.json",
    "docs/contaazul/_bundle/open-api-docs/open-api-invoice.json",
    "docs/contaazul/_bundle/open-api-docs/open-api-person.json",
    "docs/contaazul/_bundle/open-api-docs/open-api-service.json"
  ]

  @tool_operations %{
    "acquittance.create" => [
      %{method: :post, path: "/v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa"}
    ],
    "acquittance.list" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa"}
    ],
    "acquittance.get" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}"}
    ],
    "acquittance.update" => [
      %{method: :patch, path: "/v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}"}
    ],
    "acquittance.delete" => [
      %{method: :delete, path: "/v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}"}
    ],
    "charge.create" => [
      %{method: :post, path: "/v1/financeiro/eventos-financeiros/contas-a-receber/gerar-cobranca"}
    ],
    "charge.get" => [
      %{
        method: :get,
        path: "/v1/financeiro/eventos-financeiros/contas-a-receber/cobranca/{id_cobranca}"
      }
    ],
    "charge.delete" => [
      %{
        method: :delete,
        path: "/v1/financeiro/eventos-financeiros/contas-a-receber/cobranca/{id_cobranca}"
      }
    ],
    "finance.create_receivable" => [
      %{method: :post, path: "/v1/financeiro/eventos-financeiros/contas-a-receber"}
    ],
    "finance.create_payable" => [
      %{method: :post, path: "/v1/financeiro/eventos-financeiros/contas-a-pagar"}
    ],
    "finance.list_installments" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-receber/buscar"},
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar"}
    ],
    "finance.get_statement" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-receber/buscar"},
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar"}
    ],
    "finance.list_receivables" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-receber/buscar"}
    ],
    "finance.list_payables" => [
      %{method: :get, path: "/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar"}
    ],
    "finance.list_categories" => [
      %{method: :get, path: "/v1/categorias"}
    ],
    "finance.list_dre_categories" => [
      %{method: :get, path: "/v1/financeiro/categorias-dre"}
    ],
    "finance.list_cost_centers" => [
      %{method: :get, path: "/v1/centro-de-custo"}
    ],
    "finance.create_cost_center" => [
      %{method: :post, path: "/v1/centro-de-custo"}
    ],
    "finance.list_financial_accounts" => [
      %{method: :get, path: "/v1/conta-financeira"}
    ],
    "crm.create_client" => [
      %{method: :post, path: "/v1/pessoas"}
    ],
    "crm.create_person" => [
      %{method: :post, path: "/v1/pessoas"}
    ],
    "crm.list_people" => [
      %{method: :get, path: "/v1/pessoas"}
    ],
    "crm.get_person" => [
      %{method: :get, path: "/v1/pessoas/{id}"}
    ],
    "crm.get_person_by_legacy_id" => [
      %{method: :get, path: "/v1/pessoas/legado/{id}"}
    ],
    "crm.update_person" => [
      %{method: :put, path: "/v1/pessoas/{id}"}
    ],
    "crm.patch_person" => [
      %{method: :patch, path: "/v1/pessoas/{id}"}
    ],
    "crm.activate_people" => [
      %{method: :post, path: "/v1/pessoas/ativar"}
    ],
    "crm.inactivate_people" => [
      %{method: :post, path: "/v1/pessoas/inativar"}
    ],
    "crm.delete_people" => [
      %{method: :post, path: "/v1/pessoas/excluir"}
    ],
    "inventory.create_product" => [
      %{method: :post, path: "/v1/produtos"}
    ],
    "inventory.list_products" => [
      %{method: :get, path: "/v1/produtos"}
    ],
    "inventory.delete_product" => [
      %{method: :delete, path: "/v1/produtos/{id}"}
    ],
    "invoice.list" => [
      %{method: :get, path: "/v1/notas-fiscais"}
    ],
    "invoice.list_service" => [
      %{method: :get, path: "/v1/notas-fiscais-servico"}
    ],
    "invoice.link_mdfe" => [
      %{method: :post, path: "/v1/notas-fiscais/vinculo-mdfe"}
    ],
    "invoice.get_by_key" => [
      %{method: :get, path: "/v1/notas-fiscais/{chave}"}
    ],
    "service.list" => [
      %{method: :get, path: "/v1/servicos"}
    ],
    "service.create" => [
      %{method: :post, path: "/v1/servicos"}
    ],
    "service.delete_batch" => [
      %{method: :delete, path: "/v1/servicos"}
    ],
    "service.get" => [
      %{method: :get, path: "/v1/servicos/{id}"}
    ],
    "service.update" => [
      %{method: :patch, path: "/v1/servicos/{id}"}
    ]
  }

  def bundle_files, do: @bundle_files

  def tool_operations, do: @tool_operations

  def operations_for(tool_name) when is_binary(tool_name),
    do: Map.get(@tool_operations, tool_name, [])
end
