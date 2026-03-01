defmodule Cazu.Repo.Migrations.CreateConversations do
  use Ecto.Migration

  def change do
    create table(:conversations) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :chat_id, :string, null: false
      add :telegram_user_id, :string
      add :status, :string, null: false, default: "active"
      add :previous_response_id, :string
      add :last_message_at, :utc_datetime
      add :metadata, :map, null: false, default: %{}

      timestamps()
    end

    create unique_index(:conversations, [:tenant_id, :chat_id])
    create index(:conversations, [:tenant_id, :last_message_at])
  end
end
