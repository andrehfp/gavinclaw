defmodule Cazu.Tools.Service do
  @moduledoc """
  Service tool implementations backed by Conta Azul APIs.

  These endpoints are currently documented in the open-api docs section.
  """

  alias Cazu.Tools.Helpers, as: H

  def list(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/servicos", params: H.params(normalized))
  end

  def create(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, _} <- H.require_non_empty_string(normalized, ["descricao"]) do
      H.call(context, :post, "/servicos", json: H.body(normalized))
    end
  end

  def delete_batch(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, ids} <- require_service_ids(normalized) do
      body = normalized |> H.body() |> Map.put("ids", ids)
      H.call(context, :delete, "/servicos", json: body)
    end
  end

  def get(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, service_id} <- H.require_arg(normalized, ["id", "service_id"]) do
      H.call(context, :get, "/servicos/#{service_id}")
    end
  end

  def update(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, service_id} <- H.require_arg(normalized, ["id", "service_id"]) do
      body = H.body(normalized, ["id", "service_id"])
      H.call(context, :patch, "/servicos/#{service_id}", json: body)
    end
  end

  defp require_service_ids(args) do
    with {:ok, ids} <- H.require_non_empty_list(args, ["ids"]),
         {:ok, normalized_ids} <- normalize_service_ids(ids) do
      {:ok, normalized_ids}
    end
  end

  defp normalize_service_ids(ids) when is_list(ids) do
    ids
    |> Enum.map(&normalize_service_id/1)
    |> Enum.reduce_while({:ok, []}, fn
      {:ok, id}, {:ok, acc} -> {:cont, {:ok, [id | acc]}}
      {:error, reason}, _acc -> {:halt, {:error, reason}}
    end)
    |> case do
      {:ok, normalized} -> {:ok, Enum.reverse(normalized)}
      other -> other
    end
  end

  defp normalize_service_ids(_ids), do: {:error, {:invalid_argument, "ids"}}

  defp normalize_service_id(id) when is_integer(id), do: {:ok, id}

  defp normalize_service_id(id) when is_binary(id) do
    case Integer.parse(String.trim(id)) do
      {parsed, ""} -> {:ok, parsed}
      _ -> {:error, {:invalid_argument, "ids"}}
    end
  end

  defp normalize_service_id(_id), do: {:error, {:invalid_argument, "ids"}}
end
