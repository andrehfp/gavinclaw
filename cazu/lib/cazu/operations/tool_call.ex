defmodule Cazu.Operations.ToolCall do
  use Ecto.Schema
  import Ecto.Changeset

  schema "tool_calls" do
    field :name, :string
    field :confirm, :boolean, default: false
    field :idempotency_key, :string
    field :arguments, :map, default: %{}
    field :status, :string, default: "queued"
    field :result, :map, default: %{}
    field :error_reason, :string
    field :started_at, :utc_datetime
    field :finished_at, :utc_datetime

    belongs_to :tenant, Cazu.Tenancy.Tenant
    belongs_to :job, Cazu.Operations.Job

    has_many :approvals, Cazu.Operations.Approval

    timestamps()
  end

  def changeset(tool_call, attrs) do
    tool_call
    |> cast(attrs, [
      :tenant_id,
      :job_id,
      :name,
      :confirm,
      :idempotency_key,
      :arguments,
      :status,
      :result,
      :error_reason,
      :started_at,
      :finished_at
    ])
    |> validate_required([:tenant_id, :job_id, :name, :idempotency_key, :status])
    |> validate_inclusion(:status, ["queued", "running", "succeeded", "failed"])
    |> unique_constraint(:idempotency_key, name: :tool_calls_tenant_id_idempotency_key_index)
  end
end
