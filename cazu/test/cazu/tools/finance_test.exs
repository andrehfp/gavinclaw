defmodule Cazu.Tools.FinanceTest do
  use Cazu.DataCase

  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration
  alias Cazu.Tools.Finance
  alias Cazu.Tools.Specs

  setup do
    original_config = Application.get_env(:cazu, :conta_azul, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_config)
    end)

    :ok
  end

  test "create_payable/2 normalizes payload and builds one installment when payment condition id is provided" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 202, body: %{"status" => "PENDING", "protocolId" => "proto-1"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-finance-1",
      tenant_id: integration.tenant_id
    }

    args = %{
      "valor" => 2000.0,
      "competenceDate" => "2026-03-05",
      "descricao" => "aluguel",
      "contato" => %{"id" => "supplier-1"},
      "conta_financeira" => %{"id" => "account-1"},
      "rateio" => [%{"valor" => 2000.0, "categoria_financeira" => %{"id" => "cat-1"}}],
      "condicao_pagamento" => %{"id" => 1}
    }

    assert {:ok, %{"status" => "PENDING", "protocolId" => "proto-1"}} =
             Finance.create_payable(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)
    [installment] = payload["condicao_pagamento"]["parcelas"]
    [rateio_item] = payload["rateio"]

    assert request.path == "/financeiro/eventos-financeiros/contas-a-pagar"
    assert payload["data_competencia"] == "2026-03-05"
    assert payload["valor"] == 2000.0
    assert payload["descricao"] == "aluguel"
    assert payload["id_fornecedor"] == "supplier-1"
    assert payload["conta_financeira"] == "account-1"
    assert installment["data_vencimento"] == "2026-03-05"
    assert installment["conta_financeira"] == "account-1"
    assert installment["detalhe_valor"]["valor_bruto"] == 2000.0
    assert installment["detalhe_valor"]["valor_liquido"] == 2000.0
    refute Map.has_key?(payload["condicao_pagamento"], "id")
    assert rateio_item["id_categoria"] == "cat-1"
    assert rateio_item["valor"] == 2000.0
  end

  test "create_payable/2 supports opcao_condicao_pagamento like 3x" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 202, body: %{"status" => "PENDING", "protocolId" => "proto-2"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-2", refresh_token: "refresh-2"})

    context = %{
      integration: integration,
      idempotency_key: "idem-finance-2",
      tenant_id: integration.tenant_id
    }

    args = %{
      "valor" => 300.0,
      "competenceDate" => "2026-03-05",
      "descricao" => "servico",
      "contato" => %{"id" => "supplier-2"},
      "conta_financeira" => %{"id" => "account-2"},
      "opcao_condicao_pagamento" => "3x",
      "rateio" => [%{"valor" => 300.0, "categoria_financeira" => %{"id" => "cat-2"}}]
    }

    assert {:ok, %{"status" => "PENDING", "protocolId" => "proto-2"}} =
             Finance.create_payable(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)
    installments = payload["condicao_pagamento"]["parcelas"]

    assert length(installments) == 3
    assert Enum.map(installments, & &1["detalhe_valor"]["valor_bruto"]) == [100.0, 100.0, 100.0]
    assert Enum.map(installments, & &1["detalhe_valor"]["valor_liquido"]) == [100.0, 100.0, 100.0]

    assert Enum.map(installments, & &1["data_vencimento"]) == [
             "2026-03-05",
             "2026-04-04",
             "2026-05-04"
           ]
  end

  test "create_payable/2 parses Brazilian currency strings" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 202, body: %{"status" => "PENDING", "protocolId" => "proto-3"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-3", refresh_token: "refresh-3"})

    context = %{
      integration: integration,
      idempotency_key: "idem-finance-3",
      tenant_id: integration.tenant_id
    }

    args = %{
      "valor" => "R$ 2.000,00",
      "competenceDate" => "2026-03-05",
      "descricao" => "aluguel",
      "contato" => %{"id" => "supplier-3"},
      "conta_financeira" => %{"id" => "account-3"},
      "rateio" => [%{"valor" => 2000.0, "categoria_financeira" => %{"id" => "cat-3"}}]
    }

    assert {:ok, %{"status" => "PENDING", "protocolId" => "proto-3"}} =
             Finance.create_payable(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)

    assert payload["valor"] == 2000.0

    detail_value =
      payload["condicao_pagamento"]["parcelas"]
      |> hd()
      |> Map.get("detalhe_valor")

    assert detail_value["valor_bruto"] == 2000.0
    assert detail_value["valor_liquido"] == 2000.0
  end

  test "create_payable/2 accepts top-level valor_liquido and propagates it to installments" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 202, body: %{"status" => "PENDING", "protocolId" => "proto-4"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-4", refresh_token: "refresh-4"})

    context = %{
      integration: integration,
      idempotency_key: "idem-finance-4",
      tenant_id: integration.tenant_id
    }

    args = %{
      "valor" => 4000.0,
      "valor_liquido" => 3950.0,
      "competenceDate" => "2026-03-05",
      "descricao" => "aluguel",
      "contato" => %{"id" => "supplier-4"},
      "conta_financeira" => %{"id" => "account-4"},
      "rateio" => [%{"valor" => 4000.0, "categoria_financeira" => %{"id" => "cat-4"}}]
    }

    assert {:ok, %{"status" => "PENDING", "protocolId" => "proto-4"}} =
             Finance.create_payable(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)

    detail_value =
      payload["condicao_pagamento"]["parcelas"]
      |> hd()
      |> Map.get("detalhe_valor")

    assert detail_value["valor_bruto"] == 4000.0
    assert detail_value["valor_liquido"] == 3950.0
  end

  test "finance creation spec does not require condicao_pagamento id" do
    spec = Specs.spec_for("finance.create_payable")
    required = spec["parameters"]["required"]
    condition = spec["parameters"]["properties"]["condicao_pagamento"]
    detail_value = condition["properties"]["parcelas"]["items"]["properties"]["detalhe_valor"]

    assert "conta_financeira" in required
    assert "contato" in required
    refute "condicao_pagamento" in required
    assert condition["properties"]["opcao_condicao_pagamento"]["type"] == "string"
    assert detail_value["properties"]["valor_liquido"]["type"] == "number"
    refute Map.has_key?(condition["properties"], "id")
  end

  test "finance list schemas expose canonical OpenAPI filters" do
    categories = Specs.spec_for("finance.list_categories")
    categories_properties = categories["parameters"]["properties"]

    assert categories_properties["tipo"]["enum"] == ["RECEITA", "DESPESA"]
    assert categories_properties["busca"]["type"] == "string"
    assert categories_properties["pagina"]["type"] == "integer"
    assert categories_properties["tamanho_pagina"]["type"] == "integer"

    receivables = Specs.spec_for("finance.list_receivables")
    receivables_properties = receivables["parameters"]["properties"]

    assert receivables_properties["data_vencimento_de"]["format"] == "date"
    assert receivables_properties["data_vencimento_ate"]["format"] == "date"
    assert receivables_properties["ids_clientes"]["type"] == "array"
    assert receivables_properties["ids_categorias"]["type"] == "array"
  end

  defp integration_fixture(attrs) do
    tenant = tenant_fixture()

    attrs =
      Map.merge(
        %{
          tenant_id: tenant.id,
          provider: "conta_azul",
          status: "active",
          access_token: "access-token",
          refresh_token: "refresh-token",
          scopes: "openid profile"
        },
        attrs
      )

    %TenantIntegration{}
    |> TenantIntegration.changeset(attrs)
    |> Repo.insert!()
  end

  defp tenant_fixture do
    unique = System.unique_integer([:positive])

    %Tenant{}
    |> Tenant.changeset(%{
      name: "Tenant #{unique}",
      slug: "tenant-#{unique}",
      status: "active"
    })
    |> Repo.insert!()
  end

  defp start_stub_server(responses) do
    agent = start_supervised!({Agent, fn -> Cazu.TestHTTPStub.state(responses) end})
    port = Cazu.TestHTTPStub.free_port()

    start_supervised!(
      {Bandit, plug: {Cazu.TestHTTPStub, agent}, scheme: :http, ip: {127, 0, 0, 1}, port: port}
    )

    %{base_url: "http://127.0.0.1:#{port}", agent: agent}
  end
end
