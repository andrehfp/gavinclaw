defmodule Cazu.Tenancy do
  @moduledoc """
  Multi-tenant boundaries, tenant membership, and external integrations.
  """

  import Ecto.Query, warn: false

  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration
  alias Cazu.Tenancy.User

  @conta_azul_provider "conta_azul"

  def get_tenant(id), do: Repo.get(Tenant, id)
  def get_user(id), do: Repo.get(User, id)

  def get_integration(tenant_id, provider \\ @conta_azul_provider),
    do: Repo.get_by(TenantIntegration, tenant_id: tenant_id, provider: provider)

  def get_or_create_telegram_tenant(chat_id) when is_binary(chat_id) do
    slug = "telegram-chat-#{chat_id}"

    case Repo.get_by(Tenant, slug: slug) do
      nil ->
        %Tenant{}
        |> Tenant.changeset(%{name: "Telegram Chat #{chat_id}", slug: slug, status: "active"})
        |> Repo.insert()

      tenant ->
        {:ok, tenant}
    end
  end

  def get_or_create_conta_azul_tenant(conta_azul_subject, display_name \\ nil)

  def get_or_create_conta_azul_tenant(conta_azul_subject, display_name)
      when is_binary(conta_azul_subject) do
    slug = conta_azul_slug(conta_azul_subject)

    with :ok <- ensure_valid_slug(slug) do
      case Repo.get_by(Tenant, slug: slug) do
        nil ->
          %Tenant{}
          |> Tenant.changeset(%{
            name: conta_azul_tenant_name(display_name, conta_azul_subject),
            slug: slug,
            status: "active"
          })
          |> Repo.insert()

        tenant ->
          {:ok, tenant}
      end
    end
  end

  def get_or_create_telegram_user(%Tenant{id: tenant_id}, telegram_user_id, attrs \\ %{})
      when is_binary(telegram_user_id) do
    case Repo.get_by(User, tenant_id: tenant_id, telegram_user_id: telegram_user_id) do
      nil ->
        user_attrs =
          attrs
          |> Map.put_new("tenant_id", tenant_id)
          |> Map.put_new("telegram_user_id", telegram_user_id)

        %User{}
        |> User.changeset(user_attrs)
        |> Repo.insert()

      user ->
        {:ok, user}
    end
  end

  def get_active_integration(tenant_id, provider \\ @conta_azul_provider) do
    Repo.get_by(TenantIntegration, tenant_id: tenant_id, provider: provider, status: "active")
  end

  def upsert_integration_tokens(tenant_id, provider \\ @conta_azul_provider, attrs) do
    attrs =
      attrs
      |> Enum.into(%{})
      |> Map.put("tenant_id", tenant_id)
      |> Map.put("provider", provider)
      |> Map.put("status", "active")

    case Repo.get_by(TenantIntegration, tenant_id: tenant_id, provider: provider) do
      nil ->
        %TenantIntegration{}
        |> TenantIntegration.changeset(attrs)
        |> Repo.insert()

      integration ->
        integration
        |> TenantIntegration.changeset(attrs)
        |> Repo.update()
    end
  end

  def update_integration_tokens(%TenantIntegration{} = integration, attrs) do
    attrs =
      attrs
      |> Enum.into(%{})
      |> Map.put("status", "active")

    integration
    |> TenantIntegration.changeset(attrs)
    |> Repo.update()
  end

  def mark_integration_reauth_required(%TenantIntegration{} = integration) do
    integration
    |> TenantIntegration.changeset(%{"status" => "reauth_required"})
    |> Repo.update()
  end

  defp conta_azul_slug(conta_azul_subject) do
    normalized_subject =
      conta_azul_subject
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9-]+/, "-")
      |> String.trim("-")

    "conta-azul-#{normalized_subject}"
  end

  defp ensure_valid_slug("conta-azul-"), do: {:error, :invalid_conta_azul_subject}
  defp ensure_valid_slug(_slug), do: :ok

  defp conta_azul_tenant_name(display_name, _conta_azul_subject)
       when is_binary(display_name) and display_name != "" do
    "Conta Azul #{display_name}"
  end

  defp conta_azul_tenant_name(_display_name, conta_azul_subject),
    do: "Conta Azul #{conta_azul_subject}"
end
