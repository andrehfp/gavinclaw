defmodule Cazu.Agents.Actions.UserConfirmed do
  @moduledoc """
  Jido action that handles explicit user confirmation.
  """

  use Jido.Action,
    name: "user_confirmed",
    description: "Consume pending confirmation and decide next directives",
    schema: [
      confirmed: [type: :boolean, default: true]
    ]

  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.Agents.State

  @impl true
  def run(params, context) do
    state = State.new(Map.get(context, :state, %{}))
    pending = state.pending_confirmation

    cond do
      is_nil(pending) ->
        {:ok, %{}, [%EmitUserMessage{message: "Não há operação pendente para confirmar."}]}

      Map.get(params, :confirmed, true) == false ->
        {:ok, %{pending_confirmation: nil}, [%EmitUserMessage{message: "Operação cancelada."}]}

      true ->
        tool_name = Map.get(pending, "tool_name")
        arguments = Map.get(pending, "arguments", %{})
        execution_meta = Map.get(pending, "execution_meta", %{})

        next_state =
          state
          |> State.clear_pending_confirmation()
          |> State.append_tool_call(%{
            "tool_name" => tool_name,
            "at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601(),
            "confirmed" => true
          })
          |> Map.take([:pending_confirmation, :last_tool_calls])

        {:ok, next_state,
         [
           %EnqueueToolCall{
             tool_name: tool_name,
             arguments: arguments,
             execution_meta: execution_meta
           }
         ]}
    end
  end
end
