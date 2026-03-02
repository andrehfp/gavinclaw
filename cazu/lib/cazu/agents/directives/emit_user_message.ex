defmodule Cazu.Agents.Directives.EmitUserMessage do
  @moduledoc """
  Directive requesting an outbound user-facing message.
  """

  @enforce_keys [:message]
  defstruct [:message, :metadata]

  @type t :: %__MODULE__{
          message: String.t(),
          metadata: map() | nil
        }
end
