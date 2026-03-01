defmodule Cazu.Workers.ConversationTurnWorkerTest do
  use Cazu.DataCase

  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.Operations.Job
  alias Cazu.Operations.ToolCall
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.User
  alias Cazu.Workers.ConversationTurnWorker

  setup do
    original_config = Application.get_env(:cazu, :openai, [])

    on_exit(fn ->
      Application.put_env(:cazu, :openai, original_config)
    end)

    :ok
  end

  test "perform/1 persists previous_response_id for no_tool responses" do
    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_memory_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "Preciso de mais detalhes."}
                ]
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-memory",
                 "telegram_user_id" => "tg-user-memory",
                 "message_text" => "me ajuda",
                 "telegram_update_id" => "upd-1"
               }
             })

    conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "chat-memory")
    assert conversation.previous_response_id == "resp_memory_1"
    assert conversation.metadata["last_action"] == "no_tool"
    assert conversation.metadata["last_assistant_message"] == "Preciso de mais detalhes."
    assert [%{"role" => "user"}, %{"role" => "assistant"}] = conversation.metadata["messages"]
  end

  test "perform/1 enqueues a fresh read tool call when a previous turn already succeeded" do
    [tool_spec] = OpenAIResponses.build_tool_specs(["finance.list_categories"])

    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_tool_reused_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => tool_spec["name"],
                "call_id" => "call_tool_reused_1",
                "arguments" => "{}"
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    previous_response_id = "resp_before_tool_selection"

    %Conversation{}
    |> Conversation.changeset(%{
      tenant_id: tenant.id,
      chat_id: "chat-reused-tool",
      telegram_user_id: "tg-user-reused-tool",
      status: "active",
      previous_response_id: previous_response_id,
      metadata: %{
        "messages" => [
          %{"role" => "user", "content" => "lista categorias"},
          %{"role" => "assistant", "content" => "Claro, vou verificar."}
        ]
      }
    })
    |> Repo.insert!()

    existing_job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "succeeded",
        intent: "finance.list_categories",
        input_payload: %{}
      })
      |> Repo.insert!()

    %ToolCall{}
    |> ToolCall.changeset(%{
      tenant_id: tenant.id,
      job_id: existing_job.id,
      name: "finance.list_categories",
      idempotency_key:
        idempotency_key(tenant.id, "finance.list_categories", %{}, %{
          "llm_response_id" => "resp_old_turn"
        }),
      arguments: %{},
      status: "succeeded",
      result: %{"itens" => []}
    })
    |> Repo.insert!()

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-reused-tool",
                 "telegram_user_id" => "tg-user-reused-tool",
                 "message_text" => "lista categorias",
                 "telegram_update_id" => "upd-reused-1"
               }
             })

    conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "chat-reused-tool")

    assert conversation.previous_response_id == previous_response_id

    tool_calls =
      ToolCall
      |> where([tc], tc.tenant_id == ^tenant.id and tc.name == "finance.list_categories")
      |> order_by([tc], asc: tc.id)
      |> Repo.all()

    assert length(tool_calls) == 2
    assert Enum.at(tool_calls, 0).status == "succeeded"
    assert Enum.at(tool_calls, 1).status in ["queued", "running", "failed", "succeeded"]
    assert Enum.at(tool_calls, 0).idempotency_key != Enum.at(tool_calls, 1).idempotency_key
  end

  test "perform/1 falls back to legacy command parsing when llm is unavailable" do
    Application.put_env(:cazu, :openai,
      api_key: nil,
      model: "gpt-4.1-mini",
      base_url: "http://127.0.0.1:9999",
      timeout_ms: 100
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-fallback",
                 "telegram_user_id" => "tg-user-fallback",
                 "message_text" => "/crm.list_people {\"name\":\"Ana\"}",
                 "telegram_update_id" => "upd-2"
               }
             })

    assert %ToolCall{name: "crm.list_people"} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "crm.list_people")
  end

  test "perform/1 infers nome filter for crm.list_people when model omits arguments" do
    [tool_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])

    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_tool_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => tool_spec["name"],
                "call_id" => "call_tool_3",
                "arguments" => "{}"
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-nome",
                 "telegram_user_id" => "tg-user-nome",
                 "message_text" => "liste as pessoas chamadas Ana",
                 "telegram_update_id" => "upd-3"
               }
             })

    assert %ToolCall{name: "crm.list_people", arguments: %{"busca" => "Ana"}} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "crm.list_people")
  end

  test "perform/1 infers period and payable type for finance.get_statement when model omits arguments" do
    [tool_spec] = OpenAIResponses.build_tool_specs(["finance.get_statement"])

    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_tool_2",
            "output" => [
              %{
                "type" => "function_call",
                "name" => tool_spec["name"],
                "call_id" => "call_tool_4",
                "arguments" => "{}"
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-finance-statement",
                 "telegram_user_id" => "tg-user-finance-statement",
                 "message_text" => "liste as minhas contas a pagar",
                 "telegram_update_id" => "upd-4"
               }
             })

    assert %ToolCall{name: "finance.get_statement", arguments: arguments} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "finance.get_statement")

    today = Date.utc_today()
    {year, month, _day} = Date.to_erl(today)
    month_start = Date.new!(year, month, 1)
    month_end = Date.new!(year, month, :calendar.last_day_of_the_month(year, month))

    assert arguments["type"] == "payable"
    assert arguments["from"] == Date.to_iso8601(month_start)
    assert arguments["to"] == Date.to_iso8601(month_end)
  end

  test "perform/1 keeps status inquiry silent while active job is running" do
    Application.put_env(:cazu, :openai,
      api_key: nil,
      model: "gpt-4.1-mini",
      base_url: "http://127.0.0.1:9999",
      timeout_ms: 100
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    %Job{}
    |> Job.changeset(%{
      tenant_id: tenant.id,
      user_id: user.id,
      channel: "telegram",
      status: "running",
      intent: "finance.list_financial_accounts",
      input_payload: %{}
    })
    |> Repo.insert!()

    assert :ok =
             ConversationTurnWorker.perform(%Oban.Job{
               args: %{
                 "tenant_id" => tenant.id,
                 "user_id" => user.id,
                 "chat_id" => "chat-status",
                 "telegram_user_id" => "tg-user-status",
                 "message_text" => "tá rodando?",
                 "telegram_update_id" => "upd-5"
               }
             })

    assert Repo.get_by(Conversation, tenant_id: tenant.id, chat_id: "chat-status") == nil
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

  defp user_fixture(tenant) do
    unique = System.unique_integer([:positive])

    %User{}
    |> User.changeset(%{
      tenant_id: tenant.id,
      telegram_user_id: "telegram-#{unique}",
      role: "operator",
      name: "User #{unique}"
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

  defp idempotency_key(tenant_id, tool_name, arguments, execution_meta) do
    normalized_args = canonical(arguments)

    read_scope =
      Map.get(execution_meta, "llm_response_id") ||
        Map.get(execution_meta, "llm_tool_call_id") ||
        Integer.to_string(System.unique_integer([:monotonic, :positive]))

    [tenant_id, tool_name, Jason.encode!(normalized_args), read_scope]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(":")
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp canonical(value) when is_map(value) do
    value
    |> Enum.map(fn {key, val} -> {to_string(key), canonical(val)} end)
    |> Enum.sort_by(fn {key, _val} -> key end)
    |> Map.new()
  end

  defp canonical(value) when is_list(value), do: Enum.map(value, &canonical/1)
  defp canonical(value), do: value
end
