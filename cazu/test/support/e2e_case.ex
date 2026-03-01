defmodule Cazu.E2ECase do
  @moduledoc false

  use ExUnit.CaseTemplate

  using do
    quote do
      use CazuWeb.ConnCase

      import Phoenix.LiveViewTest
      import Cazu.E2ECase

      alias Cazu.Conversations.Conversation
      alias Cazu.Operations.ToolCall
      alias Cazu.Repo
      alias Cazu.Tenancy
      alias Cazu.Tenancy.Tenant
      alias Cazu.Tenancy.TenantIntegration

      @moduletag :e2e
    end
  end

  setup do
    original_openai = Application.get_env(:cazu, :openai, [])
    original_conta_azul = Application.get_env(:cazu, :conta_azul, [])
    original_telegram = Application.get_env(:cazu, :telegram, [])

    on_exit(fn ->
      Application.put_env(:cazu, :openai, original_openai)
      Application.put_env(:cazu, :conta_azul, original_conta_azul)
      Application.put_env(:cazu, :telegram, original_telegram)
    end)

    :ok
  end

  def build_fake_jwt(claims) do
    payload =
      claims
      |> Jason.encode!()
      |> Base.url_encode64(padding: false)

    "header.#{payload}.signature"
  end

  def start_stub_server(responses) do
    agent =
      start_supervised!(%{
        id: {:stub_agent, System.unique_integer([:positive])},
        start: {Agent, :start_link, [fn -> Cazu.TestHTTPStub.state(responses) end]}
      })

    port = Cazu.TestHTTPStub.free_port()

    start_supervised!(
      {Bandit, plug: {Cazu.TestHTTPStub, agent}, scheme: :http, ip: {127, 0, 0, 1}, port: port}
    )

    %{base_url: "http://127.0.0.1:#{port}", agent: agent}
  end
end
