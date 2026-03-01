defmodule CazuWeb.E2E.TelegramWebhookE2ETest do
  use Cazu.E2ECase

  alias Cazu.LLM.OpenAIResponses

  test "Telegram webhook runs full turn pipeline with tool execution", %{conn: conn} do
    [tool_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])

    %{base_url: openai_base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_webhook_turn_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => tool_spec["name"],
                "call_id" => "call_webhook_turn_1",
                "arguments" => Jason.encode!(%{"busca" => "Ana"})
              }
            ]
          }
        },
        %{status: 200, body: %{"id" => "resp_webhook_stream_placeholder", "output" => []}},
        %{
          status: 200,
          body: %{
            "id" => "resp_webhook_follow_up_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [%{"type" => "output_text", "text" => "Achei 1 contato: Ana."}]
              }
            ]
          }
        }
      ])

    %{base_url: conta_azul_base_url, agent: conta_azul_agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "items" => [%{"id" => "person-77", "nome" => "Ana"}],
            "totalItems" => 1
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: openai_base_url,
      timeout_ms: 1000
    )

    Application.put_env(:cazu, :conta_azul, api_base_url: conta_azul_base_url)
    Application.put_env(:cazu, :telegram, webhook_token: "secret-token", bot_token: nil)

    chat_id = "9901"

    {:ok, tenant} = Tenancy.get_or_create_telegram_tenant(chat_id)

    {:ok, _integration} =
      Tenancy.upsert_integration_tokens(tenant.id, "conta_azul", %{
        "access_token" => "access-webhook",
        "refresh_token" => "refresh-webhook"
      })

    payload = %{
      "update_id" => 22_001,
      "message" => %{
        "chat" => %{"id" => String.to_integer(chat_id)},
        "from" => %{"id" => 101, "first_name" => "Andre"},
        "text" => "listar pessoas Ana"
      }
    }

    conn = post(conn, ~p"/api/telegram/webhook/secret-token", payload)

    assert json_response(conn, 200) == %{"ok" => true}

    conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: chat_id)

    assert conversation.previous_response_id == "resp_webhook_follow_up_1"
    assert conversation.metadata["last_action"] == "tool_result"
    assert conversation.metadata["last_tool_name"] == "crm.list_people"

    assert %ToolCall{status: "succeeded", name: "crm.list_people"} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "crm.list_people")

    [request] = Cazu.TestHTTPStub.requests(conta_azul_agent)
    assert request.path == "/pessoas"
    assert request.query["busca"] == "Ana"
  end
end
