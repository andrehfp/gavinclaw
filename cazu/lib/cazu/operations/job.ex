defmodule Cazu.Operations.Job do
  use Ecto.Schema
  import Ecto.Changeset

  schema "jobs" do
    field :channel, :string, default: "telegram"
    field :status, :string, default: "queued"
    field :intent, :string
    field :input_payload, :map, default: %{}
    field :result_payload, :map, default: %{}
    field :error_reason, :string
    field :completed_at, :utc_datetime

    belongs_to :tenant, Cazu.Tenancy.Tenant
    belongs_to :user, Cazu.Tenancy.User

    has_many :events, Cazu.Operations.JobEvent
    has_many :tool_calls, Cazu.Operations.ToolCall

    timestamps()
  end

  def changeset(job, attrs) do
    job
    |> cast(attrs, [
      :tenant_id,
      :user_id,
      :channel,
      :status,
      :intent,
      :input_payload,
      :result_payload,
      :error_reason,
      :completed_at
    ])
    |> validate_required([:tenant_id, :user_id, :channel, :status, :intent])
    |> validate_inclusion(:status, ["queued", "running", "succeeded", "failed"])
  end
end
