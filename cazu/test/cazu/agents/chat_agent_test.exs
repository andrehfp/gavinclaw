defmodule Cazu.Agents.ChatAgentTest do
  use ExUnit.Case, async: true

  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.Directives.AskForConfirmation
  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall

  setup_all do
    _ = Application.ensure_all_started(:jido)
    :ok
  end

  test "cmd/2 emits enqueue directive for low-risk tool selection" do
    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 10,
        conversation_id: "chat-1",
        user_id: 30
      })

    {next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.user_message_action(%{
          message_text: "lista categorias",
          tool_name: "finance.list_categories",
          arguments: %{},
          execution_meta: %{"llm_response_id" => "resp-1"},
          require_confirmation: false
        })
      )

    assert [%EnqueueToolCall{} = directive] = directives
    assert directive.tool_name == "finance.list_categories"
    assert directive.arguments == %{}
    assert directive.execution_meta == %{"llm_response_id" => "resp-1"}
    assert next_agent.state.pending_confirmation == nil
    assert length(next_agent.state.last_tool_calls) == 1
  end

  test "cmd/2 asks confirmation when the action requires confirmation" do
    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 10,
        conversation_id: "chat-1",
        user_id: 30
      })

    {next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.user_message_action(%{
          message_text: "criar cobrança",
          tool_name: "charge.create",
          arguments: %{"amount" => 1200},
          require_confirmation: true
        })
      )

    assert [%AskForConfirmation{} = directive] = directives
    assert directive.pending_operation["tool_name"] == "charge.create"
    assert next_agent.state.pending_confirmation["tool_name"] == "charge.create"
    assert next_agent.state.pending_confirmation["arguments"] == %{"amount" => 1200}
  end

  test "cmd/2 enqueues write tool when message already carries explicit confirmation" do
    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 10,
        conversation_id: "chat-1",
        user_id: 30,
        pending_confirmation: %{"tool_name" => "charge.create", "arguments" => %{"amount" => 10}}
      })

    {next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.user_message_action(%{
          message_text: "confirmado",
          tool_name: "charge.create",
          arguments: %{"amount" => 1200, "confirm" => true},
          require_confirmation: true
        })
      )

    assert [%EnqueueToolCall{} = directive] = directives
    assert directive.arguments["confirm"] == true
    assert next_agent.state.pending_confirmation == nil
  end

  test "cmd/2 consumes pending confirmation on explicit user confirmation" do
    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 10,
        conversation_id: "chat-1",
        user_id: 30,
        pending_confirmation: %{
          "tool_name" => "finance.create_payable",
          "arguments" => %{"amount" => 500},
          "execution_meta" => %{"llm_response_id" => "resp-2"}
        }
      })

    {next_agent, directives} =
      ChatAgent.cmd(agent, ChatAgent.user_confirmed_action(%{confirmed: true}))

    assert [%EnqueueToolCall{} = directive] = directives
    assert directive.tool_name == "finance.create_payable"
    assert directive.execution_meta == %{"llm_response_id" => "resp-2"}
    assert next_agent.state.pending_confirmation == nil
  end

  test "cmd/2 updates integration status when tool fails with reauth_required" do
    agent =
      ChatAgent.new_for_conversation(%{
        tenant_id: 10,
        conversation_id: "chat-1",
        user_id: 30
      })

    {next_agent, directives} =
      ChatAgent.cmd(
        agent,
        ChatAgent.tool_result_action(%{
          tool_name: "finance.list_receivables",
          status: "failed",
          error: :reauth_required
        })
      )

    assert [%EmitUserMessage{} = directive] = directives
    assert directive.metadata["error_type"] == "reauth_required"
    assert next_agent.state.integration_status == :reauth_required
  end
end
