defmodule Cazu.LLM.OpenAIResponsesWebSocket.ParserTest do
  use ExUnit.Case, async: true

  alias Cazu.LLM.OpenAIResponsesWebSocket.Parser

  test "captures text deltas and returns completed response" do
    parent = self()
    on_delta = fn delta -> send(parent, {:delta, delta}) end

    state =
      Parser.new_state()
      |> Parser.handle_event(
        %{"type" => "response.output_text.delta", "delta" => "Olá"},
        on_delta
      )
      |> Parser.handle_event(
        %{"type" => "response.output_text.delta", "delta" => " mundo"},
        on_delta
      )
      |> Parser.handle_event(
        %{
          "type" => "response.completed",
          "response" => %{
            "id" => "resp_ws_1",
            "output" => [
              %{
                "type" => "message",
                "content" => [%{"type" => "output_text", "text" => "Olá mundo"}]
              }
            ]
          }
        },
        on_delta
      )

    assert Parser.terminal?(state)
    assert_receive {:delta, "Olá"}
    assert_receive {:delta, " mundo"}

    assert {:ok, response} = Parser.finalize(state)
    assert response["id"] == "resp_ws_1"
  end

  test "synthesizes response from output items when completed body is missing" do
    on_delta = fn _delta -> :ok end

    state =
      Parser.new_state()
      |> Parser.handle_event(
        %{
          "type" => "response.output_item.done",
          "item" => %{
            "type" => "function_call",
            "output_index" => 0,
            "name" => "tool_crm_list_people_abc12345",
            "call_id" => "call_1",
            "arguments" => ~s({"name":"Ana"})
          }
        },
        on_delta
      )
      |> Parser.handle_event(%{"type" => "response.done"}, on_delta)

    assert Parser.terminal?(state)

    assert {:ok, response} = Parser.finalize(state)

    assert [%{"type" => "function_call", "name" => "tool_crm_list_people_abc12345"}] =
             response["output"]
  end
end
