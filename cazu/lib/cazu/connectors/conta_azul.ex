defmodule Cazu.Connectors.ContaAzul do
  @moduledoc """
  Conta Azul API connector with automatic token refresh and single retry.
  """

  alias Cazu.Auth.ContaAzulOAuth
  alias Cazu.Tenancy
  alias Cazu.Tenancy.TenantIntegration

  def request(integration, method, path, opts \\ [])

  def request(%TenantIntegration{} = integration, method, path, opts) do
    do_request(integration, method, path, opts, true, 1)
  end

  def request(nil, _method, _path, _opts), do: {:error, :reauth_required}

  defp do_request(integration, method, path, opts, allow_refresh?, timeout_retries_left) do
    conta_azul_config = Application.get_env(:cazu, :conta_azul, [])
    base_url = Keyword.get(conta_azul_config, :api_base_url)

    receive_timeout =
      Keyword.get(opts, :receive_timeout, Keyword.get(conta_azul_config, :timeout_ms, 15_000))

    idempotency_key = Keyword.get(opts, :idempotency_key)

    headers =
      [{"authorization", "Bearer #{integration.access_token}"}]
      |> maybe_add_idempotency_header(idempotency_key)

    params =
      opts
      |> Keyword.get(:params)
      |> normalize_params_for_req()

    request_opts =
      [
        method: method,
        url: build_url(base_url, path),
        headers: headers,
        json: Keyword.get(opts, :json),
        params: params,
        receive_timeout: receive_timeout
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    case safe_request(request_opts) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        {:ok, body}

      {:ok, %Req.Response{status: 401}} when allow_refresh? ->
        with {:ok, refresh_token} <- present_refresh_token(integration),
             {:ok, token_attrs} <- ContaAzulOAuth.refresh_access_token(refresh_token),
             {:ok, refreshed} <- Tenancy.update_integration_tokens(integration, token_attrs) do
          do_request(refreshed, method, path, opts, false, timeout_retries_left)
        else
          _error ->
            _ = Tenancy.mark_integration_reauth_required(integration)
            {:error, :reauth_required}
        end

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, %{status: status, body: body}}

      {:error, exception} ->
        reason = Exception.message(exception)

        cond do
          timeout_retries_left > 0 and timeout_reason?(reason) ->
            Process.sleep(250)
            do_request(integration, method, path, opts, allow_refresh?, timeout_retries_left - 1)

          true ->
            {:error, %{reason: reason}}
        end
    end
  end

  defp normalize_params_for_req(nil), do: nil

  defp normalize_params_for_req(params) when is_map(params) do
    params
    |> Enum.flat_map(fn {key, value} -> expand_param(to_string(key), value) end)
  end

  defp normalize_params_for_req(params) when is_list(params) do
    params
    |> Enum.flat_map(fn
      {key, value} -> expand_param(to_string(key), value)
      _ -> []
    end)
  end

  defp normalize_params_for_req(_params), do: nil

  defp expand_param(_key, nil), do: []
  defp expand_param(_key, ""), do: []

  defp expand_param(key, values) when is_list(values) do
    Enum.flat_map(values, &expand_param(key, &1))
  end

  defp expand_param(key, value) when is_binary(value), do: [{key, value}]

  defp expand_param(key, value) when is_boolean(value) or is_integer(value) or is_float(value),
    do: [{key, value}]

  defp expand_param(key, value) when is_map(value), do: [{key, Jason.encode!(value)}]

  defp expand_param(key, value), do: [{key, to_string(value)}]

  defp present_refresh_token(%TenantIntegration{refresh_token: refresh_token})
       when is_binary(refresh_token),
       do: {:ok, refresh_token}

  defp present_refresh_token(_), do: {:error, :missing_refresh_token}

  defp maybe_add_idempotency_header(headers, key) when is_binary(key) do
    headers ++ [{"x-idempotency-key", key}]
  end

  defp maybe_add_idempotency_header(headers, _), do: headers

  defp build_url(base_url, path) do
    normalized_path =
      if String.starts_with?(path, "/") do
        path
      else
        "/#{path}"
      end

    "#{base_url}#{normalized_path}"
  end

  defp safe_request(request_opts) do
    Req.request(request_opts)
  rescue
    exception ->
      {:error, exception}
  end

  defp timeout_reason?(reason) when is_binary(reason) do
    reason
    |> String.downcase()
    |> String.contains?("timeout")
  end

  defp timeout_reason?(_reason), do: false
end
