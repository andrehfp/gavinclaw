defmodule Cazu.Operations do
  @moduledoc """
  Core execution records for orchestrated tool calls.
  """

  import Ecto.Query, warn: false

  alias Cazu.Operations.Approval
  alias Cazu.Operations.Job
  alias Cazu.Operations.ToolCall
  alias Cazu.Repo

  def create_job(attrs) do
    %Job{}
    |> Job.changeset(attrs)
    |> Repo.insert()
  end

  def mark_job_running(%Job{} = job) do
    update_job(job, %{
      status: "running",
      result_payload: %{},
      error_reason: nil,
      completed_at: nil
    })
  end

  def mark_job_succeeded(%Job{} = job, result_payload) do
    update_job(job, %{
      status: "succeeded",
      result_payload: result_payload,
      error_reason: nil,
      completed_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  def mark_job_failed(%Job{} = job, reason) do
    update_job(job, %{
      status: "failed",
      error_reason: truncate_error_reason(reason),
      completed_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  defp update_job(job, attrs) do
    job
    |> Job.changeset(attrs)
    |> Repo.update()
  end

  def create_tool_call(attrs) do
    %ToolCall{}
    |> ToolCall.changeset(attrs)
    |> Repo.insert()
  end

  def find_tool_call_by_idempotency(tenant_id, idempotency_key) do
    Repo.get_by(ToolCall, tenant_id: tenant_id, idempotency_key: idempotency_key)
  end

  def get_tool_call_with_job(tool_call_id) do
    ToolCall
    |> Repo.get(tool_call_id)
    |> Repo.preload(:job)
  end

  def latest_active_job(tenant_id, user_id)
      when is_integer(tenant_id) and is_integer(user_id) do
    Job
    |> where(
      [j],
      j.tenant_id == ^tenant_id and j.user_id == ^user_id and
        j.status in ["queued", "running"] and is_nil(j.completed_at)
    )
    |> order_by([j], desc: j.inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  def mark_tool_call_running(%ToolCall{} = tool_call) do
    tool_call
    |> ToolCall.changeset(%{
      status: "running",
      result: %{},
      error_reason: nil,
      started_at: DateTime.utc_now() |> DateTime.truncate(:second),
      finished_at: nil
    })
    |> Repo.update()
  end

  def mark_tool_call_succeeded(%ToolCall{} = tool_call, result) do
    tool_call
    |> ToolCall.changeset(%{
      status: "succeeded",
      result: result,
      error_reason: nil,
      finished_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
    |> Repo.update()
  end

  def mark_tool_call_failed(%ToolCall{} = tool_call, reason) do
    tool_call
    |> ToolCall.changeset(%{
      status: "failed",
      error_reason: truncate_error_reason(reason),
      finished_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
    |> Repo.update()
  end

  def create_approval(attrs) do
    %Approval{}
    |> Approval.changeset(attrs)
    |> Repo.insert()
  end

  defp truncate_error_reason(reason) do
    reason
    |> inspect()
    |> String.slice(0, 255)
  end
end
