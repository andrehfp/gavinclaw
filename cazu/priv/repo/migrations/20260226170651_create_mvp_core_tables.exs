defmodule Cazu.Repo.Migrations.CreateMvpCoreTables do
  use Ecto.Migration

  def change do
    create table(:tenants) do
      add :name, :string, null: false
      add :slug, :string, null: false
      add :status, :string, null: false, default: "active"

      timestamps()
    end

    create unique_index(:tenants, [:slug])

    create table(:users) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :telegram_user_id, :string, null: false
      add :name, :string
      add :email, :string
      add :role, :string, null: false, default: "operator"

      timestamps()
    end

    create unique_index(:users, [:tenant_id, :telegram_user_id])
    create index(:users, [:tenant_id, :role])

    create table(:tenant_integrations) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :provider, :string, null: false
      add :status, :string, null: false, default: "active"
      add :external_workspace_id, :string
      add :access_token, :text
      add :refresh_token, :text
      add :id_token, :text
      add :token_expires_at, :utc_datetime
      add :scopes, :string
      add :metadata, :map, null: false, default: %{}

      timestamps()
    end

    create unique_index(:tenant_integrations, [:tenant_id, :provider])

    create table(:jobs) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :user_id, references(:users, on_delete: :nilify_all), null: false
      add :channel, :string, null: false, default: "telegram"
      add :status, :string, null: false, default: "queued"
      add :intent, :string, null: false
      add :input_payload, :map, null: false, default: %{}
      add :result_payload, :map, null: false, default: %{}
      add :error_reason, :string
      add :completed_at, :utc_datetime

      timestamps()
    end

    create index(:jobs, [:tenant_id, :status, :inserted_at])
    create index(:jobs, [:user_id, :inserted_at])

    create table(:job_events) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :job_id, references(:jobs, on_delete: :delete_all), null: false
      add :event_type, :string, null: false
      add :payload, :map, null: false, default: %{}
      add :occurred_at, :utc_datetime, null: false

      timestamps(updated_at: false)
    end

    create index(:job_events, [:job_id, :occurred_at])
    create index(:job_events, [:tenant_id, :event_type])

    create table(:tool_calls) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :job_id, references(:jobs, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :confirm, :boolean, null: false, default: false
      add :idempotency_key, :string, null: false
      add :arguments, :map, null: false, default: %{}
      add :status, :string, null: false, default: "queued"
      add :result, :map, null: false, default: %{}
      add :error_reason, :string
      add :started_at, :utc_datetime
      add :finished_at, :utc_datetime

      timestamps()
    end

    create unique_index(:tool_calls, [:tenant_id, :idempotency_key])
    create index(:tool_calls, [:job_id])
    create index(:tool_calls, [:tenant_id, :status])

    create table(:approvals) do
      add :tenant_id, references(:tenants, on_delete: :delete_all), null: false
      add :job_id, references(:jobs, on_delete: :delete_all), null: false
      add :tool_call_id, references(:tool_calls, on_delete: :delete_all), null: false
      add :requested_by_user_id, references(:users, on_delete: :nilify_all), null: false
      add :approved_by_user_id, references(:users, on_delete: :nilify_all)
      add :status, :string, null: false, default: "pending"
      add :reason, :string
      add :decided_at, :utc_datetime

      timestamps()
    end

    create index(:approvals, [:tool_call_id, :status])
    create index(:approvals, [:tenant_id, :status])
  end
end
