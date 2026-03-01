defmodule Cazu.Tools.ReformValidationTest do
  use ExUnit.Case, async: true

  alias Cazu.Tools.Acquittance
  alias Cazu.Tools.Charge
  alias Cazu.Tools.CRM
  alias Cazu.Tools.Finance
  alias Cazu.Tools.Inventory
  alias Cazu.Tools.Invoice
  alias Cazu.Tools.Service

  @context %{integration: nil, idempotency_key: "test-idem", tenant_id: 1}

  test "charge.create/2 validates required fields and tipo enum" do
    assert {:error, {:missing_required_argument, "conta_bancaria"}} =
             Charge.create(%{}, @context)

    assert {:error, {:invalid_argument, "tipo"}} =
             Charge.create(
               %{
                 "conta_bancaria" => "acc-1",
                 "descricao_fatura" => "Teste",
                 "id_parcela" => "inst-1",
                 "data_vencimento" => "2026-03-10",
                 "tipo" => "INVALIDO"
               },
               @context
             )
  end

  test "crm.create_person/2 validates nome, tipo_pessoa and perfis" do
    assert {:error, {:missing_required_argument, "nome"}} =
             CRM.create_person(%{"tipo_pessoa" => "fisica", "perfis" => ["cliente"]}, @context)

    assert {:error, {:missing_required_argument, "tipo_pessoa"}} =
             CRM.create_person(%{"nome" => "Pessoa", "perfis" => ["cliente"]}, @context)

    assert {:error, {:missing_required_argument, "tipo_pessoa"}} =
             CRM.create_person(%{"nome" => "Pessoa", "tipo_pessoa" => ""}, @context)
  end

  test "crm.update_person/2 requires tipo_pessoa for PUT payload" do
    assert {:error, {:missing_required_argument, "tipo_pessoa"}} =
             CRM.update_person(%{"id" => "person-1", "nome" => "Novo Nome"}, @context)
  end

  test "finance.create_cost_center/2 requires nome" do
    assert {:error, {:missing_required_argument, "nome"}} =
             Finance.create_cost_center(%{"codigo" => "CC-1"}, @context)
  end

  test "inventory.create_product/2 requires nome" do
    assert {:error, {:missing_required_argument, "nome"}} =
             Inventory.create_product(%{"codigo" => "P-1"}, @context)
  end

  test "service.create/2 requires descricao and delete_batch validates ids" do
    assert {:error, {:missing_required_argument, "descricao"}} =
             Service.create(%{"codigo" => "S-1"}, @context)

    assert {:error, {:invalid_argument, "ids"}} =
             Service.delete_batch(%{"ids" => ["abc"]}, @context)
  end

  test "invoice list endpoints validate date ranges locally" do
    assert {:error, {:invalid_argument, "date_range_max_15_days"}} =
             Invoice.list(
               %{"data_inicial" => "2026-01-01", "data_final" => "2026-02-01"},
               @context
             )

    assert {:error, {:invalid_argument, "date_range_max_15_days"}} =
             Invoice.list_service(
               %{
                 "data_competencia_de" => "2026-01-01",
                 "data_competencia_ate" => "2026-02-01"
               },
               @context
             )

    assert {:error, {:invalid_argument, "data_inicial"}} =
             Invoice.list(
               %{"data_inicial" => "01-01-2026", "data_final" => "2026-01-10"},
               @context
             )
  end

  test "acquittance.create/2 validates payment date is not in the future" do
    tomorrow = Date.utc_today() |> Date.add(1) |> Date.to_iso8601()

    assert {:error, {:invalid_argument, "data_pagamento"}} =
             Acquittance.create(
               %{
                 "parcela_id" => "inst-1",
                 "data_pagamento" => tomorrow,
                 "conta_financeira" => "acc-1",
                 "composicao_valor" => %{"valor_bruto" => 10.0}
               },
               @context
             )
  end
end
