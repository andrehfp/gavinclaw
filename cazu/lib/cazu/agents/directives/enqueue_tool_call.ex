defmodule Cazu.Agents.Directives.EnqueueToolCall do
  @moduledoc """
  Directive requesting a tool execution enqueue.
  """

  @enforce_keys [:tool_name, :arguments]
  defstruct [:tool_name, :arguments, :execution_meta]

  @type t :: %__MODULE__{
          tool_name: String.t(),
          arguments: map(),
          execution_meta: map() | nil
        }
end
