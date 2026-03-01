defmodule Cazu.Auth.ContaAzulOAuth do
  @moduledoc """
  OAuth 2.0 helpers for Conta Azul authorization_code and refresh_token flows.
  """

  @type token_attrs :: %{
          optional(String.t()) => String.t() | DateTime.t() | nil
        }

  def authorize_url(state) when is_binary(state) do
    config = conta_azul_config()

    with :ok <- ensure_oauth_config(config) do
      params = %{
        "response_type" => "code",
        "client_id" => config.client_id,
        "redirect_uri" => config.redirect_uri,
        "state" => state,
        "scope" => config.scope
      }

      {:ok, "#{config.login_url}?#{URI.encode_query(params)}"}
    end
  end

  def exchange_code_for_tokens(code) when is_binary(code) do
    request_token([
      {"grant_type", "authorization_code"},
      {"code", code},
      {"redirect_uri", conta_azul_config().redirect_uri}
    ])
  end

  def refresh_access_token(refresh_token) when is_binary(refresh_token) do
    request_token([
      {"grant_type", "refresh_token"},
      {"refresh_token", refresh_token}
    ])
  end

  defp request_token(form_data) do
    config = conta_azul_config()

    with :ok <- ensure_oauth_config(config),
         {:ok, response} <-
           Req.post(
             url: config.token_url,
             headers: [
               {"authorization",
                "Basic " <> Base.encode64("#{config.client_id}:#{config.client_secret}")}
             ],
             form: form_data
           ) do
      case response.status do
        status when status in 200..299 ->
          {:ok, normalize_token_response(response.body)}

        _ ->
          {:error, %{status: response.status, body: response.body}}
      end
    end
  end

  defp normalize_token_response(body) do
    expires_in = to_integer(body["expires_in"], 0)

    %{
      "access_token" => body["access_token"],
      "refresh_token" => body["refresh_token"],
      "id_token" => body["id_token"],
      "scopes" => body["scope"] || conta_azul_config().scope,
      "token_expires_at" =>
        DateTime.utc_now() |> DateTime.add(expires_in, :second) |> DateTime.truncate(:second)
    }
  end

  defp to_integer(value, _fallback) when is_integer(value), do: value

  defp to_integer(value, fallback) when is_binary(value) do
    case Integer.parse(value) do
      {number, _} -> number
      :error -> fallback
    end
  end

  defp to_integer(_value, fallback), do: fallback

  defp ensure_oauth_config(%{login_url: nil}), do: {:error, :missing_login_url}
  defp ensure_oauth_config(%{token_url: nil}), do: {:error, :missing_token_url}
  defp ensure_oauth_config(%{client_id: nil}), do: {:error, :missing_client_id}
  defp ensure_oauth_config(%{client_secret: nil}), do: {:error, :missing_client_secret}
  defp ensure_oauth_config(%{redirect_uri: nil}), do: {:error, :missing_redirect_uri}
  defp ensure_oauth_config(_), do: :ok

  defp conta_azul_config do
    config = Application.get_env(:cazu, :conta_azul, [])

    %{
      login_url: Keyword.get(config, :login_url),
      token_url: Keyword.get(config, :token_url),
      client_id: Keyword.get(config, :client_id),
      client_secret: Keyword.get(config, :client_secret),
      redirect_uri: Keyword.get(config, :redirect_uri),
      scope: Keyword.get(config, :scope)
    }
  end
end
