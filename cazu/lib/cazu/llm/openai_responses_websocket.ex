defmodule Cazu.LLM.OpenAIResponsesWebSocket do
  @moduledoc """
  OpenAI Responses API client using WebSocket mode (`/v1/responses`).
  """

  alias Cazu.AgentTrace
  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.LLM.OpenAIResponsesWebSocket.Parser
  alias Cazu.LLM.OpenAIResponsesWebSocket.Socket
  alias Cazu.Tools

  @default_no_tool_message """
  I could not safely map this request to a tool.
  Please rephrase with objective details (ids, dates, values).
  """

  @default_model "gpt-5-mini"
  @default_websocket_base_url "wss://api.openai.com/v1/responses"
  @default_timeout_ms 30_000

  @history_turns 20
  @history_messages_limit @history_turns * 2
  @history_chars_limit 12_000
  @history_message_chars_limit 500

  @spec build_tool_specs([String.t()]) :: [map()]
  def build_tool_specs(tool_names \\ Tools.supported_tools()) when is_list(tool_names) do
    OpenAIResponses.build_tool_specs(tool_names)
  end

  @spec select_next_action(Conversation.t(), String.t(), keyword()) ::
          {:ok, tuple()} | {:error, term()}
  def select_next_action(%Conversation{} = conversation, user_text, opts \\ [])
      when is_binary(user_text) and is_list(opts) do
    select_next_action_stream(conversation, user_text, fn _delta -> :ok end, opts)
  end

  @spec select_next_action_stream(Conversation.t(), String.t(), (String.t() -> term()), keyword()) ::
          {:ok, tuple()} | {:error, term()}
  def select_next_action_stream(%Conversation{} = conversation, user_text, on_delta, opts \\ [])
      when is_binary(user_text) and is_function(on_delta, 1) and is_list(opts) do
    tools = select_tools(opts)
    {tool_specs, tool_map} = build_tool_specs_and_map(tools)

    if tool_specs == [] do
      {:error, :no_tools_available}
    else
      with {:ok, config} <- config(opts),
           request <- select_request_body(config, conversation, user_text, tool_specs),
           {:ok, response_body} <- send_response_create(request, config, on_delta, opts),
           {:ok, response_id} <- require_response_id(response_body),
           {:ok, action} <- parse_action(response_body, response_id, tool_map) do
        {:ok, action}
      end
    end
  end

  @spec summarize_tool_result(String.t(), String.t(), term(), keyword()) ::
          {:ok, String.t()} | {:error, term()}
  def summarize_tool_result(user_text, tool_name, result, opts \\ []) do
    OpenAIResponses.summarize_tool_result(user_text, tool_name, result, opts)
  end

  @spec continue_with_tool_output(String.t(), String.t(), term(), keyword()) ::
          {:ok, map()} | {:error, term()}
  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts \\ [])

  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts)
      when is_binary(previous_response_id) and previous_response_id != "" and
             is_binary(llm_tool_call_id) and llm_tool_call_id != "" and is_list(opts) do
    continue_with_tool_output_stream(
      previous_response_id,
      llm_tool_call_id,
      tool_result,
      fn _delta -> :ok end,
      opts
    )
  end

  def continue_with_tool_output(_previous_response_id, _llm_tool_call_id, _tool_result, _opts),
    do: {:error, :invalid_tool_output_context}

  @spec continue_with_tool_output_stream(
          String.t(),
          String.t(),
          term(),
          (String.t() -> term()),
          keyword()
        ) :: {:ok, map()} | {:error, term()}
  def continue_with_tool_output_stream(
        previous_response_id,
        llm_tool_call_id,
        tool_result,
        on_delta,
        opts \\ []
      )

  def continue_with_tool_output_stream(
        previous_response_id,
        llm_tool_call_id,
        tool_result,
        on_delta,
        opts
      )
      when is_binary(previous_response_id) and previous_response_id != "" and
             is_binary(llm_tool_call_id) and llm_tool_call_id != "" and
             is_function(on_delta, 1) and is_list(opts) do
    follow_up_tools = build_tool_specs(Tools.supported_tools())

    with {:ok, config} <- config(opts),
         request <-
           follow_up_request_body(
             config,
             previous_response_id,
             llm_tool_call_id,
             tool_result,
             follow_up_tools
           ),
         {:ok, response_body} <- send_response_create(request, config, on_delta, opts),
         {:ok, response_id} <- require_response_id(response_body) do
      follow_up_action(response_body, response_id)
    end
  end

  def continue_with_tool_output_stream(
        _previous_response_id,
        _llm_tool_call_id,
        _tool_result,
        _on_delta,
        _opts
      ),
      do: {:error, :invalid_tool_output_context}

  defp send_response_create(request, config, on_delta, opts) do
    _ =
      AgentTrace.log("openai.request", %{
        mode: "responses_websocket",
        request_type: request["type"],
        model: request["model"],
        previous_response_id: request["previous_response_id"],
        input: request["input"]
      })

    socket_module = Keyword.get(opts, :socket_module, Socket)
    socket_opts = Keyword.get(opts, :socket_opts, [])

    with {:ok, socket_pid} <-
           socket_module.start_link(
             ws_url(config),
             websocket_headers(config),
             self(),
             socket_opts
           ) do
      result =
        with :ok <- await_socket_connected(config.timeout_ms),
             :ok <- socket_module.send_json(socket_pid, request),
             {:ok, response_body} <- await_response(config.timeout_ms, on_delta) do
          _ =
            AgentTrace.log("openai.response", %{
              mode: "responses_websocket",
              response_id: response_body["id"],
              body: response_body
            })

          {:ok, response_body}
        end

      _ = socket_module.close(socket_pid)

      case result do
        {:ok, _response_body} = ok ->
          ok

        {:error, reason} = error ->
          _ =
            AgentTrace.log("openai.request_error", %{
              mode: "responses_websocket",
              reason: inspect(reason)
            })

          error
      end
    else
      {:error, reason} = error ->
        _ =
          AgentTrace.log("openai.request_error", %{
            mode: "responses_websocket",
            reason: inspect(reason)
          })

        error
    end
  end

  defp await_socket_connected(timeout_ms) do
    receive do
      {:openai_responses_ws, :connected} ->
        :ok

      {:openai_responses_ws, {:disconnected, reason}} ->
        {:error, {:socket_disconnected, reason}}

      {:openai_responses_ws, {:decode_error, reason}} ->
        {:error, {:socket_decode_error, reason}}
    after
      timeout_ms ->
        {:error, :socket_connect_timeout}
    end
  end

  defp await_response(timeout_ms, on_delta) when is_integer(timeout_ms) and timeout_ms > 0 do
    do_await_response(Parser.new_state(), timeout_ms, on_delta)
  end

  defp do_await_response(state, timeout_ms, on_delta) do
    receive do
      {:openai_responses_ws, {:event, event}} when is_map(event) ->
        next_state = Parser.handle_event(state, event, on_delta)

        if Parser.terminal?(next_state) do
          Parser.finalize(next_state)
        else
          do_await_response(next_state, timeout_ms, on_delta)
        end

      {:openai_responses_ws, {:decode_error, reason}} ->
        {:error, {:socket_decode_error, reason}}

      {:openai_responses_ws, {:disconnected, reason}} ->
        case Parser.finalize(state) do
          {:ok, response} -> {:ok, response}
          {:error, _} -> {:error, {:socket_disconnected, reason}}
        end
    after
      timeout_ms ->
        Parser.finalize(state)
    end
  end

  defp websocket_headers(config) do
    [{"authorization", "Bearer #{config.api_key}"}]
    |> maybe_put_beta_header(config.websocket_beta_header)
  end

  defp maybe_put_beta_header(headers, value) when is_binary(value) and value != "" do
    headers ++ [{"openai-beta", value}]
  end

  defp maybe_put_beta_header(headers, _value), do: headers

  defp ws_url(config), do: config.websocket_base_url

  defp select_request_body(config, conversation, user_text, tool_specs) do
    base = %{
      "type" => "response.create",
      "model" => config.model,
      "instructions" => instructions(),
      "input" => build_input(conversation, user_text),
      "tool_choice" => "auto",
      "parallel_tool_calls" => true,
      "store" => true,
      "tools" => tool_specs
    }

    case conversation.previous_response_id do
      previous_response_id when is_binary(previous_response_id) and previous_response_id != "" ->
        Map.put(base, "previous_response_id", previous_response_id)

      _ ->
        base
    end
  end

  defp follow_up_request_body(
         config,
         previous_response_id,
         llm_tool_call_id,
         tool_result,
         follow_up_tools
       ) do
    %{
      "type" => "response.create",
      "model" => config.model,
      "previous_response_id" => previous_response_id,
      "instructions" => tool_output_instructions(),
      "tool_choice" => "auto",
      "parallel_tool_calls" => true,
      "tools" => follow_up_tools,
      "input" => [
        %{
          "type" => "function_call_output",
          "call_id" => llm_tool_call_id,
          "output" => encode_tool_output(tool_result)
        }
      ],
      "store" => true
    }
  end

  defp build_tool_specs_and_map(tool_names) do
    tool_specs = build_tool_specs(tool_names)

    map =
      tool_specs
      |> Enum.zip(tool_names)
      |> Enum.reduce(%{}, fn
        {%{"name" => openai_name}, tool_name}, acc when is_binary(openai_name) ->
          Map.put(acc, openai_name, tool_name)

        _, acc ->
          acc
      end)

    {tool_specs, map}
  end

  defp parse_action(response_body, response_id, tool_map) do
    case extract_tool_call(response_body) do
      {:ok, openai_tool_name, arguments, llm_tool_call_id} ->
        with {:ok, tool_name} <- map_tool_name(openai_tool_name, tool_map),
             true <- Tools.supported_tool?(tool_name) do
          parsed_arguments = normalize_args(arguments)
          message = extract_tool_assistant_message(response_body)

          {:ok, {:tool, tool_name, parsed_arguments, response_id, message, llm_tool_call_id}}
        else
          _ -> {:error, :unsupported_tool_from_model}
        end

      :no_tool ->
        message = extract_assistant_message(response_body)
        {:ok, {:no_tool, message, response_id}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp follow_up_action(response_body, response_id) do
    case extract_tool_call(response_body) do
      {:ok, openai_tool_name, arguments, llm_tool_call_id} ->
        with {:ok, tool_name} <- resolve_tool_name(openai_tool_name),
             true <- Tools.supported_tool?(tool_name) do
          {:ok,
           %{
             type: :tool,
             tool_name: tool_name,
             arguments: normalize_args(arguments),
             response_id: response_id,
             llm_tool_call_id: llm_tool_call_id
           }}
        else
          _ -> {:error, :unsupported_tool_from_model}
        end

      :no_tool ->
        message = extract_assistant_message(response_body)

        case String.trim(message) do
          "" -> {:error, :empty_follow_up_message}
          normalized -> {:ok, %{type: :message, message: normalized, response_id: response_id}}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp resolve_tool_name(raw_tool_name) when is_binary(raw_tool_name) do
    if Tools.supported_tool?(raw_tool_name) do
      {:ok, raw_tool_name}
    else
      {_specs, tool_map} = build_tool_specs_and_map(Tools.supported_tools())
      map_tool_name(raw_tool_name, tool_map)
    end
  end

  defp resolve_tool_name(_raw_tool_name), do: {:error, :unknown_tool_name}

  defp extract_tool_call(%{"output" => output}) when is_list(output) do
    case Enum.find(output, &function_call?/1) do
      nil -> :no_tool
      tool_call -> parse_tool_call(tool_call)
    end
  end

  defp extract_tool_call(_), do: :no_tool

  defp function_call?(%{"type" => type, "name" => name})
       when type in ["function_call", "tool_call"] and is_binary(name),
       do: true

  defp function_call?(_), do: false

  defp parse_tool_call(%{"name" => tool_name} = tool_call) do
    arguments = tool_call["arguments"] || tool_call["input"] || %{}
    call_id = tool_call["call_id"]

    with {:ok, parsed_arguments} <- parse_arguments(arguments),
         {:ok, parsed_call_id} <- parse_call_id(call_id) do
      {:ok, tool_name, parsed_arguments, parsed_call_id}
    end
  end

  defp parse_call_id(call_id) when is_binary(call_id) and call_id != "", do: {:ok, call_id}
  defp parse_call_id(_call_id), do: {:error, :missing_tool_call_id}

  defp parse_arguments(arguments) when is_map(arguments), do: {:ok, arguments}

  defp parse_arguments(arguments) when is_binary(arguments) do
    case Jason.decode(arguments) do
      {:ok, decoded} when is_map(decoded) -> {:ok, decoded}
      {:ok, _decoded} -> {:error, :invalid_tool_arguments}
      {:error, _reason} -> {:error, :invalid_tool_arguments}
    end
  end

  defp parse_arguments(_arguments), do: {:error, :invalid_tool_arguments}

  defp require_response_id(%{"id" => response_id})
       when is_binary(response_id) and response_id != "" do
    {:ok, response_id}
  end

  defp require_response_id(_response_body), do: {:error, :missing_response_id}

  defp extract_assistant_message(%{"output_text" => output_text}) when is_binary(output_text) do
    normalized = String.trim(output_text)
    if normalized == "", do: @default_no_tool_message, else: normalized
  end

  defp extract_assistant_message(%{"output" => output}) when is_list(output) do
    output
    |> Enum.find_value(&message_text_from_output/1)
    |> case do
      message when is_binary(message) and message != "" -> message
      _ -> @default_no_tool_message
    end
  end

  defp extract_assistant_message(_response_body), do: @default_no_tool_message

  defp extract_tool_assistant_message(response_body) do
    case extract_assistant_message(response_body) do
      @default_no_tool_message -> nil
      message -> message
    end
  end

  defp message_text_from_output(%{"type" => "message", "content" => content})
       when is_list(content) do
    content
    |> Enum.map(&message_text_from_content/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n")
    |> String.trim()
    |> case do
      "" -> nil
      message -> message
    end
  end

  defp message_text_from_output(%{"type" => "output_text", "text" => text})
       when is_binary(text) do
    text |> String.trim() |> blank_to_nil()
  end

  defp message_text_from_output(_), do: nil

  defp message_text_from_content(%{"type" => "output_text", "text" => text})
       when is_binary(text) do
    text |> String.trim() |> blank_to_nil()
  end

  defp message_text_from_content(%{"text" => text}) when is_binary(text) do
    text |> String.trim() |> blank_to_nil()
  end

  defp message_text_from_content(_), do: nil

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(text), do: text

  defp normalize_args(args) when is_map(args),
    do: Map.new(args, fn {key, value} -> {to_string(key), value} end)

  defp map_tool_name(openai_tool_name, tool_map) do
    case Map.fetch(tool_map, openai_tool_name) do
      {:ok, tool_name} -> {:ok, tool_name}
      :error -> {:error, :unknown_tool_name}
    end
  end

  defp encode_tool_output(tool_result) when is_binary(tool_result), do: tool_result
  defp encode_tool_output(tool_result), do: Jason.encode!(tool_result)

  defp build_input(%Conversation{previous_response_id: id}, user_text)
       when is_binary(user_text) and is_binary(id) and id != "" do
    user_text
  end

  defp build_input(conversation, user_text) when is_binary(user_text) do
    history_block = build_history_block(conversation)

    if history_block == "" do
      user_text
    else
      """
      Recent conversation history (oldest to newest):
      #{history_block}

      Current user message:
      #{String.trim(user_text)}
      """
      |> String.trim()
    end
  end

  defp build_input(_conversation, user_text), do: to_string(user_text)

  defp build_history_block(%Conversation{} = conversation) do
    conversation.metadata
    |> normalize_metadata()
    |> Map.get("messages", [])
    |> normalize_messages()
    |> Enum.take(-@history_messages_limit)
    |> Enum.map(&format_history_message/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n")
    |> truncate_text(@history_chars_limit)
  end

  defp build_history_block(_conversation), do: ""

  defp format_history_message(message) when is_map(message) do
    role = role_label(Map.get(message, "role", Map.get(message, :role)))
    content = message_content(message)

    case String.trim(content) do
      "" -> nil
      text -> "#{role}: #{truncate_text(text, @history_message_chars_limit)}"
    end
  end

  defp format_history_message(_), do: nil

  defp role_label("user"), do: "User"
  defp role_label("assistant"), do: "Assistant"
  defp role_label(other) when is_binary(other), do: String.capitalize(other)
  defp role_label(_), do: "Message"

  defp message_content(message) when is_map(message) do
    message
    |> Map.get("content", Map.get(message, :content, ""))
    |> to_string()
    |> String.trim()
  end

  defp normalize_metadata(metadata) when is_map(metadata),
    do: Map.new(metadata, fn {key, value} -> {to_string(key), value} end)

  defp normalize_metadata(_metadata), do: %{}

  defp normalize_messages(messages) when is_list(messages), do: Enum.filter(messages, &is_map/1)
  defp normalize_messages(_messages), do: []

  defp truncate_text(text, max_chars) when is_binary(text) and is_integer(max_chars) do
    if String.length(text) <= max_chars do
      text
    else
      String.slice(text, 0, max_chars)
    end
  end

  defp select_tools(opts) do
    supported_tools = Tools.supported_tools()

    case Keyword.get(opts, :tools) do
      tools when is_list(tools) ->
        filtered =
          tools
          |> Enum.map(&to_string/1)
          |> Enum.filter(&(&1 in supported_tools))
          |> Enum.uniq()

        case filtered do
          [] -> supported_tools
          value -> value
        end

      _ ->
        supported_tools
    end
  end

  defp config(opts) do
    openai = Application.get_env(:cazu, :openai, [])

    api_key = opts[:api_key] || Keyword.get(openai, :api_key)
    model = opts[:model] || Keyword.get(openai, :model, @default_model)

    websocket_base_url =
      opts[:websocket_base_url] ||
        Keyword.get(openai, :websocket_base_url, @default_websocket_base_url)

    websocket_timeout_ms =
      opts[:websocket_timeout_ms] ||
        opts[:timeout_ms] ||
        Keyword.get(
          openai,
          :websocket_timeout_ms,
          Keyword.get(openai, :timeout_ms, @default_timeout_ms)
        )

    websocket_beta_header =
      opts[:websocket_beta_header] || Keyword.get(openai, :websocket_beta_header)

    cond do
      not (is_binary(api_key) and api_key != "") ->
        {:error, :missing_api_key}

      not (is_binary(model) and model != "") ->
        {:error, :invalid_model}

      not (is_binary(websocket_base_url) and websocket_base_url != "") ->
        {:error, :invalid_websocket_base_url}

      not (is_integer(websocket_timeout_ms) and websocket_timeout_ms > 0) ->
        {:error, :invalid_timeout}

      websocket_beta_header != nil and not is_binary(websocket_beta_header) ->
        {:error, :invalid_websocket_beta_header}

      true ->
        {:ok,
         %{
           api_key: api_key,
           model: model,
           websocket_base_url: websocket_base_url,
           websocket_timeout_ms: websocket_timeout_ms,
           timeout_ms: websocket_timeout_ms,
           websocket_beta_header: websocket_beta_header
         }}
    end
  end

  defp instructions do
    """
    You are a pro-active financial operations assistant for Conta Azul. Your role is to actively and efficiently help the user accomplish their financial task by any means possible using the available tools and information.
    Decide the next action for the user request:
    - Use exactly one function call when a supported tool can be safely selected.
    - Do not invent unsupported tools.
    - The tool parameter schema is authoritative: respect required fields and aliases.
    - Never call a write tool with empty arguments.
    - When replying to the user (without calling tools), respond as a human assistant would.
    - Never promise future action in text replies.
    """
  end

  defp tool_output_instructions do
    """
    You are continuing a Conta Azul workflow after receiving a tool execution output.
    Rules:
    - If another tool call is required to complete the user intent, return exactly one function call.
    - If no tool call is needed, return exactly one concise user-facing message with factual status only.
    - Never output internal planning.
    - Never promise future actions.
    """
  end
end
