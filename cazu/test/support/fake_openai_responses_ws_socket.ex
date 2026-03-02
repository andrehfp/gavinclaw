defmodule Cazu.TestSupport.FakeOpenAIResponsesWSSocket do
  @moduledoc false

  def start_link(_url, _headers, owner, opts \\ []) when is_pid(owner) and is_list(opts) do
    events = Keyword.get(opts, :events, [])

    Agent.start_link(fn ->
      %{
        owner: owner,
        events: events,
        sent_payloads: []
      }
    end)
    |> then(fn {:ok, pid} = ok ->
      send(owner, {:fake_openai_responses_ws_socket, :started, pid})
      send(owner, {:openai_responses_ws, :connected})
      ok
    end)
  end

  def send_json(pid, payload) when is_pid(pid) and is_map(payload) do
    {owner, events} =
      Agent.get_and_update(pid, fn state ->
        next_state = %{state | sent_payloads: state.sent_payloads ++ [payload], events: []}
        {{state.owner, state.events}, next_state}
      end)

    Enum.each(events, fn
      {:event, event} when is_map(event) ->
        send(owner, {:openai_responses_ws, {:event, event}})

      {:disconnected, reason} ->
        send(owner, {:openai_responses_ws, {:disconnected, reason}})

      {:decode_error, reason} ->
        send(owner, {:openai_responses_ws, {:decode_error, reason}})

      event when is_map(event) ->
        send(owner, {:openai_responses_ws, {:event, event}})

      _ ->
        :ok
    end)

    :ok
  end

  def close(_pid), do: :ok

  def sent_payloads(pid) when is_pid(pid) do
    Agent.get(pid, & &1.sent_payloads)
  end
end
