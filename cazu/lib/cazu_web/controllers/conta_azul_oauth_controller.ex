defmodule CazuWeb.ContaAzulOAuthController do
  use CazuWeb, :controller

  alias Cazu.Auth.ContaAzulOAuth
  alias Cazu.Tenancy

  @auto_tenant_mode "conta_azul_auto"

  def start(conn, params) do
    params = normalize_start_params(params)

    with {:ok, state_payload} <- build_state_payload(conn, params),
         {:ok, authorization_url} <- build_authorization_url(state_payload) do
      redirect(conn, external: authorization_url)
    else
      {:error, :missing_tenant_or_chat_id} ->
        respond_start_missing(conn)

      {:error, reason} ->
        respond_error(conn, :bad_request, "Could not start Conta Azul OAuth", reason)
    end
  end

  def callback(conn, %{"code" => code, "state" => state}) do
    with {:ok, state_context} <- verify_state(state),
         {:ok, token_attrs} <- ContaAzulOAuth.exchange_code_for_tokens(code),
         {:ok, tenant_id, integration_attrs} <-
           resolve_callback_target(state_context, token_attrs),
         {:ok, _integration} <-
           Tenancy.upsert_integration_tokens(
             tenant_id,
             "conta_azul",
             Map.merge(token_attrs, integration_attrs)
           ) do
      respond_success(conn, tenant_id)
    else
      {:error, reason} ->
        respond_error(conn, :unprocessable_entity, "Conta Azul OAuth callback failed", reason)
    end
  end

  def callback(conn, _params) do
    case get_format(conn) do
      "html" ->
        conn
        |> put_status(:bad_request)
        |> put_flash(:error, "code and state are required")
        |> redirect(to: ~p"/?connected=0")

      _ ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "code and state are required"})
    end
  end

  defp build_state_payload(conn, params) do
    case resolve_tenant_id(params) do
      {:ok, tenant_id} ->
        {:ok, Integer.to_string(tenant_id)}

      {:error, :missing_tenant_or_chat_id} ->
        if html_request?(conn),
          do: {:ok, %{"mode" => @auto_tenant_mode}},
          else: {:error, :missing_tenant_or_chat_id}

      other ->
        other
    end
  end

  defp resolve_tenant_id(%{"tenant_id" => tenant_id}) when tenant_id not in [nil, ""] do
    parse_tenant_id(tenant_id)
  end

  defp resolve_tenant_id(%{"chat_id" => chat_id}) when chat_id not in [nil, ""] do
    case Tenancy.get_or_create_telegram_tenant(chat_id) do
      {:ok, tenant} -> {:ok, tenant.id}
      {:error, reason} -> {:error, reason}
    end
  end

  defp resolve_tenant_id(_params), do: {:error, :missing_tenant_or_chat_id}

  defp normalize_start_params(%{"auth" => auth_params} = params) when is_map(auth_params) do
    params
    |> Map.drop(["auth"])
    |> Map.merge(auth_params)
  end

  defp normalize_start_params(params), do: params

  defp parse_tenant_id(tenant_id) when is_integer(tenant_id), do: {:ok, tenant_id}

  defp parse_tenant_id(tenant_id) when is_binary(tenant_id) do
    case Integer.parse(tenant_id) do
      {parsed, ""} -> {:ok, parsed}
      _ -> {:error, :invalid_tenant_id}
    end
  end

  defp parse_tenant_id(_tenant_id), do: {:error, :invalid_tenant_id}

  defp build_authorization_url(state_payload) do
    state = Phoenix.Token.sign(CazuWeb.Endpoint, "conta_azul_oauth", state_payload)
    ContaAzulOAuth.authorize_url(state)
  end

  defp verify_state(state) do
    with {:ok, verified_state} <-
           Phoenix.Token.verify(CazuWeb.Endpoint, "conta_azul_oauth", state, max_age: 15 * 60),
         {:ok, normalized_state} <- normalize_verified_state(verified_state) do
      {:ok, normalized_state}
    else
      _ -> {:error, :invalid_state}
    end
  end

  defp normalize_verified_state(%{"tenant_id" => tenant_id}), do: parse_state_tenant(tenant_id)

  defp normalize_verified_state(%{"mode" => @auto_tenant_mode}), do: {:ok, :auto_tenant}

  defp normalize_verified_state(tenant_id_string) when is_binary(tenant_id_string),
    do: parse_state_tenant(tenant_id_string)

  defp normalize_verified_state(_), do: {:error, :invalid_state}

  defp parse_state_tenant(tenant_id) when is_integer(tenant_id),
    do: {:ok, {:tenant_id, tenant_id}}

  defp parse_state_tenant(tenant_id) when is_binary(tenant_id) do
    case Integer.parse(tenant_id) do
      {parsed, ""} -> {:ok, {:tenant_id, parsed}}
      _ -> {:error, :invalid_state}
    end
  end

  defp parse_state_tenant(_tenant_id), do: {:error, :invalid_state}

  defp resolve_callback_target({:tenant_id, tenant_id}, token_attrs) do
    {:ok, tenant_id, build_integration_identity_attrs(token_attrs)}
  end

  defp resolve_callback_target(:auto_tenant, token_attrs) do
    with {:ok, claims} <- access_token_claims(token_attrs),
         {:ok, conta_azul_subject} <- claim(claims, "sub"),
         {:ok, tenant} <-
           Tenancy.get_or_create_conta_azul_tenant(
             conta_azul_subject,
             claims["username"] || claims["email"]
           ) do
      {:ok, tenant.id, %{"external_workspace_id" => conta_azul_subject}}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  defp access_token_claims(token_attrs) do
    case Map.get(token_attrs, "access_token") do
      token when is_binary(token) -> decode_jwt_claims(token)
      _ -> {:error, :missing_access_token}
    end
  end

  defp decode_jwt_claims(token) do
    case String.split(token, ".") do
      [_header, payload, _signature] ->
        with {:ok, payload_binary} <- Base.url_decode64(payload, padding: false),
             {:ok, claims} <- Jason.decode(payload_binary) do
          {:ok, claims}
        else
          _ -> {:error, :invalid_access_token_claims}
        end

      _ ->
        {:error, :invalid_access_token_format}
    end
  end

  defp claim(claims, key) when is_map(claims) do
    case Map.get(claims, key) do
      value when is_binary(value) and value != "" -> {:ok, value}
      _ -> {:error, {:missing_claim, key}}
    end
  end

  defp build_integration_identity_attrs(token_attrs) do
    case access_token_claims(token_attrs) do
      {:ok, claims} ->
        case claim(claims, "sub") do
          {:ok, conta_azul_subject} -> %{"external_workspace_id" => conta_azul_subject}
          {:error, _reason} -> %{}
        end

      {:error, _reason} ->
        %{}
    end
  end

  defp respond_success(conn, tenant_id) do
    case get_format(conn) do
      "html" ->
        conn
        |> put_flash(:info, "Conta Azul connected successfully for tenant #{tenant_id}.")
        |> redirect(to: ~p"/?connected=1&tenant_id=#{tenant_id}")

      _ ->
        json(conn, %{status: "ok", tenant_id: tenant_id})
    end
  end

  defp respond_start_missing(conn) do
    case get_format(conn) do
      "html" ->
        conn
        |> put_status(:bad_request)
        |> put_flash(:error, "tenant_id is required")
        |> redirect(to: ~p"/?connected=0")

      _ ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "tenant_id is required"})
    end
  end

  defp respond_error(conn, status, message, reason) do
    case get_format(conn) do
      "html" ->
        conn
        |> put_status(status)
        |> put_flash(:error, "#{message}: #{inspect(reason)}")
        |> redirect(to: ~p"/?connected=0")

      _ ->
        conn
        |> put_status(status)
        |> json(%{error: inspect(reason)})
    end
  end

  defp html_request?(conn), do: get_format(conn) == "html"
end
