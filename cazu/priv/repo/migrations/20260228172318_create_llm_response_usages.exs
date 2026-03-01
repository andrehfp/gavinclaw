defmodule Cazu.Repo.Migrations.CreateLlmResponseUsages do
  use Ecto.Migration

  def change do
    create table(:llm_response_usages) do
      add :conversation_id, references(:conversations, on_delete: :delete_all)
      add :tenant_id, :integer, null: false
      add :chat_id, :string, null: false
      add :response_id, :string, null: false
      add :previous_response_id, :string
      add :request_stage, :string, null: false
      add :model, :string, null: false
      add :input_tokens, :integer, null: false, default: 0
      add :output_tokens, :integer, null: false, default: 0
      add :total_tokens, :integer, null: false, default: 0
      add :cached_input_tokens, :integer, null: false, default: 0
      add :input_cost_usd, :float
      add :output_cost_usd, :float
      add :total_cost_usd, :float
      add :metadata, :map, null: false, default: %{}

      timestamps()
    end

    create unique_index(:llm_response_usages, [:response_id])
    create index(:llm_response_usages, [:conversation_id])
    create index(:llm_response_usages, [:tenant_id, :chat_id])
    create index(:llm_response_usages, [:inserted_at])
  end
end
