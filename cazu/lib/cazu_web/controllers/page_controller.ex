defmodule CazuWeb.PageController do
  use CazuWeb, :controller

  import Ecto.Query, warn: false

  alias Cazu.Conversations
  alias Cazu.Operations.Job
  alias Cazu.Repo
  alias Cazu.Tenancy
  alias Cazu.Workers.ConversationTurnWorker

  def home(conn, params) do
    auth_form =
      Phoenix.Component.to_form(
        %{
          "tenant_id" => params["tenant_id"] || ""
        },
        as: :auth
      )

    render(conn, :home, auth_form: auth_form, connected: params["connected"] == "1")
  end

  def agent_chat(conn, params) do
    chat_id = normalize_chat_id(params["chat_id"])
    telegram_user_id = normalize_user_id(params["telegram_user_id"])

    {:ok, tenant} = Tenancy.get_or_create_telegram_tenant(chat_id)
    {:ok, _user} = Tenancy.get_or_create_telegram_user(tenant, telegram_user_id)

    integration = Tenancy.get_integration(tenant.id)
    conversation = Conversations.get_conversation(tenant.id, chat_id)
    jobs = recent_jobs_for_tenant(tenant.id)
    pending_jobs? = Enum.any?(jobs, &active_job?/1)

    chat_form =
      Phoenix.Component.to_form(
        %{
          "chat_id" => chat_id,
          "telegram_user_id" => telegram_user_id,
          "text" => ""
        },
        as: :chat
      )

    render(conn, :agent_chat,
      chat_form: chat_form,
      chat_id: chat_id,
      telegram_user_id: telegram_user_id,
      tenant: tenant,
      integration: integration,
      integration_connected?: integration_active?(integration),
      conversation: conversation,
      jobs: jobs,
      pending_jobs?: pending_jobs?
    )
  end

  def send_agent_chat(conn, %{"chat" => chat_params}) do
    chat_id = normalize_chat_id(chat_params["chat_id"])
    telegram_user_id = normalize_user_id(chat_params["telegram_user_id"])
    text = normalize_text(chat_params["text"])

    if text == "" do
      conn
      |> put_flash(:error, "Message cannot be empty")
      |> redirect(to: ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}")
    else
      {:ok, tenant} = Tenancy.get_or_create_telegram_tenant(chat_id)
      integration = Tenancy.get_integration(tenant.id)

      if integration_active?(integration) do
        {:ok, user} =
          Tenancy.get_or_create_telegram_user(tenant, telegram_user_id, %{
            "name" => "Local Chat Tester"
          })

        update_id = next_update_id()
        payload = build_update_payload(update_id, chat_id, telegram_user_id, text)

        case Oban.insert(
               ConversationTurnWorker.new(
                 build_job_args(payload, tenant.id, user.id, chat_id, telegram_user_id, text)
               )
             ) do
          {:ok, _job} ->
            conn
            |> put_flash(:info, "Message submitted to agent queue")
            |> redirect(
              to: ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}"
            )

          {:error, reason} ->
            conn
            |> put_flash(:error, "Could not enqueue message: #{inspect(reason)}")
            |> redirect(
              to: ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}"
            )
        end
      else
        conn
        |> put_flash(
          :error,
          "Conta Azul is not connected for this chat. Connect first and then send messages."
        )
        |> redirect(to: ~p"/agent/chat?chat_id=#{chat_id}&telegram_user_id=#{telegram_user_id}")
      end
    end
  end

  def send_agent_chat(conn, _params) do
    conn
    |> put_flash(:error, "Invalid chat payload")
    |> redirect(to: ~p"/agent/chat")
  end

  defp recent_jobs_for_tenant(tenant_id) do
    Job
    |> where([j], j.tenant_id == ^tenant_id)
    |> order_by([j], desc: j.inserted_at)
    |> limit(20)
    |> preload([:tool_calls])
    |> Repo.all()
  end

  defp normalize_chat_id(chat_id) when is_binary(chat_id) and chat_id != "", do: chat_id
  defp normalize_chat_id(_chat_id), do: "local-chat-1"

  defp normalize_user_id(user_id) when is_binary(user_id) and user_id != "", do: user_id
  defp normalize_user_id(_user_id), do: "local-user-1"

  defp normalize_text(text) when is_binary(text), do: String.trim(text)
  defp normalize_text(_text), do: ""

  defp next_update_id do
    System.unique_integer([:positive])
  end

  defp build_update_payload(update_id, chat_id, telegram_user_id, text) do
    %{
      "update_id" => update_id,
      "message" => %{
        "chat" => %{"id" => chat_id},
        "from" => %{"id" => telegram_user_id, "first_name" => "Local Tester"},
        "text" => text
      }
    }
  end

  defp build_job_args(payload, tenant_id, user_id, chat_id, telegram_user_id, text) do
    %{
      "tenant_id" => tenant_id,
      "user_id" => user_id,
      "chat_id" => chat_id,
      "telegram_user_id" => telegram_user_id,
      "message_text" => text,
      "telegram_update_id" => Integer.to_string(payload["update_id"]),
      "raw_update" => payload
    }
  end

  defp integration_active?(%{status: "active"}), do: true
  defp integration_active?(_integration), do: false

  defp active_job?(job) do
    job.status in ["queued", "running"] and is_nil(job.completed_at)
  end
end
