defmodule CazuWeb.E2E.OAuthHtmlE2ETest do
  use Cazu.E2ECase

  test "OAuth HTML journey creates Conta Azul tenant and integration", %{conn: conn} do
    workspace_id = "workspace-#{System.unique_integer([:positive])}"

    access_token =
      build_fake_jwt(%{
        "sub" => workspace_id,
        "username" => "Finance Team"
      })

    %{base_url: oauth_base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "access_token" => access_token,
            "refresh_token" => "refresh-e2e",
            "id_token" => "id-e2e",
            "scope" => "openid profile",
            "expires_in" => 300
          }
        }
      ])

    Application.put_env(:cazu, :conta_azul,
      login_url: "#{oauth_base_url}/login",
      token_url: "#{oauth_base_url}/oauth2/token",
      client_id: "client-e2e",
      client_secret: "secret-e2e",
      redirect_uri: "https://app.example.test/auth/conta-azul/callback",
      scope: "openid profile"
    )

    conn = get(conn, ~p"/auth/conta-azul/start")

    location = redirected_to(conn, 302)
    %URI{query: query} = URI.parse(location)
    params = URI.decode_query(query)

    assert {:ok, %{"mode" => "conta_azul_auto"}} =
             Phoenix.Token.verify(
               CazuWeb.Endpoint,
               "conta_azul_oauth",
               params["state"],
               max_age: 15 * 60
             )

    callback_conn =
      conn
      |> recycle()
      |> get(~p"/auth/conta-azul/callback?code=code-e2e&state=#{params["state"]}")

    callback_location = redirected_to(callback_conn, 302)
    callback_uri = URI.parse(callback_location)
    callback_params = URI.decode_query(callback_uri.query || "")

    assert callback_uri.path == "/"
    assert callback_params["connected"] == "1"

    tenant_id = String.to_integer(callback_params["tenant_id"])
    tenant = Repo.get!(Tenant, tenant_id)

    assert tenant.slug == "conta-azul-#{workspace_id}"

    integration = Repo.get_by!(TenantIntegration, tenant_id: tenant.id, provider: "conta_azul")

    assert integration.status == "active"
    assert integration.external_workspace_id == workspace_id
    assert integration.access_token == access_token
    assert integration.refresh_token == "refresh-e2e"
  end
end
