defmodule Cazu.Workers.ConversationTurnWorker do
  @moduledoc """
  Processes one Telegram conversation turn using OpenAI Responses and enqueues tool execution.
  """

  use Oban.Worker,
    queue: :llm_inference,
    max_attempts: 5,
    unique: [period: 86_400, fields: [:args], keys: [:tenant_id, :chat_id, :telegram_update_id]]

  alias Cazu.AgentTrace
  alias Cazu.AgentChatStream
  alias Cazu.Conversations
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.Operations
  alias Cazu.Operations.Job
  alias Cazu.Orchestrator
  alias Cazu.Policies
  alias Cazu.Telegram
  alias Cazu.Tenancy
  alias Cazu.Tenancy.User

  @default_no_tool_message """
  I could not safely map this request to a tool.
  Please rephrase with objective details (ids, dates, values).
  """

  @default_error_message "Could not process your request right now. Please try again shortly."
  @default_primary_model "gpt-5.2"
  @default_router_model "gpt-5-mini"
  @chat_lock_retry_seconds 1

  @impl Oban.Worker
  def perform(%Oban.Job{args: args, attempt: attempt, max_attempts: max_attempts}) do
    _ =
      AgentTrace.log("turn.started", %{
        tenant_id: args["tenant_id"],
        user_id: args["user_id"],
        chat_id: args["chat_id"],
        telegram_user_id: args["telegram_user_id"],
        telegram_update_id: args["telegram_update_id"],
        message_text: args["message_text"],
        attempt: attempt,
        max_attempts: max_attempts
      })

    case parse_context(args) do
      {:ok, context} ->
        with_chat_turn_lock(context, fn ->
          case maybe_handle_status_inquiry(context) do
            :handled ->
              :ok

            :continue ->
              with {:ok, conversation} <- load_conversation(context),
                   {:ok, action} <- select_action_with_recovery(conversation, context) do
                _ =
                  AgentTrace.log("turn.action_selected", %{
                    tenant_id: context.tenant_id,
                    chat_id: context.chat_id,
                    action: inspect(action)
                  })

                _ =
                  AgentChatStream.broadcast_phase(
                    context.tenant_id,
                    context.chat_id,
                    "action-selected",
                    %{
                      tool_name: selected_tool_name(action)
                    }
                  )

                handle_action(action, conversation, context)
              else
                {:error, reason} ->
                  _ = AgentTrace.log("turn.error", %{reason: inspect(reason), args: args})
                  handle_llm_error(reason, args, attempt, max_attempts)
              end
          end
        end)

      {:error, reason} ->
        _ = AgentTrace.log("turn.error", %{reason: inspect(reason), args: args})
        handle_llm_error(reason, args, attempt, max_attempts)
    end
  end

  defp with_chat_turn_lock(context, fun) when is_function(fun, 0) do
    lock_key = {:cazu_turn_lock, context.tenant_id, context.chat_id}
    lock_ref = {lock_key, self()}
    nodes = [node()]

    if :global.set_lock(lock_ref, nodes, 0) do
      _ =
        AgentTrace.log("turn.chat_lock_acquired", %{
          tenant_id: context.tenant_id,
          chat_id: context.chat_id
        })

      try do
        fun.()
      after
        :global.del_lock(lock_ref, nodes)
      end
    else
      _ =
        AgentTrace.log("turn.chat_lock_busy", %{
          tenant_id: context.tenant_id,
          chat_id: context.chat_id,
          retry_in_seconds: @chat_lock_retry_seconds
        })

      {:snooze, @chat_lock_retry_seconds}
    end
  end

  defp parse_context(args) when is_map(args) do
    tenant_id = args["tenant_id"]
    user_id = args["user_id"]
    chat_id = args["chat_id"]
    telegram_user_id = args["telegram_user_id"]
    message_text = args["message_text"]
    telegram_update_id = args["telegram_update_id"]

    cond do
      not is_integer(tenant_id) ->
        {:error, :invalid_tenant_id}

      not is_integer(user_id) ->
        {:error, :invalid_user_id}

      not is_binary(chat_id) ->
        {:error, :invalid_chat_id}

      not is_binary(telegram_user_id) ->
        {:error, :invalid_telegram_user_id}

      not is_binary(message_text) ->
        {:error, :invalid_message_text}

      not is_binary(telegram_update_id) ->
        {:error, :invalid_telegram_update_id}

      true ->
        {:ok,
         %{
           tenant_id: tenant_id,
           user_id: user_id,
           chat_id: chat_id,
           telegram_user_id: telegram_user_id,
           message_text: message_text
         }}
    end
  end

  defp load_conversation(context) do
    _ = AgentChatStream.broadcast_phase(context.tenant_id, context.chat_id, "thinking")

    result =
      Conversations.get_or_create_by_chat(context.tenant_id, context.chat_id, %{
        "telegram_user_id" => context.telegram_user_id
      })

    case result do
      {:ok, conversation} ->
        _ =
          AgentTrace.log("turn.conversation_loaded", %{
            tenant_id: context.tenant_id,
            chat_id: context.chat_id,
            conversation_id: conversation.id,
            previous_response_id: conversation.previous_response_id,
            history_count:
              conversation.metadata
              |> normalize_metadata()
              |> Map.get("messages", [])
              |> normalize_messages()
              |> length()
          })

      _ ->
        :ok
    end

    result
  end

  defp handle_action(
         {:tool, tool_name, arguments, response_id, _assistant_message, llm_tool_call_id},
         conversation,
         context
       ) do
    _ =
      AgentTrace.log("turn.handle_tool", %{
        tenant_id: context.tenant_id,
        chat_id: context.chat_id,
        tool_name: tool_name,
        arguments: arguments,
        response_id: response_id,
        llm_tool_call_id: llm_tool_call_id
      })

    enriched_arguments = enrich_tool_arguments(tool_name, arguments, context.message_text)

    with {:ok, _conversation} <-
           put_ui_metadata(conversation, %{
             "last_user_message" => context.message_text,
             "last_assistant_message" => nil,
             "last_action" => "tool_selected",
             "last_tool_name" => tool_name,
             "pending_confirmation" => nil
           }),
         %User{} = user <- Tenancy.get_user(context.user_id),
         :ok <- Policies.validate_tool_call(user, tool_name, enriched_arguments),
         :ok <-
           Orchestrator.enqueue_tool_call(
             context.tenant_id,
             context.user_id,
             context.chat_id,
             tool_name,
             enriched_arguments,
             %{
               "llm_response_id" => response_id,
               "llm_tool_call_id" => llm_tool_call_id
             }
           ) do
      :ok
    else
      nil ->
        {:cancel, :user_not_found}

      {:error, :confirmation_required} ->
        _ =
          AgentTrace.log("turn.confirmation_required", %{
            tenant_id: context.tenant_id,
            chat_id: context.chat_id,
            tool_name: tool_name,
            arguments: enriched_arguments
          })

        _ =
          put_ui_metadata(conversation, %{
            "last_user_message" => context.message_text,
            "last_assistant_message" =>
              "This command changes data. Please send it with \"confirm\": true.",
            "last_action" => "confirmation_required",
            "last_tool_name" => tool_name,
            "pending_confirmation" => build_pending_confirmation(tool_name, enriched_arguments)
          })

        _ =
          Telegram.send_message(
            context.chat_id,
            "This command changes data. Please send it with \"confirm\": true."
          )

        _ =
          broadcast_assistant(
            context,
            "This command changes data. Please send it with \"confirm\": true.",
            "confirmation_required",
            tool_name
          )

        _ = broadcast_idle(context)

        :ok

      {:error, reason} ->
        _ =
          AgentTrace.log("turn.tool_enqueue_error", %{
            tenant_id: context.tenant_id,
            chat_id: context.chat_id,
            tool_name: tool_name,
            reason: inspect(reason)
          })

        _ =
          put_ui_metadata(conversation, %{
            "last_user_message" => context.message_text,
            "last_assistant_message" => @default_error_message,
            "last_action" => "tool_selection_error",
            "last_tool_name" => tool_name,
            "last_error_reason" => inspect(reason)
          })

        _ =
          Telegram.send_message(context.chat_id, "Could not process request: #{inspect(reason)}")

        _ =
          broadcast_assistant(
            context,
            @default_error_message,
            "tool_selection_error",
            tool_name
          )

        _ = broadcast_idle(context)

        :ok
    end
  end

  defp handle_action({:no_tool, assistant_message, response_id}, conversation, context) do
    normalized_message = normalize_no_tool_message(assistant_message)

    _ =
      AgentTrace.log("turn.handle_no_tool", %{
        tenant_id: context.tenant_id,
        chat_id: context.chat_id,
        response_id: response_id,
        assistant_message: normalized_message
      })

    with {:ok, updated_conversation} <-
           Conversations.update_previous_response(conversation, response_id),
         {:ok, _conversation} <-
           put_ui_metadata(updated_conversation, %{
             "last_user_message" => context.message_text,
             "last_assistant_message" => normalized_message,
             "last_action" => "no_tool",
             "last_tool_name" => nil
           }) do
      _ = Telegram.send_message(context.chat_id, normalize_no_tool_message(assistant_message))
      _ = broadcast_assistant(context, normalized_message, "no_tool", nil)
      _ = broadcast_idle(context)
      :ok
    end
  end

  defp handle_llm_error(reason, args, attempt, max_attempts) do
    _ =
      AgentTrace.log("turn.llm_error", %{
        reason: inspect(reason),
        attempt: attempt,
        max_attempts: max_attempts,
        args: args
      })

    retryable_transient? = transient_llm_error?(reason) and attempt < max_attempts
    context = fallback_context(args)

    case context do
      {:ok, parsed_context} ->
        handle_llm_error_with_context(reason, parsed_context, retryable_transient?)

      {:error, _context_error} ->
        if retryable_transient?, do: {:error, reason}, else: :ok
    end
  end

  defp handle_llm_error_with_context(reason, context, retryable_transient?) do
    case Orchestrator.parse_legacy_tool_command(context.message_text) do
      {:ok, tool_name, arguments} ->
        conversation = load_or_nil_conversation(context)
        _ = maybe_put_ui_metadata(conversation, fallback_metadata(context, tool_name))

        with %User{} = user <- Tenancy.get_user(context.user_id),
             :ok <- Policies.validate_tool_call(user, tool_name, arguments),
             :ok <-
               Orchestrator.enqueue_tool_call(
                 context.tenant_id,
                 context.user_id,
                 context.chat_id,
                 tool_name,
                 arguments
               ) do
          :ok
        else
          nil ->
            {:cancel, :user_not_found}

          {:error, :confirmation_required} ->
            _ =
              maybe_put_ui_metadata(conversation, %{
                "last_user_message" => context.message_text,
                "last_assistant_message" =>
                  "This command changes data. Please send it with \"confirm\": true.",
                "last_action" => "confirmation_required",
                "last_tool_name" => tool_name,
                "pending_confirmation" => build_pending_confirmation(tool_name, arguments)
              })

            _ =
              Telegram.send_message(
                context.chat_id,
                "This command changes data. Please send it with \"confirm\": true."
              )

            _ =
              broadcast_assistant(
                context,
                "This command changes data. Please send it with \"confirm\": true.",
                "confirmation_required",
                tool_name
              )

            _ = broadcast_idle(context)

            :ok

          {:error, error} ->
            _ =
              maybe_put_ui_metadata(conversation, %{
                "last_user_message" => context.message_text,
                "last_assistant_message" => @default_error_message,
                "last_action" => "fallback_tool_error",
                "last_tool_name" => tool_name,
                "last_error_reason" => inspect(error)
              })

            _ =
              Telegram.send_message(
                context.chat_id,
                "Could not process request: #{inspect(error)}"
              )

            _ =
              broadcast_assistant(
                context,
                @default_error_message,
                "fallback_tool_error",
                tool_name
              )

            _ = broadcast_idle(context)

            :ok
        end

      {:error, _unsupported} ->
        if retryable_transient? do
          {:error, reason}
        else
          conversation = load_or_nil_conversation(context)

          message =
            if transient_llm_error?(reason) do
              "A integração de IA está instável no momento e não consegui responder agora. Pode tentar novamente em alguns segundos?"
            else
              @default_error_message
            end

          _ =
            maybe_put_ui_metadata(conversation, %{
              "last_user_message" => context.message_text,
              "last_assistant_message" => message,
              "last_action" => "llm_error",
              "last_tool_name" => nil,
              "last_error_reason" => inspect(reason)
            })

          _ = Telegram.send_message(context.chat_id, message)
          _ = broadcast_assistant(context, message, "llm_error", nil)
          _ = broadcast_idle(context)
          :ok
        end
    end
  end

  defp transient_llm_error?({:request_error, _message}), do: true

  defp transient_llm_error?({:upstream_error, status, _body}) when status in [408, 409, 429],
    do: true

  defp transient_llm_error?({:upstream_error, status, _body}) when status >= 500, do: true
  defp transient_llm_error?(_), do: false

  defp fallback_context(args) do
    with {:ok, context} <- parse_context(args) do
      {:ok, context}
    end
  end

  defp normalize_no_tool_message(message) when is_binary(message) do
    case String.trim(message) do
      "" -> @default_no_tool_message
      normalized -> normalized
    end
  end

  defp normalize_no_tool_message(_), do: @default_no_tool_message

  defp put_ui_metadata(conversation, attrs) do
    metadata =
      conversation.metadata
      |> normalize_metadata()
      |> append_message_history(attrs)

    merged_metadata = Map.merge(metadata, attrs)

    Conversations.touch_last_message(conversation, %{"metadata" => merged_metadata})
  end

  defp maybe_put_ui_metadata(nil, _attrs), do: :ok
  defp maybe_put_ui_metadata(conversation, attrs), do: put_ui_metadata(conversation, attrs)

  defp load_or_nil_conversation(context) do
    Conversations.get_conversation(context.tenant_id, context.chat_id)
  end

  defp fallback_metadata(context, tool_name) do
    %{
      "last_user_message" => context.message_text,
      "last_assistant_message" => "Processed in fallback mode.",
      "last_action" => "fallback_legacy_command",
      "last_tool_name" => tool_name
    }
  end

  defp normalize_metadata(metadata) when is_map(metadata),
    do: Map.new(metadata, fn {key, value} -> {to_string(key), value} end)

  defp normalize_metadata(_metadata), do: %{}

  defp append_message_history(metadata, attrs) do
    existing_messages = normalize_messages(metadata["messages"])

    existing_messages
    |> maybe_append_message("user", attrs["last_user_message"], attrs)
    |> maybe_append_message("assistant", attrs["last_assistant_message"], attrs)
    |> then(&Map.put(metadata, "messages", &1))
  end

  defp maybe_append_message(messages, _role, content, _attrs) when content in [nil, ""],
    do: messages

  defp maybe_append_message(messages, role, content, attrs) do
    message = %{
      "role" => role,
      "content" => content,
      "action" => attrs["last_action"],
      "tool_name" => attrs["last_tool_name"],
      "at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    }

    (messages ++ [message])
    |> Enum.take(-40)
  end

  defp normalize_messages(messages) when is_list(messages) do
    Enum.filter(messages, &is_map/1)
  end

  defp normalize_messages(_messages), do: []

  defp enrich_tool_arguments("crm.list_people", arguments, message_text) when is_map(arguments) do
    arguments
    |> alias_arg("name", "busca")
    |> alias_arg("person_name", "busca")
    |> alias_arg("nome", "busca")
    |> alias_arg("filter", "busca")
    |> alias_arg("search", "busca")
    |> alias_arg("query", "busca")
    |> maybe_add_search_filter(message_text)
    |> drop_keys(["name", "person_name", "nome", "filter", "search", "query"])
  end

  defp enrich_tool_arguments(tool_name, arguments, message_text)
       when tool_name in ["finance.list_receivables", "finance.list_payables"] and
              is_map(arguments) do
    arguments
    |> normalize_finance_period_aliases()
    |> maybe_add_default_finance_period(message_text)
  end

  defp enrich_tool_arguments(tool_name, arguments, message_text)
       when tool_name in ["finance.get_statement", "finance.list_installments"] and
              is_map(arguments) do
    arguments
    |> normalize_finance_period_aliases()
    |> maybe_add_default_finance_type(message_text)
    |> maybe_add_default_finance_period(message_text)
  end

  defp enrich_tool_arguments(_tool_name, arguments, _message_text), do: arguments

  defp normalize_finance_period_aliases(arguments) do
    arguments
    |> alias_arg("data_vencimento_de", "from")
    |> alias_arg("data_vencimento_ate", "to")
    |> alias_arg("date_from", "from")
    |> alias_arg("date_to", "to")
  end

  defp alias_arg(arguments, source_key, target_key) do
    source_value = Map.get(arguments, source_key)
    target_value = Map.get(arguments, target_key)

    cond do
      present_value?(target_value) ->
        arguments

      present_value?(source_value) ->
        arguments
        |> Map.put(target_key, source_value)
        |> Map.delete(source_key)

      true ->
        arguments
    end
  end

  defp maybe_add_search_filter(arguments, message_text) do
    if present_value?(Map.get(arguments, "busca")) do
      arguments
    else
      case extract_name_hint(message_text) do
        nil -> arguments
        name -> Map.put(arguments, "busca", name)
      end
    end
  end

  defp maybe_add_default_finance_period(arguments, message_text) do
    has_from? =
      present_value?(Map.get(arguments, "from")) or
        present_value?(Map.get(arguments, "data_vencimento_de"))

    if has_from? do
      arguments
    else
      {from, to} = infer_finance_period(message_text)

      arguments
      |> Map.put_new("from", Date.to_iso8601(from))
      |> Map.put_new("to", Date.to_iso8601(to))
    end
  end

  defp maybe_add_default_finance_type(arguments, message_text) do
    if present_value?(Map.get(arguments, "type")) do
      arguments
    else
      case infer_finance_type(message_text) do
        nil -> arguments
        type -> Map.put(arguments, "type", type)
      end
    end
  end

  defp maybe_handle_status_inquiry(context) do
    if status_inquiry?(context.message_text) do
      active_job = Operations.latest_active_job(context.tenant_id, context.user_id)

      _ =
        AgentTrace.log("turn.status_inquiry", %{
          tenant_id: context.tenant_id,
          chat_id: context.chat_id,
          user_id: context.user_id,
          active_job_id: active_job && active_job.id,
          active_job_status: active_job && active_job.status,
          active_job_intent: active_job && active_job.intent
        })

      case active_job do
        %Job{} ->
          # Keep silent while a tool is still running; user will receive only final result.
          :handled

        nil ->
          assistant_message = "Não há nenhuma execução em andamento agora."

          conversation =
            case Conversations.get_or_create_by_chat(context.tenant_id, context.chat_id, %{
                   "telegram_user_id" => context.telegram_user_id
                 }) do
              {:ok, conv} -> conv
              _ -> nil
            end

          _ =
            maybe_put_ui_metadata(conversation, %{
              "last_user_message" => context.message_text,
              "last_assistant_message" => assistant_message,
              "last_action" => "job_status_idle",
              "last_tool_name" => nil
            })

          _ = Telegram.send_message(context.chat_id, assistant_message)
          _ = broadcast_assistant(context, assistant_message, "job_status_idle", nil)
          _ = broadcast_idle(context)

          :handled
      end
    else
      :continue
    end
  end

  defp status_inquiry?(message_text) when is_binary(message_text) do
    normalized = normalize_query(message_text)

    normalized == "ta rodando?" or
      String.contains?(normalized, "ta rodando") or
      String.contains?(normalized, "esta rodando") or
      String.contains?(normalized, "esta em andamento") or
      String.contains?(normalized, "em andamento") or
      String.contains?(normalized, "qual status") or
      String.contains?(normalized, "status")
  end

  defp status_inquiry?(_message_text), do: false

  defp infer_finance_type(message_text) do
    normalized = normalize_query(message_text)

    cond do
      String.contains?(normalized, "contas a pagar") or
        String.contains?(normalized, "conta a pagar") or
          Regex.match?(~r/\ba pagar\b/, normalized) ->
        "payable"

      String.contains?(normalized, "contas a receber") or
        String.contains?(normalized, "conta a receber") or
          Regex.match?(~r/\ba receber\b/, normalized) ->
        "receivable"

      true ->
        nil
    end
  end

  defp infer_finance_period(message_text) do
    today = Date.utc_today()
    normalized = normalize_query(message_text)

    cond do
      Regex.match?(~r/proxim(?:o|os)\s+\d{1,3}\s+dias?/, normalized) ->
        [_, days] = Regex.run(~r/proxim(?:o|os)\s+(\d{1,3})\s+dias?/, normalized)
        {today, Date.add(today, String.to_integer(days))}

      Regex.match?(~r/ultim(?:o|os)\s+\d{1,3}\s+dias?/, normalized) ->
        [_, days] = Regex.run(~r/ultim(?:o|os)\s+(\d{1,3})\s+dias?/, normalized)
        {Date.add(today, -String.to_integer(days)), today}

      String.contains?(normalized, "hoje") ->
        {today, today}

      String.contains?(normalized, "semana") ->
        weekday = :calendar.day_of_the_week(Date.to_erl(today))
        {Date.add(today, 1 - weekday), Date.add(today, 7 - weekday)}

      true ->
        {year, month, _day} = Date.to_erl(today)
        month_start = Date.new!(year, month, 1)
        month_end = Date.new!(year, month, :calendar.last_day_of_the_month(year, month))
        {month_start, month_end}
    end
  end

  defp normalize_query(text) when is_binary(text) do
    text
    |> String.downcase()
    |> String.normalize(:nfd)
    |> String.replace(~r/[\p{Mn}]/u, "")
    |> String.trim()
  end

  defp normalize_query(_text), do: ""

  defp extract_name_hint(message_text) when is_binary(message_text) do
    patterns = [
      ~r/\b(?:com\s+)?nome(?:\s+de)?\s+["']?([[:alpha:]][[:alnum:]'-]*(?:\s+[[:alpha:]][[:alnum:]'-]*){0,2})/iu,
      ~r/\bchamad[oa]s?\s+["']?([[:alpha:]][[:alnum:]'-]*(?:\s+[[:alpha:]][[:alnum:]'-]*){0,2})/iu
    ]

    Enum.find_value(patterns, fn pattern ->
      case Regex.run(pattern, message_text) do
        [_, name] ->
          normalize_name_hint(name)

        _ ->
          nil
      end
    end)
  end

  defp extract_name_hint(_message_text), do: nil

  defp normalize_name_hint(name) when is_binary(name) do
    name
    |> String.trim()
    |> String.trim(~s('""))
    |> String.trim_trailing(".")
    |> String.trim_trailing(",")
    |> String.replace(~r/\s+/, " ")
    |> blank_to_nil()
  end

  defp normalize_name_hint(_name), do: nil

  defp present_value?(value) when is_binary(value), do: String.trim(value) != ""
  defp present_value?(value), do: not is_nil(value)

  defp drop_keys(map, keys), do: Enum.reduce(keys, map, &Map.delete(&2, &1))

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(value), do: value

  defp build_pending_confirmation(tool_name, arguments) do
    %{
      "tool_name" => tool_name,
      "arguments" => Map.new(arguments || %{}, fn {key, value} -> {to_string(key), value} end)
    }
  end

  defp broadcast_assistant(context, content, action, tool_name) do
    AgentChatStream.broadcast_assistant_message(context.tenant_id, context.chat_id, %{
      content: content,
      action: action,
      tool_name: tool_name
    })
  end

  defp broadcast_idle(context) do
    AgentChatStream.broadcast_phase(context.tenant_id, context.chat_id, "idle")
  end

  defp select_action_with_recovery(conversation, context) do
    on_delta = fn delta ->
      AgentChatStream.broadcast_assistant_stream_delta(context.tenant_id, context.chat_id, %{
        "delta" => delta
      })
    end

    router_model = router_model()
    primary_model = primary_model()

    case select_action_for_model(
           conversation,
           context.message_text,
           on_delta,
           router_model,
           false
         ) do
      {:ok,
       {:tool, _tool_name, _arguments, _response_id, _assistant_message, _llm_tool_call_id} =
           action} ->
        {:ok, action}

      {:ok, {:no_tool, _assistant_message, _response_id} = action} ->
        if primary_model == router_model do
          {:ok, action}
        else
          select_action_for_model(
            conversation,
            context.message_text,
            on_delta,
            primary_model,
            true
          )
        end

      {:error, reason} ->
        if primary_model == router_model do
          {:error, reason}
        else
          select_action_for_model(
            conversation,
            context.message_text,
            on_delta,
            primary_model,
            true
          )
        end
    end
  end

  defp select_action_for_model(conversation, message_text, on_delta, model, stream?) do
    call_opts = [model: model]

    initial_result =
      if stream? do
        OpenAIResponses.select_next_action_stream(conversation, message_text, on_delta, call_opts)
      else
        OpenAIResponses.select_next_action(conversation, message_text, call_opts)
      end

    case initial_result do
      {:error, :missing_tool_output_for_previous_response} ->
        with {:ok, cleared_conversation} <-
               Conversations.touch_last_message(conversation, %{"previous_response_id" => nil}) do
          if stream? do
            OpenAIResponses.select_next_action_stream(
              cleared_conversation,
              message_text,
              on_delta,
              call_opts
            )
          else
            OpenAIResponses.select_next_action(cleared_conversation, message_text, call_opts)
          end
        end

      other ->
        other
    end
  end

  defp primary_model do
    openai = Application.get_env(:cazu, :openai, [])
    configured = Keyword.get(openai, :primary_model) || Keyword.get(openai, :model)

    if is_binary(configured) and configured != "",
      do: configured,
      else: @default_primary_model
  end

  defp router_model do
    openai = Application.get_env(:cazu, :openai, [])
    configured = Keyword.get(openai, :router_model) || Keyword.get(openai, :model)

    if is_binary(configured) and configured != "",
      do: configured,
      else: @default_router_model
  end

  defp selected_tool_name(
         {:tool, tool_name, _arguments, _response_id, _assistant_message, _llm_tool_call_id}
       )
       when is_binary(tool_name) do
    tool_name
  end

  defp selected_tool_name(_action), do: nil
end
