defmodule Cazu.Agents.Actions.ToolResultReceived do
  @moduledoc """
  Jido action that processes a tool execution result and decides follow-up directives.
  """

  use Jido.Action,
    name: "tool_result_received",
    description: "Handle tool result and emit follow-up directives",
    schema: [
      tool_name: [type: :string, required: true],
      status: [type: :string, required: true],
      arguments: [type: :any, default: %{}],
      result: [type: :any, default: %{}],
      error: [type: :any],
      llm_context: [type: :any, default: %{}],
      user_request: [type: :string, default: ""]
    ]

  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.LLM.Provider

  @impl true
  def run(params, _context) do
    tool_name = Map.get(params, :tool_name)
    arguments = normalize_map(Map.get(params, :arguments, %{}))
    llm_context = normalize_map(Map.get(params, :llm_context, %{}))
    user_request = Map.get(params, :user_request, "")

    case Map.get(params, :status) do
      "succeeded" ->
        handle_succeeded_tool(tool_name, Map.get(params, :result), llm_context, user_request)

      "failed" ->
        handle_failed_tool(tool_name, arguments, Map.get(params, :error), llm_context)

      status ->
        {:ok, %{},
         [
           %EmitUserMessage{
             message: "Recebi um status inesperado da ferramenta: #{status}.",
             metadata: %{"action" => "tool_result_unexpected_status", "tool_name" => tool_name}
           }
         ]}
    end
  end

  defp handle_succeeded_tool(tool_name, result, llm_context, user_request) do
    with {:ok, outcome} <-
           synthesize_success_outcome(user_request, tool_name, result, llm_context),
         {:ok, directives} <- directives_from_outcome(outcome, tool_name, "tool_result") do
      {:ok, %{}, directives}
    else
      _ ->
        {:ok, %{},
         [
           %EmitUserMessage{
             message: fallback_tool_result_message(user_request, tool_name, result),
             metadata: %{"action" => "tool_result", "tool_name" => tool_name}
           }
         ]}
    end
  end

  defp handle_failed_tool(tool_name, arguments, error, llm_context) do
    with {:ok, outcome} <- synthesize_failure_outcome(tool_name, arguments, error, llm_context),
         {:ok, directives} <-
           directives_from_outcome(outcome, tool_name, "tool_failure_recovery") do
      {:ok, %{}, directives}
    else
      {:error, continuation_reason} ->
        llm_continuation_unavailable_directives(tool_name, error, continuation_reason)

      other ->
        llm_continuation_unavailable_directives(tool_name, error, other)
    end
  end

  defp llm_continuation_unavailable_directives(tool_name, error, continuation_reason) do
    cond do
      reauth_required?(error) ->
        {:ok, %{integration_status: :reauth_required},
         [
           %EmitUserMessage{
             message: "Sua integração precisa ser reautenticada para continuar.",
             metadata: %{
               "action" => "tool_failure_recovery",
               "tool_name" => tool_name,
               "error_type" => "reauth_required",
               "llm_follow_up_error" => inspect(continuation_reason)
             }
           }
         ]}

      true ->
        tool_error_message = extract_error_message(error)

        message =
          if is_binary(tool_error_message) and tool_error_message != "" do
            "Não consegui finalizar a resposta da LLM após #{tool_name}. Erro da ferramenta: #{tool_error_message}. Quer que eu tente novamente?"
          else
            "Não consegui finalizar a resposta da LLM após #{tool_name}. Quer que eu tente novamente?"
          end

        {:ok, %{},
         [
           %EmitUserMessage{
             message: message,
             metadata: %{
               "action" => "llm_follow_up_unavailable",
               "tool_name" => tool_name,
               "error_type" => "llm_follow_up_unavailable",
               "llm_follow_up_error" => inspect(continuation_reason),
               "tool_error_message" => tool_error_message,
               "tool_error_raw" => inspect(error)
             }
           }
         ]}
    end
  end

  defp directives_from_outcome(
         {:message, message, next_previous_response_id},
         tool_name,
         action
       )
       when is_binary(message) and message != "" do
    {:ok,
     [
       %EmitUserMessage{
         message: message,
         metadata: %{
           "action" => action,
           "tool_name" => tool_name,
           "next_previous_response_id" => next_previous_response_id
         }
       }
     ]}
  end

  defp directives_from_outcome(
         {:follow_up_tool, next_tool_name, next_arguments, next_response_id,
          next_llm_tool_call_id},
         _tool_name,
         _action
       )
       when is_binary(next_tool_name) and next_tool_name != "" and is_map(next_arguments) and
              is_binary(next_response_id) and next_response_id != "" and
              is_binary(next_llm_tool_call_id) and next_llm_tool_call_id != "" do
    {:ok,
     [
       %EnqueueToolCall{
         tool_name: next_tool_name,
         arguments: normalize_map(next_arguments),
         execution_meta: %{
           "llm_response_id" => next_response_id,
           "llm_tool_call_id" => next_llm_tool_call_id
         }
       }
     ]}
  end

  defp directives_from_outcome(_outcome, _tool_name, _action), do: {:error, :invalid_outcome}

  defp synthesize_success_outcome(user_request, tool_name, result, llm_context) do
    with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context),
         {:ok, follow_up} <-
           Provider.continue_with_tool_output_stream(
             llm_response_id,
             llm_tool_call_id,
             result,
             fn _delta -> :ok end
           ),
         {:ok, outcome} <- parse_follow_up_result(follow_up) do
      {:ok, outcome}
    else
      _ ->
        with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context),
             {:ok, follow_up} <-
               Provider.continue_with_tool_output(
                 llm_response_id,
                 llm_tool_call_id,
                 result
               ),
             {:ok, outcome} <- parse_follow_up_result(follow_up) do
          {:ok, outcome}
        else
          _ ->
            {:ok, {:message, fallback_tool_result_message(user_request, tool_name, result), nil}}
        end
    end
  end

  defp synthesize_failure_outcome(tool_name, arguments, reason, llm_context) do
    with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context) do
      tool_output = failure_tool_output(tool_name, arguments, reason)

      case continue_failure_without_stream(llm_response_id, llm_tool_call_id, tool_output) do
        {:ok, outcome} ->
          {:ok, outcome}

        {:error, non_stream_reason} ->
          case continue_failure_with_stream(llm_response_id, llm_tool_call_id, tool_output) do
            {:ok, outcome} ->
              {:ok, outcome}

            {:error, stream_reason} ->
              {:error,
               {:llm_failure_recovery_unavailable,
                %{non_stream: non_stream_reason, stream: stream_reason}}}
          end
      end
    end
  end

  defp continue_failure_with_stream(llm_response_id, llm_tool_call_id, tool_output) do
    with {:ok, follow_up} <-
           Provider.continue_with_tool_output_stream(
             llm_response_id,
             llm_tool_call_id,
             tool_output,
             fn _delta -> :ok end
           ),
         {:ok, outcome} <- parse_follow_up_result(follow_up) do
      {:ok, outcome}
    end
  end

  defp continue_failure_without_stream(llm_response_id, llm_tool_call_id, tool_output) do
    with {:ok, follow_up} <-
           Provider.continue_with_tool_output(
             llm_response_id,
             llm_tool_call_id,
             tool_output
           ),
         {:ok, outcome} <- parse_follow_up_result(follow_up) do
      {:ok, outcome}
    end
  end

  defp parse_follow_up_result(%{
         type: :message,
         message: message,
         response_id: response_id
       })
       when is_binary(message) and message != "" and is_binary(response_id) and response_id != "" do
    {:ok, {:message, message, response_id}}
  end

  defp parse_follow_up_result(%{
         type: :tool,
         tool_name: tool_name,
         arguments: arguments,
         response_id: response_id,
         llm_tool_call_id: llm_tool_call_id
       })
       when is_binary(tool_name) and tool_name != "" and is_map(arguments) and
              is_binary(response_id) and response_id != "" and is_binary(llm_tool_call_id) and
              llm_tool_call_id != "" do
    {:ok, {:follow_up_tool, tool_name, arguments, response_id, llm_tool_call_id}}
  end

  defp parse_follow_up_result(_result), do: {:error, :invalid_follow_up_result}

  defp llm_context_ids(%{
         "llm_response_id" => llm_response_id,
         "llm_tool_call_id" => llm_tool_call_id
       })
       when is_binary(llm_response_id) and llm_response_id != "" and
              is_binary(llm_tool_call_id) and llm_tool_call_id != "" do
    {:ok, llm_response_id, llm_tool_call_id}
  end

  defp llm_context_ids(_llm_context), do: {:error, :missing_llm_context}

  defp failure_tool_output(tool_name, arguments, reason) do
    %{
      "status" => "failed",
      "tool_name" => tool_name,
      "arguments" => arguments || %{},
      "error" => failure_error_payload(reason)
    }
  end

  defp failure_error_payload(reason) do
    %{
      "message" => extract_error_message(reason) || inspect(reason),
      "raw" => inspect(reason)
    }
  end

  defp fallback_tool_result_message(user_request, tool_name, result) do
    case Provider.summarize_tool_result(user_request, tool_name, result) do
      {:ok, synthesized} -> synthesized
      {:error, _reason} -> format_tool_result_message(tool_name, result)
    end
  end

  defp format_payload(payload) do
    payload
    |> Jason.encode!(pretty: true)
    |> truncate(3000)
  end

  defp format_tool_result_message("crm.list_people", result) when is_map(result) do
    items = Map.get(result, "items") || Map.get(result, :items) || []
    total = Map.get(result, "totalItems") || Map.get(result, :totalItems) || length(items)

    names =
      items
      |> Enum.map(fn item ->
        cond do
          is_map(item) ->
            Map.get(item, "nome") ||
              Map.get(item, :nome) ||
              Map.get(item, "name") ||
              Map.get(item, :name)

          true ->
            nil
        end
      end)
      |> Enum.filter(&is_binary/1)
      |> Enum.take(20)

    names_block =
      case names do
        [] -> "- (no names returned)"
        _ -> Enum.map_join(names, "\n", &"- #{&1}")
      end

    """
    crm.list_people completed successfully.
    Found #{total} people.
    #{names_block}
    """
  end

  defp format_tool_result_message(tool_name, result) do
    """
    #{tool_name} completed successfully.
    Result:
    #{format_payload(result)}
    """
  end

  defp reauth_required?(error) when error in [:reauth_required, "reauth_required"], do: true
  defp reauth_required?(%{"type" => "reauth_required"}), do: true
  defp reauth_required?(%{type: :reauth_required}), do: true
  defp reauth_required?(_error), do: false

  defp extract_error_message(%{body: %{"message" => message}}) when is_binary(message),
    do: message

  defp extract_error_message(%{body: %{"error" => message}}) when is_binary(message),
    do: message

  defp extract_error_message(%{"body" => %{"message" => message}}) when is_binary(message),
    do: message

  defp extract_error_message(%{"body" => %{"error" => message}}) when is_binary(message),
    do: message

  defp extract_error_message(%{"message" => message}) when is_binary(message), do: message
  defp extract_error_message(%{"error" => message}) when is_binary(message), do: message
  defp extract_error_message(%{message: message}) when is_binary(message), do: message
  defp extract_error_message(%{error: message}) when is_binary(message), do: message
  defp extract_error_message(%{reason: reason}) when is_binary(reason), do: reason
  defp extract_error_message(%{"reason" => reason}) when is_binary(reason), do: reason
  defp extract_error_message(_reason), do: nil

  defp truncate(text, max_chars) when is_binary(text) and is_integer(max_chars) do
    if String.length(text) <= max_chars do
      text
    else
      String.slice(text, 0, max_chars) <> "\n...[truncated]"
    end
  end

  defp normalize_map(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_map(_map), do: %{}
end
