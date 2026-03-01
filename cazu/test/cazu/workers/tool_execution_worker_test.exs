defmodule Cazu.Workers.ToolExecutionWorkerTest do
  use Cazu.DataCase

  import Ecto.Query

  alias Cazu.Conversations.Conversation
  alias Cazu.LLM.OpenAIResponses
  alias Cazu.Operations.Job
  alias Cazu.Operations.ToolCall
  alias Cazu.Repo
  alias Cazu.Tenancy.Tenant
  alias Cazu.Tenancy.TenantIntegration
  alias Cazu.Tenancy.User
  alias Cazu.Workers.ToolExecutionWorker

  setup do
    original_conta_azul_config = Application.get_env(:cazu, :conta_azul, [])
    original_openai_config = Application.get_env(:cazu, :openai, [])

    on_exit(fn ->
      Application.put_env(:cazu, :conta_azul, original_conta_azul_config)
      Application.put_env(:cazu, :openai, original_openai_config)
    end)

    :ok
  end

  test "perform/1 appends successful tool result to conversation metadata" do
    %{base_url: base_url} =
      start_stub_server([
        %{status: 200, body: %{"items" => [%{"id" => "person-1", "name" => "Ana"}]}}
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: base_url)

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    %TenantIntegration{}
    |> TenantIntegration.changeset(%{
      tenant_id: tenant.id,
      provider: "conta_azul",
      status: "active",
      access_token: "access-1",
      refresh_token: "refresh-1"
    })
    |> Repo.insert!()

    %Conversation{}
    |> Conversation.changeset(%{
      tenant_id: tenant.id,
      chat_id: "chat-result",
      telegram_user_id: "tg-user-result",
      status: "active",
      metadata: %{"messages" => []}
    })
    |> Repo.insert!()

    job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "queued",
        intent: "crm.list_people",
        input_payload: %{"name" => "Ana"}
      })
      |> Repo.insert!()

    tool_call =
      %ToolCall{}
      |> ToolCall.changeset(%{
        tenant_id: tenant.id,
        job_id: job.id,
        name: "crm.list_people",
        idempotency_key: "idem-test-1",
        arguments: %{"name" => "Ana"},
        status: "queued"
      })
      |> Repo.insert!()

    assert :ok =
             ToolExecutionWorker.perform(%Oban.Job{
               args: %{"tool_call_id" => tool_call.id, "chat_id" => "chat-result"}
             })

    conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "chat-result")

    assert conversation.metadata["last_action"] == "tool_result"
    assert conversation.metadata["last_tool_name"] == "crm.list_people"
    assert is_binary(conversation.metadata["last_assistant_message"])
    assert conversation.metadata["last_assistant_message"] =~ "Ana"

    assert [
             %{"role" => "assistant", "action" => "tool_result", "tool_name" => "crm.list_people"}
           ] = conversation.metadata["messages"]
  end

  test "perform/1 enqueues follow-up tool action when LLM asks for another tool" do
    [create_payable_spec] = OpenAIResponses.build_tool_specs(["finance.create_payable"])

    follow_up_arguments = %{
      "valor" => 1200.0,
      "competenceDate" => "2026-03-04",
      "descricao" => "Aluguel",
      "opcao_condicao_pagamento" => "À vista",
      "rateio" => [
        %{
          "valor" => 1200.0,
          "categoria_financeira" => %{"id" => "cat-aluguel"}
        }
      ]
    }

    %{base_url: conta_azul_base_url} =
      start_stub_server([
        %{status: 200, body: %{"items" => [%{"id" => "cat-aluguel", "nome" => "Aluguel"}]}},
        %{status: 200, body: %{"id" => "payable-1"}}
      ])

    %{base_url: openai_base_url} =
      start_stub_server([
        %{status: 200, body: %{"id" => "resp_stream_placeholder", "output" => []}},
        %{
          status: 200,
          body: %{
            "id" => "resp_followup_2",
            "output" => [
              %{
                "type" => "function_call",
                "name" => create_payable_spec["name"],
                "call_id" => "call_followup_2",
                "arguments" => Jason.encode!(follow_up_arguments)
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: conta_azul_base_url)

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: openai_base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    %TenantIntegration{}
    |> TenantIntegration.changeset(%{
      tenant_id: tenant.id,
      provider: "conta_azul",
      status: "active",
      access_token: "access-1",
      refresh_token: "refresh-1"
    })
    |> Repo.insert!()

    %Conversation{}
    |> Conversation.changeset(%{
      tenant_id: tenant.id,
      chat_id: "chat-follow-up",
      telegram_user_id: "tg-user-follow-up",
      status: "active",
      metadata: %{"messages" => []}
    })
    |> Repo.insert!()

    job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "queued",
        intent: "finance.list_categories",
        input_payload: %{}
      })
      |> Repo.insert!()

    tool_call =
      %ToolCall{}
      |> ToolCall.changeset(%{
        tenant_id: tenant.id,
        job_id: job.id,
        name: "finance.list_categories",
        idempotency_key: "idem-test-follow-up",
        arguments: %{},
        status: "queued"
      })
      |> Repo.insert!()

    assert :ok =
             ToolExecutionWorker.perform(%Oban.Job{
               args: %{
                 "tool_call_id" => tool_call.id,
                 "chat_id" => "chat-follow-up",
                 "llm_response_id" => "resp_prev_2",
                 "llm_tool_call_id" => "call_prev_2"
               }
             })

    assert %ToolCall{name: "finance.create_payable", arguments: enqueued_arguments} =
             Repo.get_by!(ToolCall, tenant_id: tenant.id, name: "finance.create_payable")

    assert enqueued_arguments["descricao"] == "Aluguel"
    assert enqueued_arguments["competenceDate"] == "2026-03-04"
    assert enqueued_arguments["opcao_condicao_pagamento"] == "À vista"

    conversation = Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "chat-follow-up")

    assert is_nil(conversation.previous_response_id)
    assert conversation.metadata["last_tool_name"] == "finance.create_payable"
    assert conversation.metadata["last_action"] == "tool_follow_up_selected"
  end

  test "perform/1 keeps loop on tool failure by asking LLM for next action" do
    [create_person_spec] = OpenAIResponses.build_tool_specs(["crm.create_person"])

    corrected_arguments = %{
      "nome" => "Conceito Imóveis",
      "tipo_pessoa" => "Jurídica"
    }

    %{base_url: conta_azul_base_url} =
      start_stub_server([
        %{
          status: 400,
          body: %{
            "error" =>
              "O valor informado para o campo 'perfis' é inválido, o campo deve ser do tipo models.PersonProfilesCreate"
          }
        }
      ])

    %{base_url: openai_base_url} =
      start_stub_server([
        %{
          status: 200,
          body: %{
            "id" => "resp_recovery_1",
            "output" => [
              %{
                "type" => "function_call",
                "name" => create_person_spec["name"],
                "call_id" => "call_recovery_1",
                "arguments" => Jason.encode!(corrected_arguments)
              }
            ]
          }
        }
      ])

    Application.put_env(:cazu, :conta_azul, api_base_url: conta_azul_base_url)

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      model: "gpt-4.1-mini",
      base_url: openai_base_url,
      timeout_ms: 1000
    )

    tenant = tenant_fixture()
    user = user_fixture(tenant)

    %TenantIntegration{}
    |> TenantIntegration.changeset(%{
      tenant_id: tenant.id,
      provider: "conta_azul",
      status: "active",
      access_token: "access-1",
      refresh_token: "refresh-1"
    })
    |> Repo.insert!()

    %Conversation{}
    |> Conversation.changeset(%{
      tenant_id: tenant.id,
      chat_id: "chat-failure-recovery",
      telegram_user_id: "tg-user-failure-recovery",
      status: "active",
      metadata: %{"messages" => []}
    })
    |> Repo.insert!()

    job =
      %Job{}
      |> Job.changeset(%{
        tenant_id: tenant.id,
        user_id: user.id,
        channel: "telegram",
        status: "queued",
        intent: "crm.create_person",
        input_payload: %{"nome" => "Conceito Imóveis", "perfis" => %{"cliente" => true}}
      })
      |> Repo.insert!()

    tool_call =
      %ToolCall{}
      |> ToolCall.changeset(%{
        tenant_id: tenant.id,
        job_id: job.id,
        name: "crm.create_person",
        idempotency_key: "idem-test-failure-recovery",
        arguments: %{"nome" => "Conceito Imóveis", "perfis" => %{"cliente" => true}},
        status: "queued"
      })
      |> Repo.insert!()

    assert :ok =
             ToolExecutionWorker.perform(%Oban.Job{
               args: %{
                 "tool_call_id" => tool_call.id,
                 "chat_id" => "chat-failure-recovery",
                 "llm_response_id" => "resp_prev_failure_1",
                 "llm_tool_call_id" => "call_prev_failure_1"
               }
             })

    calls =
      ToolCall
      |> where([tc], tc.tenant_id == ^tenant.id and tc.name == "crm.create_person")
      |> order_by([tc], asc: tc.id)
      |> Repo.all()

    assert length(calls) == 2

    [failed_call, follow_up_call] = calls
    assert failed_call.status == "failed"
    assert follow_up_call.arguments["tipo_pessoa"] == "Jurídica"

    conversation =
      Repo.get_by!(Conversation, tenant_id: tenant.id, chat_id: "chat-failure-recovery")

    assert conversation.metadata["last_action"] in ["tool_follow_up_selected", "tool_result"]
    assert conversation.metadata["last_tool_name"] == "crm.create_person"
  end

  defp tenant_fixture do
    unique = System.unique_integer([:positive])

    %Tenant{}
    |> Tenant.changeset(%{
      name: "Tenant #{unique}",
      slug: "tenant-#{unique}",
      status: "active"
    })
    |> Repo.insert!()
  end

  defp user_fixture(tenant) do
    unique = System.unique_integer([:positive])

    %User{}
    |> User.changeset(%{
      tenant_id: tenant.id,
      telegram_user_id: "telegram-#{unique}",
      role: "operator",
      name: "User #{unique}"
    })
    |> Repo.insert!()
  end

  defp start_stub_server(responses) do
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
