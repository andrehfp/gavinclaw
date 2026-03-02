defmodule Cazu.Agents.RuntimeAdapter do
  @moduledoc """
  Translates chat-agent directives into existing runtime side-effects.

  The adapter enforces a versioned directive envelope (`v1`) before executing
  side effects.
  """

  alias Cazu.AgentChatStream
  alias Cazu.AgentTrace
  alias Cazu.Agents.Directives.AskForConfirmation
  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.Orchestrator
  alias Cazu.Telegram

  @supported_versions MapSet.new(["v1"])

  @spec execute([struct()], map()) :: :ok | {:error, term()}
  def execute(directives, context) when is_list(directives) and is_map(context) do
    Enum.reduce_while(directives, :ok, fn directive, _acc ->
      with {:ok, envelope} <- build_envelope(directive, context),
           :ok <- validate_envelope(envelope) do
        case execute_envelope(envelope, context) do
          :ok ->
            {:cont, :ok}

          {:error, reason} ->
            {:halt, {:error, reason}}
        end
      else
        {:error, reason} ->
          _ = log_invalid_directive(directive, context, reason)
          {:halt, {:error, {:directive_invalid, reason}}}
      end
    end)
  end

  defp execute_envelope(envelope, context) do
    case Map.get(envelope, :directive_type) do
      "enqueue_tool_call" ->
        execute_enqueue_tool_call(envelope, context)

      "emit_user_message" ->
        execute_emit_user_message(envelope, context)

      "ask_for_confirmation" ->
        execute_ask_for_confirmation(envelope, context)

      type ->
        {:error, {:unsupported_directive_type, type}}
    end
  end

  defp execute_enqueue_tool_call(envelope, _context) do
    payload = Map.get(envelope, :payload, %{})

    with {:ok, tenant_id, user_id, chat_id} <- envelope_identity(envelope),
         :ok <-
           Orchestrator.enqueue_tool_call(
             tenant_id,
             user_id,
             chat_id,
             Map.get(payload, "tool_name"),
             Map.get(payload, "arguments", %{}),
             Map.get(payload, "execution_meta", %{})
           ) do
      _ =
        AgentTrace.log("agent.directive.emitted", %{
          directive_id: envelope.directive_id,
          directive_type: envelope.directive_type,
          directive_version: envelope.directive_version,
          idempotency_key: envelope.idempotency_key,
          tenant_id: tenant_id,
          conversation_id: envelope.conversation_id,
          user_id: user_id
        })

      :ok
    else
      {:error, reason} -> {:error, {:enqueue_tool_call, reason}}
    end
  end

  defp execute_emit_user_message(envelope, context) do
    payload = Map.get(envelope, :payload, %{})
    message = Map.get(payload, "message", "")
    metadata = Map.get(payload, "metadata", %{})

    with {:ok, tenant_id, _user_id, chat_id} <- envelope_identity(envelope) do
      _ =
        AgentTrace.log("agent.directive.emitted", %{
          directive_id: envelope.directive_id,
          directive_type: envelope.directive_type,
          directive_version: envelope.directive_version,
          idempotency_key: envelope.idempotency_key,
          tenant_id: tenant_id,
          conversation_id: envelope.conversation_id,
          metadata: metadata
        })

      maybe_send_telegram_message(chat_id, message, context)

      _ =
        AgentChatStream.broadcast_assistant_message(tenant_id, chat_id, %{
          content: message,
          action: "agent_emit_user_message",
          tool_name: nil
        })

      :ok
    end
  end

  defp execute_ask_for_confirmation(envelope, context) do
    payload = Map.get(envelope, :payload, %{})
    message = Map.get(payload, "message", "")
    pending_operation = Map.get(payload, "pending_operation", %{})

    with {:ok, tenant_id, _user_id, chat_id} <- envelope_identity(envelope) do
      _ =
        AgentTrace.log("agent.directive.emitted", %{
          directive_id: envelope.directive_id,
          directive_type: envelope.directive_type,
          directive_version: envelope.directive_version,
          idempotency_key: envelope.idempotency_key,
          tenant_id: tenant_id,
          conversation_id: envelope.conversation_id,
          pending_operation: pending_operation
        })

      maybe_send_telegram_message(chat_id, message, context)

      _ =
        AgentChatStream.broadcast_assistant_message(tenant_id, chat_id, %{
          content: message,
          action: "agent_ask_for_confirmation",
          tool_name: Map.get(pending_operation, "tool_name")
        })

      :ok
    end
  end

  defp build_envelope(%EnqueueToolCall{} = directive, context) do
    with {:ok, tenant_id, user_id, conversation_id} <- runtime_identity(context) do
      payload = %{
        "tool_name" => directive.tool_name,
        "arguments" => normalize_map(directive.arguments),
        "execution_meta" => normalize_map(directive.execution_meta || %{})
      }

      envelope("enqueue_tool_call", payload, tenant_id, conversation_id, user_id)
    end
  end

  defp build_envelope(%EmitUserMessage{} = directive, context) do
    with {:ok, tenant_id, user_id, conversation_id} <- runtime_identity(context) do
      payload = %{
        "message" => directive.message,
        "metadata" => normalize_map(directive.metadata || %{})
      }

      envelope("emit_user_message", payload, tenant_id, conversation_id, user_id)
    end
  end

  defp build_envelope(%AskForConfirmation{} = directive, context) do
    with {:ok, tenant_id, user_id, conversation_id} <- runtime_identity(context) do
      payload = %{
        "message" => directive.message,
        "pending_operation" => normalize_map(directive.pending_operation)
      }

      envelope("ask_for_confirmation", payload, tenant_id, conversation_id, user_id)
    end
  end

  defp build_envelope(directive, _context), do: {:error, {:unsupported_directive, directive}}

  defp envelope(directive_type, payload, tenant_id, conversation_id, user_id) do
    issued_at = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    envelope = %{
      directive_id: Ecto.UUID.generate(),
      directive_type: directive_type,
      directive_version: "v1",
      tenant_id: tenant_id,
      conversation_id: conversation_id,
      user_id: user_id,
      idempotency_key:
        directive_idempotency_key(tenant_id, conversation_id, directive_type, payload),
      issued_at: issued_at,
      payload: payload
    }

    {:ok, envelope}
  end

  defp validate_envelope(envelope) when is_map(envelope) do
    with :ok <- validate_directive_type(Map.get(envelope, :directive_type)),
         :ok <- validate_directive_version(Map.get(envelope, :directive_version)),
         :ok <- validate_idempotency_key(Map.get(envelope, :idempotency_key)),
         :ok <- validate_payload(Map.get(envelope, :directive_type), Map.get(envelope, :payload)),
         :ok <- validate_identity(envelope) do
      :ok
    end
  end

  defp validate_envelope(_envelope), do: {:error, :invalid_envelope}

  defp validate_directive_type(type)
       when type in ["enqueue_tool_call", "emit_user_message", "ask_for_confirmation"],
       do: :ok

  defp validate_directive_type(type), do: {:error, {:invalid_directive_type, type}}

  defp validate_directive_version(version) when is_binary(version) do
    if MapSet.member?(@supported_versions, version) do
      :ok
    else
      {:error, {:unsupported_directive_version, version}}
    end
  end

  defp validate_directive_version(version), do: {:error, {:invalid_directive_version, version}}

  defp validate_idempotency_key(value) when is_binary(value) and value != "", do: :ok
  defp validate_idempotency_key(value), do: {:error, {:invalid_idempotency_key, value}}

  defp validate_payload("enqueue_tool_call", payload) when is_map(payload) do
    tool_name = Map.get(payload, "tool_name")
    arguments = Map.get(payload, "arguments")
    execution_meta = Map.get(payload, "execution_meta")

    cond do
      not (is_binary(tool_name) and String.trim(tool_name) != "") ->
        {:error, {:invalid_payload, :tool_name}}

      not is_map(arguments) ->
        {:error, {:invalid_payload, :arguments}}

      not is_map(execution_meta) ->
        {:error, {:invalid_payload, :execution_meta}}

      true ->
        :ok
    end
  end

  defp validate_payload("emit_user_message", payload) when is_map(payload) do
    message = Map.get(payload, "message")

    if is_binary(message) and String.trim(message) != "" do
      :ok
    else
      {:error, {:invalid_payload, :message}}
    end
  end

  defp validate_payload("ask_for_confirmation", payload) when is_map(payload) do
    message = Map.get(payload, "message")
    pending_operation = Map.get(payload, "pending_operation")

    cond do
      not (is_binary(message) and String.trim(message) != "") ->
        {:error, {:invalid_payload, :message}}

      not is_map(pending_operation) ->
        {:error, {:invalid_payload, :pending_operation}}

      true ->
        :ok
    end
  end

  defp validate_payload(_type, payload), do: {:error, {:invalid_payload, payload}}

  defp validate_identity(envelope) do
    tenant_id = Map.get(envelope, :tenant_id)
    conversation_id = Map.get(envelope, :conversation_id)
    user_id = Map.get(envelope, :user_id)

    cond do
      not is_integer(tenant_id) -> {:error, :invalid_tenant_id}
      not is_binary(conversation_id) -> {:error, :invalid_conversation_id}
      not is_integer(user_id) -> {:error, :invalid_user_id}
      true -> :ok
    end
  end

  defp envelope_identity(envelope) do
    tenant_id = Map.get(envelope, :tenant_id)
    user_id = Map.get(envelope, :user_id)
    chat_id = Map.get(envelope, :conversation_id)

    cond do
      not is_integer(tenant_id) -> {:error, :invalid_tenant_id}
      not is_integer(user_id) -> {:error, :invalid_user_id}
      not is_binary(chat_id) -> {:error, :invalid_chat_id}
      true -> {:ok, tenant_id, user_id, chat_id}
    end
  end

  defp log_invalid_directive(directive, context, reason) do
    tenant_id = Map.get(context, :tenant_id) || Map.get(context, "tenant_id")
    chat_id = Map.get(context, :chat_id) || Map.get(context, "chat_id")
    user_id = Map.get(context, :user_id) || Map.get(context, "user_id")

    AgentTrace.log("agent.directive.invalid", %{
      tenant_id: tenant_id,
      chat_id: chat_id,
      user_id: user_id,
      reason: inspect(reason),
      directive: inspect(directive)
    })
  end

  defp directive_idempotency_key(tenant_id, conversation_id, directive_type, payload) do
    [tenant_id, conversation_id, directive_type, Jason.encode!(payload)]
    |> Enum.join(":")
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp runtime_identity(context) do
    tenant_id = Map.get(context, :tenant_id) || Map.get(context, "tenant_id")
    user_id = Map.get(context, :user_id) || Map.get(context, "user_id")
    chat_id = Map.get(context, :chat_id) || Map.get(context, "chat_id")

    cond do
      not is_integer(tenant_id) -> {:error, :invalid_tenant_id}
      not is_integer(user_id) -> {:error, :invalid_user_id}
      not is_binary(chat_id) -> {:error, :invalid_chat_id}
      true -> {:ok, tenant_id, user_id, chat_id}
    end
  end

  defp maybe_send_telegram_message(chat_id, message, context) do
    if telegram_channel?(context) do
      _ = Telegram.send_message(chat_id, message)
    end

    :ok
  end

  defp telegram_channel?(context) do
    channel = Map.get(context, :channel) || Map.get(context, "channel")

    case channel do
      nil -> true
      "telegram" -> true
      :telegram -> true
      _ -> false
    end
  end

  defp normalize_map(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_map(_map), do: %{}
end
