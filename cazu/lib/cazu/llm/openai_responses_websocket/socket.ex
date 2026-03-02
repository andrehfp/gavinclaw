defmodule Cazu.LLM.OpenAIResponsesWebSocket.Socket do
  @moduledoc """
  WebSockex wrapper for Responses API websocket mode.
  """

  use WebSockex

  @spec start_link(String.t(), [{String.t(), String.t()}], pid(), keyword()) ::
          GenServer.on_start()
  def start_link(url, headers, owner, opts \\ [])
      when is_binary(url) and is_list(headers) and is_pid(owner) and is_list(opts) do
    state = %{owner: owner}
    websocket_opts = Keyword.merge([extra_headers: headers], opts)
    WebSockex.start_link(url, __MODULE__, state, websocket_opts)
  end

  @spec send_json(pid(), map()) :: :ok
  def send_json(pid, payload) when is_pid(pid) and is_map(payload) do
    WebSockex.cast(pid, {:send_json, payload})
  end

  @spec close(pid()) :: :ok
  def close(pid) when is_pid(pid) do
    WebSockex.cast(pid, :close)
  end

  @impl true
  def handle_connect(_conn, state) do
    send(state.owner, {:openai_responses_ws, :connected})
    {:ok, state}
  end

  @impl true
  def handle_frame({:text, payload}, state) when is_binary(payload) do
    case Jason.decode(payload) do
      {:ok, decoded} ->
        send(state.owner, {:openai_responses_ws, {:event, decoded}})

      {:error, reason} ->
        send(state.owner, {:openai_responses_ws, {:decode_error, inspect(reason)}})
    end

    {:ok, state}
  end

  @impl true
  def handle_frame(_frame, state), do: {:ok, state}

  @impl true
  def handle_cast({:send_json, payload}, state) do
    {:reply, {:text, Jason.encode!(payload)}, state}
  end

  @impl true
  def handle_cast(:close, state) do
    {:close, state}
  end

  @impl true
  def handle_disconnect(%{reason: reason}, state) do
    send(state.owner, {:openai_responses_ws, {:disconnected, inspect(reason)}})
    {:ok, state}
  end
end
