defmodule Cazu.Repo do
  use Ecto.Repo,
    otp_app: :cazu,
    adapter: Ecto.Adapters.Postgres
end
