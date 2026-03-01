defmodule Cazu.Tenancy.TenantIntegration do
  use Ecto.Schema
  import Ecto.Changeset

  schema "tenant_integrations" do
    field :provider, :string
    field :status, :string, default: "active"
    field :external_workspace_id, :string
    field :access_token, :string
    field :refresh_token, :string
    field :id_token, :string
    field :token_expires_at, :utc_datetime
    field :scopes, :string
    field :metadata, :map, default: %{}

    belongs_to :tenant, Cazu.Tenancy.Tenant

    timestamps()
  end

  def changeset(integration, attrs) do
    integration
    |> cast(attrs, [
      :tenant_id,
      :provider,
      :status,
      :external_workspace_id,
      :access_token,
      :refresh_token,
      :id_token,
      :token_expires_at,
      :scopes,
      :metadata
    ])
    |> validate_required([:tenant_id, :provider, :status])
    |> validate_inclusion(:status, ["active", "reauth_required", "disabled"])
    |> unique_constraint(:provider, name: :tenant_integrations_tenant_id_provider_index)
  end
end
