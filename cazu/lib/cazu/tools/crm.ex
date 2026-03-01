defmodule Cazu.Tools.CRM do
  @moduledoc """
  CRM tool implementations backed by Conta Azul APIs.
  """

  alias Cazu.Connectors.ContaAzul

  def create_client(args, context) do
    args
    |> normalize_args()
    |> ensure_default_client_profile()
    |> create_person(context)
  end

  def create_person(args, context) do
    normalized = args |> normalize_args() |> normalize_person_payload()

    with :ok <- validate_person_creation_payload(normalized) do
      call(context, :post, "/pessoas", json: drop_keys(normalized, ["confirm"]))
    end
  end

  def list_people(args, context) do
    normalized = normalize_args(args)

    params =
      normalized
      |> normalize_people_filters()
      |> drop_keys(["confirm"])

    with {:ok, response} <- call(context, :get, "/pessoas", params: params) do
      {:ok, normalize_people_response(response)}
    end
  end

  def get_person(args, context) do
    normalized = normalize_args(args)

    with {:ok, person_id} <- require_arg(normalized, ["id", "person_id"]) do
      call(context, :get, "/pessoas/#{person_id}")
    end
  end

  def get_person_by_legacy_id(args, context) do
    normalized = normalize_args(args)

    with {:ok, legacy_id} <-
           require_arg(normalized, ["id", "legacy_id", "person_legacy_id", "uuid_legado"]) do
      call(context, :get, "/pessoas/legado/#{legacy_id}")
    end
  end

  def update_person(args, context) do
    normalized = args |> normalize_args() |> normalize_person_payload()

    with {:ok, person_id} <- require_arg(normalized, ["id", "person_id"]),
         :ok <- validate_person_update_payload(normalized) do
      body = drop_keys(normalized, ["id", "person_id", "confirm"])
      call(context, :put, "/pessoas/#{person_id}", json: body)
    end
  end

  def patch_person(args, context) do
    normalized = args |> normalize_args() |> normalize_person_payload()

    with {:ok, person_id} <- require_arg(normalized, ["id", "person_id"]) do
      body = drop_keys(normalized, ["id", "person_id", "confirm"])
      call(context, :patch, "/pessoas/#{person_id}", json: body)
    end
  end

  def activate_people(args, context) do
    normalized = args |> normalize_args() |> normalize_people_batch_payload()
    call(context, :post, "/pessoas/ativar", json: drop_keys(normalized, ["confirm"]))
  end

  def inactivate_people(args, context) do
    normalized = args |> normalize_args() |> normalize_people_batch_payload()
    call(context, :post, "/pessoas/inativar", json: drop_keys(normalized, ["confirm"]))
  end

  def delete_people(args, context) do
    normalized = args |> normalize_args() |> normalize_people_batch_payload()
    call(context, :post, "/pessoas/excluir", json: drop_keys(normalized, ["confirm"]))
  end

  defp call(context, method, path, opts \\ []) do
    ContaAzul.request(
      context.integration,
      method,
      path,
      Keyword.put_new(opts, :idempotency_key, context.idempotency_key)
    )
  end

  defp normalize_args(args) when is_map(args),
    do: Map.new(args, fn {key, value} -> {to_string(key), value} end)

  defp normalize_people_filters(args) do
    args
    |> alias_arg("name", "busca")
    |> alias_arg("person_name", "busca")
    |> alias_arg("nome", "busca")
    |> alias_arg("filter", "busca")
    |> alias_arg("search", "busca")
    |> alias_arg("query", "busca")
    |> alias_arg("q", "busca")
    |> alias_arg("perfil", "tipo_perfil")
    |> alias_arg("profile", "tipo_perfil")
    |> drop_keys([
      "name",
      "person_name",
      "nome",
      "filter",
      "search",
      "query",
      "q",
      "perfil",
      "profile"
    ])
  end

  defp normalize_people_response(%{"items" => nil} = response), do: Map.put(response, "items", [])
  defp normalize_people_response(response), do: response

  defp normalize_person_payload(args) do
    args
    |> normalize_person_type()
    |> normalize_person_profiles()
    |> normalize_person_document_fields()
    |> normalize_person_address_fields()
    |> normalize_person_registration_fields()
    |> normalize_person_phone_fields()
    |> drop_keys([
      "documento",
      "endereco",
      "inscricao_estadual",
      "inscricao_municipal",
      "telefone"
    ])
  end

  defp ensure_default_client_profile(args) do
    if has_profiles?(Map.get(args, "perfis")) do
      args
    else
      Map.put(args, "perfis", [%{"tipo_perfil" => "Cliente"}])
    end
  end

  defp has_profiles?(profiles) when is_list(profiles), do: profiles != []
  defp has_profiles?(_), do: false

  defp normalize_person_type(args) do
    case Map.fetch(args, "tipo_pessoa") do
      {:ok, value} -> Map.put(args, "tipo_pessoa", normalize_person_type_value(value))
      :error -> args
    end
  end

  defp normalize_person_document_fields(args) do
    documento =
      Map.get(args, "documento")
      |> normalize_document_value()

    cond do
      not present_value?(documento) ->
        args

      present_value?(Map.get(args, "cpf")) or present_value?(Map.get(args, "cnpj")) ->
        args

      true ->
        case infer_document_field(args, documento) do
          nil -> args
          field -> Map.put(args, field, documento)
        end
    end
  end

  defp normalize_document_value(value) when is_binary(value) do
    value
    |> String.replace(~r/\D/u, "")
    |> String.trim()
  end

  defp normalize_document_value(_value), do: nil

  defp infer_document_field(args, documento) do
    case normalize_token(to_string(Map.get(args, "tipo_pessoa") || "")) do
      "juridica" -> "cnpj"
      "fisica" -> "cpf"
      _ -> infer_document_field_by_size(documento)
    end
  end

  defp infer_document_field_by_size(documento) do
    case String.length(documento) do
      14 -> "cnpj"
      11 -> "cpf"
      _ -> nil
    end
  end

  defp normalize_person_address_fields(args) do
    cond do
      present_value?(Map.get(args, "enderecos")) ->
        args

      true ->
        case normalize_addresses(Map.get(args, "endereco")) do
          [] -> args
          addresses -> Map.put(args, "enderecos", addresses)
        end
    end
  end

  defp normalize_addresses(addresses) when is_list(addresses) do
    addresses
    |> Enum.map(&normalize_single_address/1)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_addresses(address) do
    case normalize_single_address(address) do
      nil -> []
      normalized -> [normalized]
    end
  end

  defp normalize_single_address(address) when is_map(address), do: normalize_args(address)

  defp normalize_single_address(address) when is_binary(address) do
    if String.trim(address) == "" do
      nil
    else
      %{"logradouro" => String.trim(address)}
    end
  end

  defp normalize_single_address(_address), do: nil

  defp normalize_person_registration_fields(args) do
    cond do
      present_value?(Map.get(args, "inscricoes")) ->
        args

      true ->
        case normalize_registration_from_aliases(args) do
          nil -> args
          registration -> Map.put(args, "inscricoes", [registration])
        end
    end
  end

  defp normalize_registration_from_aliases(args) do
    inscricao_estadual = Map.get(args, "inscricao_estadual")
    inscricao_municipal = Map.get(args, "inscricao_municipal")

    %{}
    |> maybe_put_if_present("inscricao_estadual", inscricao_estadual)
    |> maybe_put_if_present("inscricao_municipal", inscricao_municipal)
    |> case do
      map when map == %{} -> nil
      map -> map
    end
  end

  defp normalize_person_phone_fields(args) do
    cond do
      present_value?(Map.get(args, "telefone_comercial")) ->
        args

      present_value?(Map.get(args, "telefone")) ->
        Map.put(args, "telefone_comercial", Map.get(args, "telefone"))

      true ->
        args
    end
  end

  defp normalize_person_type_value(value) when is_binary(value) do
    case normalize_token(value) do
      "fisica" -> "Física"
      "juridica" -> "Jurídica"
      "estrangeira" -> "Estrangeira"
      _ -> value
    end
  end

  defp normalize_person_type_value(value), do: value

  defp valid_person_type?("Física"), do: true
  defp valid_person_type?("Jurídica"), do: true
  defp valid_person_type?("Estrangeira"), do: true
  defp valid_person_type?(_value), do: false

  defp normalize_person_profiles(args) do
    case Map.fetch(args, "perfis") do
      {:ok, profiles} ->
        Map.put(args, "perfis", normalize_profiles_value(profiles))

      :error ->
        case Map.fetch(args, "perfil") do
          {:ok, profile} -> Map.put(args, "perfis", normalize_profiles_value(profile))
          :error -> args
        end
    end
  end

  defp normalize_profiles_value(profiles) when is_list(profiles) do
    profiles
    |> Enum.map(&normalize_profile_item/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq_by(&Map.get(&1, "tipo_perfil"))
  end

  defp normalize_profiles_value(profiles) when is_map(profiles) do
    case profiles_from_flags(profiles) do
      [] ->
        [normalize_profile_item(profiles)]
        |> Enum.reject(&is_nil/1)

      values ->
        values
    end
  end

  defp normalize_profiles_value(profile) when is_binary(profile) do
    case normalize_profile_type(profile) do
      nil -> []
      tipo -> [%{"tipo_perfil" => tipo}]
    end
  end

  defp normalize_profiles_value(_profiles), do: []

  defp profiles_from_flags(profile_map) when is_map(profile_map) do
    normalized_map = normalize_args(profile_map)

    [{"cliente", "Cliente"}, {"fornecedor", "Fornecedor"}, {"transportadora", "Transportadora"}]
    |> Enum.filter(fn {key, _tipo} -> truthy?(Map.get(normalized_map, key)) end)
    |> Enum.map(fn {_key, tipo} -> %{"tipo_perfil" => tipo} end)
  end

  defp normalize_profile_item(profile) when is_map(profile) do
    normalized_profile = normalize_args(profile)

    case profile_type_from_map(normalized_profile) do
      nil ->
        nil

      tipo ->
        %{"tipo_perfil" => tipo}
    end
  end

  defp normalize_profile_item(profile) when is_binary(profile) do
    case normalize_profile_type(profile) do
      nil -> nil
      tipo -> %{"tipo_perfil" => tipo}
    end
  end

  defp normalize_profile_item(_profile), do: nil

  defp profile_type_from_map(profile_map) do
    cond do
      present_value?(Map.get(profile_map, "tipo_perfil")) ->
        normalize_profile_type(Map.get(profile_map, "tipo_perfil"))

      present_value?(Map.get(profile_map, "tipo")) ->
        normalize_profile_type(Map.get(profile_map, "tipo"))

      present_value?(Map.get(profile_map, "perfil")) ->
        normalize_profile_type(Map.get(profile_map, "perfil"))

      present_value?(Map.get(profile_map, "type")) ->
        normalize_profile_type(Map.get(profile_map, "type"))

      present_value?(Map.get(profile_map, "nome")) ->
        normalize_profile_type(Map.get(profile_map, "nome"))

      present_value?(Map.get(profile_map, "value")) ->
        normalize_profile_type(Map.get(profile_map, "value"))

      true ->
        nil
    end
  end

  defp normalize_people_batch_payload(args) do
    uuids = extract_batch_uuids(args)

    args
    |> Map.put("uuids", uuids)
    |> drop_keys(["ids", "id", "person_id", "pessoas", "uuid", "person_ids"])
  end

  defp validate_person_creation_payload(args) do
    cond do
      not present_value?(Map.get(args, "nome")) ->
        {:error, {:missing_required_argument, "nome"}}

      not valid_person_type?(Map.get(args, "tipo_pessoa")) ->
        {:error, {:missing_required_argument, "tipo_pessoa"}}

      true ->
        :ok
    end
  end

  defp validate_person_update_payload(args) do
    if valid_person_type?(Map.get(args, "tipo_pessoa")) do
      :ok
    else
      {:error, {:missing_required_argument, "tipo_pessoa"}}
    end
  end

  defp extract_batch_uuids(args) do
    direct =
      args
      |> Map.get("uuids")
      |> normalize_uuid_values()

    if direct != [] do
      direct
    else
      from_ids =
        args
        |> Map.get("ids")
        |> normalize_uuid_values()

      if from_ids != [] do
        from_ids
      else
        args
        |> Map.get("pessoas")
        |> extract_uuids_from_people()
      end
    end
  end

  defp normalize_uuid_values(values) when is_list(values) do
    values
    |> Enum.map(&normalize_uuid_value/1)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_uuid_values(values) when is_binary(values) do
    values
    |> String.split(",", trim: true)
    |> normalize_uuid_values()
  end

  defp normalize_uuid_values(value) do
    case normalize_uuid_value(value) do
      nil -> []
      normalized -> [normalized]
    end
  end

  defp normalize_uuid_value(value) when is_integer(value), do: Integer.to_string(value)

  defp normalize_uuid_value(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_uuid_value(_value), do: nil

  defp extract_uuids_from_people(people) when is_list(people) do
    people
    |> Enum.flat_map(fn person ->
      case person do
        person_map when is_map(person_map) ->
          person_map = normalize_args(person_map)

          person_map
          |> Map.get("uuid")
          |> normalize_uuid_values()
          |> case do
            [] ->
              person_map
              |> Map.get("id")
              |> normalize_uuid_values()

            uuids ->
              uuids
          end

        _ ->
          []
      end
    end)
  end

  defp extract_uuids_from_people(_people), do: []

  defp normalize_profile_type(value) when is_binary(value) do
    case normalize_token(value) do
      "cliente" -> "Cliente"
      "fornecedor" -> "Fornecedor"
      "transportadora" -> "Transportadora"
      _ -> nil
    end
  end

  defp normalize_profile_type(_value), do: nil

  defp truthy?(value) when is_binary(value) do
    normalized = normalize_token(value)
    normalized in ["true", "1", "yes", "sim"]
  end

  defp truthy?(value), do: value in [true, 1]

  defp maybe_put_if_present(map, _key, value) when not is_binary(value), do: map

  defp maybe_put_if_present(map, key, value) do
    if String.trim(value) == "" do
      map
    else
      Map.put(map, key, value)
    end
  end

  defp normalize_token(value) do
    value
    |> String.trim()
    |> String.downcase()
    |> String.normalize(:nfd)
    |> String.replace(~r/[\p{Mn}]/u, "")
  end

  defp alias_arg(args, source_key, target_key) do
    source_value = Map.get(args, source_key)
    target_value = Map.get(args, target_key)

    cond do
      present_value?(target_value) ->
        args

      present_value?(source_value) ->
        Map.put(args, target_key, source_value)

      true ->
        args
    end
  end

  defp present_value?(value) when is_binary(value), do: String.trim(value) != ""
  defp present_value?(value), do: not is_nil(value)

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
end
