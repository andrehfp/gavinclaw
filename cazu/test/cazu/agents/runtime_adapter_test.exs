defmodule Cazu.Agents.RuntimeAdapterTest do
  use ExUnit.Case, async: true

  alias Cazu.Agents.Directives.EmitUserMessage
  alias Cazu.Agents.Directives.EnqueueToolCall
  alias Cazu.Agents.RuntimeAdapter

  @context %{
    tenant_id: 1,
    user_id: 2,
    chat_id: "chat-1",
    channel: "web"
  }

  test "execute/2 rejects unsupported directives as invalid envelope" do
    assert {:error, {:directive_invalid, {:unsupported_directive, %{foo: "bar"}}}} =
             RuntimeAdapter.execute([%{foo: "bar"}], @context)
  end

  test "execute/2 rejects directives with invalid payload" do
    assert {:error, {:directive_invalid, {:invalid_payload, :tool_name}}} =
             RuntimeAdapter.execute(
               [
                 %EnqueueToolCall{
                   tool_name: "",
                   arguments: %{},
                   execution_meta: %{}
                 }
               ],
               @context
             )
  end

  test "execute/2 accepts valid v1 envelope generated from directives" do
    assert :ok =
             RuntimeAdapter.execute(
               [
                 %EmitUserMessage{
                   message: "Tudo certo",
                   metadata: %{"source" => "test"}
                 }
               ],
               @context
             )
  end
end
