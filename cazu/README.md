# Cazu

To start your Phoenix server:

* Run `mix setup` to install and setup dependencies
* Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

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
