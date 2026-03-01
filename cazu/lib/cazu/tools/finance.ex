defmodule Cazu.Tools.Finance do
  @moduledoc """
  Finance tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Connectors.ContaAzul

  def create_receivable(args, context) do
    normalized = normalize_args(args)

    with {:ok, payload} <- normalize_finance_creation_payload(normalized, :receivable) do
      call_with_fallback(
        context,
        :post,
        "/financeiro/eventos-financeiros/contas-a-receber",
        "/financeiro/contas-a-receber",
        json: payload
      )
    end
  end

  def create_payable(args, context) do
    normalized = normalize_args(args)

    with {:ok, payload} <- normalize_finance_creation_payload(normalized, :payable) do
      call_with_fallback(
        context,
        :post,
        "/financeiro/eventos-financeiros/contas-a-pagar",
        "/financeiro/contas-a-pagar",
        json: payload
      )
    end
  end

  def list_receivables(args, context) do
    normalized = normalize_args(args)
    params = normalize_search_filters(normalized)

    call_with_fallback(
      context,
      :get,
      "/financeiro/eventos-financeiros/contas-a-receber/buscar",
      "/financeiro/contas-a-receber",
      params: params
    )
  end

  def list_payables(args, context) do
    normalized = normalize_args(args)
    params = normalize_search_filters(normalized)

    call_with_fallback(
      context,
      :get,
      "/financeiro/eventos-financeiros/contas-a-pagar/buscar",
      "/financeiro/contas-a-pagar",
      params: params
    )
  end

  def list_installments(args, context) do
    normalized = normalize_args(args)

    case finance_type(normalized) do
      "payable" -> list_payables(normalized, context)
      _ -> list_receivables(normalized, context)
    end
  end

  def get_statement(args, context), do: list_installments(args, context)

  def get_installment(_args, _context),
    do: {:error, {:unsupported_by_official_api, "finance.get_installment"}}

  def get_receipt(args, context), do: get_installment(args, context)

  def update_installment(_args, _context),
    do: {:error, {:unsupported_by_official_api, "finance.update_installment"}}

  def acquit_installment(args, context), do: update_installment(args, context)

  def list_event_installments(_args, _context),
    do: {:error, {:unsupported_by_official_api, "finance.list_event_installments"}}

  def list_categories(args, context) do
    normalized = normalize_args(args)
    params = drop_keys(normalized, ["confirm"])
    call_with_fallback(context, :get, "/categorias", "/financeiro/categorias", params: params)
  end

  def list_dre_categories(args, context), do: list_categories(args, context)

  def list_cost_centers(args, context) do
    normalized = normalize_args(args)
    params = drop_keys(normalized, ["confirm"])

    call_with_fallback(
      context,
      :get,
      "/centro-de-custo",
      "/financeiro/centros-de-custo",
      params: params
    )
  end

  def create_cost_center(args, context) do
    normalized = normalize_args(args)
    body = drop_keys(normalized, ["confirm"])

    with {:ok, _} <- require_non_empty_string(body, ["nome"]) do
      call_with_fallback(
        context,
        :post,
        "/centro-de-custo",
        "/financeiro/centros-de-custo",
        json: body
      )
    end
  end

  def list_financial_accounts(args, context) do
    normalized = normalize_args(args)
    params = drop_keys(normalized, ["confirm"])

    case call_with_fallback(
           context,
           :get,
           "/conta-financeira",
           "/financeiro/contas-financeiras",
           params: params
         ) do
      {:ok, %{"items" => items} = response} when is_list(items) ->
        {:ok, %{"itens" => items, "total_itens" => length(items), "legacy" => response}}

      other ->
        other
    end
  end

  def get_financial_account_balance(args, context) do
    normalized = normalize_args(args)

    with {:ok, account_id} <-
           require_arg(normalized, [
             "id_conta_financeira",
             "financial_account_id",
             "account_id",
             "id"
           ]),
         {:ok, accounts_response} <- list_financial_accounts(%{}, context) do
      items =
        accounts_response
        |> Map.get("itens", [])
        |> Enum.filter(fn item -> is_map(item) and Map.get(item, "id") == account_id end)

      {:ok,
       %{
         "id_conta_financeira" => account_id,
         "contas_encontradas" => items,
         "warning" => "Saldo atual não está disponível na OpenAPI v1 de contas financeiras."
       }}
    end
  end

  defp call(context, method, path, opts) do
    ContaAzul.request(
      context.integration,
      method,
      path,
      Keyword.put_new(opts, :idempotency_key, context.idempotency_key)
    )
  end

  defp call_with_fallback(context, method, primary_path, fallback_path, opts) do
    case call(context, method, primary_path, opts) do
      {:error, %{status: 404}} ->
        call(context, method, fallback_path, opts)

      other ->
        other
    end
  end

  defp finance_type(args) do
    args
    |> Map.get("type", "receivable")
    |> to_string()
    |> String.downcase()
  end

  defp normalize_search_filters(args) do
    from = Map.get(args, "from")
    to = Map.get(args, "to")

    args
    |> drop_keys(["confirm", "type"])
    |> maybe_put("data_vencimento_de", from)
    |> maybe_put("data_vencimento_ate", to)
    |> normalize_datetime_filter("data_alteracao_de", :start_of_day)
    |> normalize_datetime_filter("data_alteracao_ate", :end_of_day)
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put_new(map, key, value)

  defp normalize_datetime_filter(map, key, default_time) do
    case Map.get(map, key) do
      nil ->
        map

      "" ->
        map

      value when is_binary(value) ->
        case parse_datetime_filter(value, default_time) do
          {:ok, normalized} -> Map.put(map, key, normalized)
          :error -> Map.delete(map, key)
        end

      _ ->
        Map.delete(map, key)
    end
  end

  defp parse_datetime_filter(value, default_time) do
    trimmed = String.trim(value)

    case DateTime.from_iso8601(trimmed) do
      {:ok, datetime, _offset} ->
        {:ok,
         datetime
         |> DateTime.truncate(:second)
         |> DateTime.to_naive()
         |> NaiveDateTime.to_iso8601()}

      _ ->
        case NaiveDateTime.from_iso8601(trimmed) do
          {:ok, naive} ->
            {:ok, naive |> NaiveDateTime.truncate(:second) |> NaiveDateTime.to_iso8601()}

          _ ->
            case Date.from_iso8601(trimmed) do
              {:ok, date} ->
                time = if default_time == :end_of_day, do: ~T[23:59:59], else: ~T[00:00:00]
                {:ok, NaiveDateTime.new!(date, time) |> NaiveDateTime.to_iso8601()}

              _ ->
                :error
            end
        end
    end
  end

  defp normalize_finance_creation_payload(args, direction)
       when direction in [:payable, :receivable] do
    base_args = drop_keys(args, ["confirm"])

    with {:ok, competence_date} <-
           require_arg(base_args, ["data_competencia", "competenceDate", "competence_date"]),
         {:ok, amount} <- require_number_arg(base_args, ["valor", "value"]),
         {:ok, financial_account_id} <- require_financial_account_id(base_args),
         {:ok, contact_id} <- require_finance_contact_id(base_args, direction) do
      description =
        first_present(base_args, ["descricao", "description"]) || "Lançamento financeiro"

      note = first_present(base_args, ["observacao", "observacoes", "note"]) || description

      due_date =
        first_present(base_args, ["data_vencimento", "due_date", "vencimento"]) || competence_date

      rateio = normalize_rateio(Map.get(base_args, "rateio"))

      net_amount =
        parse_optional_number(
          first_present(base_args, ["valor_liquido", "valorLiquido", "net_value", "net_amount"])
        ) || amount

      condition =
        build_payment_condition(
          base_args,
          amount,
          net_amount,
          due_date,
          description,
          note,
          financial_account_id
        )

      payload =
        %{
          "data_competencia" => competence_date,
          "valor" => amount,
          "descricao" => description,
          "observacao" => note,
          "condicao_pagamento" => condition,
          "conta_financeira" => financial_account_id
        }
        |> put_finance_contact(direction, contact_id)
        |> maybe_put("rateio", rateio)

      {:ok, payload}
    end
  end

  defp require_number_arg(args, keys) do
    with {:ok, raw_value} <- require_arg(args, keys),
         {:ok, value} <- parse_number(raw_value) do
      {:ok, value}
    end
  end

  defp parse_number(value) when is_float(value), do: {:ok, value}
  defp parse_number(value) when is_integer(value), do: {:ok, value * 1.0}

  defp parse_number(value) when is_binary(value) do
    normalized =
      value
      |> String.trim()
      |> String.replace(~r/[^\d,.\-]/u, "")
      |> normalize_number_string()

    case Float.parse(normalized) do
      {number, ""} -> {:ok, number}
      _ -> {:error, {:invalid_argument, "valor"}}
    end
  end

  defp parse_number(_value), do: {:error, {:invalid_argument, "valor"}}

  defp normalize_number_string(value) when is_binary(value) do
    has_dot = String.contains?(value, ".")
    has_comma = String.contains?(value, ",")

    cond do
      has_dot and has_comma ->
        value
        |> String.replace(".", "")
        |> String.replace(",", ".")

      has_comma ->
        String.replace(value, ",", ".")

      true ->
        value
    end
  end

  defp first_present(args, keys) do
    Enum.find_value(keys, fn key ->
      case Map.get(args, key) do
        value when is_binary(value) ->
          trimmed = String.trim(value)
          if trimmed == "", do: nil, else: trimmed

        nil ->
          nil

        value ->
          value
      end
    end)
  end

  defp extract_id(value) when is_binary(value), do: String.trim(value)
  defp extract_id(value) when is_integer(value), do: value
  defp extract_id(value) when is_float(value), do: value

  defp extract_id(value) when is_map(value) do
    first_present(value, ["id", "uuid", "id_conta_financeira", "id_contato"])
  end

  defp extract_id(_value), do: nil

  defp normalize_rateio(nil), do: nil
  defp normalize_rateio([]), do: nil

  defp normalize_rateio(rateio) when is_list(rateio) do
    normalized =
      rateio
      |> Enum.map(&normalize_rateio_item/1)
      |> Enum.reject(&is_nil/1)

    if normalized == [], do: nil, else: normalized
  end

  defp normalize_rateio(_rateio), do: nil

  defp normalize_rateio_item(item) when is_map(item) do
    amount =
      item
      |> first_present(["valor", "amount"])
      |> parse_optional_number()

    category_id =
      first_present(item, ["id_categoria", "categoria_financeira", "categoria"])
      |> extract_id()

    cost_center_rates =
      item
      |> first_present(["rateio_centro_custo", "centro_custo", "centros_custo"])
      |> normalize_rateio_cost_centers()

    if is_nil(amount) or is_nil(category_id) do
      nil
    else
      %{
        "id_categoria" => category_id,
        "valor" => amount
      }
      |> maybe_put("rateio_centro_custo", cost_center_rates)
    end
  end

  defp normalize_rateio_item(_item), do: nil

  defp normalize_rateio_cost_centers(nil), do: nil

  defp normalize_rateio_cost_centers(value) when is_map(value),
    do: normalize_rateio_cost_centers([value])

  defp normalize_rateio_cost_centers(values) when is_list(values) do
    normalized =
      values
      |> Enum.map(fn item ->
        if is_map(item) do
          center_id =
            first_present(item, ["id_centro_custo", "centro_custo"])
            |> extract_id()

          value = parse_optional_number(first_present(item, ["valor", "amount"]))

          if is_nil(center_id) do
            nil
          else
            %{"id_centro_custo" => center_id}
            |> maybe_put("valor", value)
          end
        else
          nil
        end
      end)
      |> Enum.reject(&is_nil/1)

    if normalized == [], do: nil, else: normalized
  end

  defp normalize_rateio_cost_centers(_value), do: nil

  defp parse_optional_number(nil), do: nil

  defp parse_optional_number(value) do
    case parse_number(value) do
      {:ok, number} -> number
      _ -> nil
    end
  end

  defp require_financial_account_id(args) do
    args
    |> first_present([
      "conta_financeira",
      "id_conta_financeira",
      "conta_financeira_id",
      "financial_account_id",
      "account_id"
    ])
    |> extract_id()
    |> case do
      nil -> {:error, {:missing_required_argument, "conta_financeira"}}
      "" -> {:error, {:missing_required_argument, "conta_financeira"}}
      value -> {:ok, value}
    end
  end

  defp require_finance_contact_id(args, :payable) do
    args
    |> first_present([
      "id_fornecedor",
      "fornecedor_id",
      "contato",
      "id_contato",
      "contato_id",
      "contact_id"
    ])
    |> extract_id()
    |> case do
      nil -> {:error, {:missing_required_argument, "id_fornecedor"}}
      "" -> {:error, {:missing_required_argument, "id_fornecedor"}}
      value -> {:ok, value}
    end
  end

  defp require_finance_contact_id(args, :receivable) do
    args
    |> first_present([
      "id_cliente",
      "cliente_id",
      "contato",
      "id_contato",
      "contato_id",
      "contact_id"
    ])
    |> extract_id()
    |> case do
      nil -> {:error, {:missing_required_argument, "id_cliente"}}
      "" -> {:error, {:missing_required_argument, "id_cliente"}}
      value -> {:ok, value}
    end
  end

  defp put_finance_contact(payload, :payable, contact_id) do
    payload
    |> Map.put("contato", contact_id)
    |> Map.put("id_fornecedor", contact_id)
  end

  defp put_finance_contact(payload, :receivable, contact_id) do
    payload
    |> Map.put("contato", contact_id)
    |> Map.put("id_cliente", contact_id)
  end

  defp build_payment_condition(
         args,
         amount,
         net_amount,
         due_date,
         description,
         note,
         financial_account_id
       ) do
    condition = Map.get(args, "condicao_pagamento")

    installments =
      cond do
        is_map(condition) and is_list(condition["parcelas"]) and condition["parcelas"] != [] ->
          normalize_installments(
            condition["parcelas"],
            amount,
            net_amount,
            due_date,
            description,
            note,
            financial_account_id
          )

        true ->
          option =
            first_present(args, ["opcao_condicao_pagamento"]) ||
              if is_map(condition),
                do: first_present(condition, ["opcao_condicao_pagamento", "opcao", "descricao"]),
                else: nil

          build_installments_from_option(
            option,
            amount,
            net_amount,
            due_date,
            description,
            note,
            financial_account_id
          )
      end

    %{"parcelas" => installments}
  end

  defp normalize_installments(
         installments,
         default_gross_amount,
         default_net_amount,
         default_due_date,
         default_description,
         default_note,
         default_account_id
       ) do
    installments
    |> Enum.with_index(1)
    |> Enum.map(fn {installment, index} ->
      %{gross_amount: gross_amount, net_amount: net_amount} =
        installment_amounts(installment, default_gross_amount, default_net_amount)

      detail_value =
        installment
        |> first_present(["detalhe_valor"])
        |> normalize_detail_value(gross_amount, net_amount)

      %{
        "descricao" =>
          first_present(installment, ["descricao", "description"]) ||
            installment_description(default_description, index, length(installments)),
        "data_vencimento" =>
          first_present(installment, ["data_vencimento", "due_date", "vencimento"]) ||
            default_due_date,
        "nota" => first_present(installment, ["nota", "observacao", "note"]) || default_note,
        "detalhe_valor" => detail_value
      }
      |> maybe_put(
        "conta_financeira",
        first_present(installment, ["conta_financeira", "id_conta_financeira"])
        |> extract_id()
        |> if_present_or(default_account_id)
      )
    end)
  end

  defp installment_amounts(installment, default_gross_amount, default_net_amount) do
    detail =
      installment
      |> first_present(["detalhe_valor"])
      |> maybe_stringify_map()

    gross_amount =
      parse_optional_number(first_present(detail, ["valor_bruto", "valorBruto"])) ||
        parse_optional_number(first_present(installment, ["valor", "amount", "valor_bruto"])) ||
        default_gross_amount

    net_amount =
      parse_optional_number(
        first_present(detail, ["valor_liquido", "valorLiquido", "net_value", "net_amount"])
      ) ||
        parse_optional_number(
          first_present(installment, ["valor_liquido", "valorLiquido", "net_value", "net_amount"])
        ) || default_net_amount || gross_amount

    %{gross_amount: gross_amount, net_amount: net_amount}
  end

  defp normalize_detail_value(detail, gross_amount, net_amount) when is_map(detail) do
    detail
    |> stringify_map_keys()
    |> Map.put("valor_bruto", gross_amount)
    |> Map.put("valor_liquido", net_amount || gross_amount)
  end

  defp normalize_detail_value(_detail, gross_amount, net_amount),
    do: %{"valor_bruto" => gross_amount, "valor_liquido" => net_amount || gross_amount}

  defp if_present_or(nil, fallback), do: fallback
  defp if_present_or("", fallback), do: fallback
  defp if_present_or(value, _fallback), do: value

  defp build_installments_from_option(
         option,
         total_gross_amount,
         total_net_amount,
         due_date,
         description,
         note,
         financial_account_id
       ) do
    gross_plan = installments_plan(option, total_gross_amount, due_date)
    net_plan = installments_plan(option, total_net_amount, due_date)
    total_installments = length(gross_plan)

    Enum.zip(gross_plan, net_plan)
    |> Enum.with_index(1)
    |> Enum.map(fn {{%{amount: gross_amount, due_date: installment_due_date},
                     %{amount: net_amount}}, index} ->
      %{
        "descricao" => installment_description(description, index, total_installments),
        "data_vencimento" => installment_due_date,
        "nota" => note,
        "detalhe_valor" => %{"valor_bruto" => gross_amount, "valor_liquido" => net_amount}
      }
      |> maybe_put("conta_financeira", financial_account_id)
    end)
  end

  defp installments_plan(option, total_amount, due_date) do
    option_text =
      case option do
        value when is_binary(value) -> String.trim(value)
        _ -> ""
      end

    cond do
      option_text =~ ~r/^\d+\s*x$/i ->
        [count] =
          Regex.run(~r/^(\d+)\s*x$/i, option_text, capture: :all_but_first)
          |> Enum.map(&String.to_integer/1)

        split_amount_with_fixed_days(total_amount, due_date, count, fn index -> index * 30 end)

      option_text =~ ~r/^\d+(\s*,\s*\d+)+$/ ->
        days =
          option_text
          |> String.split(",")
          |> Enum.map(&String.trim/1)
          |> Enum.map(&String.to_integer/1)

        split_amount_by_explicit_days(total_amount, due_date, days)

      true ->
        [%{amount: total_amount, due_date: due_date}]
    end
  end

  defp split_amount_with_fixed_days(total_amount, due_date, count, day_offset_fun)
       when is_integer(count) and count > 0 do
    amounts = split_amount(total_amount, count)

    Enum.with_index(amounts, 0)
    |> Enum.map(fn {amount, index} ->
      %{amount: amount, due_date: shift_due_date(due_date, day_offset_fun.(index))}
    end)
  end

  defp split_amount_by_explicit_days(total_amount, due_date, days)
       when is_list(days) and days != [] do
    amounts = split_amount(total_amount, length(days))

    Enum.zip(amounts, days)
    |> Enum.map(fn {amount, day_offset} ->
      %{amount: amount, due_date: shift_due_date(due_date, day_offset)}
    end)
  end

  defp split_amount(total_amount, installments_count) do
    total_cents = trunc(Float.round(total_amount * 100))
    base = div(total_cents, installments_count)
    remainder = rem(total_cents, installments_count)

    0..(installments_count - 1)
    |> Enum.map(fn index ->
      cents = base + if(index < remainder, do: 1, else: 0)
      cents / 100
    end)
  end

  defp shift_due_date(due_date, day_offset) when is_binary(due_date) and is_integer(day_offset) do
    case Date.from_iso8601(due_date) do
      {:ok, date} -> date |> Date.add(day_offset) |> Date.to_iso8601()
      _ -> due_date
    end
  end

  defp shift_due_date(due_date, _day_offset), do: due_date

  defp installment_description(base_description, 1, 1), do: base_description

  defp installment_description(base_description, index, total),
    do: "#{base_description} (#{index}/#{total})"

  defp normalize_args(args) when is_map(args),
    do: Map.new(args, fn {key, value} -> {to_string(key), value} end)

  defp maybe_stringify_map(value) when is_map(value), do: stringify_map_keys(value)
  defp maybe_stringify_map(value), do: value

  defp stringify_map_keys(map) when is_map(map),
    do: Map.new(map, fn {key, value} -> {to_string(key), value} end)

  defp drop_keys(map, keys), do: Enum.reduce(keys, map, &Map.delete(&2, &1))

  defp require_arg(args, keys) do
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

  defp require_non_empty_string(args, keys) do
    with {:ok, value} <- require_arg(args, keys),
         true <- is_binary(value),
         trimmed when trimmed != "" <- String.trim(value) do
      {:ok, trimmed}
    else
      _ -> {:error, {:missing_required_argument, List.first(keys)}}
    end
  end
end
