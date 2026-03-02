defmodule Cazu.Agents.ToolResultReceivedProviderTest do
  use ExUnit.Case, async: false

  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall

  setup do
    original_llm_config = Application.get_env(:cazu, :llm, [])

    original_fake_provider_config =
      Application.get_env(:cazu, Cazu.TestSupport.FakeLLMProvider, [])

    Application.put_env(:cazu, :llm, provider: Cazu.TestSupport.FakeLLMProvider)

    on_exit(fn ->
      Application.put_env(:cazu, :llm, original_llm_config)
      Application.put_env(:cazu, Cazu.TestSupport.FakeLLMProvider, original_fake_provider_config)
    end)

    :ok
  end

  test "tool_result action uses provider abstraction to emit follow-up message" do
    Application.put_env(:cazu, Cazu.TestSupport.FakeLLMProvider,
      continue_with_tool_output_stream:
        {:ok, %{type: :message, message: "Resposta sintetizada", response_id: "resp_next_1"}}
    )

    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 1,
        conversation_id: "chat-provider-message",
        user_id: 2
      })

    {_next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.tool_result_action(%{
          tool_name: "crm.list_people",
          status: "succeeded",
          result: %{"items" => [%{"nome" => "Ana"}]},
          llm_context: %{"llm_response_id" => "resp_prev_1", "llm_tool_call_id" => "call_prev_1"},
          user_request: "qual o resultado?"
        })
      )

    assert [%EmitUserMessage{} = directive] = directives
    assert directive.message == "Resposta sintetizada"
    assert directive.metadata["next_previous_response_id"] == "resp_next_1"
  end

  test "tool_result action uses provider abstraction to emit follow-up tool call" do
    Application.put_env(:cazu, Cazu.TestSupport.FakeLLMProvider,
      continue_with_tool_output_stream:
        {:ok,
         %{
           type: :tool,
           tool_name: "crm.list_people",
           arguments: %{"busca" => "Beatriz"},
           response_id: "resp_next_2",
           llm_tool_call_id: "call_next_2"
         }}
    )

    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 1,
        conversation_id: "chat-provider-tool",
        user_id: 2
      })

    {_next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.tool_result_action(%{
          tool_name: "crm.list_people",
          status: "succeeded",
          result: %{"items" => [%{"nome" => "Ana"}]},
          llm_context: %{"llm_response_id" => "resp_prev_2", "llm_tool_call_id" => "call_prev_2"},
          user_request: "continue"
        })
      )

    assert [%EnqueueToolCall{} = directive] = directives
    assert directive.tool_name == "crm.list_people"
    assert directive.arguments == %{"busca" => "Beatriz"}
    assert directive.execution_meta["llm_response_id"] == "resp_next_2"
    assert directive.execution_meta["llm_tool_call_id"] == "call_next_2"
  end

  test "tool_result action reports llm follow-up unavailability via jido directive" do
    Application.put_env(:cazu, Cazu.TestSupport.FakeLLMProvider,
      continue_with_tool_output: {:error, :unavailable},
      continue_with_tool_output_stream: {:error, :unavailable}
    )

    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 1,
        conversation_id: "chat-provider-fallback-generic",
        user_id: 2
      })

    {_next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.tool_result_action(%{
          tool_name: "acquittance.create",
          status: "failed",
          arguments: %{},
          error: {:invalid_argument, "conta_financeira"},
          llm_context: %{}
        })
      )

    assert [%EmitUserMessage{} = directive] = directives
    assert directive.metadata["action"] == "llm_follow_up_unavailable"
    assert directive.metadata["error_type"] == "llm_follow_up_unavailable"
    assert String.contains?(directive.message, "Não consegui finalizar a resposta da LLM")
  end

  test "tool_result action includes provider/API error message when llm follow-up is unavailable" do
    Application.put_env(:cazu, Cazu.TestSupport.FakeLLMProvider,
      continue_with_tool_output: {:error, :unavailable},
      continue_with_tool_output_stream: {:error, :unavailable}
    )

    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 1,
        conversation_id: "chat-provider-fallback-with-error-message",
        user_id: 2
      })

    {_next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.tool_result_action(%{
          tool_name: "acquittance.create",
          status: "failed",
          arguments: %{},
          error: %{
            body: %{
              "message" => "A data do pagamento deve ser igual ou anterior à data atual."
            }
          },
          llm_context: %{}
        })
      )

    assert [%EmitUserMessage{} = directive] = directives
    assert directive.metadata["action"] == "llm_follow_up_unavailable"

    assert String.contains?(
             directive.message,
             "A data do pagamento deve ser igual ou anterior à data atual"
           )

    assert is_binary(directive.metadata["llm_follow_up_error"])

    assert directive.metadata["tool_error_message"] ==
             "A data do pagamento deve ser igual ou anterior à data atual."
  end
end
