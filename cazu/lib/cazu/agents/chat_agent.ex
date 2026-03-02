defmodule Cazu.Agents.ChatAgent do
  @moduledoc """
  Jido-based chat decision agent.
  """

  use Jido.Agent,
    name: "chat_agent",
    description: "Core chat decision brain for Cazu",
    jido: Cazu.Jido,
    signal_routes: [
      {"cazu.user_message_received", Cazu.Agents.Actions.UserMessageReceived},
      {"cazu.tool_result_received", Cazu.Agents.Actions.ToolResultReceived},
      {"cazu.user_confirmed", Cazu.Agents.Actions.UserConfirmed}
    ],
    schema: [
      tenant_id: [type: :integer],
      conversation_id: [type: :string],
      user_id: [type: :integer],
      integration_status: [type: :atom, default: :unknown],
      pending_confirmation: [type: :any, default: nil],
      last_tool_calls: [type: :list, default: []],
      policy_flags: [type: :map, default: %{}],
      memory_window_ref: [type: :any, default: nil],
      runtime_last_directives: [type: :list, default: []]
    ]

  alias Cazu.Agents.Actions.ToolResultReceived
  alias Cazu.Agents.Actions.UserConfirmed
  alias Cazu.Agents.Actions.UserMessageReceived
  alias Cazu.Agents.State

  @spec new_for_conversation(map()) :: Jido.Agent.t()
  def new_for_conversation(attrs) when is_map(attrs) do
    new(state: State.new(attrs))
  end

  @spec cmd_from_state(map(), Jido.Agent.action()) :: {map(), [struct()]}
  def cmd_from_state(state, action) when is_map(state) do
    {next_agent, directives} =
      state
      |> State.new()
      |> then(&new(state: &1))
      |> cmd(action)

    {next_agent.state, directives}
  end

  @impl true
  def on_before_cmd(agent, action) do
    next_state = Map.put(agent.state, :runtime_last_directives, [])
    {:ok, %{agent | state: next_state}, action}
  end

  @impl true
  def on_after_cmd(agent, _action, directives) do
    next_state = Map.put(agent.state, :runtime_last_directives, List.wrap(directives))
    {:ok, %{agent | state: next_state}, directives}
  end

  @spec user_message_action(map()) :: {module(), map()}
  def user_message_action(attrs) when is_map(attrs), do: {UserMessageReceived, attrs}

  @spec tool_result_action(map()) :: {module(), map()}
  def tool_result_action(attrs) when is_map(attrs), do: {ToolResultReceived, attrs}

  @spec user_confirmed_action(map()) :: {module(), map()}
  def user_confirmed_action(attrs) when is_map(attrs), do: {UserConfirmed, attrs}
end
