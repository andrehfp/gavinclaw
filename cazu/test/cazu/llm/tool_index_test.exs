defmodule Cazu.LLM.ToolIndexTest do
  use ExUnit.Case, async: false

  alias Cazu.LLM.ToolIndex

  setup do
    original_openai_config = Application.get_env(:cazu, :openai, [])
    original_tool_retrieval_config = Application.get_env(:cazu, :tool_retrieval, [])

    on_exit(fn ->
      Application.put_env(:cazu, :openai, original_openai_config)
      Application.put_env(:cazu, :tool_retrieval, original_tool_retrieval_config)
      _ = ToolIndex.refresh()
    end)

    :ok
  end

  test "retrieve/2 returns ranked tools when embeddings are available" do
    tools = Cazu.Tools.supported_tools()

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        embeddings_ok_response(tools, "crm.list_people"),
        embeddings_query_ok_response()
      ])

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      base_url: base_url,
      timeout_ms: 1_000
    )

    Application.put_env(:cazu, :tool_retrieval,
      embeddings_enabled: true,
      strategy: :hybrid,
      embedding_model: "text-embedding-3-small",
      embedding_timeout_ms: 1_000,
      top_k: 8,
      min_similarity: 0.1,
      tool_text_context: "initial-context",
      tool_text_version: 1
    )

    assert {:ok, :ready} = ToolIndex.refresh()

    assert {:ok, selected_tools, meta} =
             ToolIndex.retrieve("qual o email da ana?", top_k: 5, min_similarity: 0.1)

    assert "crm.list_people" in selected_tools
    assert meta[:candidate_count] >= 1
    assert is_number(meta[:top_similarity])
    assert is_binary(meta[:index_signature])

    requests = Cazu.TestHTTPStub.requests(agent)
    assert length(requests) == 2
    assert Enum.at(requests, 0).path == "/embeddings"
    assert Enum.at(requests, 1).path == "/embeddings"
  end

  test "refresh maintains deterministic signature when tool text is unchanged" do
    tools = Cazu.Tools.supported_tools()

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        embeddings_matrix_response(tools),
        embeddings_matrix_response(tools)
      ])

    common_tool_retrieval_opts = [
      embeddings_enabled: true,
      strategy: :hybrid,
      embedding_model: "text-embedding-3-small",
      embedding_timeout_ms: 1_000,
      top_k: 8,
      min_similarity: 0.1,
      tool_text_context: "stable-context",
      tool_text_version: 1
    ]

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      base_url: base_url,
      timeout_ms: 1_000
    )

    Application.put_env(:cazu, :tool_retrieval, common_tool_retrieval_opts)

    assert {:ok, :ready} = ToolIndex.refresh()
    assert {:ok, %{signature: signature_v1}} = ToolIndex.status()

    assert {:ok, :ready} = ToolIndex.refresh()
    assert {:ok, %{signature: signature_v2}} = ToolIndex.status()

    assert signature_v1 == signature_v2
    assert length(Cazu.TestHTTPStub.requests(agent)) == 2
  end

  test "refresh rebuild reflects updated tool text context" do
    tools = Cazu.Tools.supported_tools()

    %{base_url: base_url, agent: agent} =
      start_stub_server([
        embeddings_matrix_response(tools),
        embeddings_matrix_response(tools)
      ])

    common_tool_retrieval_opts = [
      embeddings_enabled: true,
      strategy: :hybrid,
      embedding_model: "text-embedding-3-small",
      embedding_timeout_ms: 1_000,
      top_k: 8,
      min_similarity: 0.1
    ]

    Application.put_env(:cazu, :openai,
      api_key: "test-key",
      base_url: base_url,
      timeout_ms: 1_000
    )

    Application.put_env(
      :cazu,
      :tool_retrieval,
      common_tool_retrieval_opts ++ [tool_text_context: "context-v1", tool_text_version: 1]
    )

    assert {:ok, :ready} = ToolIndex.refresh()
    assert {:ok, %{signature: signature_v1}} = ToolIndex.status()

    requests = Cazu.TestHTTPStub.requests(agent)
    first_build_request = List.first(requests)
    first_input = Jason.decode!(first_build_request.raw_body)["input"]

    assert Enum.any?(first_input, &String.contains?(&1, "context: context-v1"))

    Application.put_env(
      :cazu,
      :tool_retrieval,
      common_tool_retrieval_opts ++ [tool_text_context: "context-v2", tool_text_version: 1]
    )

    assert {:ok, :ready} = ToolIndex.refresh()
    assert {:ok, %{signature: signature_v2}} = ToolIndex.status()

    requests = Cazu.TestHTTPStub.requests(agent)
    second_build_request = Enum.at(requests, 1)
    second_input = Jason.decode!(second_build_request.raw_body)["input"]

    assert signature_v1 != signature_v2
    assert first_input != second_input
    assert Enum.any?(second_input, &String.contains?(&1, "context: context-v2"))
  end

  test "retrieve/2 returns disabled when embeddings are disabled" do
    Application.put_env(:cazu, :tool_retrieval,
      embeddings_enabled: false,
      strategy: :keyword
    )

    assert {:ok, :disabled} = ToolIndex.refresh()
    assert {:error, :disabled} = ToolIndex.retrieve("oi")
  end

  defp start_stub_server(responses) do
    agent = start_supervised!({Agent, fn -> Cazu.TestHTTPStub.state(responses) end})
    port = Cazu.TestHTTPStub.free_port()

    start_supervised!(
      {Bandit, plug: {Cazu.TestHTTPStub, agent}, scheme: :http, ip: {127, 0, 0, 1}, port: port}
    )

    %{base_url: "http://127.0.0.1:#{port}", agent: agent}
  end

  defp embeddings_ok_response(tools, target_tool) do
    target_index = Enum.find_index(tools, &(&1 == target_tool)) || 0

    data =
      tools
      |> Enum.with_index()
      |> Enum.map(fn {_tool_name, index} ->
        embedding = if index == target_index, do: [1.0, 0.0], else: [0.0, 1.0]

        %{
          "object" => "embedding",
          "index" => index,
          "embedding" => embedding
        }
      end)

    %{
      status: 200,
      body: %{
        "object" => "list",
        "model" => "text-embedding-3-small",
        "data" => data
      }
    }
  end

  defp embeddings_matrix_response(tools) do
    data =
      tools
      |> Enum.with_index()
      |> Enum.map(fn {_tool_name, index} ->
        embedding = [
          if(rem(index, 2) == 0, do: 1.0, else: 0.0),
          if(rem(index, 2) == 1, do: 1.0, else: 0.0)
        ]

        %{
          "object" => "embedding",
          "index" => index,
          "embedding" => embedding
        }
      end)

    %{
      status: 200,
      body: %{
        "object" => "list",
        "model" => "text-embedding-3-small",
        "data" => data
      }
    }
  end

  defp embeddings_query_ok_response do
    %{
      status: 200,
      body: %{
        "object" => "list",
        "model" => "text-embedding-3-small",
        "data" => [
          %{
            "object" => "embedding",
            "index" => 0,
            "embedding" => [1.0, 0.0]
          }
        ]
      }
    }
  end
end
