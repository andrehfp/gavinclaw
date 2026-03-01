defmodule CazuWeb.TelegramWebhookControllerTest do
  use CazuWeb.ConnCase

  alias Cazu.Conversations.Conversation
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant

  setup do
    original_telegram = Application.get_env(:cazu, :telegram, [])
    original_openai = Application.get_env(:cazu, :openai, [])

    on_exit(fn ->
      Application.put_env(:cazu, :telegram, original_telegram)
      Application.put_env(:cazu, :openai, original_openai)
    end)

    :ok
  end

  test "POST /api/telegram/webhook/:token enqueues a conversation turn", %{conn: conn} do
    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_webhook_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [%{"type" => "output_text", "text" => "Entendi."}]
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :telegram, webhook_token: "secret-token", bot_token: nil)

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: base_url,
      timeout_ms: 1000
    )

    payload = %{
      "update_id" => 12_345,
      "message" => %{
        "chat" => %{"id" => 991},
        "from" => %{"id" => 101, "first_name" => "Andre"},
        "text" => "listar pessoas"
      }
    }

    conn = post(conn, ~p"/api/telegram/webhook/secret-token", payload)
    assert json_response(conn, 200) == %{"ok" => true}

    tenant = Repo.get_by!(Tenant, slug: "telegram-chat-991")

    assert %Conversation{previous_response_id: "resp_webhook_1"} =
             Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "991")
  end

  test "POST /api/telegram/webhook/:token rejects wrong token", %{conn: conn} do
    Application.put_env(:cazu, :telegram, webhook_token: "secret-token", bot_token: nil)

    conn = post(conn, ~p"/api/telegram/webhook/wrong-token", %{})
    assert json_response(conn, 401) == %{"ok" => false}
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
