defmodule Cazu.LLM.OpenAIResponsesWebSocket.Parser do
  @moduledoc """
  Parses Responses API websocket events into a final response body.
  """

  @type state :: %{
          response_body: map() | nil,
          text_buffer: String.t(),
          output_items: [map()],
          error: term() | nil,
          terminal?: boolean()
        }

  @spec new_state() :: state()
  def new_state do
    %{
      response_body: nil,
      text_buffer: "",
      output_items: [],
      error: nil,
      terminal?: false
    }
  end

  @spec handle_event(state(), map(), (String.t() -> term())) :: state()
  def handle_event(state, event, on_delta)
      when is_map(state) and is_map(event) and is_function(on_delta, 1) do
    case Map.get(event, "type") do
      "response.output_text.delta" ->
        append_text_delta(state, event, on_delta)

      "response.text.delta" ->
        append_text_delta(state, event, on_delta)

      "response.output_item.added" ->
        add_output_item(state, event)

      "response.output_item.done" ->
        add_output_item(state, event)

      "response.completed" ->
        put_completed_response(state, event)

      "response.done" ->
        put_completed_response(state, event)

      "response.failed" ->
        put_error(state, event)

      "response.incomplete" ->
        put_error(state, event)

      "error" ->
        put_error(state, event)

      _other ->
        state
    end
  end

  @spec terminal?(state()) :: boolean()
  def terminal?(state) when is_map(state), do: state.terminal?

  @spec finalize(state()) :: {:ok, map()} | {:error, term()}
  def finalize(state) when is_map(state) do
    cond do
      not is_nil(state.error) ->
        {:error, {:websocket_mode_error, state.error}}

      is_map(state.response_body) ->
        {:ok, state.response_body}

      state.text_buffer != "" or state.output_items != [] ->
        {:ok, synthesize_response(state)}

      true ->
        {:error, :missing_stream_response}
    end
  end

  defp append_text_delta(state, event, on_delta) do
    delta = Map.get(event, "delta") || Map.get(event, "text")

    if is_binary(delta) and delta != "" do
      on_delta.(delta)
      %{state | text_buffer: state.text_buffer <> delta}
    else
      state
    end
  end

  defp add_output_item(state, event) do
    item = Map.get(event, "item")

    if is_map(item) do
      %{state | output_items: merge_output_item(state.output_items, item)}
    else
      state
    end
  end

  defp put_completed_response(state, event) do
    response = Map.get(event, "response")

    cond do
      is_map(response) ->
        %{state | response_body: response, terminal?: true}

      is_map(event) and Map.get(event, "object") == "response" ->
        %{state | response_body: event, terminal?: true}

      true ->
        %{state | terminal?: true}
    end
  end

  defp put_error(state, event), do: %{state | error: event, terminal?: true}

  defp merge_output_item(items, item) when is_list(items) and is_map(item) do
    output_index = Map.get(item, "output_index")

    cond do
      is_integer(output_index) and output_index >= 0 ->
        upsert_by_output_index(items, output_index, item)

      true ->
        items ++ [item]
    end
  end

  defp upsert_by_output_index(items, output_index, item) do
    case Enum.find_index(items, fn existing ->
           Map.get(existing, "output_index") == output_index
         end) do
      nil ->
        items ++ [item]

      index ->
        List.replace_at(items, index, item)
    end
  end

  defp synthesize_response(state) do
    output_items =
      state.output_items
      |> Enum.reject(&is_nil/1)
      |> Enum.sort_by(&Map.get(&1, "output_index", 999_999))

    output =
      if output_items == [] do
        synthesized_message_output(state.text_buffer)
      else
        output_items
      end

    output_text =
      case extract_output_text(output) do
        "" -> String.trim(state.text_buffer)
        text -> text
      end

    %{
      "id" => "resp_ws_#{System.unique_integer([:positive])}",
      "output" => output,
      "output_text" => output_text
    }
  end

  defp synthesized_message_output(text_buffer) do
    text = String.trim(text_buffer)

    if text == "" do
      []
    else
      [
        %{
          "type" => "message",
          "content" => [
            %{"type" => "output_text", "text" => text}
          ]
        }
      ]
    end
  end

  defp extract_output_text(output) when is_list(output) do
    output
    |> Enum.find_value("", fn item ->
      case item do
        %{"type" => "message", "content" => content} when is_list(content) ->
          content
          |> Enum.map(fn
            %{"type" => "output_text", "text" => text} when is_binary(text) -> text
            %{"text" => text} when is_binary(text) -> text
            _ -> nil
          end)
          |> Enum.reject(&is_nil/1)
          |> Enum.join("\n")
          |> String.trim()

        %{"type" => "output_text", "text" => text} when is_binary(text) ->
          String.trim(text)

        _ ->
          ""
      end
    end)
  end

  defp extract_output_text(_output), do: ""
end
