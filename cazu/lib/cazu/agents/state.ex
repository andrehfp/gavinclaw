defmodule Cazu.Agents.State do
  @moduledoc """
  Helpers for building and updating the chat agent state map.
  """

  @type t :: %{
          tenant_id: integer() | nil,
          conversation_id: String.t() | nil,
          user_id: integer() | nil,
          integration_status: atom(),
          pending_confirmation: map() | nil,
          last_tool_calls: [map()],
          policy_flags: map(),
          memory_window_ref: String.t() | nil
        }

  @defaults %{
    tenant_id: nil,
    conversation_id: nil,
    user_id: nil,
    integration_status: :unknown,
    pending_confirmation: nil,
    last_tool_calls: [],
    policy_flags: %{},
    memory_window_ref: nil
  }

  @spec defaults() :: t()
  def defaults, do: @defaults

  @spec new(map()) :: t()
  def new(attrs) when is_map(attrs) do
    normalized_attrs = normalize_attrs(attrs)

    @defaults
    |> Map.merge(normalized_attrs)
    |> normalize_state()
  end

  @spec append_tool_call(t(), map()) :: t()
  def append_tool_call(state, tool_call) when is_map(state) and is_map(tool_call) do
    existing = List.wrap(state[:last_tool_calls])
    window = Enum.take(existing ++ [tool_call], -10)
    Map.put(state, :last_tool_calls, window)
  end

  @spec clear_pending_confirmation(t()) :: t()
  def clear_pending_confirmation(state) when is_map(state) do
    Map.put(state, :pending_confirmation, nil)
  end

  defp normalize_attrs(attrs) do
    Map.new(attrs, fn {key, value} -> {normalize_key(key), value} end)
  end

  defp normalize_key(key) when is_atom(key), do: key

  defp normalize_key(key) when is_binary(key) do
    case key do
      "tenant_id" -> :tenant_id
      "conversation_id" -> :conversation_id
      "user_id" -> :user_id
      "integration_status" -> :integration_status
      "pending_confirmation" -> :pending_confirmation
      "last_tool_calls" -> :last_tool_calls
      "policy_flags" -> :policy_flags
      "memory_window_ref" -> :memory_window_ref
      _ -> key
    end
  end

  defp normalize_key(key), do: key

  defp normalize_state(state) do
    state
    |> Map.update(:policy_flags, %{}, fn flags -> if is_map(flags), do: flags, else: %{} end)
    |> Map.update(:last_tool_calls, [], fn calls -> if is_list(calls), do: calls, else: [] end)
    |> Map.update(:integration_status, :unknown, &normalize_integration_status/1)
    |> Map.update(:memory_window_ref, nil, &normalize_optional_string/1)
    |> Map.update(:conversation_id, nil, &normalize_optional_string/1)
    |> Map.update(:pending_confirmation, nil, &normalize_pending_confirmation/1)
  end

  defp normalize_integration_status(status) when is_atom(status), do: status

  defp normalize_integration_status(status) when is_binary(status) do
    case status do
      "ok" -> :ok
      "reauth_required" -> :reauth_required
      "unknown" -> :unknown
      _ -> :unknown
    end
  end

  defp normalize_integration_status(_status), do: :unknown

  defp normalize_optional_string(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_optional_string(_value), do: nil

  defp normalize_pending_confirmation(nil), do: nil
  defp normalize_pending_confirmation(value) when is_map(value), do: value
  defp normalize_pending_confirmation(_value), do: nil
end
