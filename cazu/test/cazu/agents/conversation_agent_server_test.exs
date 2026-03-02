defmodule Cazu.Agents.ConversationAgentServerTest do
  use ExUnit.Case, async: true

  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.ConversationAgentServer
  alias Cazu.Agents.Directives.AskForConfirmation
  alias Cazu.Agents.Directives.EnqueueToolCall

  setup do
    tenant_id = System.unique_integer([:positive])
    conversation_id = "chat-#{System.unique_integer([:positive])}"

    on_exit(fn ->
      _ = ConversationAgentServer.stop(tenant_id, conversation_id)
    end)

    %{tenant_id: tenant_id, conversation_id: conversation_id}
  end

  test "keeps state across actions for the same conversation", %{
    tenant_id: tenant_id,
    conversation_id: conversation_id
  } do
    initial_state = %{
      tenant_id: tenant_id,
      conversation_id: conversation_id,
      user_id: 10,
      integration_status: :unknown,
      pending_confirmation: nil,
      last_tool_calls: []
    }

    assert {:ok, first_state, [%AskForConfirmation{} = confirmation]} =
             ConversationAgentServer.apply_action(%{
               tenant_id: tenant_id,
               conversation_id: conversation_id,
               user_id: 10,
               initial_state: initial_state,
               action:
                 ChatAgent.user_message_action(%{
                   message_text: "criar cobrança",
                   tool_name: "charge.create",
                   arguments: %{"amount" => 1200},
                   execution_meta: %{},
                   require_confirmation: true
                 })
             })

    assert confirmation.pending_operation["tool_name"] == "charge.create"
    assert first_state.pending_confirmation["tool_name"] == "charge.create"

    # Pass an empty initial_state here on purpose. The server must keep the
    # in-memory pending_confirmation from the previous action.
    assert {:ok, second_state, [%EnqueueToolCall{} = enqueue]} =
             ConversationAgentServer.apply_action(%{
               tenant_id: tenant_id,
               conversation_id: conversation_id,
               user_id: 10,
               initial_state: %{},
               action: ChatAgent.user_confirmed_action(%{confirmed: true})
             })

    assert enqueue.tool_name == "charge.create"
    assert enqueue.arguments == %{"amount" => 1200}
    assert second_state.pending_confirmation == nil
  end
end
