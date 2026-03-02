defmodule Cazu.LLM.Provider do
  @moduledoc """
  Provider-agnostic LLM interface used by workers and agents.

  This module resolves the configured provider implementation and delegates all
  LLM operations through a stable contract.
  """

  alias Cazu.Conversations.Conversation

  @type provider_key :: :openai | String.t() | atom() | module()

  @callback select_next_action(Conversation.t(), String.t(), keyword()) ::
              {:ok, term()} | {:error, term()}
  @callback select_next_action_stream(
              Conversation.t(),
              String.t(),
              (String.t() -> term()),
              keyword()
            ) :: {:ok, term()} | {:error, term()}
  @callback continue_with_tool_output(String.t(), String.t(), term(), keyword()) ::
              {:ok, term()} | {:error, term()}
  @callback continue_with_tool_output_stream(
              String.t(),
              String.t(),
              term(),
              (String.t() -> term()),
              keyword()
            ) :: {:ok, term()} | {:error, term()}
  @callback summarize_tool_result(String.t(), String.t(), term(), keyword()) ::
              {:ok, String.t()} | {:error, term()}
  @callback build_tool_specs([String.t()]) :: [map()]

  @spec provider_module(keyword()) :: {:ok, module()} | {:error, term()}
  def provider_module(opts \\ []) when is_list(opts) do
    provider = Keyword.get(opts, :provider, configured_provider())

    case normalize_provider(provider) do
      {:ok, module} -> {:ok, module}
      {:error, reason} -> {:error, reason}
    end
  end

  @spec select_next_action(Conversation.t(), String.t(), keyword()) ::
          {:ok, term()} | {:error, term()}
  def select_next_action(%Conversation{} = conversation, user_text, opts \\ [])
      when is_binary(user_text) and is_list(opts) do
    with {:ok, module} <- provider_module(opts) do
      module.select_next_action(conversation, user_text, opts)
    end
  end

  @spec select_next_action_stream(Conversation.t(), String.t(), (String.t() -> term()), keyword()) ::
          {:ok, term()} | {:error, term()}
  def select_next_action_stream(%Conversation{} = conversation, user_text, on_delta, opts \\ [])
      when is_binary(user_text) and is_function(on_delta, 1) and is_list(opts) do
    with {:ok, module} <- provider_module(opts) do
      module.select_next_action_stream(conversation, user_text, on_delta, opts)
    end
  end

  @spec continue_with_tool_output(String.t(), String.t(), term(), keyword()) ::
          {:ok, term()} | {:error, term()}
  def continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts \\ [])
      when is_binary(previous_response_id) and is_binary(llm_tool_call_id) and is_list(opts) do
    with {:ok, module} <- provider_module(opts) do
      module.continue_with_tool_output(previous_response_id, llm_tool_call_id, tool_result, opts)
    end
  end

  @spec continue_with_tool_output_stream(
          String.t(),
          String.t(),
          term(),
          (String.t() -> term()),
          keyword()
        ) :: {:ok, term()} | {:error, term()}
  def continue_with_tool_output_stream(
        previous_response_id,
        llm_tool_call_id,
        tool_result,
        on_delta,
        opts \\ []
      )
      when is_binary(previous_response_id) and is_binary(llm_tool_call_id) and
             is_function(on_delta, 1) and is_list(opts) do
    with {:ok, module} <- provider_module(opts) do
      module.continue_with_tool_output_stream(
        previous_response_id,
        llm_tool_call_id,
        tool_result,
        on_delta,
        opts
      )
    end
  end

  @spec summarize_tool_result(String.t(), String.t(), term(), keyword()) ::
          {:ok, String.t()} | {:error, term()}
  def summarize_tool_result(user_text, tool_name, result, opts \\ [])
      when is_binary(user_text) and is_binary(tool_name) and is_list(opts) do
    with {:ok, module} <- provider_module(opts) do
      module.summarize_tool_result(user_text, tool_name, result, opts)
    end
  end

  @spec build_tool_specs([String.t()], keyword()) :: [map()]
  def build_tool_specs(tool_names, opts \\ []) when is_list(tool_names) and is_list(opts) do
    case provider_module(opts) do
      {:ok, module} -> module.build_tool_specs(tool_names)
      {:error, _reason} -> []
    end
  end

  defp configured_provider do
    :cazu
    |> Application.get_env(:llm, [])
    |> Keyword.get(:provider, :openai)
  end

  defp normalize_provider(:openai), do: {:ok, Cazu.LLM.Providers.OpenAI}
  defp normalize_provider("openai"), do: {:ok, Cazu.LLM.Providers.OpenAI}

  defp normalize_provider(module) when is_atom(module) do
    if Code.ensure_loaded?(module) do
      {:ok, module}
    else
      {:error, {:unsupported_provider, module}}
    end
  end

  defp normalize_provider(provider), do: {:error, {:unsupported_provider, provider}}
end
