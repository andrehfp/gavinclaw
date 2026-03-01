defmodule Cazu.Auth.ContaAzulOAuthTest do
  use Cazu.DataCase

  alias Cazu.Auth.ContaAzulOAuth

  setup do
    original_config = Application.get_env(:cazu, :conta_azul, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_config)
    end)

    :ok
  end

  test "authorize_url/1 returns the expected OAuth URL" do
    Application.put_env(:cazu, :conta_azul,
      login_url: "https://auth.example.test/login",
      token_url: "https://auth.example.test/token",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "https://app.example.test/api/auth/conta-azul/callback",
      scope: "openid profile"
    )

    assert {:ok, url} = ContaAzulOAuth.authorize_url("state-123")

    parsed = URI.parse(url)
    params = URI.decode_query(parsed.query)

    assert parsed.path == "/login"
    assert params["response_type"] == "code"
    assert params["client_id"] == "client-id"
    assert params["redirect_uri"] == "https://app.example.test/api/auth/conta-azul/callback"
    assert params["state"] == "state-123"
    assert params["scope"] == "openid profile"
  end

  test "authorize_url/1 returns an explicit error when client_id is missing" do
    Application.put_env(:cazu, :conta_azul,
      login_url: "https://auth.example.test/login",
      token_url: "https://auth.example.test/token",
      client_secret: "client-secret",
      redirect_uri: "https://app.example.test/api/auth/conta-azul/callback",
      scope: "openid profile"
    )

    assert {:error, :missing_client_id} = ContaAzulOAuth.authorize_url("state-123")
  end

  test "exchange_code_for_tokens/1 posts form data and normalizes tokens" do
    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "access_token" => "access-1",
            "refresh_token" => "refresh-1",
            "id_token" => "id-1",
            "scope" => "openid profile",
            "expires_in" => 120
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

    assert {:ok, token_attrs} = ContaAzulOAuth.exchange_code_for_tokens("code-123")
    assert token_attrs["access_token"] == "access-1"
    assert token_attrs["refresh_token"] == "refresh-1"
    assert token_attrs["id_token"] == "id-1"
    assert token_attrs["scopes"] == "openid profile"
    assert %DateTime{} = token_attrs["token_expires_at"]

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

  test "exchange_code_for_tokens/1 returns error map for non-2xx responses" do
    %{base_url: base_url} =
      start_stub_server([
        %{status: 401, body: %{"error" => "invalid_grant"}}
      ])

    Application.put_env(:cazu, :conta_azul,
      login_url: "#{base_url}/login",
      token_url: "#{base_url}/oauth2/token",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "https://app.example.test/api/auth/conta-azul/callback",
      scope: "openid profile"
    )

    assert {:error, %{status: 401, body: %{"error" => "invalid_grant"}}} =
             ContaAzulOAuth.exchange_code_for_tokens("bad-code")
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
