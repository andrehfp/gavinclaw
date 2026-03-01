defmodule CazuWeb.AgentChatLiveTest do
  use CazuWeb.ConnCase

  import Phoenix.LiveViewTest

  test "renders live chat console and key elements", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/agent/chat")

    assert has_element?(view, "#agent-chat-form")
    assert has_element?(view, "#agent-chat-session-form")
    assert has_element?(view, "#agent-chat-messages")
    refute has_element?(view, ".agent-pill-pending")
    refute has_element?(view, "#agent-thinking-bubble")
  end

  test "streams runtime tool events inside chat and toggles processing state", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/agent/chat")

    send(view.pid, {:agent_chat_event, :phase, %{status: "thinking", at: "2026-02-27T12:00:00Z"}})

    assert has_element?(view, "#agent-chat-messages", "Thinking about your request...")

    send(view.pid, {
      :agent_chat_event,
      :phase,
      %{status: "action-selected", tool_name: "crm.list_people", at: "2026-02-27T12:00:00Z"}
    })

    assert has_element?(view, "#agent-chat-messages", "Action selected: crm.list_people")

    send(view.pid, {
      :agent_chat_event,
      :assistant_message,
      %{
        id: "assistant-test-1",
        role: "assistant",
        content: "streaming test",
        action: "no_tool",
        at: "2026-02-27T12:00:00Z"
      }
    })

    assert has_element?(view, ~s([data-markdown-source="streaming test"]))

    send(view.pid, :typing_tick)
    send(view.pid, :typing_tick)
    send(view.pid, :typing_tick)
    send(view.pid, :typing_tick)
    send(view.pid, :typing_tick)

    assert has_element?(view, "#agent-chat-messages article")

    send(view.pid, {
      :agent_chat_event,
      :tool_call,
      %{
        tool_call_id: 77,
        job_id: 31,
        tool_name: "crm.list_people",
        status: "running",
        arguments: %{"busca" => "Ana"},
        at: "2026-02-27T12:00:01Z"
      }
    })

    assert has_element?(view, "#agent-chat-messages", "Running tool crm.list_people...")
    assert has_element?(view, ".agent-pill-pending")
  end
end
