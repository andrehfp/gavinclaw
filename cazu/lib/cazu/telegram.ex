defmodule Cazu.Telegram do
  @moduledoc """
  Telegram parsing and message delivery.
  """

  alias Cazu.AgentTrace

  @spec parse_update(map()) :: {:ok, map()} | {:error, atom()}
  def parse_update(%{"message" => %{"chat" => chat, "from" => from, "text" => text}})
      when is_map(chat) and is_map(from) and is_binary(text) do
    {:ok,
     %{
       chat_id: to_string(chat["id"]),
       telegram_user_id: to_string(from["id"]),
       user_name: from["first_name"] || from["username"] || "Telegram User",
       text: text
     }}
  end

  def parse_update(_), do: {:error, :unsupported_update}

  def send_message(chat_id, message) when is_binary(chat_id) and is_binary(message) do
    config = Application.get_env(:cazu, :telegram, [])
    bot_token = Keyword.get(config, :bot_token)
    api_base_url = Keyword.get(config, :api_base_url, "https://api.telegram.org")

    if is_binary(bot_token) and bot_token != "" do
      url = "#{api_base_url}/bot#{bot_token}/sendMessage"

      case Req.post(url: url, json: %{chat_id: chat_id, text: message}) do
        {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
          _ =
            AgentTrace.log("telegram.send_message", %{
              chat_id: chat_id,
              status: status,
              body: body
            })

          :ok

        {:ok, %Req.Response{status: status, body: body}} ->
          _ =
            AgentTrace.log("telegram.send_message_error", %{
              chat_id: chat_id,
              status: status,
              body: body
            })

          {:error, {:telegram_upstream_error, status}}

        {:error, error} ->
          _ =
            AgentTrace.log("telegram.send_message_error", %{
              chat_id: chat_id,
              error: Exception.message(error)
            })

          {:error, {:request_error, Exception.message(error)}}
      end
    else
      _ =
        AgentTrace.log("telegram.send_message_error", %{
          chat_id: chat_id,
          error: "telegram_not_configured"
        })

      {:error, :telegram_not_configured}
    end
  end
end
