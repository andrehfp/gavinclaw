defmodule Cazu.LLM.OpenAIResponses do
  @moduledoc """
  OpenAI Responses API client for selecting the next tool action from chat messages.
  """

  alias Cazu.AgentTrace
  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.ResponseUsage
  alias Cazu.LLM.ToolIndex
  alias Cazu.Tools
  alias Cazu.Tools.Specs, as: ToolSpecs

  @default_no_tool_message """
  I could not safely map this request to a tool.
  Please rephrase with objective details (ids, dates, values).
  """

  @namespace_keywords %{
    "finance" =>
      ~w(financeiro financeira financeiros lancamento pagar receber vencimento parcela extrato
         categoria rateio despesa receita aluguel pagamento recebimento contas conta),
    "crm" =>
      ~w(cliente clientes fornecedor fornecedores pessoa pessoas contato contatos cpf cnpj email),
    "invoice" => ~w(nota notas fiscal fiscais nfe nfse fatura faturas),
    "inventory" => ~w(produto produtos estoque item),
    "service" => ~w(servico servicos ordem),
    "charge" => ~w(cobranca cobrar boleto),
    "sales" => ~w(venda vendas pedido pedidos proposta propostas)
  }

  # When a namespace is matched, also include these companions
  @namespace_companions %{
    "finance" => ["crm"],
    "sales" => ["crm", "inventory"],
    "service" => ["crm"]
  }

  @follow_up_tokens ~w(sim nao pode faz tenta novamente isso confirma confirme manda)

  @default_model "gpt-5-mini"
  @default_base_url "https://api.openai.com/v1"
  @default_timeout_ms 10_000
  @default_tool_retrieval_strategy :keyword
  @default_tool_retrieval_top_k 12
  @default_tool_retrieval_min_similarity 0.28
  @history_turns 20
  @history_messages_limit @history_turns * 2
  @history_chars_limit 12_000
  @history_message_chars_limit 500

  def build_tool_specs(tool_names \\ Tools.supported_tools()) when is_list(tool_names) do
    {specs, _tool_map} = build_tool_specs_and_map(tool_names)
    specs
  end

  def select_next_action(%Conversation{} = conversation, user_text, opts \\ [])
      when is_binary(user_text) do
    tools = select_tools_for_turn(conversation, user_text, opts)
    {tool_specs, tool_map} = build_tool_specs_and_map(tools)

    with {:ok, config} <- config(opts),
         {:ok, response_body} <- create_response(config, conversation, user_text, tool_specs),
         {:ok, response_id} <- require_response_id(response_body),
         {:ok, action} <-
           parse_action(response_body, conversation, user_text, response_id, tool_map) do
      {:ok, action}
    end
  end

  def select_next_action_stream(%Conversation{} = conversation, user_text, on_delta, opts \\ [])
      when is_binary(user_text) and is_function(on_delta, 1) do
    tools = select_tools_for_turn(conversation, user_text, opts)
    {tool_specs, tool_map} = build_tool_specs_and_map(tools)

    with {:ok, config} <- config(opts),
         {:ok, response_body} <-
           create_response_stream(config, conversation, user_text, tool_specs, on_delta),
         {:ok, response_id} <- require_response_id(response_body),
         {:ok, action} <-
           parse_action(response_body, conversation, user_text, response_id, tool_map) do
      {:ok, action}
    end
  end

  def summarize_tool_result(user_text, tool_name, result, opts \\ [])
      when is_binary(user_text) and is_binary(tool_name) do
    with {:ok, config} <- config(opts),
         {:ok, response_body} <- create_summary_response(config, user_text, tool_name, result) do
      message = extract_assistant_message(response_body)

      case String.trim(message) do
        "" -> {:error, :empty_summary}
        normalized -> {:ok, normalized}
      end
    end
  end

  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts \\ [])

  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts)
      when is_binary(previous_response_id) and previous_response_id != "" and
             is_binary(llm_tool_call_id) and llm_tool_call_id != "" do
    with {:ok, config} <- config(opts),
         {:ok, response_body} <-
           create_tool_output_response(
             config,
             previous_response_id,
             llm_tool_call_id,
             tool_result
           ),
         {:ok, response_id} <- require_response_id(response_body) do
      follow_up_action(response_body, response_id)
    end
  end

  def continue_with_tool_output(_previous_response_id, _llm_tool_call_id, _tool_result, _opts),
    do: {:error, :invalid_tool_output_context}

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
             is_binary(llm_tool_call_id) and llm_tool_call_id != "" and is_function(on_delta, 1) do
    with {:ok, config} <- config(opts),
         {:ok, response_body} <-
           create_tool_output_response_stream(
             config,
             previous_response_id,
             llm_tool_call_id,
             tool_result,
             on_delta
           ),
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

  defp follow_up_action(response_body, response_id) do
    case extract_tool_call(response_body) do
      {:ok, openai_tool_name, arguments, llm_tool_call_id} ->
        with {:ok, tool_name} <- resolve_tool_name(openai_tool_name),
             true <- Tools.supported_tool?(tool_name) do
          _ =
            AgentTrace.log("openai.follow_up_action", %{
              action_type: "tool",
              response_id: response_id,
              tool_name: tool_name,
              arguments: arguments,
              llm_tool_call_id: llm_tool_call_id
            })

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
          "" ->
            {:error, :empty_follow_up_message}

          normalized ->
            _ =
              AgentTrace.log("openai.follow_up_action", %{
                action_type: "message",
                response_id: response_id,
                message: normalized
              })

            {:ok, %{type: :message, message: normalized, response_id: response_id}}
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

  defp create_response(config, conversation, user_text, tool_specs) do
    if tool_specs == [] do
      {:error, :no_tools_available}
    else
      url = "#{config.base_url}/responses"
      payload = request_body(config, conversation, user_text, tool_specs)

      _ =
        AgentTrace.log("openai.request", %{
          mode: "select_next_action",
          stream: false,
          model: config.model,
          previous_response_id: payload["previous_response_id"],
          tools: Enum.map(tool_specs, &Map.get(&1, "name")),
          input: payload["input"]
        })

      case Req.post(
             url: url,
             receive_timeout: config.timeout_ms,
             headers: [
               {"authorization", "Bearer #{config.api_key}"},
               {"content-type", "application/json"}
             ],
             json: payload
           ) do
        {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
          _ =
            AgentTrace.log("openai.response", %{
              mode: "select_next_action",
              stream: false,
              status: status,
              response_id: body["id"],
              body: body
            })

          _ =
            ResponseUsage.record_select_response(
              conversation,
              body,
              payload["previous_response_id"],
              "select_next_action"
            )

          {:ok, body}

        {:ok, %Req.Response{status: status, body: body}} ->
          _ =
            AgentTrace.log("openai.response", %{
              mode: "select_next_action",
              stream: false,
              status: status,
              body: body
            })

          if missing_tool_output_error?(status, body) do
            {:error, :missing_tool_output_for_previous_response}
          else
            {:error, {:upstream_error, status, body}}
          end

        {:error, error} ->
          _ =
            AgentTrace.log("openai.request_error", %{
              mode: "select_next_action",
              stream: false,
              error: Exception.message(error)
            })

          {:error, {:request_error, Exception.message(error)}}
      end
    end
  end

  defp create_response_stream(config, conversation, user_text, tool_specs, on_delta) do
    if tool_specs == [] do
      {:error, :no_tools_available}
    else
      url = "#{config.base_url}/responses"

      body =
        request_body(config, conversation, user_text, tool_specs)
        |> Map.put("stream", true)

      _ =
        AgentTrace.log("openai.request", %{
          mode: "select_next_action",
          stream: true,
          model: config.model,
          previous_response_id: body["previous_response_id"],
          tools: Enum.map(tool_specs, &Map.get(&1, "name")),
          input: body["input"]
        })

      case Req.post(
             url: url,
             receive_timeout: config.timeout_ms,
             headers: [
               {"authorization", "Bearer #{config.api_key}"},
               {"content-type", "application/json"}
             ],
             json: body,
             decode_body: false,
             into: fn
               {:data, chunk}, {req, resp} ->
                 state =
                   resp.private
                   |> Map.get(:openai_stream_state, new_stream_state())
                   |> parse_sse_chunk(chunk, on_delta)

                 {:cont, {req, put_in(resp.private[:openai_stream_state], state)}}

               _other, acc ->
                 {:cont, acc}
             end
           ) do
        {:ok, %Req.Response{status: status} = response} when status in 200..299 ->
          case get_in(response.private, [:openai_stream_state, :response_body]) do
            parsed when is_map(parsed) ->
              _ =
                AgentTrace.log("openai.response", %{
                  mode: "select_next_action",
                  stream: true,
                  status: status,
                  response_id: parsed["id"],
                  body: parsed
                })

              _ =
                ResponseUsage.record_select_response(
                  conversation,
                  parsed,
                  body["previous_response_id"],
                  "select_next_action"
                )

              {:ok, parsed}

            _ ->
              {:error, :missing_stream_response}
          end

        {:ok, %Req.Response{status: status, body: body}} ->
          parsed_body = parse_error_body(body)

          _ =
            AgentTrace.log("openai.response", %{
              mode: "select_next_action",
              stream: true,
              status: status,
              body: parsed_body
            })

          if missing_tool_output_error?(status, parsed_body) do
            {:error, :missing_tool_output_for_previous_response}
          else
            {:error, {:upstream_error, status, parsed_body}}
          end

        {:error, error} ->
          _ =
            AgentTrace.log("openai.request_error", %{
              mode: "select_next_action",
              stream: true,
              error: Exception.message(error)
            })

          {:error, {:request_error, Exception.message(error)}}
      end
    end
  end

  defp create_summary_response(config, user_text, tool_name, result) do
    url = "#{config.base_url}/responses"
    payload = summary_request_body(config, user_text, tool_name, result)

    _ =
      AgentTrace.log("openai.request", %{
        mode: "summary",
        stream: false,
        model: config.model,
        tool_name: tool_name,
        input: payload["input"]
      })

    case Req.post(
           url: url,
           receive_timeout: config.timeout_ms,
           headers: [
             {"authorization", "Bearer #{config.api_key}"},
             {"content-type", "application/json"}
           ],
           json: payload
         ) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        _ =
          AgentTrace.log("openai.response", %{
            mode: "summary",
            stream: false,
            status: status,
            response_id: body["id"],
            body: body
          })

        {:ok, body}

      {:ok, %Req.Response{status: status, body: body}} ->
        _ =
          AgentTrace.log("openai.response", %{
            mode: "summary",
            stream: false,
            status: status,
            body: body
          })

        {:error, {:upstream_error, status, body}}

      {:error, error} ->
        _ =
          AgentTrace.log("openai.request_error", %{
            mode: "summary",
            stream: false,
            error: Exception.message(error)
          })

        {:error, {:request_error, Exception.message(error)}}
    end
  end

  defp create_tool_output_response(config, previous_response_id, llm_tool_call_id, tool_result) do
    url = "#{config.base_url}/responses"
    follow_up_tools = build_tool_specs(Tools.supported_tools())

    payload = %{
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

    _ =
      AgentTrace.log("openai.request", %{
        mode: "tool_output",
        stream: false,
        model: config.model,
        previous_response_id: previous_response_id,
        llm_tool_call_id: llm_tool_call_id,
        input: payload["input"]
      })

    case Req.post(
           url: url,
           receive_timeout: config.timeout_ms,
           headers: [
             {"authorization", "Bearer #{config.api_key}"},
             {"content-type", "application/json"}
           ],
           json: payload
         ) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        _ =
          AgentTrace.log("openai.response", %{
            mode: "tool_output",
            stream: false,
            status: status,
            response_id: body["id"],
            body: body
          })

        _ = ResponseUsage.record_follow_up_response(previous_response_id, body, "tool_output")

        {:ok, body}

      {:ok, %Req.Response{status: status, body: body}} ->
        _ =
          AgentTrace.log("openai.response", %{
            mode: "tool_output",
            stream: false,
            status: status,
            body: body
          })

        {:error, {:upstream_error, status, body}}

      {:error, error} ->
        _ =
          AgentTrace.log("openai.request_error", %{
            mode: "tool_output",
            stream: false,
            error: Exception.message(error)
          })

        {:error, {:request_error, Exception.message(error)}}
    end
  end

  defp create_tool_output_response_stream(
         config,
         previous_response_id,
         llm_tool_call_id,
         tool_result,
         on_delta
       ) do
    url = "#{config.base_url}/responses"
    follow_up_tools = build_tool_specs(Tools.supported_tools())

    payload = %{
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
      "stream" => true,
      "store" => true
    }

    _ =
      AgentTrace.log("openai.request", %{
        mode: "tool_output",
        stream: true,
        model: config.model,
        previous_response_id: previous_response_id,
        llm_tool_call_id: llm_tool_call_id,
        input: payload["input"]
      })

    case Req.post(
           url: url,
           receive_timeout: config.timeout_ms,
           headers: [
             {"authorization", "Bearer #{config.api_key}"},
             {"content-type", "application/json"}
           ],
           json: payload,
           decode_body: false,
           into: fn
             {:data, chunk}, {req, resp} ->
               state =
                 resp.private
                 |> Map.get(:openai_stream_state, new_stream_state())
                 |> parse_sse_chunk(chunk, on_delta)

               {:cont, {req, put_in(resp.private[:openai_stream_state], state)}}

             _other, acc ->
               {:cont, acc}
           end
         ) do
      {:ok, %Req.Response{status: status} = response} when status in 200..299 ->
        case get_in(response.private, [:openai_stream_state, :response_body]) do
          body when is_map(body) ->
            _ =
              AgentTrace.log("openai.response", %{
                mode: "tool_output",
                stream: true,
                status: status,
                response_id: body["id"],
                body: body
              })

            _ = ResponseUsage.record_follow_up_response(previous_response_id, body, "tool_output")

            {:ok, body}

          _ ->
            {:error, :missing_stream_response}
        end

      {:ok, %Req.Response{status: status, body: body}} ->
        _ =
          AgentTrace.log("openai.response", %{
            mode: "tool_output",
            stream: true,
            status: status,
            body: body
          })

        {:error, {:upstream_error, status, body}}

      {:error, error} ->
        _ =
          AgentTrace.log("openai.request_error", %{
            mode: "tool_output",
            stream: true,
            error: Exception.message(error)
          })

        {:error, {:request_error, Exception.message(error)}}
    end
  end

  defp new_stream_state do
    %{
      buffer: "",
      response_body: nil
    }
  end

  defp parse_sse_chunk(state, chunk, on_delta) when is_binary(chunk) do
    raw = state.buffer <> String.replace(chunk, "\r\n", "\n")
    {frames, rest} = split_sse_frames(raw)

    next_state =
      Enum.reduce(frames, %{state | buffer: ""}, fn frame, acc ->
        handle_sse_frame(acc, frame, on_delta)
      end)

    %{next_state | buffer: rest}
  end

  defp parse_sse_chunk(state, _chunk, _on_delta), do: state

  defp split_sse_frames(raw) when is_binary(raw) do
    parts = String.split(raw, "\n\n")

    case List.pop_at(parts, -1) do
      {nil, _} ->
        {[], ""}

      {tail, complete_frames} ->
        if String.ends_with?(raw, "\n\n") do
          {complete_frames ++ [tail], ""}
        else
          {complete_frames, tail}
        end
    end
  end

  defp handle_sse_frame(state, frame, on_delta) do
    case sse_payload(frame) do
      "[DONE]" ->
        state

      payload when is_binary(payload) ->
        case Jason.decode(payload) do
          {:ok, %{"type" => "response.output_text.delta", "delta" => delta}}
          when is_binary(delta) ->
            on_delta.(delta)
            state

          {:ok, %{"type" => "response.output_text.delta", "text" => delta}}
          when is_binary(delta) ->
            on_delta.(delta)
            state

          {:ok, %{"type" => "response.completed", "response" => response}}
          when is_map(response) ->
            %{state | response_body: response}

          {:ok, %{"response" => response}} when is_map(response) ->
            %{state | response_body: response}

          _ ->
            state
        end

      _ ->
        state
    end
  end

  defp sse_payload(frame) when is_binary(frame) do
    frame
    |> String.split("\n")
    |> Enum.filter(&String.starts_with?(&1, "data:"))
    |> Enum.map(&String.trim_leading(&1, "data:"))
    |> Enum.map(&String.trim/1)
    |> Enum.join("\n")
    |> case do
      "" -> nil
      value -> value
    end
  end

  defp parse_error_body(body) when is_map(body), do: body

  defp parse_error_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, parsed} -> parsed
      _ -> %{"raw_body" => body}
    end
  end

  defp parse_error_body(body), do: %{"raw_body" => inspect(body)}

  defp parse_action(response_body, _conversation, _user_text, response_id, tool_map) do
    case extract_tool_call(response_body) do
      {:ok, openai_tool_name, arguments, llm_tool_call_id} ->
        with {:ok, tool_name} <- map_tool_name(openai_tool_name, tool_map),
             true <- Tools.supported_tool?(tool_name) do
          parsed_arguments = normalize_args(arguments)

          message = extract_tool_assistant_message(response_body)

          _ =
            AgentTrace.log("openai.turn_action", %{
              action_type: "tool",
              response_id: response_id,
              tool_name: tool_name,
              arguments: parsed_arguments,
              llm_tool_call_id: llm_tool_call_id,
              assistant_message: message
            })

          {:ok, {:tool, tool_name, parsed_arguments, response_id, message, llm_tool_call_id}}
        else
          _ -> {:error, :unsupported_tool_from_model}
        end

      :no_tool ->
        message = extract_assistant_message(response_body)

        _ =
          AgentTrace.log("openai.turn_action", %{
            action_type: "no_tool",
            response_id: response_id,
            assistant_message: message
          })

        {:ok, {:no_tool, message, response_id}}

      {:error, reason} ->
        {:error, reason}
    end
  end

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

  defp encode_tool_output(tool_result) when is_binary(tool_result), do: tool_result
  defp encode_tool_output(tool_result), do: Jason.encode!(tool_result)

  defp normalize_args(args) when is_map(args),
    do: Map.new(args, fn {key, value} -> {to_string(key), value} end)

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

  defp require_response_id(%{"id" => response_id})
       when is_binary(response_id) and response_id != "" do
    {:ok, response_id}
  end

  defp require_response_id(_response_body), do: {:error, :missing_response_id}

  defp request_body(config, conversation, user_text, tool_specs) do
    base =
      %{
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

  defp summary_request_body(config, user_text, tool_name, result) do
    focused_result = focus_tool_result_for_user(user_text, tool_name, result)

    %{
      "model" => config.model,
      "instructions" => tool_result_instructions(),
      "input" => """
      User request:
      #{user_text}

      Tool executed:
      #{tool_name}

      Tool result JSON:
      #{Jason.encode!(focused_result)}
      """
    }
  end

  defp instructions do
    """
    You are a pro-active financial operations assistant for Conta Azul. Your role is to actively and efficiently help the user accomplish their financial task by any means possible using the available tools and information.
    Decide the next action for the user request:
    - Always strive to accomplish the user's intent, taking proactive steps to move their request forward.
    - Use exactly one function call when a supported tool can be safely selected.
    - Do not invent unsupported tools.
    - If there is not enough information, first use read/search tools to gather missing IDs whenever possible (for example finance.list_categories, finance.list_financial_accounts, crm.list_people).
      Only ask the user when those lookup tools return no match or multiple ambiguous matches.
    - Never ask the user to open Conta Azul screens or send screenshots for data that can be looked up by tools.
      If a lookup endpoint is temporarily unavailable, proceed with the best possible next tool call and only ask for a direct value when strictly necessary.
    - The tool parameter schema is authoritative: respect required fields and aliases.
    - Never call a write tool with empty arguments.
    - For finance.create_payable and finance.create_receivable, normalize natural language into tool arguments:
      - "2k", "4k", "R$ 2.500" -> numeric "valor"
      - "dia 5 de março", "05/03" -> ISO date in "competenceDate" (YYYY-MM-DD)
      - payment purpose like "aluguel" -> "descricao"
    - Use canonical Conta Azul keys for finance creation when applicable:
      "valor", "competenceDate", "descricao", "rateio", "opcao_condicao_pagamento", "condicao_pagamento".
    - For CRM person creation/update, use canonical person payload fields:
      - "perfis" must be a list of objects with "tipo_perfil" (Cliente, Fornecedor, Transportadora).
      - Never send "perfis" as a single object or use "tipo"/"perfil" inside profile items.
    - "condicao_pagamento" id is not required. Prefer textual option:
      "opcao_condicao_pagamento": "À vista" when user did not specify installments.
    - Do not invent missing business data. If required fields like "rateio"
      are missing from user context, try lookup tools first to resolve IDs/candidates before asking the user.
      Ask a concise clarification only when lookup tools cannot resolve the missing information.
    - When a tool output indicates failure/validation error, continue the workflow:
      either call another tool with corrected arguments or ask the user a concise clarification question.
      Never expose raw API/system errors to the user.
    - Never promise future action in text replies (forbidden examples: "vou fazer", "vou agendar", "te aviso depois").
      Either call the next tool now or ask only for the single missing business field.
    - For short follow-up confirmations (for example "sim", "pode lançar"), continue from existing context instead of restarting a full questionnaire.
    - When replying to the user (without calling tools), respond as a human assistant would:
      never mention IDs, UUIDs, response IDs, or any internal system identifiers.
      Use only business-relevant information: names, values, dates, descriptions.
    """
  end

  defp tool_result_instructions do
    """
    You are a financial operations assistant for Conta Azul.
    A tool has already executed successfully. Your task is to answer the user using the tool result.
    Rules:
    - Answer the user's exact question first. Do not give a generic summary when a specific value is requested.
    - If the user asks for one field from one entity (for example email, phone, document), return only that field.
    - For questions like "qual é o email do cliente X?", prefer: "O e-mail de <nome> é <email>."
    - If the requested entity or field is missing, say that clearly.
    - Only summarize lists/counts when the user explicitly asked for a list/summary.
    - Do not claim actions that are not present in the result.
    - Never promise future action in text replies. If something is still missing, ask only for the missing field.
    - Reply in the same language as the user request.
    - Respond as a human assistant would: never mention IDs, UUIDs, internal identifiers, or technical system details.
      Use only business-relevant information: names, values, dates, descriptions, emails, phones.
    """
  end

  defp tool_output_instructions do
    """
    You are continuing a Conta Azul workflow after receiving a tool execution output.
    Rules:
    - If another tool call is required to complete the user intent, return exactly one function call.
    - If no tool call is needed, return exactly one concise user-facing message with factual status only.
    - Never output internal planning, JSON scratch notes, loops, counters, or pseudo-steps.
    - Never promise future actions (forbidden examples: "vou fazer", "vou agendar", "te aviso", "vou tentar depois").
    - If something is missing, state that the action is not completed and ask only for the missing business data.
    - Never mention internal identifiers (UUIDs, response IDs, call IDs).
    - Reply in the same language as the user.
    """
  end

  defp config(opts) do
    openai = Application.get_env(:cazu, :openai, [])
    api_key = opts[:api_key] || Keyword.get(openai, :api_key)
    model = opts[:model] || Keyword.get(openai, :model, @default_model)
    base_url = opts[:base_url] || Keyword.get(openai, :base_url, @default_base_url)
    timeout_ms = opts[:timeout_ms] || Keyword.get(openai, :timeout_ms, @default_timeout_ms)

    cond do
      not (is_binary(api_key) and api_key != "") ->
        {:error, :missing_api_key}

      not is_binary(model) ->
        {:error, :invalid_model}

      not is_binary(base_url) ->
        {:error, :invalid_base_url}

      not is_integer(timeout_ms) ->
        {:error, :invalid_timeout}

      true ->
        {:ok,
         %{
           api_key: api_key,
           model: model,
           base_url: String.trim_trailing(base_url, "/"),
           timeout_ms: timeout_ms
         }}
    end
  end

  defp build_tool_specs_and_map(tool_names) do
    Enum.reduce(tool_names, {[], %{}}, fn tool_name, {specs, map} ->
      openai_name = openai_tool_name(tool_name)
      spec_definition = ToolSpecs.spec_for(tool_name)

      spec = %{
        "type" => "function",
        "name" => openai_name,
        "description" => spec_definition["description"],
        "parameters" => spec_definition["parameters"]
      }

      {[spec | specs], Map.put(map, openai_name, tool_name)}
    end)
    |> then(fn {specs, map} -> {Enum.reverse(specs), map} end)
  end

  defp select_tools_for_turn(%Conversation{} = conversation, user_text, opts) do
    supported_tools = Tools.supported_tools()

    case explicit_tools_from_opts(opts, supported_tools) do
      {:ok, tools} ->
        tools

      :none ->
        strategy = tool_retrieval_strategy(opts)

        case strategy do
          :keyword ->
            tools = filter_tools_by_namespace(supported_tools, conversation, user_text)

            log_tool_retrieval(%{
              retrieval_strategy: "keyword",
              candidate_count: length(tools),
              fallback_used?: false
            })

            tools

          :embeddings ->
            select_tools_with_embeddings_fallback(
              supported_tools,
              conversation,
              user_text,
              opts,
              "embeddings"
            )

          :hybrid ->
            select_tools_with_embeddings_fallback(
              supported_tools,
              conversation,
              user_text,
              opts,
              "hybrid"
            )
        end
    end
  end

  defp select_tools_for_turn(_conversation, _user_text, opts) do
    supported_tools = Tools.supported_tools()

    case explicit_tools_from_opts(opts, supported_tools) do
      {:ok, tools} -> tools
      :none -> supported_tools
    end
  end

  defp explicit_tools_from_opts(opts, supported_tools) do
    case Keyword.get(opts, :tools) do
      tools when is_list(tools) ->
        filtered =
          tools
          |> Enum.map(&to_string/1)
          |> Enum.filter(&(&1 in supported_tools))
          |> Enum.uniq()

        case filtered do
          [] -> {:ok, supported_tools}
          value -> {:ok, value}
        end

      _ ->
        :none
    end
  end

  defp select_tools_with_embeddings_fallback(
         supported_tools,
         conversation,
         user_text,
         opts,
         strategy
       ) do
    normalized = normalize_text(user_text)

    retrieval_opts = [
      top_k: tool_retrieval_top_k(opts),
      min_similarity: tool_retrieval_min_similarity(opts)
    ]

    case ToolIndex.retrieve(user_text, retrieval_opts) do
      {:ok, tools, meta} ->
        selected =
          tools
          |> Enum.filter(&(&1 in supported_tools))
          |> Enum.uniq()
          |> apply_follow_up_namespace_bias(supported_tools, conversation, normalized)
          |> expand_tools_with_companions(supported_tools)

        case selected do
          [] ->
            fallback_tools = filter_tools_by_namespace(supported_tools, conversation, user_text)

            log_tool_retrieval(%{
              retrieval_strategy: strategy,
              candidate_count: length(fallback_tools),
              top_similarity: meta[:top_similarity],
              fallback_used?: true,
              fallback_reason: "empty_embeddings_result"
            })

            fallback_tools

          filtered ->
            log_tool_retrieval(%{
              retrieval_strategy: strategy,
              candidate_count: length(filtered),
              top_similarity: meta[:top_similarity],
              embedding_latency_ms: meta[:embedding_latency_ms],
              fallback_used?: false
            })

            filtered
        end

      {:error, reason} ->
        fallback_tools = filter_tools_by_namespace(supported_tools, conversation, user_text)

        log_tool_retrieval(%{
          retrieval_strategy: strategy,
          candidate_count: length(fallback_tools),
          fallback_used?: true,
          fallback_reason: inspect(reason)
        })

        fallback_tools
    end
  end

  defp log_tool_retrieval(attrs) when is_map(attrs) do
    _ = AgentTrace.log("tool_retrieval.selection", attrs)
    :ok
  end

  defp apply_follow_up_namespace_bias(tools, supported_tools, conversation, normalized)
       when is_list(tools) and is_list(supported_tools) do
    if follow_up_message?(normalized) do
      case last_used_namespace(conversation) do
        namespace when is_binary(namespace) and namespace != "" ->
          namespace
          |> List.wrap()
          |> expand_with_companions()
          |> then(fn expanded ->
            follow_up_tools = Enum.filter(supported_tools, &(tool_namespace(&1) in expanded))
            Enum.uniq(follow_up_tools ++ tools)
          end)

        _ ->
          tools
      end
    else
      tools
    end
  end

  defp apply_follow_up_namespace_bias(tools, _supported_tools, _conversation, _normalized),
    do: tools

  defp expand_tools_with_companions(tools, supported_tools)
       when is_list(tools) and is_list(supported_tools) do
    namespaces =
      tools
      |> Enum.map(&tool_namespace/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    companions =
      namespaces
      |> expand_with_companions()
      |> then(fn expanded -> Enum.filter(supported_tools, &(tool_namespace(&1) in expanded)) end)

    Enum.uniq(tools ++ companions)
  end

  defp expand_tools_with_companions(tools, _supported_tools), do: tools

  defp filter_tools_by_namespace(supported_tools, conversation, user_text) do
    normalized = normalize_text(user_text)

    namespaces =
      if follow_up_message?(normalized) do
        case last_used_namespace(conversation) do
          nil -> keyword_namespaces(normalized)
          ns -> [ns]
        end
      else
        keyword_namespaces(normalized)
      end

    case namespaces do
      [] ->
        supported_tools

      matched ->
        expanded = expand_with_companions(matched)

        supported_tools
        |> Enum.filter(&(tool_namespace(&1) in expanded))
        |> case do
          [] -> supported_tools
          filtered -> filtered
        end
    end
  end

  defp keyword_namespaces(normalized) do
    query_tokens = tokens(normalized)

    @namespace_keywords
    |> Enum.filter(fn {_namespace, keywords} ->
      Enum.any?(keywords, &MapSet.member?(query_tokens, &1))
    end)
    |> Enum.map(&elem(&1, 0))
  end

  defp expand_with_companions(namespaces) do
    companions = Enum.flat_map(namespaces, &Map.get(@namespace_companions, &1, []))
    Enum.uniq(namespaces ++ companions)
  end

  defp follow_up_message?(normalized) do
    words = String.split(normalized, ~r/\s+/, trim: true)
    length(words) <= 4 and Enum.any?(words, &(&1 in @follow_up_tokens))
  end

  defp last_used_namespace(%Conversation{} = conversation) do
    conversation.metadata
    |> normalize_metadata()
    |> Map.get("messages", [])
    |> normalize_messages()
    |> Enum.reverse()
    |> Enum.find_value(fn message ->
      message
      |> Map.get("tool_name", Map.get(message, :tool_name))
      |> tool_namespace()
    end)
  end

  defp last_used_namespace(_conversation), do: nil

  defp tool_retrieval_strategy(opts) do
    configured =
      Application.get_env(:cazu, :tool_retrieval, [])
      |> Keyword.get(:strategy, @default_tool_retrieval_strategy)

    opts
    |> Keyword.get(:tool_retrieval_strategy, configured)
    |> normalize_strategy()
  end

  defp tool_retrieval_top_k(opts) do
    configured =
      Application.get_env(:cazu, :tool_retrieval, [])
      |> Keyword.get(:top_k, @default_tool_retrieval_top_k)

    case Keyword.get(opts, :top_k, configured) do
      value when is_integer(value) and value > 0 -> value
      _ -> @default_tool_retrieval_top_k
    end
  end

  defp tool_retrieval_min_similarity(opts) do
    configured =
      Application.get_env(:cazu, :tool_retrieval, [])
      |> Keyword.get(:min_similarity, @default_tool_retrieval_min_similarity)

    case Keyword.get(opts, :min_similarity, configured) do
      value when is_float(value) -> value
      value when is_integer(value) -> value / 1
      _ -> @default_tool_retrieval_min_similarity
    end
  end

  defp normalize_strategy(strategy) when is_atom(strategy) do
    if strategy in [:keyword, :embeddings, :hybrid], do: strategy, else: :keyword
  end

  defp normalize_strategy(strategy) when is_binary(strategy) do
    case String.downcase(strategy) do
      "keyword" -> :keyword
      "embeddings" -> :embeddings
      "hybrid" -> :hybrid
      _ -> :keyword
    end
  end

  defp normalize_strategy(_strategy), do: :keyword

  defp tool_namespace(tool_name) when is_binary(tool_name) do
    case String.split(tool_name, ".", parts: 2) do
      [ns, _] when ns != "" -> ns
      _ -> nil
    end
  end

  defp tool_namespace(_), do: nil

  defp openai_tool_name(tool_name) do
    hash =
      :crypto.hash(:sha256, tool_name)
      |> Base.encode16(case: :lower)
      |> binary_part(0, 8)

    safe_name = String.replace(tool_name, ~r/[^a-zA-Z0-9_-]/, "_")
    "tool_#{safe_name}_#{hash}"
  end

  defp map_tool_name(openai_tool_name, tool_map) do
    case Map.fetch(tool_map, openai_tool_name) do
      {:ok, tool_name} -> {:ok, tool_name}
      :error -> {:error, :unknown_tool_name}
    end
  end

  defp missing_tool_output_error?(400, %{"error" => %{"message" => message}})
       when is_binary(message) do
    String.contains?(message, "No tool output found for function call")
  end

  defp missing_tool_output_error?(_status, _body), do: false

  defp focus_tool_result_for_user(user_text, "crm.list_people", result) when is_map(result) do
    items = Map.get(result, "items") || Map.get(result, :items) || []
    normalized_user = normalize_text(user_text)

    asks_specific_field? =
      String.contains?(normalized_user, "email") or
        String.contains?(normalized_user, "e-mail") or
        String.contains?(normalized_user, "telefone") or
        String.contains?(normalized_user, "celular") or
        String.contains?(normalized_user, "cpf") or
        String.contains?(normalized_user, "cnpj") or
        String.contains?(normalized_user, "documento")

    if asks_specific_field? and is_list(items) do
      candidates =
        items
        |> Enum.filter(&is_map/1)
        |> Enum.map(fn item ->
          name = item_name(item)
          %{item: item, score: relevance_score(normalized_user, name)}
        end)
        |> Enum.filter(&(&1.score > 0))
        |> Enum.sort_by(& &1.score, :desc)
        |> Enum.take(3)
        |> Enum.map(&minimize_person_item(&1.item))

      %{
        "items" => candidates,
        "totalItems" => length(candidates)
      }
    else
      result
    end
  end

  defp focus_tool_result_for_user(_user_text, _tool_name, result), do: result

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

  defp minimize_person_item(item) do
    %{
      "nome" => Map.get(item, "nome") || Map.get(item, :nome),
      "email" => Map.get(item, "email") || Map.get(item, :email),
      "telefone" => Map.get(item, "telefone") || Map.get(item, :telefone),
      "documento" => Map.get(item, "documento") || Map.get(item, :documento),
      "tipo_pessoa" => Map.get(item, "tipo_pessoa") || Map.get(item, :tipo_pessoa)
    }
  end

  defp item_name(item) do
    item
    |> Map.get("nome", Map.get(item, :nome, ""))
    |> to_string()
    |> normalize_text()
  end

  defp relevance_score(normalized_user, normalized_name) do
    cond do
      normalized_name == "" -> 0
      String.contains?(normalized_user, normalized_name) -> 100
      true -> token_overlap_score(normalized_user, normalized_name)
    end
  end

  defp token_overlap_score(normalized_user, normalized_name) do
    user_tokens = tokens(normalized_user)
    name_tokens = tokens(normalized_name)

    name_tokens
    |> Enum.count(&MapSet.member?(user_tokens, &1))
  end

  defp tokens(text) do
    text
    |> String.split(~r/[^a-z0-9]+/u, trim: true)
    |> Enum.reject(&(String.length(&1) < 2))
    |> MapSet.new()
  end

  defp normalize_text(text) when is_binary(text) do
    text
    |> String.downcase()
    |> String.normalize(:nfd)
    |> String.replace(~r/[\p{Mn}]/u, "")
    |> String.trim()
  end

  defp normalize_text(_text), do: ""
end
