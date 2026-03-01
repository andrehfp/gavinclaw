defmodule Cazu.Tools.Charge do
  @moduledoc """
  Charge (Cobrancas) tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  @charge_types MapSet.new(["LINK_PAGAMENTO", "PIX_COBRANCA", "BOLETO"])

  def create(args, context) do
    normalized =
      args
      |> H.normalize_args()
      |> normalize_charge_payload()

    with {:ok, _} <- H.require_arg(normalized, ["conta_bancaria"]),
         {:ok, _} <- H.require_non_empty_string(normalized, ["descricao_fatura"]),
         {:ok, _} <- H.require_arg(normalized, ["id_parcela"]),
         {:ok, _} <- H.require_non_empty_string(normalized, ["data_vencimento"]),
         {:ok, _} <- validate_charge_type(normalized) do
      H.call(context, :post, "/financeiro/eventos-financeiros/contas-a-receber/gerar-cobranca",
        json: H.body(normalized)
      )
    end
  end

  def get(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, charge_id} <- H.require_arg(normalized, ["id_cobranca", "charge_id", "id"]) do
      H.call(
        context,
        :get,
        "/financeiro/eventos-financeiros/contas-a-receber/cobranca/#{charge_id}"
      )
    end
  end

  def delete(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, charge_id} <- H.require_arg(normalized, ["id_cobranca", "charge_id", "id"]) do
      H.call(
        context,
        :delete,
        "/financeiro/eventos-financeiros/contas-a-receber/cobranca/#{charge_id}"
      )
    end
  end

  defp normalize_charge_payload(args) when is_map(args) do
    parcel_id = Map.get(args, "id_parcela") || Map.get(args, "parcela_id")

    args
    |> maybe_put("id_parcela", parcel_id)
    |> Map.delete("parcela_id")
  end

  defp normalize_charge_payload(args), do: args

  defp validate_charge_type(args) do
    case H.require_non_empty_string(args, ["tipo"]) do
      {:ok, type} ->
        if MapSet.member?(@charge_types, type) do
          {:ok, type}
        else
          {:error, {:invalid_argument, "tipo"}}
        end

      error ->
        error
    end
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
