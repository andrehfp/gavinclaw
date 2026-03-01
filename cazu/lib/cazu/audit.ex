defmodule Cazu.Audit do
  @moduledoc """
  Immutable audit stream for tool execution lifecycle.
  """

  alias Cazu.Operations.Job
  alias Cazu.Operations.JobEvent
  alias Cazu.Repo

  @secret_keys ~w(access_token refresh_token id_token authorization api_key token secret)

  def record_event(%Job{id: job_id, tenant_id: tenant_id}, event_type, payload \\ %{}) do
    sanitized_payload = sanitize_payload(payload)

    %JobEvent{}
    |> JobEvent.changeset(%{
      tenant_id: tenant_id,
      job_id: job_id,
      event_type: event_type,
      payload: sanitized_payload,
      occurred_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
    |> Repo.insert()
  end

  def sanitize_payload(payload) when is_map(payload) do
    Map.new(payload, fn {key, value} ->
      normalized_key = to_string(key)

      if normalized_key in @secret_keys do
        {key, "[REDACTED]"}
      else
        {key, sanitize_payload(value)}
      end
    end)
  end

  def sanitize_payload(payload) when is_list(payload), do: Enum.map(payload, &sanitize_payload/1)
  def sanitize_payload(payload), do: payload
end
