defmodule Cazu.Tools.Inventory do
  @moduledoc """
  Inventory (Produto) tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  def create_product(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, _} <- H.require_non_empty_string(normalized, ["nome"]) do
      H.call(context, :post, "/produtos", json: H.body(normalized))
    end
  end

  def list_products(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/produtos", params: H.params(normalized))
  end

  def deactivate_products(_args, _context),
    do: {:error, {:unsupported_by_official_api, "inventory.deactivate_products"}}

  def delete_product(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, product_id} <- H.require_arg(normalized, ["id", "product_id"]) do
      H.call(context, :delete, "/produtos/#{product_id}")
    end
  end
end
