# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :cazu,
  ecto_repos: [Cazu.Repo],
  generators: [timestamp_type: :utc_datetime]

config :cazu, Oban,
  repo: Cazu.Repo,
  plugins: [{Oban.Plugins.Pruner, max_age: 7 * 24 * 60 * 60}],
  queues: [default: 10, llm_inference: 5, tool_calls: 20]

config :cazu, :conta_azul,
  login_url: "https://auth.contaazul.com/login",
  token_url: "https://auth.contaazul.com/oauth2/token",
  api_base_url: "https://api-v2.contaazul.com/v1",
  scope: "openid profile aws.cognito.signin.user.admin"

config :cazu, :telegram, api_base_url: "https://api.telegram.org"

config :cazu, :llm,
  provider: :openai,
  websocket_mode_enabled: false

config :cazu, :openai,
  model: "gpt-5.2",
  primary_model: "gpt-5.2",
  router_model: "gpt-5-mini",
  base_url: "https://api.openai.com/v1",
  websocket_base_url: "wss://api.openai.com/v1/responses",
  timeout_ms: 30_000,
  websocket_timeout_ms: 30_000,
  websocket_beta_header: nil,
  model_prices: %{}

config :cazu, :tool_retrieval,
  strategy: :keyword,
  embeddings_enabled: false,
  embedding_model: "text-embedding-3-small",
  top_k: 12,
  min_similarity: 0.28,
  embedding_timeout_ms: 3_000,
  tool_text_context: nil,
  tool_text_version: 1

config :cazu, :agent_trace,
  enabled: false,
  path: "output/agent_trace.jsonl"

config :cazu, :agent_governance, require_write_confirmation: false

config :cazu, :agent_runtime,
  legacy_command_fallback_enabled: false,
  conversation_agent_idle_timeout_ms: 5 * 60 * 1000,
  conversation_agent_prune_interval_ms: 60_000

config :cazu, Cazu.Jido,
  max_tasks: 1000,
  agent_pools: []

# Configure the endpoint
config :cazu, CazuWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: CazuWeb.ErrorHTML, json: CazuWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Cazu.PubSub,
  live_view: [signing_salt: "QaSOgauw"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
