defmodule Cazu.LLM.ToolIndex do
  @moduledoc false

  use GenServer

  alias Cazu.AgentTrace
  alias Cazu.Tools
  alias Cazu.Tools.Specs, as: ToolSpecs

  @default_embedding_model "text-embedding-3-small"
  @default_timeout_ms 3_000
  @default_top_k 12
  @default_min_similarity 0.28
  @call_timeout 15_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def status do
    GenServer.call(__MODULE__, :status)
  catch
    :exit, _ -> {:error, :unavailable}
  end

  def retrieve(user_text, opts \\ [])

  def retrieve(user_text, opts) when is_binary(user_text) do
    GenServer.call(__MODULE__, {:retrieve, user_text, opts}, @call_timeout)
  catch
    :exit, _ -> {:error, :unavailable}
  end

  def retrieve(_user_text, _opts), do: {:error, :invalid_query}

  def refresh do
    GenServer.call(__MODULE__, :refresh, @call_timeout)
  catch
    :exit, _ -> {:error, :unavailable}
  end

  @impl true
  def init(_opts) do
    initial_state = %{status: :idle, index: %{}, signature: nil, last_error: nil}

    if embeddings_enabled?() do
      {:ok, initial_state, {:continue, :build_index}}
    else
      {:ok, %{initial_state | status: :disabled}}
    end
  end

  @impl true
  def handle_continue(:build_index, state) do
    case build_index() do
      {:ok, payload} ->
        {:noreply, ready_state(state, payload)}

      {:error, reason} ->
        _ =
          AgentTrace.log("tool_retrieval.index_build_failed", %{
            reason: inspect(reason)
          })

        {:noreply, %{state | index: %{}, signature: nil, status: :degraded, last_error: reason}}
    end
  end

  @impl true
  def handle_call(:refresh, _from, state) do
    if embeddings_enabled?() do
      case build_index() do
        {:ok, payload} ->
          next_state = ready_state(state, payload)
          {:reply, {:ok, :ready}, next_state}

        {:error, reason} ->
          next_state = %{
            state
            | status: :degraded,
              index: %{},
              signature: nil,
              last_error: reason
          }

          {:reply, {:error, reason}, next_state}
      end
    else
      next_state = %{state | status: :disabled, index: %{}, signature: nil, last_error: nil}
      {:reply, {:ok, :disabled}, next_state}
    end
  end

  @impl true
  def handle_call(:status, _from, state) do
    {
      :reply,
      {
        :ok,
        %{
          status: state.status,
          size: map_size(state.index),
          signature: state.signature,
          last_error: state.last_error
        }
      },
      state
    }
  end

  @impl true
  def handle_call({:retrieve, user_text, opts}, _from, state) do
    with {:ok, ready_state_data} <- ensure_index(state),
         {:ok, user_embedding, embedding_latency_ms} <- embed_query(user_text),
         {:ok, top_k} <- resolve_top_k(opts),
         {:ok, min_similarity} <- resolve_min_similarity(opts) do
      ranked = rank_index(ready_state_data.index, user_embedding)
      top_similarity = ranked |> List.first() |> maybe_score()

      tools =
        ranked
        |> Enum.filter(fn {_tool_name, score} -> score >= min_similarity end)
        |> Enum.take(top_k)
        |> Enum.map(&elem(&1, 0))

      if tools == [] do
        _ =
          AgentTrace.log("tool_retrieval.retrieve", %{
            retrieval_strategy: "embeddings",
            candidate_count: 0,
            top_similarity: top_similarity,
            embedding_latency_ms: embedding_latency_ms,
            fallback_used?: true,
            fallback_reason: "low_confidence"
          })

        degraded = %{ready_state_data | status: :ready}
        {:reply, {:error, :low_confidence}, degraded}
      else
        _ =
          AgentTrace.log("tool_retrieval.retrieve", %{
            retrieval_strategy: "embeddings",
            candidate_count: length(tools),
            top_similarity: top_similarity,
            embedding_latency_ms: embedding_latency_ms,
            fallback_used?: false
          })

        meta = %{
          candidate_count: length(tools),
          top_similarity: top_similarity,
          embedding_latency_ms: embedding_latency_ms,
          index_signature: ready_state_data.signature
        }

        {:reply, {:ok, tools, meta}, ready_state_data}
      end
    else
      {:error, :disabled} ->
        {:reply, {:error, :disabled}, %{state | status: :disabled, index: %{}, signature: nil}}

      {:error, reason} ->
        _ =
          AgentTrace.log("tool_retrieval.retrieve", %{
            retrieval_strategy: "embeddings",
            fallback_used?: true,
            fallback_reason: inspect(reason)
          })

        degraded_state = %{
          state
          | status: :degraded,
            index: %{},
            signature: nil,
            last_error: reason
        }

        {:reply, {:error, reason}, degraded_state}
    end
  end

  defp ready_state(state, %{index: index, signature: signature}) do
    %{state | index: index, signature: signature, status: :ready, last_error: nil}
  end

  defp ensure_index(state) do
    if embeddings_enabled?() do
      cond do
        state.status == :ready and map_size(state.index) > 0 and not is_nil(state.signature) ->
          {:ok, state}

        true ->
          case build_index() do
            {:ok, payload} ->
              {:ok, ready_state(state, payload)}

            {:error, reason} ->
              {:error, reason}
          end
      end
    else
      {:error, :disabled}
    end
  end

  defp build_index do
    tools = Tools.supported_tools()

    if Enum.empty?(tools) do
      {:ok, %{index: %{}, signature: nil}}
    else
      texts = Enum.map(tools, &tool_text/1)

      with {:ok, embeddings, _latency_ms} <- embed_inputs(texts),
           true <- length(embeddings) == length(tools) do
        {
          :ok,
          %{
            index: Enum.zip(tools, embeddings) |> Map.new(),
            signature: index_signature(tools, texts)
          }
        }
      else
        false -> {:error, :embedding_count_mismatch}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp tool_text(tool_name) when is_binary(tool_name) do
    spec = ToolSpecs.spec_for(tool_name)

    description = String.trim(to_string(Map.get(spec, "description", "")))
    parameters = Map.get(spec, "parameters", %{})

    required =
      Map.get(parameters, "required", [])
      |> normalize_param_list()

    optional =
      Map.get(parameters, "properties", %{})
      |> Map.keys()
      |> normalize_param_list()
      |> Kernel.--(required)

    alias_context = tool_text_context()
    namespace = tool_namespace(tool_name)
    operation = tool_operation(tool_name)

    [
      "tool_name: #{tool_name}",
      "namespace: #{namespace}",
      "operation: #{operation}",
      "description: #{description}",
      "required_parameters: #{Enum.join(required, ", ")}",
      "optional_parameters: #{Enum.join(optional, ", ")}",
      "context: #{alias_context}",
      "description_version: #{description_version()}"
    ]
    |> Enum.join("\n")
    |> String.trim()
  end

  defp tool_text(_) do
    ""
  end

  defp normalize_param_list(list) when is_list(list) do
    list
    |> Enum.map(&to_string/1)
    |> Enum.filter(&(String.trim(&1) != ""))
    |> Enum.sort()
    |> Enum.uniq()
  end

  defp normalize_param_list(_), do: []

  defp tool_namespace(tool_name) when is_binary(tool_name) do
    case String.split(tool_name, ".", parts: 2) do
      [namespace, _] when namespace != "" -> namespace
      _ -> ""
    end
  end

  defp tool_operation(tool_name) when is_binary(tool_name) do
    case String.split(tool_name, ".", parts: 2) do
      [_, rest] when rest != "" ->
        case String.split(rest, "_", parts: 2) do
          [operation, _] when operation != "" -> operation
          _ -> rest
        end

      _ ->
        ""
    end
  end

  defp description_version do
    tool_retrieval_value(:tool_text_version, "1")
  end

  defp tool_text_context do
    tool_retrieval_value(:tool_text_context, "")
  end

  defp tool_retrieval_value(key, default) do
    value = Application.get_env(:cazu, :tool_retrieval, []) |> Keyword.get(key)

    case value do
      nil -> default
      value when is_binary(value) -> value
      value -> to_string(value)
    end
  end

  defp index_signature(tools, texts) do
    signature_source =
      Enum.zip(tools, texts)
      |> Enum.map_join("\n", fn {tool, text} -> "#{tool}=#{text}" end)

    :crypto.hash(:sha256, signature_source)
    |> Base.encode16(case: :lower)
  end

  defp embed_query(user_text) do
    with {:ok, [embedding], latency_ms} <- embed_inputs([user_text]) do
      {:ok, embedding, latency_ms}
    end
  end

  defp embed_inputs(inputs) when is_list(inputs) do
    with {:ok, config} <- embedding_config() do
      started_at = System.monotonic_time(:millisecond)

      case Req.post(
             url: "#{config.base_url}/embeddings",
             receive_timeout: config.timeout_ms,
             headers: [
               {"authorization", "Bearer #{config.api_key}"},
               {"content-type", "application/json"}
             ],
             json: %{
               "model" => config.model,
               "input" => inputs
             }
           ) do
        {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
          case extract_embeddings(body) do
            {:ok, embeddings} ->
              latency_ms = System.monotonic_time(:millisecond) - started_at
              {:ok, embeddings, latency_ms}

            {:error, reason} ->
              {:error, reason}
          end

        {:ok, %Req.Response{status: status, body: body}} ->
          _ =
            AgentTrace.log("tool_retrieval.embedding_error", %{
              status: status,
              body: body
            })

          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  defp embedding_config do
    openai = Application.get_env(:cazu, :openai, [])
    retrieval = Application.get_env(:cazu, :tool_retrieval, [])

    api_key = Keyword.get(openai, :api_key)
    base_url = Keyword.get(openai, :base_url, "https://api.openai.com/v1")
    model = Keyword.get(retrieval, :embedding_model, @default_embedding_model)
    timeout_ms = Keyword.get(retrieval, :embedding_timeout_ms, @default_timeout_ms)

    cond do
      not (is_binary(api_key) and api_key != "") ->
        {:error, :missing_api_key}

      not is_binary(base_url) ->
        {:error, :invalid_base_url}

      not is_binary(model) ->
        {:error, :invalid_model}

      not (is_integer(timeout_ms) and timeout_ms > 0) ->
        {:error, :invalid_timeout}

      true ->
        {:ok,
         %{
           api_key: api_key,
           base_url: String.trim_trailing(base_url, "/"),
           model: model,
           timeout_ms: timeout_ms
         }}
    end
  end

  defp extract_embeddings(%{"data" => data}) when is_list(data) do
    embeddings =
      data
      |> Enum.filter(&is_map/1)
      |> Enum.sort_by(&Map.get(&1, "index", 0))
      |> Enum.map(&Map.get(&1, "embedding"))

    if Enum.all?(embeddings, &embedding_vector?/1) do
      {:ok, embeddings}
    else
      {:error, :invalid_embeddings_payload}
    end
  end

  defp extract_embeddings(_body), do: {:error, :invalid_embeddings_payload}

  defp embedding_vector?(vector) when is_list(vector) do
    Enum.all?(vector, &is_number/1)
  end

  defp embedding_vector?(_), do: false

  defp resolve_top_k(opts) do
    configured =
      Application.get_env(:cazu, :tool_retrieval, []) |> Keyword.get(:top_k, @default_top_k)

    value = Keyword.get(opts, :top_k, configured)

    if is_integer(value) and value > 0 do
      {:ok, value}
    else
      {:error, :invalid_top_k}
    end
  end

  defp resolve_min_similarity(opts) do
    configured =
      Application.get_env(:cazu, :tool_retrieval, [])
      |> Keyword.get(:min_similarity, @default_min_similarity)

    value = Keyword.get(opts, :min_similarity, configured)

    cond do
      is_float(value) -> {:ok, value}
      is_integer(value) -> {:ok, value / 1}
      true -> {:error, :invalid_min_similarity}
    end
  end

  defp rank_index(index, user_embedding) do
    index
    |> Enum.map(fn {tool_name, tool_embedding} ->
      {tool_name, cosine_similarity(user_embedding, tool_embedding)}
    end)
    |> Enum.sort_by(&elem(&1, 1), :desc)
  end

  defp cosine_similarity(left, right) when is_list(left) and is_list(right) do
    cond do
      left == [] or right == [] ->
        0.0

      length(left) != length(right) ->
        0.0

      true ->
        {dot, left_norm, right_norm} =
          Enum.zip(left, right)
          |> Enum.reduce({0.0, 0.0, 0.0}, fn {a, b}, {dot_acc, left_acc, right_acc} ->
            a_float = a / 1
            b_float = b / 1

            {
              dot_acc + a_float * b_float,
              left_acc + a_float * a_float,
              right_acc + b_float * b_float
            }
          end)

        denominator = :math.sqrt(left_norm) * :math.sqrt(right_norm)

        if denominator == 0.0 do
          0.0
        else
          dot / denominator
        end
    end
  end

  defp cosine_similarity(_, _), do: 0.0

  defp maybe_score({_tool_name, score}) when is_number(score), do: score
  defp maybe_score(_), do: 0.0

  defp embeddings_enabled? do
    Application.get_env(:cazu, :tool_retrieval, [])
    |> Keyword.get(:embeddings_enabled, false)
  end
end
