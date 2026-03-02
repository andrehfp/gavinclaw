defmodule Cazu.Policies do
  @moduledoc """
  Authorization and risk guardrails for tool execution.
  """

  alias Cazu.Tenancy.User

  @write_tools MapSet.new([
                 "acquittance.create",
                 "acquittance.update",
                 "acquittance.delete",
                 "charge.create",
                 "charge.delete",
                 "finance.create_receivable",
                 "finance.create_payable",
                 "finance.create_cost_center",
                 "crm.create_client",
                 "crm.create_person",
                 "crm.update_person",
                 "crm.patch_person",
                 "crm.activate_people",
                 "crm.inactivate_people",
                 "crm.delete_people",
                 "inventory.create_product",
                 "inventory.delete_product",
                 "invoice.link_mdfe",
                 "service.create",
                 "service.delete_batch",
                 "service.update"
               ])

  @allowed_roles MapSet.new(["admin", "operator"])

  def validate_tool_call(%User{} = user, _tool_name, _arguments), do: authorize_user(user)

  def write_tool?(tool_name), do: MapSet.member?(@write_tools, tool_name)

  def require_confirmation_for_tool?(tool_name) when is_binary(tool_name) do
    write_tool?(tool_name) and write_confirmation_enabled?()
  end

  def require_confirmation_for_tool?(_tool_name), do: false

  defp authorize_user(%User{role: role}) do
    if MapSet.member?(@allowed_roles, role), do: :ok, else: {:error, :not_authorized}
  end

  defp write_confirmation_enabled? do
    :cazu
    |> Application.get_env(:agent_governance, [])
    |> Keyword.get(:require_write_confirmation, false)
  end
end
