defmodule Cazu.Tools.Acquittance do
  @moduledoc """
  Acquittance (Baixas) tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Tools.Helpers, as: H

  @acquittance_payment_methods [
    "DINHEIRO",
    "CARTAO_CREDITO",
    "BOLETO_BANCARIO",
    "CARTAO_CREDITO_VIA_LINK",
    "CHEQUE",
    "CARTAO_DEBITO",
    "TRANSFERENCIA_BANCARIA",
    "OUTRO",
    "CARTEIRA_DIGITAL",
    "CASHBACK",
    "CREDITO_LOJA",
    "CREDITO_VIRTUAL",
    "DEPOSITO_BANCARIO",
    "PIX_PAGAMENTO_INSTANTANEO"
  ]

  @acquittance_payment_method_aliases @acquittance_payment_methods
                                      |> Enum.into(%{}, fn method -> {method, method} end)
                                      |> Map.merge(%{
                                        "ESPECIE" => "DINHEIRO",
                                        "DINHEIRO_EM_ESPECIE" => "DINHEIRO",
                                        "CARTAO" => "CARTAO_CREDITO",
                                        "CARTAO_DE_CREDITO" => "CARTAO_CREDITO",
                                        "BOLETO" => "BOLETO_BANCARIO",
                                        "LINK_PAGAMENTO" => "CARTAO_CREDITO_VIA_LINK",
                                        "CARTAO_CREDITO_LINK" => "CARTAO_CREDITO_VIA_LINK",
                                        "CARTAO_DE_DEBITO" => "CARTAO_DEBITO",
                                        "TRANSFERENCIA" => "TRANSFERENCIA_BANCARIA",
                                        "TED" => "TRANSFERENCIA_BANCARIA",
                                        "DOC" => "TRANSFERENCIA_BANCARIA",
                                        "OUTROS" => "OUTRO",
                                        "CARTEIRA" => "CARTEIRA_DIGITAL",
                                        "WALLET" => "CARTEIRA_DIGITAL",
                                        "CREDITO_DE_LOJA" => "CREDITO_LOJA",
                                        "DEPOSITO" => "DEPOSITO_BANCARIO",
                                        "PIX" => "PIX_PAGAMENTO_INSTANTANEO",
                                        "PIX_INSTANTANEO" => "PIX_PAGAMENTO_INSTANTANEO"
                                      })

  def create(args, context) do
    normalized =
      args
      |> H.normalize_args()
      |> normalize_create_payload()

    with {:ok, normalized} <- normalize_payment_method(normalized),
         {:ok, installment_id} <-
           H.require_arg(normalized, ["parcela_id", "installment_id", "id_parcela", "id"]),
         {:ok, payment_date} <- H.require_non_empty_string(normalized, ["data_pagamento"]),
         :ok <- validate_payment_date(payment_date),
         {:ok, financial_account_id} <- resolve_financial_account_id(normalized, context),
         {:ok, _} <- H.require_arg(normalized, ["composicao_valor"]) do
      body =
        normalized
        |> H.body(["parcela_id", "installment_id", "id_parcela", "id"])
        |> Map.put("conta_financeira", financial_account_id)

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
    normalized =
      args
      |> H.normalize_args()
      |> normalize_create_payload()

    with {:ok, normalized} <- normalize_payment_method(normalized),
         {:ok, acquittance_id} <- H.require_arg(normalized, ["baixa_id", "acquittance_id", "id"]),
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

  defp normalize_create_payload(args) do
    args
    |> normalize_payment_date()
    |> normalize_value_composition()
  end

  defp normalize_payment_method(args) do
    case Map.get(args, "metodo_pagamento") do
      nil ->
        {:ok, args}

      value when is_binary(value) ->
        trimmed = String.trim(value)

        cond do
          trimmed == "" ->
            {:ok, Map.delete(args, "metodo_pagamento")}

          true ->
            case payment_method_to_enum(trimmed) do
              nil -> {:error, {:invalid_argument, "metodo_pagamento"}}
              method -> {:ok, Map.put(args, "metodo_pagamento", method)}
            end
        end

      _ ->
        {:error, {:invalid_argument, "metodo_pagamento"}}
    end
  end

  defp payment_method_to_enum(value) do
    value
    |> normalize_enum_token()
    |> then(&Map.get(@acquittance_payment_method_aliases, &1))
  end

  defp normalize_enum_token(value) do
    value
    |> to_string()
    |> String.upcase()
    |> String.normalize(:nfd)
    |> String.replace(~r/[\p{Mn}]/u, "")
    |> String.replace(~r/[^A-Z0-9]+/u, "_")
    |> String.replace(~r/_+/, "_")
    |> String.trim("_")
  end

  defp normalize_payment_date(args) do
    case Map.get(args, "data_pagamento") do
      value when is_binary(value) ->
        Map.put(args, "data_pagamento", normalize_payment_date_value(value))

      _ ->
        args
    end
  end

  defp normalize_payment_date_value(value) when is_binary(value) do
    trimmed = String.trim(value)

    cond do
      trimmed == "" ->
        ""

      today_alias?(trimmed) ->
        Date.utc_today() |> Date.to_iso8601()

      Regex.match?(~r/^\d{2}\/\d{2}\/\d{4}$/, trimmed) ->
        [day, month, year] = String.split(trimmed, "/")
        "#{year}-#{month}-#{day}"

      Regex.match?(~r/^\d{2}-\d{2}-\d{4}$/, trimmed) ->
        [day, month, year] = String.split(trimmed, "-")
        "#{year}-#{month}-#{day}"

      true ->
        trimmed
    end
  end

  defp normalize_value_composition(args) do
    existing_composition =
      case Map.get(args, "composicao_valor") do
        value when is_map(value) -> H.normalize_args(value)
        _ -> %{}
      end

    composition =
      existing_composition
      |> maybe_put("valor_bruto", Map.get(args, "valor_bruto") || Map.get(args, "valor"))
      |> maybe_put("multa", Map.get(args, "multa"))
      |> maybe_put("juros", Map.get(args, "juros"))
      |> maybe_put("desconto", Map.get(args, "desconto"))
      |> maybe_put("taxa", Map.get(args, "taxa"))

    if present_value?(Map.get(composition, "valor_bruto")) do
      Map.put(args, "composicao_valor", composition)
    else
      args
    end
  end

  defp resolve_financial_account_id(args, context) do
    with {:ok, raw_account} <- H.require_arg(args, ["conta_financeira"]) do
      cond do
        is_map(raw_account) ->
          raw_account
          |> H.normalize_args()
          |> H.require_non_empty_string(["id"])
          |> case do
            {:ok, id} -> {:ok, id}
            _ -> {:error, {:invalid_argument, "conta_financeira"}}
          end

        is_integer(raw_account) ->
          {:ok, Integer.to_string(raw_account)}

        is_binary(raw_account) ->
          normalized = String.trim(raw_account)

          cond do
            normalized == "" ->
              {:error, {:missing_required_argument, "conta_financeira"}}

            looks_like_uuid?(normalized) ->
              {:ok, normalized}

            true ->
              resolve_financial_account_id_by_name(normalized, context)
          end

        true ->
          {:error, {:invalid_argument, "conta_financeira"}}
      end
    end
  end

  defp resolve_financial_account_id_by_name(name, context) do
    case list_financial_accounts(context) do
      {:ok, accounts} ->
        case match_financial_account(accounts, name) do
          {:ok, id} -> {:ok, id}
          {:error, :not_found} -> {:error, {:invalid_argument, "conta_financeira"}}
          {:error, :ambiguous} -> {:error, {:ambiguous_argument, "conta_financeira"}}
        end

      other ->
        other
    end
  end

  defp list_financial_accounts(context) do
    case call_with_fallback(
           context,
           :get,
           "/conta-financeira",
           "/financeiro/contas-financeiras",
           []
         ) do
      {:ok, %{"items" => items}} when is_list(items) -> {:ok, items}
      {:ok, %{"itens" => items}} when is_list(items) -> {:ok, items}
      {:ok, items} when is_list(items) -> {:ok, items}
      {:ok, _} -> {:ok, []}
      other -> other
    end
  end

  defp call_with_fallback(context, method, primary_path, fallback_path, opts) do
    case H.call(context, method, primary_path, opts) do
      {:error, %{status: 404}} ->
        H.call(context, method, fallback_path, opts)

      other ->
        other
    end
  end

  defp match_financial_account(accounts, target_name) do
    normalized_target = normalize_text(target_name)

    candidates =
      accounts
      |> Enum.filter(&is_map/1)
      |> Enum.map(&normalize_financial_account/1)
      |> Enum.reject(&is_nil/1)

    exact_matches = Enum.filter(candidates, &(&1.normalized_name == normalized_target))

    cond do
      exact_matches != [] ->
        choose_financial_account(exact_matches)

      true ->
        partial_matches =
          Enum.filter(candidates, fn candidate ->
            String.contains?(candidate.normalized_name, normalized_target) or
              String.contains?(normalized_target, candidate.normalized_name)
          end)

        choose_financial_account(partial_matches)
    end
  end

  defp choose_financial_account([]), do: {:error, :not_found}

  defp choose_financial_account(matches) do
    active_matches = Enum.filter(matches, & &1.active?)

    cond do
      length(active_matches) == 1 ->
        [%{id: id}] = active_matches
        {:ok, id}

      length(matches) == 1 ->
        [%{id: id}] = matches
        {:ok, id}

      true ->
        {:error, :ambiguous}
    end
  end

  defp normalize_financial_account(account) do
    normalized = H.normalize_args(account)

    id = Map.get(normalized, "id")
    name = Map.get(normalized, "nome") || Map.get(normalized, "name")

    if present_value?(id) and present_value?(name) do
      %{
        id: to_string(id),
        normalized_name: normalize_text(to_string(name)),
        active?: account_active?(normalized)
      }
    else
      nil
    end
  end

  defp account_active?(account) do
    cond do
      is_boolean(Map.get(account, "ativo")) ->
        Map.get(account, "ativo")

      is_boolean(Map.get(account, "active")) ->
        Map.get(account, "active")

      is_binary(Map.get(account, "status")) ->
        status = Map.get(account, "status") |> to_string() |> String.downcase()

        cond do
          String.contains?(status, "inativ") -> false
          String.contains?(status, "ativ") -> true
          true -> true
        end

      true ->
        true
    end
  end

  defp looks_like_uuid?(value) do
    Regex.match?(
      ~r/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      value
    )
  end

  defp normalize_text(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.normalize(:nfd)
    |> String.replace(~r/[\p{Mn}]/u, "")
    |> String.replace(~r/[^a-z0-9\s]/u, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp today_alias?(value) do
    normalized =
      value
      |> String.downcase()
      |> String.normalize(:nfd)
      |> String.replace(~r/[\p{Mn}]/u, "")
      |> String.trim()

    normalized in ["hoje", "today", "agora"]
  end

  defp present_value?(value) when is_binary(value), do: String.trim(value) != ""
  defp present_value?(value), do: not is_nil(value)

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map

  defp maybe_put(map, key, value) do
    if present_value?(Map.get(map, key)) do
      map
    else
      Map.put(map, key, value)
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
