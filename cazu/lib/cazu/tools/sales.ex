defmodule Cazu.Tools.Sales do
  @moduledoc """
  Sales tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  def create(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :post, "/venda", json: H.body(normalized))
  end

  def search(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/venda/busca", params: H.params(normalized))
  end

  def delete_batch(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :post, "/venda/exclusao-lote", json: H.body(normalized))
  end

  def next_number(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/venda/proximo-numero", params: H.params(normalized))
  end

  def list_sellers(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/venda/vendedores", params: H.params(normalized))
  end

  def get_items(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, sale_id} <- H.require_arg(normalized, ["id_venda", "sale_id", "id"]) do
      H.call(context, :get, "/venda/#{sale_id}/itens")
    end
  end

  def get(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, sale_id} <- H.require_arg(normalized, ["id", "sale_id", "id_venda"]) do
      H.call(context, :get, "/venda/#{sale_id}")
    end
  end

  def update(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, sale_id} <- H.require_arg(normalized, ["id", "sale_id", "id_venda"]) do
      body = H.body(normalized, ["id", "sale_id", "id_venda"])
      H.call(context, :put, "/venda/#{sale_id}", json: body)
    end
  end

  def print_pdf(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, sale_id} <- H.require_arg(normalized, ["id", "sale_id", "id_venda"]) do
      H.call(context, :get, "/venda/#{sale_id}/imprimir")
    end
  end
end
