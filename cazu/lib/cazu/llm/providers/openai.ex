defmodule Cazu.LLM.Providers.OpenAI do
  @moduledoc """
  OpenAI provider implementation for the generic `Cazu.LLM.Provider` contract.
  """

  @behaviour Cazu.LLM.Provider

  alias Cazu.AgentTrace
  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.LLM.OpenAIResponsesWebSocket

  @impl true
  def select_next_action(%Conversation{} = conversation, user_text, opts \\ [])
      when is_binary(user_text) and is_list(opts) do
    maybe_call_websocket_mode(
      opts,
      fn -> OpenAIResponsesWebSocket.select_next_action(conversation, user_text, opts) end,
      fn -> OpenAIResponses.select_next_action(conversation, user_text, opts) end,
      "select_next_action"
    )
  end

  @impl true
  def select_next_action_stream(%Conversation{} = conversation, user_text, on_delta, opts \\ [])
      when is_binary(user_text) and is_function(on_delta, 1) and is_list(opts) do
    maybe_call_websocket_mode(
      opts,
      fn ->
        OpenAIResponsesWebSocket.select_next_action_stream(
          conversation,
          user_text,
          on_delta,
          opts
        )
      end,
      fn ->
        OpenAIResponses.select_next_action_stream(conversation, user_text, on_delta, opts)
      end,
      "select_next_action_stream"
    )
  end

  @impl true
  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts \\ [])
      when is_binary(previous_response_id) and is_binary(llm_tool_call_id) and is_list(opts) do
    maybe_call_websocket_mode(
      opts,
      fn ->
        OpenAIResponsesWebSocket.continue_with_tool_output(
          previous_response_id,
          llm_tool_call_id,
          tool_result,
          opts
        )
      end,
      fn ->
        OpenAIResponses.continue_with_tool_output(
          previous_response_id,
          llm_tool_call_id,
          tool_result,
          opts
        )
      end,
      "continue_with_tool_output"
    )
  end

  @impl true
  def continue_with_tool_output_stream(
        previous_response_id,
        llm_tool_call_id,
        tool_result,
        on_delta,
        opts \\ []
      )
      when is_binary(previous_response_id) and is_binary(llm_tool_call_id) and
             is_function(on_delta, 1) and is_list(opts) do
    maybe_call_websocket_mode(
      opts,
      fn ->
        OpenAIResponsesWebSocket.continue_with_tool_output_stream(
          previous_response_id,
          llm_tool_call_id,
          tool_result,
          on_delta,
          opts
        )
      end,
      fn ->
        OpenAIResponses.continue_with_tool_output_stream(
          previous_response_id,
          llm_tool_call_id,
          tool_result,
          on_delta,
          opts
        )
      end,
      "continue_with_tool_output_stream"
    )
  end

  @impl true
  def summarize_tool_result(user_text, tool_name, result, opts \\ [])
      when is_binary(user_text) and is_binary(tool_name) and is_list(opts) do
    OpenAIResponses.summarize_tool_result(user_text, tool_name, result, opts)
  end

  @impl true
  def build_tool_specs(tool_names) when is_list(tool_names) do
    if websocket_mode_enabled?([]) do
      OpenAIResponsesWebSocket.build_tool_specs(tool_names)
    else
      OpenAIResponses.build_tool_specs(tool_names)
    end
  end

  defp maybe_call_websocket_mode(opts, websocket_fun, fallback_fun, operation)
       when is_list(opts) and is_function(websocket_fun, 0) and is_function(fallback_fun, 0) and
              is_binary(operation) do
    if websocket_mode_enabled?(opts) do
      case websocket_fun.() do
        {:ok, _result} = ok ->
          ok

        {:error, reason} ->
          _ =
            AgentTrace.log("openai.websocket_mode.fallback", %{
              operation: operation,
              reason: inspect(reason)
            })

          fallback_fun.()
      end
    else
      fallback_fun.()
    end
  end

  defp websocket_mode_enabled?(opts) when is_list(opts) do
    case Keyword.fetch(opts, :websocket_mode_enabled) do
      {:ok, value} -> truthy?(value)
      :error -> configured_websocket_mode_enabled?()
    end
  end

  defp configured_websocket_mode_enabled? do
    :cazu
    |> Application.get_env(:llm, [])
    |> Keyword.get(:websocket_mode_enabled, false)
    |> truthy?()
  end

  defp truthy?(value) when value in [true, 1, "1"], do: true

  defp truthy?(value) when is_binary(value) do
    String.downcase(String.trim(value)) in ["true", "yes", "on"]
  end

  defp truthy?(_value), do: false
end
