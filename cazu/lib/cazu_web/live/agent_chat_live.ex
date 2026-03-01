defmodule CazuWeb.AgentChatLive do
  use CazuWeb, :live_view

  import Ecto.Query, warn: false

  alias Cazu.AgentTrace
  alias Cazu.AgentChatStream
  alias Cazu.Conversations
  alias Cazu.Operations.Job
  alias Cazu.Repo
  alias Cazu.Tenancy
  alias Cazu.Workers.ConversationTurnWorker

  @typing_tick_ms 8

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Agent Chat Console")
     |> assign(:chat_id, nil)
     |> assign(:telegram_user_id, nil)
     |> assign(:tenant, nil)
     |> assign(:integration, nil)
     |> assign(:integration_connected?, false)
     |> assign(:pending_jobs?, false)
     |> assign(:phase, "Idle")
     |> assign(:typing, nil)
     |> assign(:assistant_thinking?, false)
     |> assign(:assistant_streaming, nil)
     |> assign(:typing_queue, [])
     |> assign(:message_count, 0)
     |> assign(:session_subscription, nil)
     |> assign(:chat_form, Phoenix.Component.to_form(%{"text" => ""}, as: :chat))
     |> assign(
       :session_form,
       Phoenix.Component.to_form(%{"chat_id" => "", "telegram_user_id" => ""}, as: :session)
     )
     |> stream(:messages, [])
     |> stream(:tool_calls, [])}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    {:noreply, load_session(socket, params)}
  end

  @impl true
  def handle_event("switch_session", %{"session" => session_params}, socket) do
    chat_id = normalize_chat_id(session_params["chat_id"])
    telegram_user_id = normalize_user_id(session_params["telegram_user_id"])

    {:noreply,
     push_patch(
       socket,
       to: ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}"
     )}
  end

  @impl true
  def handle_event("send_message", %{"chat" => chat_params}, socket) do
    text = normalize_text(chat_params["text"])

    _ =
      AgentTrace.log("live_chat.send_message", %{
        chat_id: socket.assigns.chat_id,
        telegram_user_id: socket.assigns.telegram_user_id,
        integration_connected: socket.assigns.integration_connected?,
        message_text: text
      })

    cond do
      text == "" ->
        _ =
          AgentTrace.log("live_chat.send_message_blocked", %{
            chat_id: socket.assigns.chat_id,
            reason: "empty_message"
          })

        {:noreply, put_flash(socket, :error, "Message cannot be empty")}

      not socket.assigns.integration_connected? ->
        _ =
          AgentTrace.log("live_chat.send_message_blocked", %{
            chat_id: socket.assigns.chat_id,
            reason: "integration_disconnected"
          })

        {:noreply,
         put_flash(
           socket,
           :error,
           "Conta Azul is not connected for this chat. Connect first and then send messages."
         )}

      true ->
        enqueue_conversation_turn(socket, text)
    end
  end

  @impl true
  def handle_event("clear_thread", _params, socket) do
    conversation =
      Conversations.get_conversation(socket.assigns.tenant.id, socket.assigns.chat_id)

    case clear_thread(conversation) do
      :ok ->
        {:noreply,
         socket
         |> assign(:phase, "idle")
         |> assign(:typing, nil)
         |> assign(:assistant_thinking?, false)
         |> assign(:assistant_streaming, nil)
         |> assign(:typing_queue, [])
         |> assign(:message_count, 0)
         |> assign(:pending_jobs?, false)
         |> stream(:messages, [], reset: true)
         |> stream(:tool_calls, [], reset: true)
         |> put_flash(:info, "Thread cleared. Starting from zero.")}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, "Could not clear thread: #{inspect(reason)}")}
    end
  end

  @impl true
  def handle_info({:agent_chat_event, :phase, payload}, socket) do
    status = payload[:status] || "processing"
    thread_started? = socket.assigns.message_count > 0

    assistant_thinking? =
      thread_started? and
        status in ["queued", "thinking", "action-selected", "tool-running", "tool-retrying"]

    assistant_streaming =
      if status in [
           "action-selected",
           "tool-running",
           "tool-retrying",
           "tool-succeeded",
           "tool-failed"
         ] do
        nil
      else
        socket.assigns.assistant_streaming
      end

    {:noreply,
     socket
     |> assign(:phase, status)
     |> assign(:assistant_thinking?, assistant_thinking?)
     |> assign(:assistant_streaming, assistant_streaming)
     |> maybe_stream_phase_runtime_message(status, payload)}
  end

  @impl true
  def handle_info({:agent_chat_event, :assistant_message, payload}, socket) do
    entry =
      build_message_entry(%{
        "id" => payload[:id],
        "role" => payload[:role] || "assistant",
        "content" => payload[:content],
        "action" => payload[:action],
        "tool_name" => payload[:tool_name],
        "at" => payload[:at]
      })

    socket =
      socket
      |> assign(:assistant_thinking?, false)
      |> assign(:assistant_streaming, nil)
      |> assign(:phase, "idle")
      |> assign(:pending_jobs?, false)

    if is_nil(socket.assigns.typing) do
      {:noreply,
       socket
       |> stream_insert(:messages, entry, at: -1)
       |> Phoenix.Component.update(:message_count, &(&1 + 1))}
    else
      {:noreply, enqueue_streamed_assistant(socket, entry)}
    end
  end

  @impl true
  def handle_info({:agent_chat_event, :assistant_stream_start, payload}, socket) do
    id = payload[:id] || "assistant-stream-#{System.unique_integer([:positive])}"

    streaming = %{
      id: id,
      role: "assistant",
      content: "",
      at: payload[:at] || now_iso8601()
    }

    {:noreply,
     socket
     |> assign(:assistant_thinking?, false)
     |> assign(:assistant_streaming, streaming)}
  end

  @impl true
  def handle_info({:agent_chat_event, :assistant_stream_delta, payload}, socket) do
    delta = payload[:delta] || ""
    stream_id = payload[:id]

    streaming =
      case socket.assigns.assistant_streaming do
        nil when is_binary(delta) and delta != "" ->
          %{
            id: stream_id || "assistant-stream-#{System.unique_integer([:positive])}",
            role: "assistant",
            content: delta,
            at: payload[:at] || now_iso8601()
          }

        %{id: id} = current
        when is_binary(delta) and delta != "" and (is_nil(stream_id) or id == stream_id) ->
          %{current | content: current.content <> delta}

        current ->
          current
      end

    {:noreply, assign(socket, :assistant_streaming, streaming)}
  end

  @impl true
  def handle_info({:agent_chat_event, :tool_call, payload}, socket) do
    tool_entry = build_tool_entry_from_event(payload)
    thread_started? = socket.assigns.message_count > 0

    pending_jobs? =
      thread_started? and
        case tool_entry.status do
          "queued" -> true
          "running" -> true
          _ -> pending_jobs_for_tenant?(socket.assigns.tenant.id)
        end

    {:noreply,
     socket
     |> stream_insert(:tool_calls, tool_entry, at: 0)
     |> maybe_stream_tool_runtime_message(tool_entry)
     |> assign(:pending_jobs?, pending_jobs?)}
  end

  @impl true
  def handle_info(:typing_tick, socket) do
    {:noreply, advance_typing(socket)}
  end

  defp load_session(socket, params) do
    chat_id = normalize_chat_id(params["chat_id"])
    telegram_user_id = normalize_user_id(params["telegram_user_id"])

    {:ok, tenant} = Tenancy.get_or_create_telegram_tenant(chat_id)
    {:ok, _user} = Tenancy.get_or_create_telegram_user(tenant, telegram_user_id)

    integration = Tenancy.get_integration(tenant.id)
    conversation = Conversations.get_conversation(tenant.id, chat_id)
    jobs = recent_jobs_for_tenant(tenant.id)

    messages =
      conversation
      |> conversation_messages()
      |> Enum.map(&build_message_entry/1)

    session_started? = messages != []
    pending_jobs? = session_started? and Enum.any?(jobs, &active_job?/1)

    tool_calls =
      jobs
      |> Enum.flat_map(fn job ->
        Enum.map(job.tool_calls, &build_tool_entry_from_db(&1, job.id))
      end)

    socket
    |> maybe_resubscribe(tenant.id, chat_id)
    |> assign(:chat_id, chat_id)
    |> assign(:telegram_user_id, telegram_user_id)
    |> assign(:tenant, tenant)
    |> assign(:integration, integration)
    |> assign(:integration_connected?, integration_active?(integration))
    |> assign(:pending_jobs?, pending_jobs?)
    |> assign(:phase, if(pending_jobs?, do: "processing", else: "idle"))
    |> assign(:typing, nil)
    |> assign(:assistant_thinking?, false)
    |> assign(:assistant_streaming, nil)
    |> assign(:typing_queue, [])
    |> assign(:message_count, length(messages))
    |> assign(:chat_form, Phoenix.Component.to_form(%{"text" => ""}, as: :chat))
    |> assign(
      :session_form,
      Phoenix.Component.to_form(
        %{"chat_id" => chat_id, "telegram_user_id" => telegram_user_id},
        as: :session
      )
    )
    |> stream(:messages, messages, reset: true)
    |> stream(:tool_calls, tool_calls, reset: true)
    |> then(fn updated_socket ->
      _ =
        AgentTrace.log("live_chat.session_loaded", %{
          chat_id: chat_id,
          telegram_user_id: telegram_user_id,
          tenant_id: tenant.id,
          integration_connected: integration_active?(integration),
          message_count: length(messages),
          pending_jobs: pending_jobs?
        })

      updated_socket
    end)
  end

  defp maybe_resubscribe(socket, tenant_id, chat_id) do
    next_subscription = %{tenant_id: tenant_id, chat_id: chat_id}
    current_subscription = socket.assigns.session_subscription

    if connected?(socket) and current_subscription != next_subscription do
      if is_map(current_subscription) do
        AgentChatStream.unsubscribe(current_subscription.tenant_id, current_subscription.chat_id)
      end

      AgentChatStream.subscribe(tenant_id, chat_id)
    end

    assign(socket, :session_subscription, next_subscription)
  end

  defp enqueue_conversation_turn(socket, text) do
    tenant = socket.assigns.tenant
    chat_id = socket.assigns.chat_id
    telegram_user_id = socket.assigns.telegram_user_id

    {:ok, user} =
      Tenancy.get_or_create_telegram_user(tenant, telegram_user_id, %{
        "name" => "Local Chat Tester"
      })

    update_id = next_update_id()
    payload = build_update_payload(update_id, chat_id, telegram_user_id, text)

    case Oban.insert(
           ConversationTurnWorker.new(
             build_job_args(payload, tenant.id, user.id, chat_id, telegram_user_id, text)
           )
         ) do
      {:ok, _job} ->
        _ =
          AgentTrace.log("live_chat.turn_enqueued", %{
            chat_id: chat_id,
            telegram_user_id: telegram_user_id,
            tenant_id: tenant.id,
            message_text: text
          })

        entry =
          build_message_entry(%{
            "id" => "local-user-#{System.unique_integer([:positive])}",
            "role" => "user",
            "content" => text,
            "action" => "user_input",
            "at" => now_iso8601()
          })

        socket =
          socket
          |> stream_insert(:messages, entry, at: -1)
          |> Phoenix.Component.update(:message_count, &(&1 + 1))
          |> maybe_stream_enqueue_runtime_message()
          |> assign(:pending_jobs?, true)
          |> assign(:phase, "queued")
          |> assign(:assistant_thinking?, true)
          |> assign(:assistant_streaming, nil)
          |> assign(:chat_form, Phoenix.Component.to_form(%{"text" => ""}, as: :chat))
          |> push_event("chat:clear-input", %{})

        {:noreply, socket}

      {:error, reason} ->
        _ =
          AgentTrace.log("live_chat.turn_enqueue_error", %{
            chat_id: chat_id,
            telegram_user_id: telegram_user_id,
            tenant_id: tenant.id,
            message_text: text,
            reason: inspect(reason)
          })

        {:noreply, put_flash(socket, :error, "Could not enqueue message: #{inspect(reason)}")}
    end
  end

  defp enqueue_streamed_assistant(socket, entry) do
    content = String.trim(entry.content || "")

    if content == "" do
      socket
    else
      if is_nil(socket.assigns.typing) do
        start_typing(socket, entry)
      else
        Phoenix.Component.update(socket, :typing_queue, fn queue -> queue ++ [entry] end)
      end
    end
  end

  defp clear_thread(nil), do: :ok

  defp clear_thread(conversation) do
    case Conversations.reset_thread(conversation) do
      {:ok, _conversation} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp start_typing(socket, entry) do
    Process.send_after(self(), :typing_tick, @typing_tick_ms)

    assign(socket, :typing, %{
      entry: entry,
      full_content: entry.content,
      visible_content: ""
    })
  end

  defp advance_typing(socket) do
    case socket.assigns.typing do
      nil ->
        socket

      typing ->
        full_content = typing.full_content
        next_size = String.length(typing.visible_content) + typing_chunk_size(full_content)
        full_size = String.length(full_content)
        bounded_size = min(next_size, full_size)
        visible_content = String.slice(full_content, 0, bounded_size)

        if bounded_size < full_size do
          Process.send_after(self(), :typing_tick, @typing_tick_ms)
          assign(socket, :typing, %{typing | visible_content: visible_content})
        else
          completed_entry = %{typing.entry | content: full_content}

          socket
          |> assign(:typing, nil)
          |> stream_insert(:messages, completed_entry, at: -1)
          |> Phoenix.Component.update(:message_count, &(&1 + 1))
          |> maybe_start_next_typing()
        end
    end
  end

  defp maybe_start_next_typing(socket) do
    case socket.assigns.typing_queue do
      [next | rest] ->
        socket
        |> assign(:typing_queue, rest)
        |> start_typing(next)

      [] ->
        socket
    end
  end

  defp typing_chunk_size(content) do
    size = String.length(content)

    cond do
      size <= 80 -> 20
      size <= 320 -> 42
      true -> 72
    end
  end

  defp recent_jobs_for_tenant(tenant_id) do
    Job
    |> where([j], j.tenant_id == ^tenant_id)
    |> order_by([j], desc: j.inserted_at)
    |> limit(20)
    |> preload([:tool_calls])
    |> Repo.all()
  end

  defp pending_jobs_for_tenant?(tenant_id) do
    query =
      from j in Job,
        where:
          j.tenant_id == ^tenant_id and j.status in ["queued", "running"] and
            is_nil(j.completed_at),
        select: count(j.id)

    Repo.one(query) > 0
  end

  defp build_message_entry(message) do
    role = message["role"] || "assistant"
    content = normalize_message_content(message["content"])
    action = message["action"]
    tool_name = message["tool_name"]
    level = message["level"]
    at = message["at"] || now_iso8601()
    raw_id = message["id"] || "#{role}:#{content}:#{action}:#{tool_name}:#{level}:#{at}"

    %{
      id: "msg-#{:erlang.phash2(raw_id)}",
      role: role,
      content: content,
      action: action,
      tool_name: tool_name,
      level: level,
      at: at
    }
  end

  defp build_tool_entry_from_db(tool_call, job_id) do
    status = effective_tool_status(tool_call)

    %{
      id: "tool-#{tool_call.id}",
      tool_call_id: tool_call.id,
      job_id: job_id,
      tool_name: tool_call.name,
      status: status,
      arguments_preview: format_payload(tool_call.arguments),
      result_preview: format_payload(tool_call.result),
      error_reason: tool_call.error_reason,
      at: format_timestamp(tool_call.finished_at || tool_call.started_at || tool_call.inserted_at)
    }
  end

  defp build_tool_entry_from_event(payload) do
    tool_call_id = payload[:tool_call_id]
    job_id = payload[:job_id]
    tool_name = payload[:tool_name] || "unknown.tool"
    status = payload[:status] || "queued"
    at = payload[:at] || now_iso8601()

    %{
      id:
        if(is_nil(tool_call_id),
          do: "tool-evt-#{:erlang.phash2({tool_name, status, at})}",
          else: "tool-#{tool_call_id}"
        ),
      tool_call_id: tool_call_id,
      job_id: job_id,
      tool_name: tool_name,
      status: status,
      arguments_preview: format_payload(payload[:arguments] || %{}),
      result_preview: format_payload(payload[:result]),
      error_reason: payload[:error_reason],
      at: at
    }
  end

  defp maybe_stream_enqueue_runtime_message(socket) do
    socket
    |> stream_insert(
      :messages,
      runtime_message_entry(
        "Message queued for processing.",
        "runtime_enqueued",
        nil,
        "info",
        now_iso8601()
      ),
      at: -1
    )
    |> Phoenix.Component.update(:message_count, &(&1 + 1))
  end

  defp maybe_stream_phase_runtime_message(socket, status, payload) do
    case phase_runtime_content(status, payload) do
      nil ->
        socket

      {content, action, level} ->
        socket
        |> stream_insert(
          :messages,
          runtime_message_entry(
            content,
            action,
            nil,
            level,
            payload[:at] || now_iso8601()
          ),
          at: -1
        )
        |> Phoenix.Component.update(:message_count, &(&1 + 1))
    end
  end

  defp maybe_stream_tool_runtime_message(socket, tool_entry) do
    case tool_runtime_content(tool_entry) do
      nil ->
        socket

      {content, action, level} ->
        socket
        |> stream_insert(
          :messages,
          runtime_message_entry(
            content,
            action,
            tool_entry.tool_name,
            level,
            tool_entry.at || now_iso8601()
          ),
          at: -1
        )
        |> Phoenix.Component.update(:message_count, &(&1 + 1))
    end
  end

  defp phase_runtime_content("thinking", _payload),
    do: {"Thinking about your request...", "runtime_phase_thinking", "info"}

  defp phase_runtime_content("action-selected", payload) do
    case payload[:tool_name] do
      tool_name when is_binary(tool_name) and tool_name != "" ->
        {"Action selected: #{tool_name}", "runtime_phase_action_selected", "info"}

      _ ->
        {"Action selected. Preparing tool call...", "runtime_phase_action_selected", "info"}
    end
  end

  defp phase_runtime_content("tool-retrying", _payload),
    do: {"Retrying tool after a transient error...", "runtime_phase_tool_retrying", "warn"}

  defp phase_runtime_content(_status, _payload), do: nil

  defp tool_runtime_content(%{status: "queued", tool_name: tool_name}) do
    {"Tool queued: #{tool_name}", "tool_status_queued", "info"}
  end

  defp tool_runtime_content(%{status: "running", tool_name: tool_name}) do
    {"Running tool #{tool_name}...", "tool_status_running", "info"}
  end

  defp tool_runtime_content(%{status: "succeeded", tool_name: tool_name}) do
    {"Tool succeeded: #{tool_name}", "tool_status_succeeded", "success"}
  end

  defp tool_runtime_content(%{
         status: "failed",
         tool_name: tool_name,
         error_reason: _error_reason
       }) do
    {"Tool failed: #{tool_name}. Let me adjust and continue...", "tool_status_failed", "error"}
  end

  defp tool_runtime_content(_tool_entry), do: nil

  defp runtime_message_entry(content, action, tool_name, level, at) do
    build_message_entry(%{
      "id" => "runtime-#{System.unique_integer([:positive])}",
      "role" => "tool",
      "content" => content,
      "action" => action,
      "tool_name" => tool_name,
      "level" => level,
      "at" => at
    })
  end

  defp normalize_message_content(content) when is_binary(content), do: content
  defp normalize_message_content(content) when is_map(content), do: format_payload(content)
  defp normalize_message_content(content) when is_list(content), do: format_payload(content)
  defp normalize_message_content(nil), do: ""
  defp normalize_message_content(content), do: inspect(content)

  defp conversation_messages(nil), do: []

  defp conversation_messages(conversation) do
    conversation
    |> Map.get(:metadata, %{})
    |> Map.get("messages", [])
    |> Enum.filter(&is_map/1)
  end

  defp format_payload(nil), do: nil

  defp format_payload(payload) when is_binary(payload) do
    payload
    |> String.trim()
    |> truncate(1200)
  end

  defp format_payload(payload) do
    payload
    |> Jason.encode!(pretty: true)
    |> truncate(1200)
  end

  defp truncate(value, max_chars) when is_binary(value) do
    if String.length(value) <= max_chars do
      value
    else
      String.slice(value, 0, max_chars) <> "\n...[truncated]"
    end
  end

  defp format_timestamp(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp format_timestamp(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  defp format_timestamp(value) when is_binary(value), do: value
  defp format_timestamp(_value), do: now_iso8601()

  defp normalize_chat_id(chat_id) when is_binary(chat_id) and chat_id != "", do: chat_id
  defp normalize_chat_id(_chat_id), do: "local-chat-1"

  defp normalize_user_id(user_id) when is_binary(user_id) and user_id != "", do: user_id
  defp normalize_user_id(_user_id), do: "local-user-1"

  defp normalize_text(text) when is_binary(text), do: String.trim(text)
  defp normalize_text(_text), do: ""

  defp next_update_id do
    System.unique_integer([:positive])
  end

  defp build_update_payload(update_id, chat_id, telegram_user_id, text) do
    %{
      "update_id" => update_id,
      "message" => %{
        "chat" => %{"id" => chat_id},
        "from" => %{"id" => telegram_user_id, "first_name" => "Local Tester"},
        "text" => text
      }
    }
  end

  defp build_job_args(payload, tenant_id, user_id, chat_id, telegram_user_id, text) do
    %{
      "tenant_id" => tenant_id,
      "user_id" => user_id,
      "chat_id" => chat_id,
      "telegram_user_id" => telegram_user_id,
      "message_text" => text,
      "telegram_update_id" => Integer.to_string(payload["update_id"]),
      "raw_update" => payload
    }
  end

  defp integration_active?(%{status: "active"}), do: true
  defp integration_active?(_integration), do: false

  defp active_job?(job) do
    job.status in ["queued", "running"] and is_nil(job.completed_at)
  end

  defp effective_tool_status(%{status: "running", finished_at: finished_at} = tool_call)
       when not is_nil(finished_at) do
    if is_binary(tool_call.error_reason) and tool_call.error_reason != "" do
      "failed"
    else
      "succeeded"
    end
  end

  defp effective_tool_status(tool_call), do: tool_call.status

  defp now_iso8601 do
    DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  end
end
