defmodule Cazu.Agents.Directives.AskForConfirmation do
  @moduledoc """
  Directive requesting explicit user confirmation for a pending operation.
  """

  @enforce_keys [:message, :pending_operation]
  defstruct [:message, :pending_operation]

  @type t :: %__MODULE__{
          message: String.t(),
          pending_operation: map()
        }
end
