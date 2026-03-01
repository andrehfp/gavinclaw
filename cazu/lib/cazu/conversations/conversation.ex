defmodule Cazu.Conversations.Conversation do
  use Ecto.Schema
  import Ecto.Changeset

  schema "conversations" do
    field :chat_id, :string
    field :telegram_user_id, :string
    field :status, :string, default: "active"
    field :previous_response_id, :string
    field :last_message_at, :utc_datetime
    field :metadata, :map, default: %{}

    belongs_to :tenant, Cazu.Tenancy.Tenant

    timestamps()
  end

  def changeset(conversation, attrs) do
    conversation
    |> cast(attrs, [
      :tenant_id,
      :chat_id,
      :telegram_user_id,
      :status,
      :previous_response_id,
      :last_message_at,
      :metadata
    ])
    |> validate_required([:tenant_id, :chat_id, :status])
    |> validate_inclusion(:status, ["active", "archived"])
    |> unique_constraint(:chat_id, name: :conversations_tenant_id_chat_id_index)
  end
end
