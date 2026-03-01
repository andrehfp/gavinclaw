defmodule CazuWeb.Router do
  use CazuWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {CazuWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", CazuWeb do
    pipe_through :browser

    get "/", PageController, :home
    live "/agent/chat", AgentChatLive
    post "/agent/chat/send", PageController, :send_agent_chat
    get "/auth/conta-azul/start", ContaAzulOAuthController, :start
    get "/auth/conta-azul/callback", ContaAzulOAuthController, :callback
  end

  scope "/api", CazuWeb do
    pipe_through :api

    get "/auth/conta-azul/start", ContaAzulOAuthController, :start
    get "/auth/conta-azul/callback", ContaAzulOAuthController, :callback
    post "/telegram/webhook/:token", TelegramWebhookController, :receive
  end
end
