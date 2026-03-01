defmodule Cazu.Workers.ToolExecutionWorker do
  @moduledoc """
  Executes queued tool calls with audit and status updates.
  """

  use Oban.Worker, queue: :tool_calls, max_attempts: 10

  alias Cazu.Audit
  alias Cazu.AgentTrace
  alias Cazu.AgentChatStream
  alias Cazu.Conversations
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.Operations
  alias Cazu.Orchestrator
  alias Cazu.Policies
  alias Cazu.Telegram
  alias Cazu.Tenancy
  alias Cazu.Tenancy.User
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
             _ <-
               AgentChatStream.broadcast_phase(
                 tool_call.tenant_id,
                 chat_id,
                 "tool-running"
               ),
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

          result_flow =
            persist_result_message(
              tool_call.tenant_id,
              job.user_id,
              chat_id,
              succeeded_call.name,
              result,
              llm_context
            )

          if result_flow == :delivered do
            _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "idle")
          end

          :ok
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

      case attempt_failure_recovery(updated_call, job, chat_id, reason, llm_context) do
        :recovered ->
          :ok

        :not_recovered ->
          {user_message, user_action} = friendly_failure_feedback(tool_call.name, reason)

          _ = Telegram.send_message(chat_id, user_message)

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

          _ =
            persist_failure_message(
              tool_call.tenant_id,
              chat_id,
              updated_call.name,
              reason,
              user_message,
              user_action
            )

          _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "idle")

          :ok
      end
    end
  end

  defp attempt_failure_recovery(tool_call, job, chat_id, reason, llm_context) do
    with {:ok, outcome} <- synthesize_failure_outcome(tool_call, reason, llm_context) do
      handle_failure_recovery_outcome(
        outcome,
        tool_call,
        job.user_id,
        chat_id,
        reason
      )
    else
      _ -> :not_recovered
    end
  end

  defp persist_result_message(tenant_id, user_id, chat_id, tool_name, result, llm_context) do
    user_request = latest_user_message(tenant_id, chat_id)

    case synthesize_success_outcome(
           user_request,
           tool_name,
           result,
           llm_context,
           tenant_id,
           chat_id
         ) do
      {:message, message, next_previous_response_id} ->
        _ =
          AgentTrace.log("tool_execution.follow_up", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            type: "message",
            tool_name: tool_name,
            message: message,
            next_previous_response_id: next_previous_response_id
          })

        _ = Telegram.send_message(chat_id, message)

        _ =
          AgentChatStream.broadcast_assistant_message(tenant_id, chat_id, %{
            content: message,
            action: "tool_result",
            tool_name: tool_name
          })

        _ =
          persist_conversation_metadata(
            tenant_id,
            chat_id,
            message,
            %{
              "last_action" => "tool_result",
              "last_tool_name" => tool_name
            },
            next_previous_response_id
          )

        :delivered

      {:follow_up_tool, next_tool_name, next_arguments, next_response_id, next_llm_tool_call_id} ->
        _ =
          AgentTrace.log("tool_execution.follow_up", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            type: "tool",
            tool_name: next_tool_name,
            arguments: next_arguments,
            response_id: next_response_id,
            llm_tool_call_id: next_llm_tool_call_id
          })

        case enqueue_follow_up_tool(
               tenant_id,
               user_id,
               chat_id,
               next_tool_name,
               next_arguments,
               next_response_id,
               next_llm_tool_call_id
             ) do
          :ok ->
            _ =
              AgentTrace.log("tool_execution.follow_up_enqueued", %{
                tenant_id: tenant_id,
                chat_id: chat_id,
                tool_name: next_tool_name
              })

            _ =
              persist_follow_up_tool_selected(
                tenant_id,
                chat_id,
                next_tool_name
              )

            _ =
              AgentChatStream.broadcast_phase(tenant_id, chat_id, "action-selected", %{
                tool_name: next_tool_name
              })

            :follow_up_queued

          {:error, reason} ->
            _ =
              AgentTrace.log("tool_execution.follow_up_enqueue_error", %{
                tenant_id: tenant_id,
                chat_id: chat_id,
                tool_name: next_tool_name,
                reason: inspect(reason)
              })

            message = fallback_tool_result_message(user_request, tool_name, result)
            _ = Telegram.send_message(chat_id, message)

            _ =
              AgentChatStream.broadcast_assistant_message(tenant_id, chat_id, %{
                content: message,
                action: "tool_result",
                tool_name: tool_name
              })

            _ =
              persist_conversation_metadata(
                tenant_id,
                chat_id,
                message,
                %{
                  "last_action" => "tool_result",
                  "last_tool_name" => tool_name,
                  "last_error_reason" => inspect(reason)
                }
              )

            :delivered
        end
    end
  end

  defp enqueue_follow_up_tool(
         tenant_id,
         user_id,
         chat_id,
         tool_name,
         arguments,
         response_id,
         llm_tool_call_id
       ) do
    with %User{} = user <- Tenancy.get_user(user_id),
         :ok <- Policies.validate_tool_call(user, tool_name, arguments),
         :ok <-
           Orchestrator.enqueue_tool_call(
             tenant_id,
             user_id,
             chat_id,
             tool_name,
             arguments,
             %{
               "llm_response_id" => response_id,
               "llm_tool_call_id" => llm_tool_call_id
             }
           ) do
      :ok
    else
      nil -> {:error, :user_not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  defp persist_failure_message(tenant_id, chat_id, tool_name, reason, message, action) do
    _ =
      AgentChatStream.broadcast_assistant_message(tenant_id, chat_id, %{
        content: message,
        action: action,
        tool_name: tool_name
      })

    persist_conversation_metadata(
      tenant_id,
      chat_id,
      message,
      %{
        "last_action" => action,
        "last_tool_name" => tool_name,
        "last_error_reason" => inspect(reason)
      }
    )
  end

  defp persist_conversation_metadata(
         tenant_id,
         chat_id,
         message,
         attrs,
         next_previous_response_id \\ nil
       ) do
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

  defp normalize_messages(messages) when is_list(messages), do: Enum.filter(messages, &is_map/1)
  defp normalize_messages(_messages), do: []

  defp normalize_metadata(metadata) when is_map(metadata),
    do: Map.new(metadata, fn {key, value} -> {to_string(key), value} end)

  defp normalize_metadata(_metadata), do: %{}

  defp latest_user_message(tenant_id, chat_id) do
    case Conversations.get_conversation(tenant_id, chat_id) do
      nil ->
        ""

      conversation ->
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
  end

  defp synthesize_success_outcome(
         user_request,
         tool_name,
         result,
         llm_context,
         tenant_id,
         chat_id
       ) do
    with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context),
         stream_message_id <- "assistant-stream-#{System.unique_integer([:positive])}",
         _ <-
           AgentChatStream.broadcast_assistant_stream_start(
             tenant_id,
             chat_id,
             %{"id" => stream_message_id}
           ),
         {:ok, follow_up} <-
           OpenAIResponses.continue_with_tool_output_stream(
             llm_response_id,
             llm_tool_call_id,
             result,
             fn delta ->
               AgentChatStream.broadcast_assistant_stream_delta(
                 tenant_id,
                 chat_id,
                 %{"id" => stream_message_id, "delta" => delta}
               )
             end
           ),
         {:ok, outcome} <- parse_follow_up_result(follow_up) do
      outcome
    else
      _ ->
        with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context),
             {:ok, follow_up} <-
               OpenAIResponses.continue_with_tool_output(
                 llm_response_id,
                 llm_tool_call_id,
                 result
               ),
             {:ok, outcome} <- parse_follow_up_result(follow_up) do
          outcome
        else
          _ ->
            {:message, fallback_tool_result_message(user_request, tool_name, result), nil}
        end
    end
  end

  defp synthesize_failure_outcome(tool_call, reason, llm_context) do
    with {:ok, llm_response_id, llm_tool_call_id} <- llm_context_ids(llm_context),
         {:ok, follow_up} <-
           OpenAIResponses.continue_with_tool_output(
             llm_response_id,
             llm_tool_call_id,
             failure_tool_output(tool_call, reason)
           ),
         {:ok, outcome} <- parse_follow_up_result(follow_up) do
      {:ok, outcome}
    else
      _ -> {:error, :failure_recovery_unavailable}
    end
  end

  defp handle_failure_recovery_outcome(
         {:message, message, next_previous_response_id},
         tool_call,
         _user_id,
         chat_id,
         reason
       )
       when is_binary(message) and message != "" do
    _ =
      AgentTrace.log("tool_execution.failure_recovery", %{
        tenant_id: tool_call.tenant_id,
        chat_id: chat_id,
        type: "message",
        tool_name: tool_call.name,
        message: message
      })

    _ = Telegram.send_message(chat_id, message)

    _ =
      AgentChatStream.broadcast_assistant_message(tool_call.tenant_id, chat_id, %{
        content: message,
        action: "tool_failure_recovery",
        tool_name: tool_call.name
      })

    _ =
      persist_conversation_metadata(
        tool_call.tenant_id,
        chat_id,
        message,
        %{
          "last_action" => "tool_failure_recovery",
          "last_tool_name" => tool_call.name,
          "last_error_reason" => inspect(reason)
        },
        next_previous_response_id
      )

    _ = AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "idle")

    :recovered
  end

  defp handle_failure_recovery_outcome(
         {:follow_up_tool, next_tool_name, next_arguments, next_response_id,
          next_llm_tool_call_id},
         tool_call,
         user_id,
         chat_id,
         _reason
       ) do
    _ =
      AgentTrace.log("tool_execution.failure_recovery", %{
        tenant_id: tool_call.tenant_id,
        chat_id: chat_id,
        type: "tool",
        tool_name: next_tool_name,
        arguments: next_arguments
      })

    case enqueue_follow_up_tool(
           tool_call.tenant_id,
           user_id,
           chat_id,
           next_tool_name,
           next_arguments,
           next_response_id,
           next_llm_tool_call_id
         ) do
      :ok ->
        _ =
          persist_follow_up_tool_selected(
            tool_call.tenant_id,
            chat_id,
            next_tool_name
          )

        _ =
          AgentChatStream.broadcast_phase(tool_call.tenant_id, chat_id, "action-selected", %{
            tool_name: next_tool_name
          })

        :recovered

      {:error, _reason} ->
        :not_recovered
    end
  end

  defp handle_failure_recovery_outcome(_outcome, _tool_call, _user_id, _chat_id, _reason),
    do: :not_recovered

  defp failure_tool_output(tool_call, reason) do
    %{
      "status" => "failed",
      "tool_name" => tool_call.name,
      "arguments" => tool_call.arguments || %{},
      "error" => failure_error_payload(reason)
    }
  end

  defp failure_error_payload(reason) do
    %{
      "message" => extract_error_message(reason) || inspect(reason),
      "raw" => inspect(reason)
    }
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

  defp fallback_tool_result_message(user_request, tool_name, result) do
    case OpenAIResponses.summarize_tool_result(user_request, tool_name, result) do
      {:ok, synthesized} -> synthesized
      {:error, _reason} -> format_tool_result_message(tool_name, result)
    end
  end

  defp persist_follow_up_tool_selected(tenant_id, chat_id, tool_name) do
    case Conversations.get_conversation(tenant_id, chat_id) do
      nil ->
        :ok

      conversation ->
        metadata =
          conversation.metadata
          |> normalize_metadata()
          |> Map.merge(%{
            "last_action" => "tool_follow_up_selected",
            "last_tool_name" => tool_name
          })

        Conversations.touch_last_message(conversation, %{"metadata" => metadata})
    end
  end

  defp llm_context_ids(%{
         "llm_response_id" => llm_response_id,
         "llm_tool_call_id" => llm_tool_call_id
       })
       when is_binary(llm_response_id) and llm_response_id != "" and is_binary(llm_tool_call_id) and
              llm_tool_call_id != "" do
    {:ok, llm_response_id, llm_tool_call_id}
  end

  defp llm_context_ids(_llm_context), do: {:error, :missing_llm_context}

  defp extract_llm_context(args) when is_map(args) do
    %{}
    |> maybe_put_llm("llm_response_id", Map.get(args, "llm_response_id"))
    |> maybe_put_llm("llm_tool_call_id", Map.get(args, "llm_tool_call_id"))
  end

  defp extract_llm_context(_args), do: %{}

  defp maybe_put_llm(map, _key, value) when not is_binary(value) or value == "", do: map
  defp maybe_put_llm(map, key, value), do: Map.put(map, key, value)

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

  defp friendly_failure_feedback("finance.list_receivables", reason) do
    cond do
      timeout_reason?(reason) ->
        {
          "A Conta Azul demorou para responder e não consegui concluir agora. Quer que eu tente novamente?",
          "integration_timeout"
        }

      true ->
        case extract_missing_required_param(reason) do
          "data_vencimento_de" ->
            {
              "Para listar contas a receber, preciso de um período. Quer informar um período específico ou posso buscar os próximos 30 dias?",
              "clarification_required"
            }

          _ ->
            {
              "Não consegui listar as contas a receber com os dados atuais. Você quer que eu tente com os próximos 30 dias?",
              "clarification_required"
            }
        end
    end
  end

  defp friendly_failure_feedback("finance.list_payables", reason) do
    cond do
      timeout_reason?(reason) ->
        {
          "A Conta Azul demorou para responder e não consegui concluir agora. Quer que eu tente novamente?",
          "integration_timeout"
        }

      true ->
        case extract_missing_required_param(reason) do
          "data_vencimento_de" ->
            {
              "Para listar contas a pagar, preciso de um período. Quer informar um período específico ou posso buscar os próximos 30 dias?",
              "clarification_required"
            }

          _ ->
            {
              "Não consegui listar as contas a pagar com os dados atuais. Você quer que eu tente com os próximos 30 dias?",
              "clarification_required"
            }
        end
    end
  end

  defp friendly_failure_feedback(tool_name, reason)
       when tool_name in ["finance.get_statement", "finance.list_installments"] do
    cond do
      timeout_reason?(reason) ->
        {
          "A Conta Azul demorou para responder e não consegui concluir agora. Quer que eu tente novamente?",
          "integration_timeout"
        }

      true ->
        case extract_missing_required_param(reason) do
          "data_vencimento_de" ->
            {
              "Para listar esse extrato financeiro, preciso de um período. Quer informar um período específico ou posso buscar os próximos 30 dias?",
              "clarification_required"
            }

          _ ->
            {
              "Não consegui listar esse extrato financeiro com os dados atuais. Você quer que eu tente com os próximos 30 dias?",
              "clarification_required"
            }
        end
    end
  end

  defp friendly_failure_feedback(tool_name, reason)
       when tool_name in ["finance.create_payable", "finance.create_receivable"] do
    cond do
      timeout_reason?(reason) ->
        {
          "A Conta Azul demorou para responder e o lançamento não foi concluído agora. Quer que eu tente novamente?",
          "integration_timeout"
        }

      invalid_json_reason?(reason) ->
        {
          "A Conta Azul rejeitou o formato do lançamento. Para concluir, preciso de: valor numérico, data de competência (YYYY-MM-DD) e rateio com categoria financeira. A condição de pagamento pode ser, por exemplo, \"À vista\", \"3x\" ou \"30,60,90\".",
          "clarification_required"
        }

      missing = missing_finance_fields(reason) ->
        {
          "Para concluir esse lançamento, ainda faltam campos obrigatórios: #{Enum.join(missing, ", ")}. Me envie esses dados e eu tento novamente.",
          "clarification_required"
        }

      true ->
        {
          "Não consegui concluir o lançamento financeiro com os dados atuais. Quer que eu tente novamente?",
          "tool_execution_failed"
        }
    end
  end

  defp friendly_failure_feedback(tool_name, reason) do
    cond do
      timeout_reason?(reason) ->
        {
          "A integração demorou para responder e não consegui concluir agora. Quer que eu tente novamente?",
          "integration_timeout"
        }

      true ->
        {
          "Não consegui concluir #{tool_name} com os dados atuais. Pode me confirmar os dados necessários para eu tentar novamente?",
          "clarification_required"
        }
    end
  end

  defp extract_missing_required_param(reason) do
    case reason do
      {:missing_required_argument, param} when is_binary(param) ->
        param

      {:invalid_argument, param} when is_binary(param) ->
        param

      _ ->
        reason
        |> extract_error_message()
        |> case do
          nil ->
            nil

          message ->
            case Regex.run(~r/O parâmetro obrigatório '([^']+)' não foi informado/i, message) do
              [_, param] -> param
              _ -> nil
            end
        end
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

  defp invalid_json_reason?(reason) do
    reason
    |> extract_error_message()
    |> case do
      nil ->
        false

      message ->
        normalized = String.downcase(message)
        String.contains?(normalized, "formato json inválido")
    end
  end

  defp missing_finance_fields(reason) do
    with {tag, field} when tag in [:missing_required_argument, :invalid_argument] <- reason,
         true <- is_binary(field),
         humanized when is_binary(humanized) <- humanize_finance_field(field) do
      [humanized]
    else
      _ ->
        do_missing_finance_fields(reason)
    end
  end

  defp do_missing_finance_fields(reason) do
    reason
    |> extract_error_message()
    |> case do
      nil ->
        nil

      message ->
        fields =
          Regex.scan(~r/([a-zA-Z_]+)\s*:/, message, capture: :all_but_first)
          |> Enum.map(&List.first/1)
          |> Enum.uniq()
          |> Enum.map(&humanize_finance_field/1)
          |> Enum.reject(&is_nil/1)

        if fields == [], do: nil, else: fields
    end
  end

  defp humanize_finance_field("valor"), do: "valor"
  defp humanize_finance_field("rateio"), do: "categoria financeira (rateio)"
  defp humanize_finance_field("competenceDate"), do: "data de competência"
  defp humanize_finance_field("data_competencia"), do: "data de competência"
  defp humanize_finance_field("condicao_pagamento"), do: "condição de pagamento"
  defp humanize_finance_field("parcelas"), do: "parcelas da condição de pagamento"
  defp humanize_finance_field("data_vencimento"), do: "data de vencimento"
  defp humanize_finance_field("conta_financeira"), do: "conta financeira"
  defp humanize_finance_field("contato"), do: "contato/fornecedor"
  defp humanize_finance_field("id_categoria"), do: "categoria financeira (rateio)"
  defp humanize_finance_field("valor_bruto"), do: "valor da parcela"
  defp humanize_finance_field("valor_liquido"), do: "valor líquido da parcela"
  defp humanize_finance_field("valorLiquido"), do: "valor líquido da parcela"
  defp humanize_finance_field(_field), do: nil

  defp truncate(text, max_chars) when is_binary(text) and is_integer(max_chars) do
    if String.length(text) <= max_chars do
      text
    else
      String.slice(text, 0, max_chars) <> "\n...[truncated]"
    end
  end
end
