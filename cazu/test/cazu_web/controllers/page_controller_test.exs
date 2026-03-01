defmodule CazuWeb.PageControllerTest do
  use CazuWeb.ConnCase

  alias Cazu.Conversations.Conversation
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration

  test "GET /", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Peace of mind from prototype to production"
  end

  test "GET /agent/chat renders sandbox", %{conn: conn} do
    conn = get(conn, ~p"/agent/chat")
    assert html_response(conn, 200) =~ "Agent Operations Console"
  end

  test "POST /agent/chat/send requires active Conta Azul integration", %{conn: conn} do
    params = %{
      "chat" => %{
        "chat_id" => "local-chat-missing",
        "telegram_user_id" => "local-user-test",
        "text" => "me ajuda"
      }
    }

    conn = post(conn, ~p"/agent/chat/send", params)

    assert redirected_to(conn) ==
             "/agent/chat?chat_id=local-chat-missing&telegram_user_id=local-user-test"

    assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Conta Azul is not connected"
  end

  test "POST /agent/chat/send enqueues a turn and redirects when integration is active", %{
    conn: conn
  } do
    tenant =
      %Tenant{}
      |> Tenant.changeset(%{
        name: "Local Chat Tenant",
        slug: "telegram-chat-local-chat-test",
        status: "active"
      })
      |> Repo.insert!()

    %TenantIntegration{}
    |> TenantIntegration.changeset(%{
      tenant_id: tenant.id,
      provider: "conta_azul",
      status: "active",
      access_token: "test-token"
    })
    |> Repo.insert!()

    params = %{
      "chat" => %{
        "chat_id" => "local-chat-test",
        "telegram_user_id" => "local-user-test",
        "text" => "me ajuda"
      }
    }

    conn = post(conn, ~p"/agent/chat/send", params)

    assert redirected_to(conn) ==
             "/agent/chat?chat_id=local-chat-test&telegram_user_id=local-user-test"

    assert %Conversation{} =
             Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "local-chat-test")
  end
end
