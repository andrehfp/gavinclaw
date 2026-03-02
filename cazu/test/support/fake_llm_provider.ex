defmodule Cazu.TestSupport.FakeLLMProvider do
  @moduledoc false

  @behaviour Cazu.LLM.Provider

  alias Cazu.Conversations.Conversation

  @impl true
  def select_next_action(%Conversation{}, _user_text, _opts) do
    fetch!(:select_next_action)
  end

  @impl true
  def select_next_action_stream(%Conversation{}, _user_text, _on_delta, _opts) do
    fetch!(:select_next_action_stream)
  end

  @impl true
  def continue_with_tool_output(_previous_response_id, _llm_tool_call_id, _tool_result, _opts) do
    fetch!(:continue_with_tool_output)
  end

  @impl true
  def continue_with_tool_output_stream(
        _previous_response_id,
        _llm_tool_call_id,
        _tool_result,
        _on_delta,
        _opts
      ) do
    fetch!(:continue_with_tool_output_stream)
  end

  @impl true
  def summarize_tool_result(_user_text, _tool_name, _result, _opts) do
    fetch!(:summarize_tool_result)
  end

  @impl true
  def build_tool_specs(tool_names) when is_list(tool_names) do
    Enum.map(tool_names, fn tool_name ->
      %{
        "type" => "function",
        "name" => tool_name,
        "description" => "fake #{tool_name}",
        "parameters" => %{"type" => "object", "properties" => %{}}
      }
    end)
  end

  defp fetch!(key) do
    config = Application.get_env(:cazu, __MODULE__, [])

    case Keyword.fetch(config, key) do
      {:ok, value} -> value
      :error -> {:error, {:fake_provider_missing_response, key}}
    end
  end
end
