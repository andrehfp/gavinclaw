defmodule Cazu.Tenancy.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :telegram_user_id, :string
    field :name, :string
    field :email, :string
    field :role, :string, default: "operator"

    belongs_to :tenant, Cazu.Tenancy.Tenant

    timestamps()
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:tenant_id, :telegram_user_id, :name, :email, :role])
    |> validate_required([:tenant_id, :telegram_user_id, :role])
    |> validate_inclusion(:role, ["admin", "operator", "viewer"])
    |> unique_constraint(:telegram_user_id, name: :users_tenant_id_telegram_user_id_index)
  end
end
