import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/cazu start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :cazu, CazuWeb.Endpoint, server: true
end

config :cazu, CazuWeb.Endpoint, http: [port: String.to_integer(System.get_env("PORT", "4000"))]

config :cazu, :conta_azul,
  client_id: System.get_env("CONTA_AZUL_CLIENT_ID"),
  client_secret: System.get_env("CONTA_AZUL_CLIENT_SECRET"),
  redirect_uri: System.get_env("CONTA_AZUL_REDIRECT_URI")

config :cazu, :telegram,
  bot_token: System.get_env("TELEGRAM_BOT_TOKEN"),
  webhook_token: System.get_env("TELEGRAM_WEBHOOK_TOKEN")

openai_timeout_ms =
  case Integer.parse(System.get_env("OPENAI_TIMEOUT_MS", "30000")) do
    {value, ""} -> value
    _ -> 30_000
  end

openai_websocket_timeout_ms =
  case Integer.parse(System.get_env("OPENAI_WEBSOCKET_TIMEOUT_MS", "30000")) do
    {value, ""} when value > 0 -> value
    _ -> 30_000
  end

parse_model_price_value = fn
  value when is_number(value) ->
    {:ok, value / 1}

  value when is_binary(value) ->
    case Float.parse(value) do
      {parsed, ""} -> {:ok, parsed}
      _ -> :error
    end

  _ ->
    :error
end

normalize_openai_model_price_entry = fn values ->
  case values do
    values when is_map(values) ->
      input_rate =
        values["input_per_million"] ||
          values[:input_per_million] || values["input"] || values[:input]

      output_rate =
        values["output_per_million"] ||
          values[:output_per_million] || values["output"] || values[:output]

      with {:ok, input_per_million} <- parse_model_price_value.(input_rate),
           {:ok, output_per_million} <- parse_model_price_value.(output_rate) do
        {:ok,
         %{
           input_per_million: input_per_million,
           output_per_million: output_per_million
         }}
      else
        _ ->
          :error
      end

    _ ->
      :error
  end
end

openai_model_prices =
  case String.trim(System.get_env("OPENAI_MODEL_PRICES_JSON") || "") do
    "" ->
      %{}

    raw ->
      case Jason.decode(raw) do
        {:ok, decoded} when is_map(decoded) ->
          Enum.reduce(decoded, %{}, fn
            {model, values}, acc when is_binary(model) ->
              case normalize_openai_model_price_entry.(values) do
                {:ok, normalized} ->
                  Map.put(acc, model, normalized)

                _ ->
                  acc
              end

            _, acc ->
              acc
          end)

        _ ->
          %{}
      end
  end

config :cazu, :openai,
  api_key: System.get_env("OPENAI_API_KEY"),
  model: System.get_env("OPENAI_MODEL", "gpt-5.2"),
  primary_model:
    System.get_env("OPENAI_PRIMARY_MODEL", System.get_env("OPENAI_MODEL", "gpt-5.2")),
  router_model: System.get_env("OPENAI_ROUTER_MODEL", "gpt-5-mini"),
  base_url: System.get_env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
  websocket_base_url:
    System.get_env("OPENAI_WEBSOCKET_BASE_URL", "wss://api.openai.com/v1/responses"),
  websocket_timeout_ms: openai_websocket_timeout_ms,
  websocket_beta_header: System.get_env("OPENAI_WEBSOCKET_BETA_HEADER"),
  timeout_ms: openai_timeout_ms,
  model_prices: openai_model_prices

llm_provider =
  case String.downcase(System.get_env("LLM_PROVIDER", "openai")) do
    "openai" -> :openai
    _ -> :openai
  end

llm_websocket_mode_enabled? =
  System.get_env("LLM_WEBSOCKET_MODE_ENABLED", "false")
  |> String.downcase()
  |> then(&(&1 in ["1", "true", "yes", "on"]))

config :cazu, :llm,
  provider: llm_provider,
  websocket_mode_enabled: llm_websocket_mode_enabled?

# Optional OpenAI model prices in USD per 1M tokens.
# Expected JSON shape:
# {
#   "gpt-4.1-mini": {"input_per_million": 0.4, "output_per_million": 1.6},
#   "gpt-5-mini": {"input_per_million": 0.0, "output_per_million": 0.0}
# }

tool_retrieval_strategy =
  case String.downcase(System.get_env("TOOL_RETRIEVAL_STRATEGY", "keyword")) do
    "keyword" -> :keyword
    "embeddings" -> :embeddings
    "hybrid" -> :hybrid
    _ -> :keyword
  end

