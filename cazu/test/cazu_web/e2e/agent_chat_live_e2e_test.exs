defmodule CazuWeb.E2E.AgentChatLiveE2ETest do
  use Cazu.E2ECase

  alias Cazu.LLM.OpenAIResponses

  test "Live Agent Chat blocks message send when Conta Azul is disconnected", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/agent/chat")

    view
    |> form("#agent-chat-form", %{"chat" => %{"text" => "me ajuda"}})
    |> render_submit()

    assert has_element?(view, "#flash-error", "Conta Azul is not connected")
  end

  test "Live Agent Chat runs full LLM + tool flow and renders assistant output", %{conn: conn} do
    [tool_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])

    %{base_url: openai_base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_live_turn_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => tool_spec["name"],
                "call_id" => "call_live_turn_1",
                "arguments" => Jason.encode!(%{"busca" => "Ana"})
              }
            ]
          }
        },
        %{status: 200, body: %{"id" => "resp_live_stream_placeholder", "output" => []}},
        %{
          status: 200,
          body: %{
            "id" => "resp_live_follow_up_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [%{"type" => "output_text", "text" => "Encontrei Ana no CRM."}]
              }
            ]
          }
        }
      ])

    %{base_url: conta_azul_base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "items" => [%{"id" => "person-1", "nome" => "Ana", "email" => "ana@example.com"}],
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

    chat_id = "live-chat-#{System.unique_integer([:positive])}"
    telegram_user_id = "live-user-#{System.unique_integer([:positive])}"

    {:ok, tenant} = Tenancy.get_or_create_telegram_tenant(chat_id)

    {:ok, _integration} =
      Tenancy.upsert_integration_tokens(tenant.id, "conta_azul", %{
        "access_token" => "access-live",
        "refresh_token" => "refresh-live"
      })

    {:ok, view, _html} =
      live(conn, ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}")

    view
    |> form("#agent-chat-form", %{"chat" => %{"text" => "liste as pessoas chamadas Ana"}})
    |> render_submit()

    assert has_element?(view, "#agent-chat-messages", "Message queued for processing.")
    assert has_element?(view, ~s([data-markdown-source="Encontrei Ana no CRM."]))

    assert %Conversation{} =
             conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: chat_id)

    assert conversation.previous_response_id == "resp_live_follow_up_1"
    assert conversation.metadata["last_action"] == "tool_result"
    assert conversation.metadata["last_tool_name"] == "crm.list_people"

    assert %ToolCall{status: "succeeded", name: "crm.list_people"} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "crm.list_people")
  end
end
