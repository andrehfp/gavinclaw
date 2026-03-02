defmodule Cazu.Agents.Actions.UserMessageReceived do
  @moduledoc """
  Jido action that processes an incoming user message and decides directives.
  """

  use Jido.Action,
    name: "user_message_received",
    description: "Process user message and decide the next runtime directives",
    schema: [
      message_text: [type: :string, required: true],
      tool_name: [type: :string],
      arguments: [type: :any, default: %{}],
      execution_meta: [type: :any, default: %{}],
      require_confirmation: [type: :boolean, default: false],
      confirmation_message: [type: :string]
    ]

  alias Cazu.Agents.Directives.AskForConfirmation
  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.Agents.State

  @impl true
  def run(params, context) do
    state = State.new(Map.get(context, :state, %{}))

    tool_name = normalize_tool_name(Map.get(params, :tool_name))
    arguments = normalize_map(Map.get(params, :arguments, %{}))
    execution_meta = normalize_map(Map.get(params, :execution_meta, %{}))
    require_confirmation = Map.get(params, :require_confirmation, false)
    custom_confirmation_message = Map.get(params, :confirmation_message)

    cond do
      is_nil(tool_name) ->
        {:ok, %{},
         [
           %EmitUserMessage{
             message:
               "Não consegui mapear sua mensagem para uma ferramenta com segurança. Pode reformular com mais detalhes?"
           }
         ]}

      require_confirmation and not confirmed?(arguments) ->
        pending_operation = %{
          "tool_name" => tool_name,
          "arguments" => arguments,
          "execution_meta" => execution_meta
        }

        next_state = %{pending_confirmation: pending_operation}

        {:ok, next_state,
         [
           %AskForConfirmation{
             message: confirmation_message(custom_confirmation_message, tool_name),
             pending_operation: pending_operation
           }
         ]}

      true ->
        next_state =
          state
          |> State.clear_pending_confirmation()
          |> State.append_tool_call(%{
            "tool_name" => tool_name,
            "at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
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

  defp normalize_tool_name(nil), do: nil

  defp normalize_tool_name(tool_name) when is_binary(tool_name) do
    case String.trim(tool_name) do
      "" -> nil
      normalized -> normalized
    end
  end

  defp normalize_tool_name(_tool_name), do: nil

  defp normalize_map(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_map(_map), do: %{}

  defp confirmed?(arguments) do
    Map.get(arguments, "confirm") in [true, "true"]
  end

  defp confirmation_message(value, _tool_name) when is_binary(value) and value != "", do: value

  defp confirmation_message(_value, tool_name) do
    "Essa ação (#{tool_name}) altera dados. Responda com confirmação para continuar."
  end
end
