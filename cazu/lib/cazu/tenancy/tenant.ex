defmodule Cazu.Tenancy.Tenant do
  use Ecto.Schema
  import Ecto.Changeset

  schema "tenants" do
    field :name, :string
    field :slug, :string
    field :status, :string, default: "active"

    has_many :users, Cazu.Tenancy.User
    has_many :integrations, Cazu.Tenancy.TenantIntegration

    timestamps()
  end

  def changeset(tenant, attrs) do
    tenant
    |> cast(attrs, [:name, :slug, :status])
    |> validate_required([:name, :slug, :status])
    |> validate_length(:name, min: 2)
    |> validate_format(:slug, ~r/^[a-z0-9\-]+$/)
    |> unique_constraint(:slug)
  end
end
