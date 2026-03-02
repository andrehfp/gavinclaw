defmodule Cazu.Agents.ConversationAgentServer do
  @moduledoc """
  Stateful per-conversation runtime backed by `Jido.AgentServer`.

  Keeps one live `ChatAgent` process per `{tenant_id, conversation_id}` in the
  `Cazu.Jido` instance and applies actions through Jido signals.
  """

  alias Cazu.Agents.Actions.ToolResultReceived
  alias Cazu.Agents.Actions.UserConfirmed
  alias Cazu.Agents.Actions.UserMessageReceived
  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.ConversationAgentLifecycle
  alias Cazu.Agents.State
  alias Jido.AgentServer
  alias Jido.Signal

  @default_call_timeout 15_000

  @type action :: Jido.Agent.action()

  @spec apply_action(%{
          required(:tenant_id) => integer(),
          required(:conversation_id) => String.t(),
          required(:user_id) => integer(),
          required(:initial_state) => map(),
          required(:action) => action()
        }) :: {:ok, map(), [struct()]} | {:error, term()}
  def apply_action(%{
        tenant_id: tenant_id,
        conversation_id: conversation_id,
        user_id: user_id,
        initial_state: initial_state,
        action: action
      })
      when is_integer(tenant_id) and is_binary(conversation_id) and is_integer(user_id) and
             is_map(initial_state) do
    agent_id = conversation_agent_id(tenant_id, conversation_id)

    with {:ok, signal} <- action_to_signal(action, agent_id),
         {:ok, _pid} <-
           ensure_started(agent_id, tenant_id, conversation_id, user_id, initial_state),
         {:ok, pid} <- lookup_pid(agent_id),
         {:ok, agent} <- AgentServer.call(pid, signal, @default_call_timeout) do
      _ = ConversationAgentLifecycle.touch(agent_id)

      directives = List.wrap(Map.get(agent.state, :runtime_last_directives, []))
      next_state = Map.delete(agent.state, :runtime_last_directives)

      {:ok, next_state, directives}
    end
  end

  @spec lookup(integer(), String.t()) :: {:ok, pid()} | :error
  def lookup(tenant_id, conversation_id)
      when is_integer(tenant_id) and is_binary(conversation_id) do
    conversation_agent_id(tenant_id, conversation_id)
    |> lookup_pid()
    |> case do
      {:ok, pid} -> {:ok, pid}
      {:error, :not_found} -> :error
      {:error, _reason} -> :error
    end
  end

  @spec stop(integer(), String.t()) :: :ok
  def stop(tenant_id, conversation_id)
      when is_integer(tenant_id) and is_binary(conversation_id) do
    agent_id = conversation_agent_id(tenant_id, conversation_id)

    _ = ConversationAgentLifecycle.forget(agent_id)

    case Cazu.Jido.stop_agent(agent_id) do
      :ok -> :ok
      {:error, :not_found} -> :ok
    end
  end

  defp action_to_signal({UserMessageReceived, attrs}, agent_id) when is_map(attrs) do
    {:ok, Signal.new!("cazu.user_message_received", attrs, source: signal_source(agent_id))}
  end

  defp action_to_signal({ToolResultReceived, attrs}, agent_id) when is_map(attrs) do
    {:ok, Signal.new!("cazu.tool_result_received", attrs, source: signal_source(agent_id))}
  end

  defp action_to_signal({UserConfirmed, attrs}, agent_id) when is_map(attrs) do
    {:ok, Signal.new!("cazu.user_confirmed", attrs, source: signal_source(agent_id))}
  end

  defp action_to_signal(_action, _agent_id), do: {:error, :unsupported_action}

  defp ensure_started(agent_id, tenant_id, conversation_id, user_id, initial_state) do
    normalized_state =
      initial_state
      |> Map.merge(%{
        tenant_id: tenant_id,
        conversation_id: conversation_id,
        user_id: user_id
      })
      |> State.new()

    case Cazu.Jido.start_agent(ChatAgent, id: agent_id, initial_state: normalized_state) do
      {:ok, pid} -> {:ok, pid}
      {:error, {:already_started, pid}} -> {:ok, pid}
      {:error, {:already_registered, pid}} -> {:ok, pid}
      {:error, :already_present} -> lookup_pid(agent_id)
      {:error, reason} -> {:error, reason}
    end
  end

  defp lookup_pid(agent_id) when is_binary(agent_id) do
    case Cazu.Jido.whereis(agent_id) do
      pid when is_pid(pid) -> {:ok, pid}
      nil -> {:error, :not_found}
    end
  end

  defp conversation_agent_id(tenant_id, conversation_id),
    do: "conversation:#{tenant_id}:#{conversation_id}"

  defp signal_source(agent_id), do: "/cazu/conversation/#{agent_id}"
end
