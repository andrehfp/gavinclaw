defmodule Cazu.LLM.OpenAIResponsesWebSocketTest do
  use ExUnit.Case, async: true

  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponsesWebSocket
  alias Cazu.TestSupport.FakeOpenAIResponsesWSSocket

  test "select_next_action_stream/4 sends response.create and parses tool call" do
    [tool_spec] = OpenAIResponsesWebSocket.build_tool_specs(["crm.list_people"])
    openai_tool_name = tool_spec["name"]

    events = [
      %{"type" => "response.output_text.delta", "delta" => "Analisando..."},
      %{
        "type" => "response.completed",
        "response" => %{
          "id" => "resp_ws_action_1",
          "output" => [
            %{
              "type" => "function_call",
              "name" => openai_tool_name,
              "call_id" => "call_ws_1",
              "arguments" => ~s({"name":"Ana"})
            }
          ]
        }
      }
    ]

    conversation = %Conversation{metadata: %{}, previous_response_id: "resp_prev_1"}
    parent = self()

    on_delta = fn delta -> send(parent, {:delta, delta}) end

    assert {:ok,
            {:tool, "crm.list_people", %{"name" => "Ana"}, "resp_ws_action_1", nil, "call_ws_1"}} =
             OpenAIResponsesWebSocket.select_next_action_stream(
               conversation,
               "liste pessoas com nome Ana",
               on_delta,
               api_key: "test-key",
               model: "gpt-5.2",
               websocket_base_url: "ws://localhost:9999/v1/responses",
               websocket_timeout_ms: 500,
               tools: ["crm.list_people"],
               socket_module: FakeOpenAIResponsesWSSocket,
               socket_opts: [events: events]
             )

    assert_receive {:delta, "Analisando..."}
    assert_receive {:fake_openai_responses_ws_socket, :started, socket_pid}

    [payload] = FakeOpenAIResponsesWSSocket.sent_payloads(socket_pid)

    assert payload["type"] == "response.create"
    assert payload["model"] == "gpt-5.2"
    assert payload["previous_response_id"] == "resp_prev_1"
    assert payload["tool_choice"] == "auto"
    assert is_list(payload["tools"])
  end

  test "continue_with_tool_output_stream/5 sends function_call_output and returns message" do
    events = [
      %{
        "type" => "response.completed",
        "response" => %{
          "id" => "resp_ws_follow_1",
          "output" => [
            %{
              "type" => "message",
              "content" => [
                %{"type" => "output_text", "text" => "Concluído com sucesso."}
              ]
            }
          ]
        }
      }
    ]

    assert {:ok,
            %{
              type: :message,
              message: "Concluído com sucesso.",
              response_id: "resp_ws_follow_1"
            }} =
             OpenAIResponsesWebSocket.continue_with_tool_output_stream(
               "resp_prev_2",
               "call_prev_2",
               %{"ok" => true},
               fn _delta -> :ok end,
               api_key: "test-key",
               model: "gpt-5.2",
               websocket_base_url: "ws://localhost:9999/v1/responses",
               websocket_timeout_ms: 500,
               socket_module: FakeOpenAIResponsesWSSocket,
               socket_opts: [events: events]
             )

    assert_receive {:fake_openai_responses_ws_socket, :started, socket_pid}

    [payload] = FakeOpenAIResponsesWSSocket.sent_payloads(socket_pid)

    assert payload["type"] == "response.create"
    assert payload["previous_response_id"] == "resp_prev_2"

    assert [input_item] = payload["input"]
    assert input_item["type"] == "function_call_output"
    assert input_item["call_id"] == "call_prev_2"
    assert is_binary(input_item["output"])
  end
end
