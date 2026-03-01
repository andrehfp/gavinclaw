defmodule Cazu.LLM.ResponseUsage do
  @moduledoc """
  Tracks OpenAI Responses API usage and estimated token cost.
  """

  alias Cazu.AgentTrace
  alias Cazu.Conversations.Conversation
  alias Cazu.Repo
  use Ecto.Schema
  import Ecto.Changeset

  @default_stage "select_next_action"
  @request_stages ["select_next_action", "tool_output", "summary"]

  schema "llm_response_usages" do
    belongs_to :conversation, Conversation

    field :tenant_id, :integer
    field :chat_id, :string
    field :response_id, :string
    field :previous_response_id, :string
    field :request_stage, :string
    field :model, :string
    field :input_tokens, :integer, default: 0
    field :output_tokens, :integer, default: 0
    field :total_tokens, :integer, default: 0
    field :cached_input_tokens, :integer, default: 0
    field :input_cost_usd, :float
    field :output_cost_usd, :float
    field :total_cost_usd, :float
    field :metadata, :map, default: %{}

    timestamps()
  end

  def changeset(response_usage, attrs) do
    response_usage
    |> cast(attrs, [
      :conversation_id,
      :tenant_id,
      :chat_id,
      :response_id,
      :previous_response_id,
      :request_stage,
      :model,
      :input_tokens,
      :output_tokens,
      :total_tokens,
      :cached_input_tokens,
      :input_cost_usd,
      :output_cost_usd,
      :total_cost_usd,
      :metadata
    ])
    |> validate_required([
      :tenant_id,
      :chat_id,
      :response_id,
      :request_stage,
      :model
    ])
    |> validate_inclusion(:request_stage, @request_stages)
    |> unique_constraint(:response_id)
    |> validate_non_negative(:input_tokens)
    |> validate_non_negative(:output_tokens)
    |> validate_non_negative(:total_tokens)
    |> validate_non_negative(:cached_input_tokens)
    |> validate_non_negative(:input_cost_usd)
    |> validate_non_negative(:output_cost_usd)
    |> validate_non_negative(:total_cost_usd)
  end

  def record_select_response(
        %Conversation{} = conversation,
        response_body,
        previous_response_id \\ nil,
        request_stage \\ @default_stage
      ) do
    context =
      Map.take(conversation, [:id, :tenant_id, :chat_id])
      |> Map.merge(%{"previous_response_id" => previous_response_id})

    record_for_context(response_body, context, request_stage)
  end

  def record_follow_up_response(
        previous_response_id,
        response_body,
        request_stage \\ "tool_output"
      )

  def record_follow_up_response(previous_response_id, response_body, request_stage)
      when is_binary(previous_response_id) do
    context =
      case find_by_response_id(previous_response_id) do
        nil ->
          %{"previous_response_id" => previous_response_id}

        usage ->
          %{
            "conversation_id" => usage.conversation_id,
            "tenant_id" => usage.tenant_id,
            "chat_id" => usage.chat_id,
            "previous_response_id" => previous_response_id
          }
      end

    record_for_context(response_body, context, request_stage)
  end

  def record_follow_up_response(_previous_response_id, _response_body, _request_stage), do: :ok

  def find_by_response_id(response_id) when is_binary(response_id) do
    Repo.get_by(__MODULE__, response_id: response_id)
  end

  def find_by_response_id(_response_id), do: nil

  defp record_for_context(response_body, context, request_stage) do
    with {:ok, attrs} <- build_attrs(response_body, context, request_stage),
         false <- usage_exists?(attrs["response_id"] || attrs[:response_id]) do
      case Repo.insert(
             %__MODULE__{}
             |> changeset(attrs),
             on_conflict: :nothing,
             conflict_target: :response_id
           ) do
        {:ok, %__MODULE__{} = record} ->
          _ =
            AgentTrace.log("llm_usage.saved", %{
              response_id: record.response_id,
              conversation_id: record.conversation_id,
              tenant_id: record.tenant_id,
              chat_id: record.chat_id,
              stage: request_stage,
              model: record.model,
              total_tokens: record.total_tokens,
              total_cost_usd: record.total_cost_usd
            })

          :ok

        {:ok, nil} ->
          :ok

        {:error, changeset} ->
          _ =
            AgentTrace.log("llm_usage.save_failed", %{
              errors: inspect(changeset.errors),
              stage: request_stage
            })

          :ok
      end
    else
      true ->
        :ok

      {:error, reason} ->
        _ =
          AgentTrace.log("llm_usage.save_failed", %{
            stage: request_stage,
            reason: inspect(reason)
          })

        :ok
    end
  end

  defp usage_exists?(nil), do: false
  defp usage_exists?(response_id), do: not is_nil(find_by_response_id(response_id))

  defp build_attrs(response_body, context, request_stage) do
    response_id = response_body["id"]

    if not is_binary(response_id) or response_id == "" do
      {:error, :missing_response_id}
    else
      model =
        response_body["model"] ||
          context["model"] ||
          context[:model] ||
          Application.get_env(:cazu, :openai, []) |> Keyword.get(:model)

      if not is_binary(model) or model == "" do
        {:error, :missing_model}
      else
        usage = parse_usage(response_body["usage"])

        {input_tokens, output_tokens, total_tokens, cached_input_tokens} = usage

        tenant_id = normalize_int(context["tenant_id"] || context[:tenant_id])
        chat_id = normalize_string(context["chat_id"] || context[:chat_id])
        previous_response_id = normalize_string(context["previous_response_id"])

        if is_nil(tenant_id) or chat_id == nil do
          {:error, :missing_conversation_context}
        else
          prices = price_config(model)
          input_cost_usd = compute_cost(input_tokens, prices[:input_per_million])
          output_cost_usd = compute_cost(output_tokens, prices[:output_per_million])
          total_cost_usd = (input_cost_usd || 0.0) + (output_cost_usd || 0.0)

          metadata =
            context
            |> Map.take(["metadata", :metadata])
            |> to_metadata()
            |> Map.put("usage", response_body["usage"] || %{})

          {:ok,
           %{
             "conversation_id" =>
               normalize_int(
                 context["conversation_id"] ||
                   context[:conversation_id] ||
                   context["id"] ||
                   context[:id]
               ),
             "tenant_id" => tenant_id,
             "chat_id" => chat_id,
             "response_id" => response_id,
             "previous_response_id" => previous_response_id,
             "request_stage" => request_stage,
             "model" => model,
             "input_tokens" => input_tokens,
             "output_tokens" => output_tokens,
             "total_tokens" => total_tokens,
             "cached_input_tokens" => cached_input_tokens,
             "input_cost_usd" => input_cost_usd,
             "output_cost_usd" => output_cost_usd,
             "total_cost_usd" => total_cost_usd,
             "metadata" => metadata
           }}
        end
      end
    end
  end

  defp to_metadata(%{"metadata" => metadata}) when is_map(metadata), do: metadata
  defp to_metadata(%{metadata: metadata}) when is_map(metadata), do: metadata
  defp to_metadata(_), do: %{}

  defp parse_usage(usage) when is_map(usage) do
    input_tokens = int_value(usage["input_tokens"])
    output_tokens = int_value(usage["output_tokens"])

    total_tokens =
      int_value(usage["total_tokens"]) || fallback_total_tokens(input_tokens, output_tokens)

    cached_input_tokens =
      usage
      |> Map.get("input_tokens_details", %{})
      |> int_value_from_map("cached_tokens")

    {input_tokens, output_tokens, total_tokens, cached_input_tokens}
  end

  defp parse_usage(_usage), do: {0, 0, 0, 0}

  defp fallback_total_tokens(input_tokens, output_tokens)
       when is_integer(input_tokens) and is_integer(output_tokens),
       do: input_tokens + output_tokens

  defp fallback_total_tokens(_input_tokens, _output_tokens), do: 0

  defp compute_cost(_tokens, nil), do: nil

  defp compute_cost(tokens, price_per_million) when is_integer(tokens) do
    tokens / 1_000_000 * price_per_million
  end

  defp compute_cost(tokens, price_per_million) when is_float(tokens) do
    compute_cost(round(tokens), price_per_million)
  end

  defp compute_cost(_tokens, _price_per_million), do: nil

  defp price_config(model) when is_binary(model) do
    openai = Application.get_env(:cazu, :openai, [])
    model_prices = Keyword.get(openai, :model_prices)

    model_prices
    |> normalize_model_prices()
    |> Map.get(model, %{})
  end

  defp price_config(_model), do: %{}

  defp normalize_model_prices(prices) when is_map(prices) do
    prices
    |> Enum.reduce(%{}, fn {key, values}, acc ->
      case parse_model_rate_values(values) do
        {:ok, rates} ->
          normalized_key = to_string(key)
          Map.put(acc, normalized_key, rates)

        _ ->
          acc
      end
    end)
  end

  defp normalize_model_prices(_prices), do: %{}

  defp parse_model_rate_values(values) when is_map(values) do
    input_rate =
      values["input_per_million"] || values[:input_per_million] || values["input"] ||
        values[:input]

    output_rate =
      values["output_per_million"] || values[:output_per_million] || values["output"] ||
        values[:output]

    with {:ok, input_per_million} <- parse_rate(input_rate),
         {:ok, output_per_million} <- parse_rate(output_rate) do
      {:ok, %{input_per_million: input_per_million, output_per_million: output_per_million}}
    else
      _ ->
        :error
    end
  end

  defp parse_model_rate_values(_values), do: :error

  defp parse_rate(value) when is_integer(value), do: {:ok, value / 1}
  defp parse_rate(value) when is_float(value), do: {:ok, value}
  defp parse_rate(value) when is_binary(value), do: parse_float(value)
  defp parse_rate(_value), do: :error

  defp parse_float(value) when is_binary(value) do
    case Float.parse(value) do
      {parsed, ""} -> {:ok, parsed}
      _ -> :error
    end
  end

  defp parse_float(_), do: :error

  defp int_value(value) when is_integer(value), do: value
  defp int_value(value) when is_binary(value), do: parse_int(value)
  defp int_value(_value), do: 0

  defp int_value_from_map(map, key) when is_map(map) do
    int_value(Map.get(map, key))
  end

  defp int_value_from_map(_map, _key), do: 0

  defp parse_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} -> parsed
      _ -> 0
    end
  end

  defp parse_int(_), do: 0

  defp normalize_int(value) when is_integer(value), do: value

  defp normalize_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} -> parsed
      _ -> nil
    end
  end

  defp normalize_int(_value), do: nil

  defp normalize_string(value) when is_binary(value), do: value
  defp normalize_string(_value), do: nil

  defp validate_non_negative(changeset, field) do
    validate_change(changeset, field, fn
      _, value when is_number(value) and value >= 0 -> []
      _, value when is_nil(value) -> []
      _, _ -> [{field, "must be greater than or equal to 0"}]
    end)
  end
end
