defmodule Cazu.Agents.ConversationAgentLifecycleTest do
  use ExUnit.Case, async: false

  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.ConversationAgentLifecycle

  @table Cazu.Agents.ConversationAgentLifecycle.Table

  test "prune_now/0 stops stale conversation agents" do
    tenant_id = System.unique_integer([:positive])
    conversation_id = "lifecycle-#{System.unique_integer([:positive])}"
    agent_id = "conversation:#{tenant_id}:#{conversation_id}"

    on_exit(fn ->
      _ = Cazu.Jido.stop_agent(agent_id)
      _ = :ets.delete(@table, agent_id)
    end)

    initial_state = %{
      tenant_id: tenant_id,
      conversation_id: conversation_id,
      user_id: 123,
      integration_status: :unknown,
      pending_confirmation: nil,
      last_tool_calls: []
    }

    assert {:ok, pid} =
             Cazu.Jido.start_agent(ChatAgent, id: agent_id, initial_state: initial_state)

    assert is_pid(pid)
    ref = Process.monitor(pid)

    stale_ts = System.monotonic_time(:millisecond) - 10 * 60 * 1000
    true = :ets.insert(@table, {agent_id, stale_ts})

    assert :ok = ConversationAgentLifecycle.prune_now()
    assert_receive {:DOWN, ^ref, :process, ^pid, _reason}
    assert Cazu.Jido.whereis(agent_id) == nil
  end
end
