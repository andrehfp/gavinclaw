defmodule Cazu.Tools.CRMTest do
  use Cazu.DataCase

  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration
  alias Cazu.Tools.CRM

  setup do
    original_config = Application.get_env(:cazu, :conta_azul, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_config)
    end)

    :ok
  end

  test "list_people/2 maps aliases to busca and strips unsupported params" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"items" => [%{"nome" => "Ana Maria"}], "totalItems" => 1}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-1",
      tenant_id: integration.tenant_id
    }

    assert {:ok, %{"items" => [%{"nome" => "Ana Maria"}], "totalItems" => 1}} =
             CRM.list_people(%{"nome" => "Ana", "confirm" => false}, context)

    [request] = Cazu.TestHTTPStub.requests(agent)

    assert request.method == "GET"
    assert request.path == "/pessoas"
    assert request.query["busca"] == "Ana"
    refute Map.has_key?(request.query, "nome")
    refute Map.has_key?(request.query, "confirm")
  end

  test "list_people/2 normalizes nil items to empty list" do
    %{base_url: base_url} =
      start_stub_server([
        %{status: 200, body: %{"items" => nil, "totalItems" => 0}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-2",
      tenant_id: integration.tenant_id
    }

    assert {:ok, %{"items" => [], "totalItems" => 0}} =
             CRM.list_people(%{"busca" => "Ana"}, context)
  end

  test "create_person/2 normalizes tipo_pessoa values for Conta Azul" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"id" => "person-1"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-3",
      tenant_id: integration.tenant_id
    }

    assert {:ok, %{"id" => "person-1"}} =
             CRM.create_person(
               %{"nome" => "Conceito Imóveis", "tipo_pessoa" => "JURIDICA"},
               context
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    {:ok, body} = Jason.decode(request.raw_body)

    assert request.method == "POST"
    assert request.path == "/pessoas"
    assert body["nome"] == "Conceito Imóveis"
    assert body["tipo_pessoa"] == "Jurídica"
  end

  test "create_person/2 normalizes perfis to lista com tipo_perfil" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 201, body: %{"id" => "person-2"}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-4",
      tenant_id: integration.tenant_id
    }

    assert {:ok, %{"id" => "person-2"}} =
             CRM.create_person(
               %{
                 "nome" => "Fornecedor XPTO",
                 "tipo_pessoa" => "juridica",
                 "perfis" => %{"fornecedor" => true}
               },
               context
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    {:ok, body} = Jason.decode(request.raw_body)

    assert body["perfis"] == [%{"tipo_perfil" => "Fornecedor"}]
    assert body["tipo_pessoa"] == "Jurídica"
  end

  test "activate_people/2 normalizes ids alias to uuids" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 204, body: nil}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    context = %{
      integration: integration,
      idempotency_key: "idem-5",
      tenant_id: integration.tenant_id
    }

    assert {:ok, _} =
             CRM.activate_people(
               %{"ids" => ["A-1", "B-2"]},
               context
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    {:ok, body} = Jason.decode(request.raw_body)

    assert request.path == "/pessoas/ativar"
    assert body["uuids"] == ["A-1", "B-2"]
    refute Map.has_key?(body, "ids")
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
