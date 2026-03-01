defmodule Cazu.Tools.Invoice do
  @moduledoc """
  Invoice tool implementations backed by Conta Azul APIs.

  These endpoints are currently documented in the open-api docs section.
  """

  alias Cazu.Tools.Helpers, as: H

  @max_date_range_days 15

  def list(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, params} <- validate_invoice_range(normalized, "data_inicial", "data_final") do
      H.call(context, :get, "/notas-fiscais", params: H.params(params))
    end
  end

  def list_service(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, params} <-
           validate_invoice_range(normalized, "data_competencia_de", "data_competencia_ate") do
      H.call(context, :get, "/notas-fiscais-servico", params: H.params(params))
    end
  end

  def link_mdfe(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, _} <- H.require_non_empty_list(normalized, ["chaves_acesso"]),
         {:ok, _} <- H.require_non_empty_string(normalized, ["identificador"]) do
      H.call(context, :post, "/notas-fiscais/vinculo-mdfe", json: H.body(normalized))
    end
  end

  def get_by_key(args, context) do
    normalized = H.normalize_args(args)

    with {:ok, chave} <- H.require_arg(normalized, ["chave", "key", "id"]) do
      H.call(context, :get, "/notas-fiscais/#{chave}")
    end
  end

  defp validate_invoice_range(args, from_key, to_key) do
    with {:ok, from_value} <- H.require_non_empty_string(args, [from_key]),
         {:ok, to_value} <- H.require_non_empty_string(args, [to_key]),
         {:ok, from_date} <- parse_date(from_value, from_key),
         {:ok, to_date} <- parse_date(to_value, to_key),
         :ok <- validate_date_range(from_date, to_date) do
      {:ok, args}
    end
  end

  defp parse_date(value, key) do
    case Date.from_iso8601(value) do
      {:ok, date} -> {:ok, date}
      _ -> {:error, {:invalid_argument, key}}
    end
  end

  defp validate_date_range(from_date, to_date) do
    range_days = Date.diff(to_date, from_date)

    cond do
      range_days < 0 ->
        {:error, {:invalid_argument, "data_intervalo"}}

      range_days > @max_date_range_days ->
        {:error, {:invalid_argument, "date_range_max_15_days"}}

      true ->
        :ok
    end
  end
end
