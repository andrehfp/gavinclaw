defmodule Cazu.Agents.ConversationAgentLifecycle do
  @moduledoc """
  Tracks last activity for conversation agents and prunes idle ones.
  """

  use GenServer

  @table __MODULE__.Table
  @default_idle_timeout_ms 5 * 60 * 1000
  @default_prune_interval_ms 60_000

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @spec touch(String.t()) :: :ok
  def touch(agent_id) when is_binary(agent_id) do
    if pid = Process.whereis(__MODULE__) do
      GenServer.cast(pid, {:touch, agent_id})
    end

    :ok
  end

  @spec forget(String.t()) :: :ok
  def forget(agent_id) when is_binary(agent_id) do
    if pid = Process.whereis(__MODULE__) do
      GenServer.cast(pid, {:forget, agent_id})
    end

    :ok
  end

  @spec prune_now() :: :ok
  def prune_now do
    if pid = Process.whereis(__MODULE__) do
      _ = GenServer.call(pid, :prune_now)
    end

    :ok
  end

  @impl true
  def init(_opts) do
    _ = ensure_table!()

    state = %{
      idle_timeout_ms: idle_timeout_ms(),
      prune_interval_ms: prune_interval_ms(),
      timer_ref: schedule_prune(prune_interval_ms())
    }

    {:ok, state}
  end

  @impl true
  def handle_cast({:touch, agent_id}, state) do
    :ets.insert(@table, {agent_id, now_ms()})
    {:noreply, state}
  end

  @impl true
  def handle_cast({:forget, agent_id}, state) do
    :ets.delete(@table, agent_id)
    {:noreply, state}
  end

  @impl true
  def handle_call(:prune_now, _from, state) do
    {:reply, :ok, prune(state)}
  end

  @impl true
  def handle_info(:prune, state) do
    {:noreply, prune(state)}
  end

  defp prune(state) do
    cutoff = now_ms() - state.idle_timeout_ms

    @table
    |> :ets.tab2list()
    |> Enum.each(fn {agent_id, last_seen_ms} ->
      if last_seen_ms <= cutoff do
        _ = Cazu.Jido.stop_agent(agent_id)
        :ets.delete(@table, agent_id)
      end
    end)

    if is_reference(state.timer_ref) do
      _ = Process.cancel_timer(state.timer_ref)
    end

    %{state | timer_ref: schedule_prune(state.prune_interval_ms)}
  end

  defp schedule_prune(interval_ms) when is_integer(interval_ms) and interval_ms > 0 do
    Process.send_after(self(), :prune, interval_ms)
  end

  defp schedule_prune(_interval_ms) do
    Process.send_after(self(), :prune, @default_prune_interval_ms)
  end

  defp ensure_table! do
    case :ets.info(@table) do
      :undefined ->
        :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])

      _ ->
        @table
    end
  end

  defp idle_timeout_ms do
    :cazu
    |> Application.get_env(:agent_runtime, [])
    |> Keyword.get(:conversation_agent_idle_timeout_ms, @default_idle_timeout_ms)
    |> normalize_timeout(@default_idle_timeout_ms)
  end

  defp prune_interval_ms do
    :cazu
    |> Application.get_env(:agent_runtime, [])
    |> Keyword.get(:conversation_agent_prune_interval_ms, @default_prune_interval_ms)
    |> normalize_timeout(@default_prune_interval_ms)
  end

  defp normalize_timeout(value, _fallback) when is_integer(value) and value > 0, do: value
  defp normalize_timeout(_value, fallback), do: fallback

  defp now_ms, do: System.monotonic_time(:millisecond)
end