tool_retrieval_enabled? =
  System.get_env("TOOL_RETRIEVAL_EMBEDDINGS_ENABLED", "false")
  |> String.downcase()
  |> then(&(&1 in ["1", "true", "yes", "on"]))

tool_retrieval_top_k =
  case Integer.parse(System.get_env("TOOL_RETRIEVAL_TOP_K", "12")) do
    {value, ""} when value > 0 -> value
    _ -> 12
  end

tool_retrieval_min_similarity =
  case Float.parse(System.get_env("TOOL_RETRIEVAL_MIN_SIMILARITY", "0.28")) do
    {value, ""} -> value
    _ -> 0.28
  end

tool_retrieval_timeout_ms =
  case Integer.parse(System.get_env("TOOL_RETRIEVAL_TIMEOUT_MS", "3000")) do
    {value, ""} when value > 0 -> value
    _ -> 3_000
  end

tool_text_context = System.get_env("TOOL_TEXT_CONTEXT")

tool_text_version =
  case Integer.parse(System.get_env("TOOL_TEXT_VERSION", "1")) do
    {value, ""} -> value
    _ -> 1
  end

config :cazu, :tool_retrieval,
  strategy: tool_retrieval_strategy,
  embeddings_enabled: tool_retrieval_enabled?,
  embedding_model: System.get_env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  top_k: tool_retrieval_top_k,
  min_similarity: tool_retrieval_min_similarity,
  embedding_timeout_ms: tool_retrieval_timeout_ms,
  tool_text_context: tool_text_context,
  tool_text_version: tool_text_version

agent_trace_enabled? =
  System.get_env("AGENT_TRACE_ENABLED", "false")
  |> String.downcase()
  |> then(&(&1 in ["1", "true", "yes", "on"]))

config :cazu, :agent_trace,
  enabled: agent_trace_enabled?,
  path: System.get_env("AGENT_TRACE_PATH", "output/agent_trace.jsonl")

require_write_confirmation? =
  System.get_env("AGENT_REQUIRE_WRITE_CONFIRMATION", "false")
  |> String.downcase()
  |> then(&(&1 in ["1", "true", "yes", "on"]))

config :cazu, :agent_governance, require_write_confirmation: require_write_confirmation?

legacy_command_fallback_enabled? =
  System.get_env("AGENT_LEGACY_COMMAND_FALLBACK_ENABLED", "false")
  |> String.downcase()
  |> then(&(&1 in ["1", "true", "yes", "on"]))

conversation_agent_idle_timeout_ms =
  case Integer.parse(System.get_env("AGENT_CONVERSATION_IDLE_TIMEOUT_MS", "300000")) do
    {value, ""} when value > 0 -> value
    _ -> 300_000
  end

conversation_agent_prune_interval_ms =
  case Integer.parse(System.get_env("AGENT_CONVERSATION_PRUNE_INTERVAL_MS", "60000")) do
    {value, ""} when value > 0 -> value
    _ -> 60_000
  end

config :cazu, :agent_runtime,
  legacy_command_fallback_enabled: legacy_command_fallback_enabled?,
  conversation_agent_idle_timeout_ms: conversation_agent_idle_timeout_ms,
  conversation_agent_prune_interval_ms: conversation_agent_prune_interval_ms

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :cazu, Cazu.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: maybe_ipv6

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to use this value in your own applications.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :cazu, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :cazu, CazuWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://hexdocs.pm/bandit/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  if is_nil(System.get_env("CONTA_AZUL_CLIENT_ID")) do
    raise "environment variable CONTA_AZUL_CLIENT_ID is missing"
  end

  if is_nil(System.get_env("CONTA_AZUL_CLIENT_SECRET")) do
    raise "environment variable CONTA_AZUL_CLIENT_SECRET is missing"
  end

  if is_nil(System.get_env("CONTA_AZUL_REDIRECT_URI")) do
    raise "environment variable CONTA_AZUL_REDIRECT_URI is missing"
  end

  if is_nil(System.get_env("TELEGRAM_BOT_TOKEN")) do
    raise "environment variable TELEGRAM_BOT_TOKEN is missing"
  end

  if is_nil(System.get_env("TELEGRAM_WEBHOOK_TOKEN")) do
    raise "environment variable TELEGRAM_WEBHOOK_TOKEN is missing"
  end

  if is_nil(System.get_env("OPENAI_API_KEY")) do
    raise "environment variable OPENAI_API_KEY is missing"
  end

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :cazu, CazuWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and most secure SSL ciphers. This means old browsers
  # might not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:keyfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :cazu, :dns_cluster_query,
  #     force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in https://hexdocs.pm/plug/Plug.SSL.html
end
