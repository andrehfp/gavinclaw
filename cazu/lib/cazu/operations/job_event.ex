defmodule Cazu.Operations.JobEvent do
  use Ecto.Schema
  import Ecto.Changeset

  schema "job_events" do
    field :event_type, :string
    field :payload, :map, default: %{}
    field :occurred_at, :utc_datetime

    belongs_to :tenant, Cazu.Tenancy.Tenant
    belongs_to :job, Cazu.Operations.Job

    timestamps(updated_at: false)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [:tenant_id, :job_id, :event_type, :payload, :occurred_at])
    |> validate_required([:tenant_id, :job_id, :event_type, :occurred_at])
  end
end
