defmodule Cazu.AgentTrace do
  @moduledoc """
  Lightweight JSONL tracing for agent conversations and tool orchestration.

  Enable with:
    AGENT_TRACE_ENABLED=true
  Optional path:
    AGENT_TRACE_PATH=output/agent_trace.jsonl
  """

  require Logger

  @default_path "output/agent_trace.jsonl"
  @max_string_len 20_000
  @redacted_keys MapSet.new([
                   "authorization",
                   "api_key",
                   "access_token",
                   "refresh_token",
                   "client_secret"
                 ])

  def log(event, attrs \\ %{})

  def log(event, attrs) when is_atom(event), do: log(to_string(event), attrs)

  def log(event, attrs) when is_binary(event) and is_map(attrs) do
    if enabled?() do
      payload =
        attrs
        |> sanitize_map()
        |> Map.put("event", event)
        |> Map.put_new(
          "at",
          DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
        )

      write_line(payload)
    else
      :ok
    end
  end

  def enabled? do
    config = Application.get_env(:cazu, :agent_trace, [])
    Keyword.get(config, :enabled, false)
  end

  defp path do
    config = Application.get_env(:cazu, :agent_trace, [])
    Keyword.get(config, :path, @default_path)
  end

  defp write_line(payload) do
    encoded = Jason.encode!(payload) <> "\n"
    trace_path = path()

    with :ok <- File.mkdir_p(Path.dirname(trace_path)),
         :ok <- File.write(trace_path, encoded, [:append]) do
      :ok
    else
      {:error, reason} ->
        Logger.debug("agent_trace write failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp sanitize_map(map) when is_map(map) do
    Map.new(map, fn {key, value} ->
      normalized_key = to_string(key)
      {normalized_key, sanitize_value(normalized_key, value)}
    end)
  end

  defp sanitize_value(key, value) do
    if MapSet.member?(@redacted_keys, key) do
      "[REDACTED]"
    else
      sanitize_non_sensitive_value(value)
    end
  end

  defp sanitize_non_sensitive_value(value) when is_map(value), do: sanitize_map(value)

  defp sanitize_non_sensitive_value(value) when is_list(value) do
    Enum.map(value, &sanitize_value("", &1))
  end

  defp sanitize_non_sensitive_value(value) when is_binary(value) do
    if String.length(value) <= @max_string_len do
      value
    else
      String.slice(value, 0, @max_string_len) <> "...[truncated]"
    end
  end

  defp sanitize_non_sensitive_value(value), do: value
end
