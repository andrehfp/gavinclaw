defmodule Cazu.LLM.OpenAIResponsesTest do
  use Cazu.DataCase

  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.LLM.ResponseUsage
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant

  setup do
    original_openai_config = Application.get_env(:cazu, :openai, [])
    original_tool_retrieval_config = Application.get_env(:cazu, :tool_retrieval, [])

    on_exit(fn ->
      Application.put_env(:cazu, :openai, original_openai_config)
      Application.put_env(:cazu, :tool_retrieval, original_tool_retrieval_config)
      _ = Cazu.LLM.ToolIndex.refresh()
    end)

    :ok
  end

  test "select_next_action/3 parses a tool call and preserves previous_response_id context" do
    [tool_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])
    openai_tool_name = tool_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_2",
            "output" => [
              %{
                "type" => "function_call",
                "name" => openai_tool_name,
                "call_id" => "call_tool_1",
                "arguments" => ~s({"name":"Ana"})
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

    conversation = conversation_fixture(%{previous_response_id: "resp_1"})

    assert {:ok, {:tool, "crm.list_people", %{"name" => "Ana"}, "resp_2", nil, "call_tool_1"}} =
             OpenAIResponses.select_next_action(conversation, "liste clientes Ana",
               tools: ["crm.list_people"]
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    request_body = Jason.decode!(request.raw_body)

    assert request.path == "/responses"
    assert request.headers["authorization"] == "Bearer test-key"
    assert request_body["previous_response_id"] == "resp_1"
    assert request_body["model"] == "gpt-4.1-mini"
    assert String.contains?(request_body["instructions"], "Never promise future action")
    assert String.contains?(request_body["instructions"], "short follow-up confirmations")

    assert [%{"name" => request_tool_name}] = request_body["tools"]
    assert request_tool_name == openai_tool_name
    assert String.starts_with?(request_tool_name, "tool_crm_list_people_")
  end

  test "select_next_action/3 persists usage with estimated costs" do
    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_cost_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "Tudo certo."}
                ]
              }
            ],
            "usage" => %{
              "input_tokens" => 1000,
              "output_tokens" => 250,
              "total_tokens" => 1250,
              "input_tokens_details" => %{"cached_tokens" => 100}
            }
          }
        }
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      model_prices: %{
        "gpt-4.1-mini" => %{
          input_per_million: 0.4,
          output_per_million: 1.6
        }
      },
      base_url: base_url,
      timeout_ms: 1000
    )

    conversation = conversation_fixture()

    assert {:ok, {:no_tool, "Tudo certo.", "resp_cost_1"}} =
             OpenAIResponses.select_next_action(conversation, "ola")

    usage = Repo.get_by!(ResponseUsage, response_id: "resp_cost_1")

    assert usage.conversation_id == conversation.id
    assert usage.tenant_id == conversation.tenant_id
    assert usage.chat_id == conversation.chat_id
    assert usage.model == "gpt-4.1-mini"
    assert usage.request_stage == "select_next_action"
    assert usage.input_tokens == 1000
    assert usage.output_tokens == 250
    assert usage.total_tokens == 1250
    assert usage.cached_input_tokens == 100
    assert_in_delta usage.input_cost_usd, 0.0004, 0.0000001
    assert_in_delta usage.output_cost_usd, 0.0004, 0.0000001
    assert_in_delta usage.total_cost_usd, 0.0008, 0.0000001
  end

  test "select_next_action/3 returns no_tool with model message" do
    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_3",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "Preciso de mais detalhes para executar."}
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

    conversation = conversation_fixture()

    assert {:ok, {:no_tool, "Preciso de mais detalhes para executar.", "resp_3"}} =
             OpenAIResponses.select_next_action(conversation, "me ajuda")
  end

  test "select_next_action/3 preserves confirm argument from the model tool call" do
    [tool_spec] = OpenAIResponses.build_tool_specs(["crm.create_client"])
    openai_tool_name = tool_spec["name"]

    %{base_url: base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_4",
            "output" => [
              %{
                "type" => "function_call",
                "name" => openai_tool_name,
                "call_id" => "call_tool_2",
                "arguments" => ~s({"name":"Ada","confirm":true})
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

    conversation = conversation_fixture()

    assert {:ok,
            {:tool, "crm.create_client", %{"confirm" => true, "name" => "Ada"}, "resp_4", nil,
             "call_tool_2"}} =
             OpenAIResponses.select_next_action(conversation, "crie cliente Ada")
  end

  test "select_next_action/3 keeps follow-up namespace continuity when prior tool namespace exists" do
    [payable_spec] = OpenAIResponses.build_tool_specs(["finance.create_payable"])
    openai_payable_tool_name = payable_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_5",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "ok"}
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

    Application.put_env(:cazu, :tool_retrieval, strategy: :keyword, embeddings_enabled: false)

    conversation =
      conversation_fixture(%{
        metadata: %{
          "messages" => [
            %{"role" => "user", "content" => "quero lançar uma conta a pagar de aluguel"},
            %{
              "role" => "assistant",
              "content" => "Perfeito, vou criar um contas a pagar com rateio Aluguel",
              "tool_name" => "finance.create_payable"
            },
            %{"role" => "user", "content" => "pode ser esse mesmo"}
          ]
        }
      })

    assert {:ok, {:no_tool, "ok", "resp_5"}} =
             OpenAIResponses.select_next_action(conversation, "sim")

    [request] = Cazu.TestHTTPStub.requests(agent)
    request_body = Jason.decode!(request.raw_body)
    selected_tool_names = Enum.map(request_body["tools"], & &1["name"])

    assert openai_payable_tool_name in selected_tool_names
  end

  test "select_next_action/3 includes proactive lookup tools for payable category lookup requests" do
    [categories_spec] = OpenAIResponses.build_tool_specs(["finance.list_categories"])
    openai_categories_tool_name = categories_spec["name"]
    [people_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])
    openai_people_tool_name = people_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_6",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "ok"}
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
      timeout_ms: 1000,
      max_tools_per_turn: 5
    )

    conversation = conversation_fixture()

    assert {:ok, {:no_tool, "ok", "resp_6"}} =
             OpenAIResponses.select_next_action(
               conversation,
               "Vencimento no mesmo dia da competência. Procura a categoria despesas aluguel e o fornecedor Conceito Imóveis."
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    request_body = Jason.decode!(request.raw_body)
    selected_tool_names = Enum.map(request_body["tools"], & &1["name"])

    assert openai_categories_tool_name in selected_tool_names
    assert openai_people_tool_name in selected_tool_names
  end

  test "select_next_action/3 keyword routing keeps acquittance tools for baixa intents" do
    [acquittance_spec] = OpenAIResponses.build_tool_specs(["acquittance.create"])
    openai_acquittance_tool_name = acquittance_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_6b",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "ok"}
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

    Application.put_env(:cazu, :tool_retrieval, strategy: :keyword, embeddings_enabled: false)

    conversation = conversation_fixture()

    assert {:ok, {:no_tool, "ok", "resp_6b"}} =
             OpenAIResponses.select_next_action(
               conversation,
               "pode dar baixa na parcela 123 hoje?"
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    request_body = Jason.decode!(request.raw_body)
    selected_tool_names = Enum.map(request_body["tools"], & &1["name"])

    assert openai_acquittance_tool_name in selected_tool_names
  end

  test "select_next_action/3 hybrid strategy uses embeddings candidates when confidence is high" do
    [people_spec] = OpenAIResponses.build_tool_specs(["crm.list_people"])
    openai_people_tool_name = people_spec["name"]

    tools = Cazu.Tools.supported_tools()
    target_tool = "crm.list_people"

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        embeddings_ok_response(tools, target_tool),
        embeddings_query_ok_response(),
        %{
          status: 200,
          body: %{
            "id" => "resp_hybrid_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => openai_people_tool_name,
                "call_id" => "call_hybrid_1",
                "arguments" => ~s({"name":"Ana"})
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

    Application.put_env(:cazu, :tool_retrieval,
      strategy: :hybrid,
      embeddings_enabled: true,
      embedding_model: "text-embedding-3-small",
      top_k: 8,
      min_similarity: 0.1,
      embedding_timeout_ms: 1_000
    )

    assert {:ok, :ready} = Cazu.LLM.ToolIndex.refresh()

    conversation = conversation_fixture()

    assert {:ok,
            {:tool, "crm.list_people", %{"name" => "Ana"}, "resp_hybrid_1", nil, "call_hybrid_1"}} =
             OpenAIResponses.select_next_action(conversation, "qual o email da Ana?")

    requests = Cazu.TestHTTPStub.requests(agent)

    assert Enum.any?(requests, &(&1.path == "/embeddings"))
    assert Enum.any?(requests, &(&1.path == "/responses"))

    response_request = Enum.find(requests, &(&1.path == "/responses"))
    response_body = Jason.decode!(response_request.raw_body)
    selected_tool_names = Enum.map(response_body["tools"], & &1["name"])

    assert openai_people_tool_name in selected_tool_names
  end

  test "select_next_action/3 hybrid strategy falls back to keyword routing when embeddings fail" do
    [payable_spec] = OpenAIResponses.build_tool_specs(["finance.create_payable"])
    openai_payable_tool_name = payable_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 500,
          body: %{"error" => "embedding_failure"}
        },
        %{
          status: 200,
          body: %{
            "id" => "resp_hybrid_2",
            "output" => [
              %{
                "type" => "message",
                "content" => [
                  %{"type" => "output_text", "text" => "ok"}
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

    Application.put_env(:cazu, :tool_retrieval,
      strategy: :hybrid,
      embeddings_enabled: true,
      embedding_model: "text-embedding-3-small",
      top_k: 8,
      min_similarity: 0.1,
      embedding_timeout_ms: 1_000
    )

    conversation = conversation_fixture()

    assert {:ok, {:no_tool, "ok", "resp_hybrid_2"}} =
             OpenAIResponses.select_next_action(conversation, "quero lançar uma conta a pagar")

    [embedding_request, response_request] = Cazu.TestHTTPStub.requests(agent)

    assert embedding_request.path == "/embeddings"
    assert response_request.path == "/responses"

    response_body = Jason.decode!(response_request.raw_body)
    selected_tool_names = Enum.map(response_body["tools"], & &1["name"])

    assert openai_payable_tool_name in selected_tool_names
  end

  test "continue_with_tool_output/4 returns a follow-up tool action when model requests another tool" do
    [categories_spec] = OpenAIResponses.build_tool_specs(["finance.list_categories"])
    openai_categories_name = categories_spec["name"]

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_followup_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => openai_categories_name,
                "call_id" => "call_followup_1",
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

    assert {:ok,
            %{
              type: :tool,
              tool_name: "finance.list_categories",
              arguments: %{},
              response_id: "resp_followup_1",
              llm_tool_call_id: "call_followup_1"
            }} =
             OpenAIResponses.continue_with_tool_output(
               "resp_prev_1",
               "call_prev_1",
               %{"ok" => true}
             )

    [request] = Cazu.TestHTTPStub.requests(agent)
    request_body = Jason.decode!(request.raw_body)

    assert is_binary(request_body["instructions"])
    assert String.contains?(request_body["instructions"], "Never promise future actions")
    assert request_body["tool_choice"] == "auto"
    assert request_body["parallel_tool_calls"] == true
    assert is_list(request_body["tools"])
    assert Enum.any?(request_body["tools"], &(&1["name"] == openai_categories_name))
  end

  defp conversation_fixture(attrs \\ %{}) do
    tenant = tenant_fixture()

    attrs =
      Map.merge(
        %{
          tenant_id: tenant.id,
          chat_id: "chat-#{System.unique_integer([:positive])}",
          telegram_user_id: "telegram-user-1",
          status: "active"
        },
        attrs
      )

    %Conversation{}
    |> Conversation.changeset(attrs)
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

  defp embeddings_ok_response(tools, target_tool) do
    target_index = Enum.find_index(tools, &(&1 == target_tool)) || 0

    data =
      tools
      |> Enum.with_index()
      |> Enum.map(fn {_tool_name, index} ->
        embedding = if index == target_index, do: [1.0, 0.0], else: [0.0, 1.0]

        %{
          "object" => "embedding",
          "index" => index,
          "embedding" => embedding
        }
      end)

    %{
      status: 200,
      body: %{
        "object" => "list",
        "model" => "text-embedding-3-small",
        "data" => data
      }
    }
  end

  defp embeddings_query_ok_response do
    %{
      status: 200,
      body: %{
        "object" => "list",
        "model" => "text-embedding-3-small",
        "data" => [
          %{
            "object" => "embedding",
            "index" => 0,
            "embedding" => [1.0, 0.0]
          }
        ]
      }
    }
  end
end
