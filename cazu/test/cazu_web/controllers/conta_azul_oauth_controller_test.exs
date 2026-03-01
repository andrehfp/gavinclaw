defmodule CazuWeb.ContaAzulOAuthControllerTest do
  use CazuWeb.ConnCase

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

  test "GET /api/auth/conta-azul/start requires tenant_id", %{conn: conn} do
    conn = get(conn, ~p"/api/auth/conta-azul/start")
    assert json_response(conn, 400) == %{"error" => "tenant_id is required"}
  end

  test "GET /api/auth/conta-azul/start redirects to OAuth provider with signed state", %{
    conn: conn
  } do
    tenant = tenant_fixture()

    Application.put_env(:cazu, :conta_azul,
      login_url: "https://auth.example.test/login",
      token_url: "https://auth.example.test/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "https://app.example.test/api/auth/conta-azul/callback",
      scope: "openid profile"
    )

    conn = get(conn, ~p"/api/auth/conta-azul/start?tenant_id=#{tenant.id}")

    location = redirected_to(conn, 302)
    uri = URI.parse(location)
    params = URI.decode_query(uri.query)

    assert uri.host == "auth.example.test"
    assert uri.path == "/login"
    assert params["response_type"] == "code"
    assert params["client_id"] == "client-id"
    assert params["redirect_uri"] == "https://app.example.test/api/auth/conta-azul/callback"
    assert params["scope"] == "openid profile"

    assert {:ok, tenant_id} =
             Phoenix.Token.verify(
               CazuWeb.Endpoint,
               "conta_azul_oauth",
               params["state"],
               max_age: 15 * 60
             )

    assert tenant_id == Integer.to_string(tenant.id)
  end

  test "GET /api/auth/conta-azul/callback requires code and state", %{conn: conn} do
    conn = get(conn, ~p"/api/auth/conta-azul/callback")
    assert json_response(conn, 400) == %{"error" => "code and state are required"}
  end

  test "GET /api/auth/conta-azul/callback rejects invalid state", %{conn: conn} do
    conn = get(conn, ~p"/api/auth/conta-azul/callback?code=code-1&state=invalid")
    assert json_response(conn, 422) == %{"error" => ":invalid_state"}
  end

  test "GET /api/auth/conta-azul/callback exchanges code and persists integration", %{conn: conn} do
    tenant = tenant_fixture()

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "access_token" => "access-1",
            "refresh_token" => "refresh-1",
            "id_token" => "id-1",
            "scope" => "openid profile",
            "expires_in" => 300
          }
        }
      ])

    Application.put_env(:cazu, :conta_azul,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "https://app.example.test/api/auth/conta-azul/callback",
      scope: "openid profile"
    )

    state = Phoenix.Token.sign(CazuWeb.Endpoint, "conta_azul_oauth", Integer.to_string(tenant.id))
    conn = get(conn, ~p"/api/auth/conta-azul/callback?code=code-123&state=#{state}")

    assert json_response(conn, 200) == %{"status" => "ok", "tenant_id" => tenant.id}

    integration = Repo.get_by!(TenantIntegration, tenant_id: tenant.id, provider: "conta_azul")

    assert integration.access_token == "access-1"
    assert integration.refresh_token == "refresh-1"
    assert integration.id_token == "id-1"
    assert integration.status == "active"
    assert integration.scopes == "openid profile"
    assert %DateTime{} = integration.token_expires_at

    [request] = Cazu.TestHTTPStub.requests(agent)
    form = URI.decode_query(request.raw_body)

    assert request.method == "POST"
    assert request.path == "/oauth2/token"

    assert request.headers["authorization"] ==
             "Basic " <> Base.encode64("client-id:client-secret")

    assert form["grant_type"] == "authorization_code"
    assert form["code"] == "code-123"
    assert form["redirect_uri"] == "https://app.example.test/api/auth/conta-azul/callback"
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
