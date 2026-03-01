defmodule Cazu.OperationsTest do
  use Cazu.DataCase

  alias Cazu.Operations
  alias Cazu.Operations.Job
  alias Cazu.Operations.ToolCall
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.User

  test "mark_job_running/1 clears terminal fields from previous attempt" do
    completed_at = DateTime.utc_now() |> DateTime.truncate(:second)
    tenant = tenant_fixture()
    user = user_fixture(tenant)

    job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "failed",
        intent: "finance.list_financial_accounts",
        result_payload: %{"old" => true},
        error_reason: "old error",
        completed_at: completed_at
      })
      |> Repo.insert!()

    assert {:ok, updated} = Operations.mark_job_running(job)
    assert updated.status == "running"
    assert updated.result_payload == %{}
    assert is_nil(updated.error_reason)
    assert is_nil(updated.completed_at)
  end

  test "mark_tool_call_running/1 clears terminal fields from previous attempt" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    tenant = tenant_fixture()
    user = user_fixture(tenant)

    job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "failed",
        intent: "crm.create_person"
      })
      |> Repo.insert!()

    tool_call =
      %ToolCall{}
      |> ToolCall.changeset(%{
        tenant_id: tenant.id,
        job_id: job.id,
        name: "crm.create_person",
        idempotency_key: "idem-running-reset-1",
        arguments: %{"nome" => "Conceito Imóveis"},
        status: "failed",
        result: %{"old" => true},
        error_reason: "old error",
        started_at: now,
        finished_at: now
      })
      |> Repo.insert!()

    assert {:ok, updated} = Operations.mark_tool_call_running(tool_call)
    assert updated.status == "running"
    assert updated.result == %{}
    assert is_nil(updated.error_reason)
    assert is_nil(updated.finished_at)
    assert match?(%DateTime{}, updated.started_at)
  end

  test "latest_active_job/2 ignores stale running jobs that already completed" do
    completed_at = DateTime.utc_now() |> DateTime.truncate(:second)
    tenant = tenant_fixture()
    user = user_fixture(tenant)

    %Job{}
    |> Job.changeset(%{
      tenant_id: tenant.id,
      user_id: user.id,
      channel: "telegram",
      status: "running",
      intent: "finance.list_financial_accounts",
      completed_at: completed_at
    })
    |> Repo.insert!()

    assert Operations.latest_active_job(tenant.id, user.id) == nil
  end

  defp tenant_fixture do
    unique = System.unique_integer([:positive])

    %Tenant{}
    |> Tenant.changeset(%{
      name: "Tenant #{unique}",
      slug: "tenant-ops-#{unique}",
      status: "active"
    })
    |> Repo.insert!()
  end

  defp user_fixture(tenant) do
    unique = System.unique_integer([:positive])

    %User{}
    |> User.changeset(%{
      tenant_id: tenant.id,
      telegram_user_id: "telegram-ops-#{unique}",
      role: "operator",
      name: "User #{unique}"
    })
    |> Repo.insert!()
  end
end
