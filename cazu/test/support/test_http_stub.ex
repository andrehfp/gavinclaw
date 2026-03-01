defmodule Cazu.TestHTTPStub do
  @moduledoc false

  import Plug.Conn

  def init(agent_pid), do: agent_pid

  def call(conn, agent_pid) do
    {:ok, raw_body, conn} = read_body(conn)

    request = %{
      method: conn.method,
      path: conn.request_path,
      query_string: conn.query_string,
      query: decode_query(conn.query_string),
      headers: Map.new(conn.req_headers),
      raw_body: raw_body
    }

    response =
      Agent.get_and_update(agent_pid, fn
        %{responses: [next_response | rest], requests: requests} = state ->
          {next_response, %{state | responses: rest, requests: [request | requests]}}

        %{responses: [], requests: requests} = state ->
          fallback = %{status: 500, headers: [], body: %{"error" => "no_stub_response"}}
          {fallback, %{state | requests: [request | requests]}}
      end)

    send_stub_response(conn, response)
  end

  def state(responses), do: %{responses: responses, requests: []}

  def requests(agent_pid), do: Agent.get(agent_pid, &Enum.reverse(&1.requests))

  def free_port do
    {:ok, socket} = :gen_tcp.listen(0, [:binary, active: false, ip: {127, 0, 0, 1}])
    {:ok, port} = :inet.port(socket)
    :ok = :gen_tcp.close(socket)
    port
  end

  defp decode_query(""), do: %{}
  defp decode_query(nil), do: %{}
  defp decode_query(query_string), do: URI.decode_query(query_string)

  defp send_stub_response(conn, %{status: status, body: body} = response) do
    headers = ensure_content_type(Map.get(response, :headers, []), body)
    encoded_body = encode_body(body)

    conn =
      Enum.reduce(headers, conn, fn {header, value}, acc ->
        put_resp_header(acc, header, value)
      end)

    send_resp(conn, status, encoded_body)
  end

  defp ensure_content_type(headers, body) when is_binary(body), do: headers

  defp ensure_content_type(headers, _body) do
    if Enum.any?(headers, fn {key, _value} -> String.downcase(key) == "content-type" end) do
      headers
    else
      [{"content-type", "application/json"} | headers]
    end
  end

  defp encode_body(body) when is_binary(body), do: body
  defp encode_body(body), do: Jason.encode!(body)
end
