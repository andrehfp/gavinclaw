defmodule CazuWeb.TelegramWebhookController do
  use CazuWeb, :controller

  alias Cazu.AgentTrace
  alias Cazu.Telegram
  alias Cazu.Tenancy
  alias Cazu.Workers.ConversationTurnWorker

  def receive(conn, %{"token" => token} = params) do
    expected_token = Application.get_env(:cazu, :telegram, []) |> Keyword.get(:webhook_token)

    if token == expected_token do
      payload = Map.delete(params, "token")

      _ =
        AgentTrace.log("telegram.webhook_received", %{
          token_matches: true,
          update_id: payload["update_id"],
          has_message: is_map(payload["message"])
        })

      case enqueue_turn(payload) do
        :ok ->
          _ = AgentTrace.log("telegram.webhook_enqueued", %{ok: true})
          json(conn, %{ok: true})

        :ignore ->
          _ = AgentTrace.log("telegram.webhook_ignored", %{ok: true})
          json(conn, %{ok: true})
      end
    else
      _ =
        AgentTrace.log("telegram.webhook_rejected", %{
          token_matches: false
        })

      conn
      |> put_status(:unauthorized)
      |> json(%{ok: false})
    end
  end

  defp enqueue_turn(payload) do
    with {:ok, update} <- Telegram.parse_update(payload),
         {:ok, tenant} <- Tenancy.get_or_create_telegram_tenant(update.chat_id),
         {:ok, user} <-
           Tenancy.get_or_create_telegram_user(tenant, update.telegram_user_id, %{
             "name" => update.user_name
           }),
         {:ok, _job} <-
           Oban.insert(ConversationTurnWorker.new(job_args(payload, tenant.id, user.id, update))) do
      :ok
    else
      {:error, :unsupported_update} ->
        :ignore

      {:error, _reason} ->
        :ignore
    end
  end

  defp job_args(payload, tenant_id, user_id, update) do
    %{
      "tenant_id" => tenant_id,
      "user_id" => user_id,
      "chat_id" => update.chat_id,
      "telegram_user_id" => update.telegram_user_id,
      "message_text" => update.text,
      "telegram_update_id" => extract_update_id(payload),
      "raw_update" => payload
    }
  end

  defp extract_update_id(%{"update_id" => update_id}) when is_integer(update_id),
    do: Integer.to_string(update_id)

  defp extract_update_id(%{"update_id" => update_id}) when is_binary(update_id), do: update_id

  defp extract_update_id(payload) do
    payload
    |> Jason.encode!()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end
end
