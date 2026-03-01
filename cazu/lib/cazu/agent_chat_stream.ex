defmodule Cazu.AgentChatStream do
  @moduledoc """
  PubSub helpers for the local Agent Chat interface.
  """

  alias Phoenix.PubSub

  @pubsub Cazu.PubSub

  def topic(tenant_id, chat_id) when is_integer(tenant_id) and is_binary(chat_id) do
    "agent_chat:#{tenant_id}:#{chat_id}"
  end

  def subscribe(tenant_id, chat_id) do
    PubSub.subscribe(@pubsub, topic(tenant_id, chat_id))
  end

  def unsubscribe(tenant_id, chat_id) do
    PubSub.unsubscribe(@pubsub, topic(tenant_id, chat_id))
  end

  def broadcast_phase(tenant_id, chat_id, status, attrs \\ %{})

  def broadcast_phase(tenant_id, chat_id, status, attrs)
      when is_binary(status) and is_map(attrs) do
    broadcast(tenant_id, chat_id, :phase, %{
      status: status,
      tool_name: Map.get(attrs, :tool_name) || Map.get(attrs, "tool_name"),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now_iso8601()
    })
  end

  def broadcast_assistant_message(tenant_id, chat_id, attrs) when is_map(attrs) do
    content = Map.get(attrs, :content) || Map.get(attrs, "content")

    broadcast(tenant_id, chat_id, :assistant_message, %{
      id: "assistant-#{System.unique_integer([:positive])}",
      role: "assistant",
      content: content,
      action: Map.get(attrs, :action) || Map.get(attrs, "action"),
      tool_name: Map.get(attrs, :tool_name) || Map.get(attrs, "tool_name"),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now_iso8601()
    })
  end

  def broadcast_assistant_stream_start(tenant_id, chat_id, attrs) when is_map(attrs) do
    broadcast(tenant_id, chat_id, :assistant_stream_start, %{
      id: Map.get(attrs, :id) || Map.get(attrs, "id"),
      role: "assistant",
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now_iso8601()
    })
  end

  def broadcast_assistant_stream_delta(tenant_id, chat_id, attrs) when is_map(attrs) do
    broadcast(tenant_id, chat_id, :assistant_stream_delta, %{
      id: Map.get(attrs, :id) || Map.get(attrs, "id"),
      delta: Map.get(attrs, :delta) || Map.get(attrs, "delta") || "",
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now_iso8601()
    })
  end

  def broadcast_tool_call(tenant_id, chat_id, attrs) when is_map(attrs) do
    broadcast(tenant_id, chat_id, :tool_call, %{
      tool_call_id: Map.get(attrs, :tool_call_id) || Map.get(attrs, "tool_call_id"),
      job_id: Map.get(attrs, :job_id) || Map.get(attrs, "job_id"),
      tool_name: Map.get(attrs, :tool_name) || Map.get(attrs, "tool_name"),
      status: Map.get(attrs, :status) || Map.get(attrs, "status"),
      arguments: Map.get(attrs, :arguments) || Map.get(attrs, "arguments") || %{},
      result: Map.get(attrs, :result) || Map.get(attrs, "result"),
      error_reason: Map.get(attrs, :error_reason) || Map.get(attrs, "error_reason"),
      at: Map.get(attrs, :at) || Map.get(attrs, "at") || now_iso8601()
    })
  end

  defp broadcast(tenant_id, chat_id, event, payload) do
    PubSub.broadcast(@pubsub, topic(tenant_id, chat_id), {:agent_chat_event, event, payload})
  end

  defp now_iso8601 do
    DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  end
end
