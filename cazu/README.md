# Cazu

To start your Phoenix server:

* Run `mix setup` to install and setup dependencies
* Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

## Secrets workflow (Bitwarden)

Use Bitwarden as the source of truth.

Preferred (no `.env` file write):

* First time only: `bw login`
* Start Phoenix with secrets injected only in process env: `bin/dev-secure`

Generic command runner:

* Run any command with Bitwarden secrets in process env: `bin/secrets-exec cazu-dev-env -- mix test`

Optional (writes local `.env`):

* Pull secrets from your Bitwarden item notes into `.env`: `bin/secrets-pull cazu-dev-env`

Notes:

* Store dotenv content in the Bitwarden item's **Notes** field
* `bin/secrets-exec` and `bin/dev-secure` do not write `.env`
* `.env` is ignored by git; only commit `.env.example`

## Test workflows

Run the full test suite:

* `mix test`

Run only end-to-end tests (`@moduletag :e2e`):

* `mix test --only e2e`
* `mix e2e`

E2E files live in `test/cazu_web/e2e/` and are split by journey:

* OAuth browser callback flow
* Live Agent Chat flow
* Telegram webhook flow

Ready to run in production? Please [check our deployment guides](https://hexdocs.pm/phoenix/deployment.html).

## Learn more

* Official website: https://www.phoenixframework.org/
* Guides: https://hexdocs.pm/phoenix/overview.html
* Docs: https://hexdocs.pm/phoenix
* Forum: https://elixirforum.com/c/phoenix-forum
* Source: https://github.com/phoenixframework/phoenix
