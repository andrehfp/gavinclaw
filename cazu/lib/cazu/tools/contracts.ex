defmodule Cazu.Tools.Contracts do
  @moduledoc """
  Contracts tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  def list(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/contratos", params: H.params(normalized))
  end

  def create(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :post, "/contratos", json: H.body(normalized))
  end

  def next_number(args, context) do
    normalized = H.normalize_args(args)
    H.call(context, :get, "/contratos/proximo-numero", params: H.params(normalized))
  end
end
