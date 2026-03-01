defmodule Cazu.Orchestrator do
  @moduledoc """
  Tool call orchestration helpers: parsing, validation, persistence, and queueing.
  """

  alias Cazu.AgentTrace
  alias Cazu.Audit
  alias Cazu.AgentChatStream
  alias Cazu.Operations
  alias Cazu.Operations.Job
  alias Cazu.Operations.ToolCall
  alias Cazu.Policies
  alias Cazu.Repo
  alias Cazu.Telegram
  alias Cazu.Tenancy
  alias Cazu.Tools
  alias Cazu.Workers.ToolExecutionWorker
  alias Ecto.Multi

  def handle_telegram_update(payload) when is_map(payload) do
    with {:ok, update} <- Telegram.parse_update(payload),
         {:ok, tool_name, arguments} <- parse_legacy_tool_command(update.text),
         {:ok, tenant} <- Tenancy.get_or_create_telegram_tenant(update.chat_id),
         {:ok, user} <-
           Tenancy.get_or_create_telegram_user(tenant, update.telegram_user_id, %{
             "name" => update.user_name
           }),
         :ok <- Policies.validate_tool_call(user, tool_name, arguments),
         :ok <- enqueue_tool_call(tenant.id, user.id, update.chat_id, tool_name, arguments) do
      :ok
    else
      {:error, :unsupported_update} ->
        :ignore

      {:error, :unsupported_tool} ->
        :ignore

      {:error, :confirmation_required} ->
        _ =
          Telegram.send_message(
            extract_chat_id(payload),
            "This command changes data. Please send it with \"confirm\": true."
          )

        :ok

      {:error, reason} ->
        _ =
          Telegram.send_message(
            extract_chat_id(payload),
            "Could not process request: #{inspect(reason)}"
          )

        :ok
    end
  end

  def enqueue_tool_call(tenant_id, user_id, chat_id, tool_name, arguments, execution_meta \\ %{})
      when is_integer(tenant_id) and is_integer(user_id) and is_binary(chat_id) and
             is_binary(tool_name) and
             is_map(arguments) and is_map(execution_meta) do
    with :ok <- ensure_supported_tool(tool_name) do
      do_enqueue_tool_call(tenant_id, user_id, chat_id, tool_name, arguments, execution_meta)
    end
  end

  def parse_legacy_tool_command(text) when is_binary(text) do
    case String.split(text, ~r/\s+/, parts: 2, trim: true) do
      [raw_tool_name] ->
        tool_name = normalize_tool_name(raw_tool_name)

        with :ok <- ensure_supported_tool(tool_name) do
          {:ok, tool_name, %{}}
        end

      [raw_tool_name, raw_arguments] ->
        with {:ok, arguments} <- parse_arguments(raw_arguments) do
          tool_name = normalize_tool_name(raw_tool_name)

          with :ok <- ensure_supported_tool(tool_name) do
            {:ok, tool_name, arguments}
          end
        end

      _ ->
        {:error, :unsupported_tool}
    end
  end

  defp do_enqueue_tool_call(tenant_id, user_id, chat_id, tool_name, arguments, execution_meta) do
    normalized_execution_meta = normalize_execution_meta(execution_meta)

    idempotency_key =
      idempotency_key(tenant_id, tool_name, arguments, normalized_execution_meta)

    _ =
      AgentTrace.log("orchestrator.enqueue_attempt", %{
        tenant_id: tenant_id,
        user_id: user_id,
        chat_id: chat_id,
        tool_name: tool_name,
        arguments: arguments,
        idempotency_key: idempotency_key,
        execution_meta: normalized_execution_meta
      })

    case Operations.find_tool_call_by_idempotency(tenant_id, idempotency_key) do
      %ToolCall{status: "failed"} = existing ->
        _ =
          AgentTrace.log("orchestrator.enqueue_idempotency_match", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            tool_name: tool_name,
            existing_tool_call_id: existing.id,
            existing_status: existing.status,
            action: "retry_failed"
          })

        with {:ok, _oban_job} <-
               enqueue_existing_tool_call(existing, chat_id, normalized_execution_meta) do
          _ = Telegram.send_message(chat_id, "Retrying #{tool_name} after previous failure.")

          _ =
            AgentChatStream.broadcast_tool_call(tenant_id, chat_id, %{
              tool_call_id: existing.id,
              job_id: existing.job_id,
              tool_name: existing.name,
              status: "queued",
              arguments: existing.arguments
            })

          :ok
        else
          {:error, reason} -> {:error, reason}
        end

      %ToolCall{status: "running", finished_at: finished_at} = existing
      when not is_nil(finished_at) ->
        _ =
          AgentTrace.log("orchestrator.enqueue_idempotency_match", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            tool_name: tool_name,
            existing_tool_call_id: existing.id,
            existing_status: existing.status,
            action: "retry_stale_running"
          })

        with {:ok, _oban_job} <-
               enqueue_existing_tool_call(existing, chat_id, normalized_execution_meta) do
          _ = Telegram.send_message(chat_id, "Retomando #{tool_name}.")

          _ =
            AgentChatStream.broadcast_tool_call(tenant_id, chat_id, %{
              tool_call_id: existing.id,
              job_id: existing.job_id,
              tool_name: existing.name,
              status: "queued",
              arguments: existing.arguments
            })

          :ok
        else
          {:error, reason} -> {:error, reason}
        end

      %ToolCall{} = existing ->
        _ =
          AgentTrace.log("orchestrator.enqueue_idempotency_match", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            tool_name: tool_name,
            existing_tool_call_id: existing.id,
            existing_status: existing.status,
            action: "reuse_existing"
          })

        _ =
          Telegram.send_message(
            chat_id,
            duplicate_tool_call_message(existing.status)
          )

        _ =
          AgentChatStream.broadcast_tool_call(tenant_id, chat_id, %{
            tool_call_id: existing.id,
            job_id: existing.job_id,
            tool_name: existing.name,
            status: existing.status,
            arguments: existing.arguments,
            result: existing.result,
            error_reason: existing.error_reason
          })

        :ok

      nil ->
        _ =
          AgentTrace.log("orchestrator.enqueue_new", %{
            tenant_id: tenant_id,
            chat_id: chat_id,
            tool_name: tool_name,
            idempotency_key: idempotency_key
          })

        with {:ok, %{job: job, tool_call: tool_call}} <-
               create_job_and_tool_call(tenant_id, user_id, tool_name, arguments, idempotency_key),
             {:ok, _oban_job} <-
               Oban.insert(
                 ToolExecutionWorker.new(
                   build_tool_job_args(tool_call.id, chat_id, normalized_execution_meta)
                 )
               ),
             {:ok, _event} <-
               Audit.record_event(job, "tool.enqueued", %{
                 "tool_call_id" => tool_call.id,
                 "tool" => tool_name
               }) do
          _ = Telegram.send_message(chat_id, "Queued #{tool_name}.")

          _ =
            AgentChatStream.broadcast_tool_call(tenant_id, chat_id, %{
              tool_call_id: tool_call.id,
              job_id: job.id,
              tool_name: tool_name,
              status: tool_call.status,
              arguments: tool_call.arguments
            })

          :ok
        else
          {:error, _step, reason, _changes_so_far} ->
            {:error, reason}

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  defp create_job_and_tool_call(tenant_id, user_id, tool_name, arguments, idempotency_key) do
    Multi.new()
    |> Multi.insert(
      :job,
      Job.changeset(%Job{}, %{
        tenant_id: tenant_id,
        user_id: user_id,
        channel: "telegram",
        status: "queued",
        intent: tool_name,
        input_payload: arguments
      })
    )
    |> Multi.insert(:tool_call, fn %{job: job} ->
      ToolCall.changeset(%ToolCall{}, %{
        tenant_id: tenant_id,
        job_id: job.id,
        name: tool_name,
        confirm: Map.get(arguments, "confirm") in [true, "true"],
        idempotency_key: idempotency_key,
        arguments: arguments,
        status: "queued"
      })
    end)
    |> Repo.transaction()
  end

  defp ensure_supported_tool(tool_name) do
    if Tools.supported_tool?(tool_name), do: :ok, else: {:error, :unsupported_tool}
  end

  defp parse_arguments(raw_arguments) do
    case Jason.decode(raw_arguments) do
      {:ok, arguments} when is_map(arguments) -> {:ok, arguments}
      {:ok, _} -> {:error, :invalid_arguments}
      {:error, _} -> {:error, :invalid_json_arguments}
    end
  end

  defp normalize_tool_name(raw_tool_name), do: String.trim_leading(raw_tool_name, "/")

  defp build_tool_job_args(tool_call_id, chat_id, execution_meta) do
    %{"tool_call_id" => tool_call_id, "chat_id" => chat_id}
    |> Map.merge(execution_meta)
  end

  defp enqueue_existing_tool_call(existing_tool_call, chat_id, execution_meta) do
    Oban.insert(
      ToolExecutionWorker.new(build_tool_job_args(existing_tool_call.id, chat_id, execution_meta))
    )
  end

  defp normalize_execution_meta(meta) when is_map(meta) do
    llm_response_id =
      Map.get(meta, "llm_response_id") ||
        Map.get(meta, :llm_response_id) ||
        Map.get(meta, "response_id") ||
        Map.get(meta, :response_id)

    llm_tool_call_id =
      Map.get(meta, "llm_tool_call_id") ||
        Map.get(meta, :llm_tool_call_id) ||
        Map.get(meta, "call_id") ||
        Map.get(meta, :call_id)

    %{}
    |> maybe_put_meta("llm_response_id", llm_response_id)
    |> maybe_put_meta("llm_tool_call_id", llm_tool_call_id)
  end

  defp normalize_execution_meta(_meta), do: %{}

  defp maybe_put_meta(map, _key, value) when not is_binary(value) or value == "", do: map
  defp maybe_put_meta(map, key, value), do: Map.put(map, key, value)

  defp idempotency_key(tenant_id, tool_name, arguments, execution_meta) do
    normalized_args = canonical(arguments)

    read_scope =
      if read_only_tool?(tool_name) do
        Map.get(execution_meta, "llm_response_id") ||
          Map.get(execution_meta, "llm_tool_call_id") ||
          Integer.to_string(System.unique_integer([:monotonic, :positive]))
      else
        nil
      end

    [tenant_id, tool_name, Jason.encode!(normalized_args), read_scope]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(":")
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp canonical(value) when is_map(value) do
    value
    |> Enum.map(fn {key, val} -> {to_string(key), canonical(val)} end)
    |> Enum.sort_by(fn {key, _val} -> key end)
    |> Map.new()
  end

  defp canonical(value) when is_list(value), do: Enum.map(value, &canonical/1)
  defp canonical(value), do: value

  defp read_only_tool?(tool_name) when is_binary(tool_name) do
    case tool_name |> String.split(".", parts: 2) do
      [_namespace, operation] ->
        operation
        |> String.split("_", parts: 2)
        |> List.first()
        |> Kernel.in(["list", "get", "search", "find", "lookup", "query"])

      _ ->
        false
    end
  end

  defp read_only_tool?(_tool_name), do: false

  defp extract_chat_id(%{"message" => %{"chat" => %{"id" => chat_id}}}), do: to_string(chat_id)
  defp extract_chat_id(_), do: ""

  defp duplicate_tool_call_message("running"), do: "Essa solicitação igual já está em andamento."
  defp duplicate_tool_call_message("queued"), do: "Essa solicitação igual já está na fila."
  defp duplicate_tool_call_message("succeeded"), do: "Essa solicitação igual já foi concluída."

  defp duplicate_tool_call_message("failed"),
    do: "A última tentativa igual falhou. Vou tentar novamente."

  defp duplicate_tool_call_message(_status), do: "Essa solicitação igual já foi registrada."
end
