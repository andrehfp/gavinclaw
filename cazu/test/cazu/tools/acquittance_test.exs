defmodule Cazu.Tools.AcquittanceTest do
  use Cazu.DataCase

  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration
  alias Cazu.Tools.Acquittance

  setup do
    original_config = Application.get_env(:cazu, :conta_azul, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_config)
    end)

    :ok
  end

  test "create/2 resolves conta_financeira by name and normalizes payload" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "items" => [
              %{"id" => "acc-1", "nome" => "Nubank Pessoal", "status" => "ATIVO"}
            ]
          }
        },
        %{status: 200, body: %{"id" => "baixa-1"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-1", refresh_token: "refresh-acq-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-1",
      tenant_id: integration.tenant_id
    }

    args = %{
      "parcela_id" => "inst-1",
      "data_pagamento" => "hoje",
      "conta_financeira" => "Nubank Pessoal",
      "valor_bruto" => 4000.0
    }

    assert {:ok, %{"id" => "baixa-1"}} = Acquittance.create(args, context)

    [lookup_request, create_request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(create_request.raw_body)

    assert lookup_request.path == "/conta-financeira"

    assert create_request.path ==
             "/financeiro/eventos-financeiros/parcelas/inst-1/baixa"

    assert payload["conta_financeira"] == "acc-1"
    assert payload["composicao_valor"]["valor_bruto"] == 4000.0
    assert payload["data_pagamento"] == Date.utc_today() |> Date.to_iso8601()
  end

  test "create/2 accepts conta_financeira map id without lookup" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"id" => "baixa-2"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-2", refresh_token: "refresh-acq-2"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-2",
      tenant_id: integration.tenant_id
    }

    args = %{
      "parcela_id" => "inst-2",
      "data_pagamento" => Date.utc_today() |> Date.to_iso8601(),
      "conta_financeira" => %{"id" => "acc-2"},
      "composicao_valor" => %{"valor_bruto" => 120.5}
    }

    assert {:ok, %{"id" => "baixa-2"}} = Acquittance.create(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)

    assert request.path == "/financeiro/eventos-financeiros/parcelas/inst-2/baixa"
    assert payload["conta_financeira"] == "acc-2"
  end

  test "create/2 returns ambiguous_argument when account name matches multiple active accounts" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "items" => [
              %{"id" => "acc-1", "nome" => "Nubank Pessoal", "status" => "ATIVO"},
              %{"id" => "acc-2", "nome" => "Nubank Pessoal", "status" => "ATIVO"}
            ]
          }
        }
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-3", refresh_token: "refresh-acq-3"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-3",
      tenant_id: integration.tenant_id
    }

    args = %{
      "parcela_id" => "inst-3",
      "data_pagamento" => Date.utc_today() |> Date.to_iso8601(),
      "conta_financeira" => "Nubank Pessoal",
      "composicao_valor" => %{"valor_bruto" => 10.0}
    }

    assert {:error, {:ambiguous_argument, "conta_financeira"}} = Acquittance.create(args, context)

    [request] = Cazu.TestHTTPStub.requests(agent)
    assert request.path == "/conta-financeira"
  end

  test "create/2 normalizes metodo_pagamento aliases to API enum" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"id" => "baixa-3"}},
        %{status: 200, body: %{"id" => "baixa-4"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-4", refresh_token: "refresh-acq-4"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-4",
      tenant_id: integration.tenant_id
    }

    payment_date = Date.utc_today() |> Date.to_iso8601()

    assert {:ok, %{"id" => "baixa-3"}} =
             Acquittance.create(
               %{
                 "parcela_id" => "inst-4",
                 "data_pagamento" => payment_date,
                 "conta_financeira" => "ab5fe054-1abe-4109-a773-bbcef387b97b",
                 "composicao_valor" => %{"valor_bruto" => 50.0},
                 "metodo_pagamento" => "Pix"
               },
               context
             )

    assert {:ok, %{"id" => "baixa-4"}} =
             Acquittance.create(
               %{
                 "parcela_id" => "inst-5",
                 "data_pagamento" => payment_date,
                 "conta_financeira" => "ab5fe054-1abe-4109-a773-bbcef387b97b",
                 "composicao_valor" => %{"valor_bruto" => 60.0},
                 "metodo_pagamento" => "depósito"
               },
               context
             )

    [request_1, request_2] = Cazu.TestHTTPStub.requests(agent)

    payload_1 = Jason.decode!(request_1.raw_body)
    payload_2 = Jason.decode!(request_2.raw_body)

    assert payload_1["metodo_pagamento"] == "PIX_PAGAMENTO_INSTANTANEO"
    assert payload_2["metodo_pagamento"] == "DEPOSITO_BANCARIO"
  end

  test "update/2 normalizes metodo_pagamento aliases to API enum" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"id" => "baixa-7", "versao" => 2}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-6", refresh_token: "refresh-acq-6"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-6",
      tenant_id: integration.tenant_id
    }

    assert {:ok, %{"id" => "baixa-7", "versao" => 2}} =
             Acquittance.update(
               %{
                 "baixa_id" => "baixa-7",
                 "versao" => 1,
                 "metodo_pagamento" => "cartão de crédito"
               },
               context
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    payload = Jason.decode!(request.raw_body)

    assert request.path == "/financeiro/eventos-financeiros/parcelas/baixa/baixa-7"
    assert payload["metodo_pagamento"] == "CARTAO_CREDITO"
  end

  test "create/2 rejects unknown metodo_pagamento locally" do
    %{base_url: base_url, agent: agent} = start_stub_server([])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration =
      integration_fixture(%{access_token: "access-acq-5", refresh_token: "refresh-acq-5"})

    context = %{
      integration: integration,
      idempotency_key: "idem-acq-5",
      tenant_id: integration.tenant_id
    }

    assert {:error, {:invalid_argument, "metodo_pagamento"}} =
             Acquittance.create(
               %{
                 "parcela_id" => "inst-6",
                 "data_pagamento" => Date.utc_today() |> Date.to_iso8601(),
                 "conta_financeira" => "ab5fe054-1abe-4109-a773-bbcef387b97b",
                 "composicao_valor" => %{"valor_bruto" => 70.0},
                 "metodo_pagamento" => "PIXX"
               },
               context
             )

    assert [] == Cazu.TestHTTPStub.requests(agent)
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
