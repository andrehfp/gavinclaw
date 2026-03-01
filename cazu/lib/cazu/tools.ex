defmodule Cazu.Tools do
  @moduledoc """
  Entry point for supported tool calls.
  """

  alias Cazu.Tools.Acquittance
  alias Cazu.Tools.Charge
  alias Cazu.Tools.CRM
  alias Cazu.Tools.Finance
  alias Cazu.Tools.Inventory
  alias Cazu.Tools.Invoice
  alias Cazu.Tools.Service

  @tool_handlers %{
    "acquittance.create" => {Acquittance, :create},
    "acquittance.list" => {Acquittance, :list},
    "acquittance.get" => {Acquittance, :get},
    "acquittance.update" => {Acquittance, :update},
    "acquittance.delete" => {Acquittance, :delete},
    "charge.create" => {Charge, :create},
    "charge.get" => {Charge, :get},
    "charge.delete" => {Charge, :delete},
    "finance.create_receivable" => {Finance, :create_receivable},
    "finance.create_payable" => {Finance, :create_payable},
    "finance.list_installments" => {Finance, :list_installments},
    "finance.get_statement" => {Finance, :get_statement},
    "finance.list_receivables" => {Finance, :list_receivables},
    "finance.list_payables" => {Finance, :list_payables},
    "finance.list_categories" => {Finance, :list_categories},
    "finance.list_dre_categories" => {Finance, :list_dre_categories},
    "finance.list_cost_centers" => {Finance, :list_cost_centers},
    "finance.create_cost_center" => {Finance, :create_cost_center},
    "finance.list_financial_accounts" => {Finance, :list_financial_accounts},
    "crm.create_client" => {CRM, :create_client},
    "crm.create_person" => {CRM, :create_person},
    "crm.list_people" => {CRM, :list_people},
    "crm.get_person" => {CRM, :get_person},
    "crm.get_person_by_legacy_id" => {CRM, :get_person_by_legacy_id},
    "crm.update_person" => {CRM, :update_person},
    "crm.patch_person" => {CRM, :patch_person},
    "crm.activate_people" => {CRM, :activate_people},
    "crm.inactivate_people" => {CRM, :inactivate_people},
    "crm.delete_people" => {CRM, :delete_people},
    "inventory.create_product" => {Inventory, :create_product},
    "inventory.list_products" => {Inventory, :list_products},
    "inventory.delete_product" => {Inventory, :delete_product},
    "invoice.list" => {Invoice, :list},
    "invoice.list_service" => {Invoice, :list_service},
    "invoice.link_mdfe" => {Invoice, :link_mdfe},
    "invoice.get_by_key" => {Invoice, :get_by_key},
    "service.list" => {Service, :list},
    "service.create" => {Service, :create},
    "service.delete_batch" => {Service, :delete_batch},
    "service.get" => {Service, :get},
    "service.update" => {Service, :update}
  }

  @supported_tools @tool_handlers |> Map.keys() |> Enum.sort()

  def supported_tools, do: @supported_tools

  def supported_tool?(tool_name), do: Map.has_key?(@tool_handlers, tool_name)

  def run(tool_name, args, context) do
    case Map.get(@tool_handlers, tool_name) do
      {module, function_name} -> apply(module, function_name, [args, context])
      nil -> {:error, :unsupported_tool}
    end
  end
end
