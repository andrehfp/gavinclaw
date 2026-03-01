defmodule Cazu.Tools.Acquittance do
  @moduledoc """
  Acquittance (Baixas) tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  def create(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, installment_id} <-
           H.require_arg(normalized, ["parcela_id", "installment_id", "id_parcela", "id"]),
         {:ok, payment_date} <- H.require_non_empty_string(normalized, ["data_pagamento"]),
         :ok <- validate_payment_date(payment_date),
         {:ok, _} <- H.require_arg(normalized, ["conta_financeira"]),
         {:ok, _} <- H.require_arg(normalized, ["composicao_valor"]) do
      body = H.body(normalized, ["parcela_id", "installment_id", "id_parcela", "id"])

      H.call(context, :post, "/financeiro/eventos-financeiros/parcelas/#{installment_id}/baixa",
        json: body
      )
    end
  end

  def list(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, installment_id} <-
           H.require_arg(normalized, ["parcela_id", "installment_id", "id_parcela", "id"]) do
      H.call(context, :get, "/financeiro/eventos-financeiros/parcelas/#{installment_id}/baixa")
    end
  end

  def get(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, acquittance_id} <- H.require_arg(normalized, ["baixa_id", "acquittance_id", "id"]) do
      H.call(context, :get, "/financeiro/eventos-financeiros/parcelas/baixa/#{acquittance_id}")
    end
  end

  def update(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, acquittance_id} <- H.require_arg(normalized, ["baixa_id", "acquittance_id", "id"]),
         {:ok, _} <- H.require_arg(normalized, ["versao", "version"]) do
      body = H.body(normalized, ["baixa_id", "acquittance_id", "id"])

      H.call(context, :patch, "/financeiro/eventos-financeiros/parcelas/baixa/#{acquittance_id}",
        json: body
      )
    end
  end

  def delete(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, acquittance_id} <- H.require_arg(normalized, ["baixa_id", "acquittance_id", "id"]) do
      H.call(context, :delete, "/financeiro/eventos-financeiros/parcelas/baixa/#{acquittance_id}")
    end
  end

  defp validate_payment_date(value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        if Date.compare(date, Date.utc_today()) == :gt do
          {:error, {:invalid_argument, "data_pagamento"}}
        else
          :ok
        end

      _ ->
        {:error, {:invalid_argument, "data_pagamento"}}
    end
  end
end
