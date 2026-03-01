defmodule Cazu.Tools.Protocol do
  @moduledoc """
  Protocol tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  def get(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, protocol_id} <- H.require_arg(normalized, ["id", "protocol_id"]) do
      H.call(context, :get, "/protocolo/#{protocol_id}")
    end
  end
end
