defmodule Cazu.Workers.ToolExecutionWorker do
  @moduledoc """
  Executes queued tool calls and routes follow-up decisions through the Jido ChatAgent loop.
  """

  use Oban.Worker, queue: :tool_calls, max_attempts: 10

  alias Cazu.AgentChatStream
  alias Cazu.AgentTrace
  alias Cazu.Agents.ChatAgent
  alias Cazu.Agents.ConversationAgentServer
  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.Agents.RuntimeAdapter
  alias Cazu.Audit
  alias Cazu.Conversations
  alias Cazu.Operations
  alias Cazu.Telegram
  alias Cazu.Tenancy
  alias Cazu.Tools

  @max_transient_attempts 3

  @impl Oban.Worker
  def perform(%Oban.Job{
        args: %{"tool_call_id" => tool_call_id, "chat_id" => chat_id} = args,
        attempt: attempt,
        max_attempts: max_attempts
      }) do
    _ =
      AgentTrace.log("tool_execution.started", %{
        tool_call_id: tool_call_id,
        chat_id: chat_id,
        attempt: attempt,
        max_attempts: max_attempts,
        args: args
      })

    llm_context = extract_llm_context(args)

    case Operations.get_tool_call_with_job(tool_call_id) do
      nil ->
        {:cancel, :tool_call_not_found}

      tool_call ->
        job = tool_call.job
        integration = Tenancy.get_active_integration(tool_call.tenant_id)

        with {:ok, _job} <- Operations.mark_job_running(job),
             {:ok, running_call} <- Operations.mark_tool_call_running(tool_call),
             {:ok, _event} <-
               Audit.record_event(job, "tool.started", %{
                 "tool_call_id" => running_call.id,
                 "tool" => running_call.name
               }),
             _ <- AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "tool-running"),
             _ <-
               AgentChatStream.broadcast_tool_call(tool_call.tenant_id, chat_id, %{
                 tool_call_id: running_call.id,
                 job_id: job.id,
                 tool_name: running_call.name,
                 status: running_call.status,
                 arguments: running_call.arguments
               }),
             {:ok, result} <-
               Tools.run(running_call.name, running_call.arguments, %{
                 integration: integration,
                 idempotency_key: running_call.idempotency_key,
                 tenant_id: running_call.tenant_id
               }),
             {:ok, succeeded_call} <- Operations.mark_tool_call_succeeded(running_call, result),
             {:ok, _job_done} <- Operations.mark_job_succeeded(job, result),
             {:ok, _event} <-
               Audit.record_event(job, "tool.succeeded", %{
                 "tool_call_id" => succeeded_call.id,
                 "tool" => succeeded_call.name
               }) do
          _ =
            AgentTrace.log("tool_execution.succeeded", %{
              tenant_id: tool_call.tenant_id,
              chat_id: chat_id,
              job_id: job.id,
              tool_call_id: succeeded_call.id,
              tool_name: succeeded_call.name,
              arguments: succeeded_call.arguments,
              result: result
            })

          _ =
            AgentChatStream.broadcast_tool_call(tool_call.tenant_id, chat_id, %{
              tool_call_id: succeeded_call.id,
              job_id: job.id,
              tool_name: succeeded_call.name,
              status: succeeded_call.status,
              arguments: succeeded_call.arguments,
              result: succeeded_call.result
            })

          _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "tool-succeeded")

          decide_tool_outcome_with_agent(
            succeeded_call,
            job,
            chat_id,
            "succeeded",
            result,
            nil,
            llm_context
          )
        else
          {:error, reason} ->
            _ =
              AgentTrace.log("tool_execution.error", %{
                tenant_id: tool_call.tenant_id,
                chat_id: chat_id,
                job_id: job.id,
                tool_call_id: tool_call.id,
                tool_name: tool_call.name,
                reason: inspect(reason)
              })

            handle_failure(tool_call, job, chat_id, reason, attempt, max_attempts, llm_context)

          other ->
            _ =
              AgentTrace.log("tool_execution.error", %{
                tenant_id: tool_call.tenant_id,
                chat_id: chat_id,
                job_id: job.id,
                tool_call_id: tool_call.id,
                tool_name: tool_call.name,
                reason: inspect(other)
              })

            handle_failure(tool_call, job, chat_id, other, attempt, max_attempts, llm_context)
        end
    end
  end

  defp handle_failure(tool_call, job, chat_id, reason, attempt, max_attempts, llm_context) do
    if should_retry_transient?(reason, attempt, max_attempts) do
      _ =
        Audit.record_event(job, "tool.retrying", %{
          "tool_call_id" => tool_call.id,
          "tool" => tool_call.name,
          "attempt" => attempt,
          "max_attempts" => max_attempts,
          "reason" => inspect(reason)
        })

      _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "tool-retrying")

      {:error, reason}
    else
      updated_call =
        case Operations.mark_tool_call_failed(tool_call, reason) do
          {:ok, call} -> call
          _ -> tool_call
        end

      _ = Operations.mark_job_failed(job, reason)

      _ =
        Audit.record_event(job, "tool.failed", %{
          "tool_call_id" => tool_call.id,
          "tool" => tool_call.name,
          "reason" => inspect(reason)
        })

      _ =
        AgentChatStream.broadcast_tool_call(tool_call.tenant_id, chat_id, %{
          tool_call_id: updated_call.id,
          job_id: job.id,
          tool_name: updated_call.name,
          status: updated_call.status,
          arguments: updated_call.arguments,
          error_reason: updated_call.error_reason
        })

      _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "tool-failed")

      decide_tool_outcome_with_agent(
        updated_call,
        job,
        chat_id,
        "failed",
        nil,
        reason,
        llm_context
      )
    end
  end

  defp decide_tool_outcome_with_agent(
         tool_call,
         job,
         chat_id,
         status,
         result,
         error,
         llm_context
       ) do
    conversation = Conversations.get_conversation(tool_call.tenant_id, chat_id)
    initial_state = build_agent_state(conversation, tool_call, job, chat_id)

    case ConversationAgentServer.apply_action(%{
           tenant_id: tool_call.tenant_id,
           conversation_id: chat_id,
           user_id: job.user_id,
           initial_state: initial_state,
           action:
             ChatAgent.tool_result_action(%{
               tool_name: tool_call.name,
               status: status,
               arguments: tool_call.arguments || %{},
               result: result,
               error: error,
               llm_context: llm_context,
               user_request: latest_user_message(conversation)
             })
         }) do
      {:ok, next_state, directives} ->
        _ =
          AgentTrace.log("tool_execution.agent_decision", %{
            tenant_id: tool_call.tenant_id,
            chat_id: chat_id,
            job_id: job.id,
            tool_call_id: tool_call.id,
            status: status,
            directives: Enum.map(directives, &directive_type/1),
            integration_status: next_state.integration_status
          })

        _ = persist_agent_state(conversation, next_state)

        case RuntimeAdapter.execute(directives, %{
               tenant_id: tool_call.tenant_id,
               user_id: job.user_id,
               chat_id: chat_id,
               channel: job.channel
             }) do
          :ok ->
            _ =
              persist_directive_metadata(
                tool_call.tenant_id,
                chat_id,
                tool_call.name,
                directives,
                status,
                error
              )

            _ = broadcast_final_phase(tool_call.tenant_id, chat_id, directives)
            :ok

          {:error, reason} ->
            _ =
              AgentTrace.log("tool_execution.directive_error", %{
                tenant_id: tool_call.tenant_id,
                chat_id: chat_id,
                tool_call_id: tool_call.id,
                reason: inspect(reason)
              })

            fallback_message = fallback_directive_error_message(tool_call.name, status)

            _ = Telegram.send_message(chat_id, fallback_message)

            _ =
              AgentChatStream.broadcast_assistant_message(tool_call.tenant_id, chat_id, %{
                content: fallback_message,
                action: "tool_result_fallback",
                tool_name: tool_call.name
              })

            _ =
              persist_message(
                tool_call.tenant_id,
                chat_id,
                fallback_message,
                %{
                  "last_action" => "tool_result_fallback",
                  "last_tool_name" => tool_call.name,
                  "last_error_reason" => inspect(reason)
                },
                nil
              )

            _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "idle")
            :ok
        end

      {:error, reason} ->
        _ =
          AgentTrace.log("tool_execution.agent_server_error", %{
            tenant_id: tool_call.tenant_id,
            chat_id: chat_id,
            tool_call_id: tool_call.id,
            reason: inspect(reason)
          })

        fallback_message = fallback_directive_error_message(tool_call.name, status)

        _ = Telegram.send_message(chat_id, fallback_message)

        _ =
          AgentChatStream.broadcast_assistant_message(tool_call.tenant_id, chat_id, %{
            content: fallback_message,
            action: "tool_result_fallback",
            tool_name: tool_call.name
          })

        _ =
          persist_message(
            tool_call.tenant_id,
            chat_id,
            fallback_message,
            %{
              "last_action" => "tool_result_fallback",
              "last_tool_name" => tool_call.name,
              "last_error_reason" => inspect(reason)
            },
            nil
          )

        _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "idle")
        :ok
    end
  end

  defp directive_type(%EmitUserMessage{}), do: "emit_user_message"
  defp directive_type(%EnqueueToolCall{}), do: "enqueue_tool_call"
  defp directive_type(_directive), do: "unknown"

  defp build_agent_state(conversation, tool_call, job, chat_id) do
    metadata =
      case conversation do
        nil -> %{}
        _ -> normalize_metadata(conversation.metadata)
      end

    %{
      tenant_id: tool_call.tenant_id,
      conversation_id: chat_id,
      user_id: job.user_id,
      integration_status: Map.get(metadata, "integration_status", "unknown"),
      pending_confirmation: Map.get(metadata, "pending_confirmation"),
      last_tool_calls: Map.get(metadata, "agent_last_tool_calls", []),
      policy_flags: Map.get(metadata, "policy_flags", %{}),
      memory_window_ref: Map.get(metadata, "memory_window_ref")
    }
  end

  defp persist_agent_state(nil, _state), do: :ok

  defp persist_agent_state(conversation, state) when is_map(state) do
    metadata =
      conversation.metadata
      |> normalize_metadata()
      |> Map.merge(%{
        "pending_confirmation" => state.pending_confirmation,
        "agent_last_tool_calls" => state.last_tool_calls,
        "integration_status" => to_string(state.integration_status)
      })

    Conversations.touch_last_message(conversation, %{"metadata" => metadata})
  end

  defp persist_directive_metadata(
         tenant_id,
         chat_id,
         current_tool_name,
         directives,
         status,
         error
       ) do
    Enum.each(directives, fn directive ->
      persist_single_directive_metadata(
        tenant_id,
        chat_id,
        current_tool_name,
        directive,
        status,
        error
      )
    end)

    :ok
  end

  defp persist_single_directive_metadata(
         tenant_id,
         chat_id,
         _current_tool_name,
         %EnqueueToolCall{tool_name: next_tool_name},
         _status,
         _error
       ) do
    case Conversations.get_conversation(tenant_id, chat_id) do
      nil ->
        :ok

      conversation ->
        metadata =
          conversation.metadata
          |> normalize_metadata()
          |> Map.merge(%{
            "last_action" => "tool_follow_up_selected",
            "last_tool_name" => next_tool_name
          })

        _ = Conversations.touch_last_message(conversation, %{"metadata" => metadata})
        :ok
    end
  end

  defp persist_single_directive_metadata(
         tenant_id,
         chat_id,
         current_tool_name,
         %EmitUserMessage{message: message, metadata: metadata},
         status,
         error
       ) do
    normalized_directive_metadata = normalize_metadata(metadata)

    action =
      Map.get(normalized_directive_metadata, "action") ||
        if(status == "failed", do: "tool_failure_recovery", else: "tool_result")

    tool_name = Map.get(normalized_directive_metadata, "tool_name", current_tool_name)

    next_previous_response_id =
      Map.get(normalized_directive_metadata, "next_previous_response_id")

    attrs =
      %{
        "last_action" => action,
        "last_tool_name" => tool_name,
        "last_assistant_message" => message
      }
      |> maybe_put_error_reason(status, error)
      |> maybe_put_follow_up_failure_details(normalized_directive_metadata)

    _ = persist_message(tenant_id, chat_id, message, attrs, next_previous_response_id)
    :ok
  end

  defp persist_single_directive_metadata(
         _tenant_id,
         _chat_id,
         _current_tool_name,
         _directive,
         _status,
         _error
       ) do
    :ok
  end

  defp persist_message(tenant_id, chat_id, message, attrs, next_previous_response_id) do
    case Conversations.get_conversation(tenant_id, chat_id) do
      nil ->
        :ok

      conversation ->
        metadata =
          conversation.metadata
          |> normalize_metadata()
          |> append_assistant_message(message, attrs)
          |> Map.merge(Map.put(attrs, "last_assistant_message", message))

        updates =
          %{"metadata" => metadata}
          |> maybe_put_previous_response_id(next_previous_response_id)

        Conversations.touch_last_message(conversation, updates)
    end
  end

  defp maybe_put_error_reason(attrs, "failed", error),
    do: Map.put(attrs, "last_error_reason", inspect(error))

  defp maybe_put_error_reason(attrs, _status, _error), do: attrs

  defp maybe_put_follow_up_failure_details(attrs, metadata) when is_map(metadata) do
    attrs
    |> maybe_put_attr("last_llm_follow_up_error", Map.get(metadata, "llm_follow_up_error"))
    |> maybe_put_attr("last_tool_error_message", Map.get(metadata, "tool_error_message"))
  end

  defp maybe_put_follow_up_failure_details(attrs, _metadata), do: attrs

  defp maybe_put_attr(attrs, _key, value) when not is_binary(value) or value == "", do: attrs
  defp maybe_put_attr(attrs, key, value), do: Map.put(attrs, key, value)

  defp maybe_put_previous_response_id(updates, value) when is_binary(value) and value != "" do
    Map.put(updates, "previous_response_id", value)
  end

  defp maybe_put_previous_response_id(updates, _value), do: updates

  defp append_assistant_message(metadata, message, attrs) do
    messages = normalize_messages(metadata["messages"])

    appended =
      messages ++
        [
          %{
            "role" => "assistant",
            "content" => message,
            "action" => attrs["last_action"],
            "tool_name" => attrs["last_tool_name"],
            "at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
          }
        ]

    Map.put(metadata, "messages", Enum.take(appended, -40))
  end

  defp latest_user_message(nil), do: ""

  defp latest_user_message(conversation) do
    conversation.metadata
    |> normalize_metadata()
    |> Map.get("messages", [])
    |> normalize_messages()
    |> Enum.reverse()
    |> Enum.find_value("", fn message ->
      if message["role"] == "user" and is_binary(message["content"]) do
        String.trim(message["content"])
      else
        nil
      end
    end)
  end

  defp normalize_messages(messages) when is_list(messages), do: Enum.filter(messages, &is_map/1)
  defp normalize_messages(_messages), do: []

  defp normalize_metadata(metadata) when is_map(metadata),
    do: Map.new(metadata, fn {key, value} -> {to_string(key), value} end)

  defp normalize_metadata(_metadata), do: %{}

  defp broadcast_final_phase(tenant_id, chat_id, directives) do
    case Enum.find(directives, &match?(%EnqueueToolCall{}, &1)) do
      %EnqueueToolCall{tool_name: tool_name} ->
        AgentChatStream.broadcast_phase(tenant_id, chat_id, "action-selected", %{
          tool_name: tool_name
        })

      _ ->
        AgentChatStream.broadcast_phase(tenant_id, chat_id, "idle")
    end
  end

  defp fallback_directive_error_message(tool_name, "failed") do
    "Não consegui concluir #{tool_name} agora. Pode tentar novamente em instantes?"
  end

  defp fallback_directive_error_message(tool_name, _status) do
    "Concluí #{tool_name}, mas não consegui continuar o fluxo automaticamente."
  end

  defp should_retry_transient?(reason, attempt, max_attempts) do
    transient_error?(reason) and attempt < retry_limit(max_attempts)
  end

  defp retry_limit(max_attempts) when is_integer(max_attempts),
    do: min(max_attempts, @max_transient_attempts)

  defp retry_limit(_max_attempts), do: @max_transient_attempts

  defp transient_error?(reason) do
    timeout_reason?(reason) or
      reason
      |> inspect()
      |> String.downcase()
      |> then(fn text ->
        Enum.any?(
          ["connection refused", "econnrefused", "econnreset", "temporarily unavailable"],
          &String.contains?(text, &1)
        )
      end)
  end

  defp timeout_reason?(reason) do
    reason
    |> extract_error_message()
    |> case do
      nil ->
        reason
        |> inspect()
        |> String.downcase()
        |> String.contains?("timeout")

      message ->
        message
        |> String.downcase()
        |> String.contains?("timeout")
    end
  end

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

  defp extract_llm_context(args) when is_map(args) do
    %{}
    |> maybe_put_llm("llm_response_id", Map.get(args, "llm_response_id"))
    |> maybe_put_llm("llm_tool_call_id", Map.get(args, "llm_tool_call_id"))
  end

  defp extract_llm_context(_args), do: %{}

  defp maybe_put_llm(map, _key, value) when not is_binary(value) or value == "", do: map
  defp maybe_put_llm(map, key, value), do: Map.put(map, key, value)
end
