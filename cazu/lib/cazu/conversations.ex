defmodule Cazu.Conversations do
  @moduledoc """
  Conversation state per tenant/chat used to preserve LLM context.
  """

  alias Cazu.Conversations.Conversation
  alias Cazu.Repo

  def get_conversation(tenant_id, chat_id) when is_integer(tenant_id) and is_binary(chat_id) do
    Repo.get_by(Conversation, tenant_id: tenant_id, chat_id: chat_id)
  end

  def get_or_create_by_chat(tenant_id, chat_id, attrs \\ %{})
      when is_integer(tenant_id) and is_binary(chat_id) and is_map(attrs) do
    case get_conversation(tenant_id, chat_id) do
      %Conversation{} = conversation ->
        update_conversation(conversation, attrs)

      nil ->
        create_attrs =
          attrs
          |> Map.put_new("tenant_id", tenant_id)
          |> Map.put_new("chat_id", chat_id)
          |> Map.put_new("last_message_at", DateTime.utc_now() |> DateTime.truncate(:second))

        %Conversation{}
        |> Conversation.changeset(create_attrs)
        |> Repo.insert()
    end
  end

  def update_previous_response(%Conversation{} = conversation, previous_response_id)
      when is_binary(previous_response_id) and previous_response_id != "" do
    update_conversation(conversation, %{
      "previous_response_id" => previous_response_id,
      "last_message_at" => DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  def touch_last_message(%Conversation{} = conversation, attrs \\ %{}) do
    update_conversation(
      conversation,
      Map.merge(
        attrs,
        %{"last_message_at" => DateTime.utc_now() |> DateTime.truncate(:second)}
      )
    )
  end

  def reset_thread(%Conversation{} = conversation) do
    metadata =
      conversation.metadata
      |> normalize_attrs()
      |> Map.drop([
        "messages",
        "last_user_message",
        "last_assistant_message",
        "last_action",
        "last_tool_name",
        "pending_confirmation",
        "last_error_reason"
      ])
      |> Map.put("messages", [])

    update_conversation(conversation, %{
      "metadata" => metadata,
      "previous_response_id" => nil,
      "last_message_at" => DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  defp update_conversation(%Conversation{} = conversation, attrs) when is_map(attrs) do
    conversation
    |> Conversation.changeset(normalize_attrs(attrs))
    |> Repo.update()
  end

  defp normalize_attrs(attrs), do: Map.new(attrs, fn {key, value} -> {to_string(key), value} end)
end
