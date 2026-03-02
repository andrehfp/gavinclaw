defmodule Cazu.LLM.ProviderTest do
  use ExUnit.Case, async: true

  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.Provider
  alias Cazu.LLM.Providers.OpenAI
  alias Cazu.TestSupport.FakeOpenAIResponsesWSSocket

  setup do
    original_llm_config = Application.get_env(:cazu, :llm, [])

    on_exit(fn ->
      Application.put_env(:cazu, :llm, original_llm_config)
    end)

    :ok
  end

  test "provider_module/1 resolves configured provider" do
    Application.put_env(:cazu, :llm, provider: :openai)

    assert {:ok, module} = Provider.provider_module()
    assert module == OpenAI
  end

  test "provider_module/1 rejects unsupported provider" do
    Application.put_env(:cazu, :llm, provider: :unknown_provider)

    assert {:error, {:unsupported_provider, :unknown_provider}} =
             Provider.provider_module()
  end

  test "provider_module/1 accepts explicit module override" do
    assert {:ok, OpenAI} = Provider.provider_module(provider: OpenAI)
  end

  test "select_next_action/3 uses websocket mode when enabled" do
    [tool_spec] = OpenAI.build_tool_specs(["crm.list_people"])
    openai_tool_name = tool_spec["name"]

    conversation = %Conversation{metadata: %{}}

    events = [
      %{
        "type" => "response.completed",
        "response" => %{
          "id" => "resp_ws_provider_1",
          "output" => [
            %{
              "type" => "function_call",
              "name" => openai_tool_name,
              "call_id" => "call_ws_provider_1",
              "arguments" => ~s({"name":"Ana"})
            }
          ]
        }
      }
    ]

    assert {:ok,
            {:tool, "crm.list_people", %{"name" => "Ana"}, "resp_ws_provider_1", nil,
             "call_ws_provider_1"}} =
             Provider.select_next_action(conversation, "listar pessoas Ana",
               websocket_mode_enabled: true,
               api_key: "test-key",
               model: "gpt-5.2",
               websocket_base_url: "ws://localhost:9999/v1/responses",
               websocket_timeout_ms: 500,
               tools: ["crm.list_people"],
               socket_module: FakeOpenAIResponsesWSSocket,
               socket_opts: [events: events]
             )
  end
end
