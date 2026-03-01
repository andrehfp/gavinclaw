defmodule Cazu.Tools.Helpers do
  @moduledoc false

  alias Cazu.Connectors.ContaAzul

  def call(context, method, path, opts \\ []) do
    ContaAzul.request(
      context.integration,
      method,
      path,
      Keyword.put_new(opts, :idempotency_key, context.idempotency_key)
    )
  end

  def normalize_args(args) when is_map(args),
    do: Map.new(args, fn {key, value} -> {to_string(key), value} end)

  def require_arg(args, keys) do
    keys
    |> Enum.find_value(fn key ->
      case Map.get(args, key) do
        nil -> nil
        "" -> nil
        value -> value
      end
    end)
    |> case do
      nil -> {:error, {:missing_required_argument, List.first(keys)}}
      value -> {:ok, value}
    end
  end

  def require_non_empty_string(args, keys) do
    with {:ok, value} <- require_arg(args, keys),
         true <- is_binary(value),
         trimmed when trimmed != "" <- String.trim(value) do
      {:ok, trimmed}
    else
      _ -> {:error, {:missing_required_argument, List.first(keys)}}
    end
  end

  def require_non_empty_list(args, keys) do
    with {:ok, value} <- require_arg(args, keys),
         true <- is_list(value),
         true <- value != [] do
      {:ok, value}
    else
      _ -> {:error, {:missing_required_argument, List.first(keys)}}
    end
  end

  def body(args, drop_keys \\ []) do
    args
    |> drop_keys(["confirm" | drop_keys])
  end

  def params(args, drop_keys \\ []) do
    args
    |> drop_keys(["confirm" | drop_keys])
  end

  def drop_keys(map, keys), do: Enum.reduce(keys, map, &Map.delete(&2, &1))
end
