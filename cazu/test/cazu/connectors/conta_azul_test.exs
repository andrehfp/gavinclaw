defmodule Cazu.Connectors.ContaAzulTest do
  use Cazu.DataCase

  alias Cazu.Connectors.ContaAzul
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration

  setup do
    original_config = Application.get_env(:cazu, :conta_azul, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_config)
    end)

    :ok
  end

  test "request/4 sends authenticated request and forwards successful responses" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"items" => [%{"id" => "inst-1"}]}}
      ])

    Application.put_env(:cazu, :conta_azul,
      api_base_url: base_url,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "openid profile",
      redirect_uri: "https://app.example.test/callback"
    )

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    assert {:ok, %{"items" => [%{"id" => "inst-1"}]}} =
             ContaAzul.request(
               integration,
               :get,
               "/finance/installments",
               params: %{"status" => "open"},
               idempotency_key: "idem-1"
             )

    [request] = Cazu.TestHTTPStub.requests(agent)

    assert request.method == "GET"
    assert request.path == "/finance/installments"
    assert request.query == %{"status" => "open"}
    assert request.headers["authorization"] == "Bearer access-1"
    assert request.headers["x-idempotency-key"] == "idem-1"
  end

  test "request/4 serializes list query params and drops empty values" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 200, body: %{"ok" => true}}
      ])

    Application.put_env(:cazu, :conta_azul,
      api_base_url: base_url,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "openid profile",
      redirect_uri: "https://app.example.test/callback"
    )

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    assert {:ok, %{"ok" => true}} =
             ContaAzul.request(
               integration,
               :get,
               "/finance/installments",
               params: %{
                 "status" => ["EM_ABERTO", "ATRASADO"],
                 "ids_clientes" => [],
                 "pagina" => 1,
                 "descricao" => ""
               }
             )

    [request] = Cazu.TestHTTPStub.requests(agent)

    assert request.method == "GET"
    assert request.path == "/finance/installments"
    assert request.query["pagina"] == "1"
    assert request.query["status"] == "ATRASADO"
    refute Map.has_key?(request.query, "ids_clientes")
    refute Map.has_key?(request.query, "descricao")
    assert String.contains?(request.query_string, "status=EM_ABERTO")
    assert String.contains?(request.query_string, "status=ATRASADO")
  end

  test "request/4 refreshes tokens on 401 and retries once" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{status: 401, body: %{"error" => "expired_token"}},
        %{
          status: 200,
          body: %{
            "access_token" => "access-2",
            "refresh_token" => "refresh-2",
            "id_token" => "id-2",
            "scope" => "openid profile",
            "expires_in" => 3600
          }
        },
        %{status: 200, body: %{"ok" => true}}
      ])

    Application.put_env(:cazu, :conta_azul,
      api_base_url: base_url,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "openid profile",
      redirect_uri: "https://app.example.test/callback"
    )

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    assert {:ok, %{"ok" => true}} =
             ContaAzul.request(
               integration,
               :post,
               "/crm/clients",
               json: %{"name" => "Ada Lovelace"},
               idempotency_key: "idem-2"
             )

    [first_request, refresh_request, retried_request] = Cazu.TestHTTPStub.requests(agent)
    refresh_form = URI.decode_query(refresh_request.raw_body)

    assert first_request.path == "/crm/clients"
    assert first_request.headers["authorization"] == "Bearer access-1"
    assert refresh_request.path == "/oauth2/token"

    assert refresh_request.headers["authorization"] ==
             "Basic " <> Base.encode64("client-id:client-secret")

    assert refresh_form["grant_type"] == "refresh_token"
    assert refresh_form["refresh_token"] == "refresh-1"
    assert retried_request.path == "/crm/clients"
    assert retried_request.headers["authorization"] == "Bearer access-2"

    refreshed_integration = Repo.get!(TenantIntegration, integration.id)
    assert refreshed_integration.access_token == "access-2"
    assert refreshed_integration.refresh_token == "refresh-2"
    assert refreshed_integration.status == "active"
  end

  test "request/4 marks integration as reauth_required when refresh fails" do
    %{base_url: base_url} =
      start_stub_server([
        %{status: 401, body: %{"error" => "expired_token"}},
        %{status: 400, body: %{"error" => "invalid_refresh_token"}}
      ])

    Application.put_env(:cazu, :conta_azul,
      api_base_url: base_url,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "openid profile",
      redirect_uri: "https://app.example.test/callback"
    )

    integration = integration_fixture(%{access_token: "access-1", refresh_token: "refresh-1"})

    assert {:error, :reauth_required} =
             ContaAzul.request(integration, :get, "/finance/installments", params: %{})

    failed_integration = Repo.get!(TenantIntegration, integration.id)
    assert failed_integration.status == "reauth_required"
  end

  test "request/4 returns reauth_required when no integration is present" do
    assert {:error, :reauth_required} = ContaAzul.request(nil, :get, "/finance/installments")
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
