defmodule Cazu.Operations.Approval do
  use Ecto.Schema
  import Ecto.Changeset

  schema "approvals" do
    field :status, :string, default: "pending"
    field :reason, :string
    field :decided_at, :utc_datetime

    belongs_to :tenant, Cazu.Tenancy.Tenant
    belongs_to :job, Cazu.Operations.Job
    belongs_to :tool_call, Cazu.Operations.ToolCall
    belongs_to :requested_by_user, Cazu.Tenancy.User
    belongs_to :approved_by_user, Cazu.Tenancy.User

    timestamps()
  end

  def changeset(approval, attrs) do
    approval
    |> cast(attrs, [
      :tenant_id,
      :job_id,
      :tool_call_id,
      :requested_by_user_id,
      :approved_by_user_id,
      :status,
      :reason,
      :decided_at
    ])
    |> validate_required([:tenant_id, :job_id, :tool_call_id, :requested_by_user_id, :status])
    |> validate_inclusion(:status, ["pending", "approved", "rejected", "expired"])
  end
end
