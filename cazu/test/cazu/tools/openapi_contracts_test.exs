defmodule Cazu.Tools.OpenAPIContractsTest do
  use ExUnit.Case, async: true

  alias Cazu.Tools
  alias Cazu.Tools.OpenAPIContracts

  @http_methods ~w(get post put patch delete head options)

  test "all supported tools are mapped to OpenAPI operations" do
    supported = MapSet.new(Tools.supported_tools())
    mapped = MapSet.new(Map.keys(OpenAPIContracts.tool_operations()))

    missing = supported |> MapSet.difference(mapped) |> MapSet.to_list() |> Enum.sort()

    assert missing == []
  end

  test "every mapped operation exists in downloaded Conta Azul OpenAPI bundles" do
    documented_operations = load_documented_operations()

    missing_operations =
      OpenAPIContracts.tool_operations()
      |> Enum.flat_map(fn {tool_name, operations} ->
        Enum.flat_map(operations, fn operation ->
          key = operation_key(operation)

          if MapSet.member?(documented_operations, key) do
            []
          else
            [
              %{
                tool_name: tool_name,
                method: operation[:method],
                path: operation[:path]
              }
            ]
          end
        end)
      end)

    assert missing_operations == []
  end

  defp load_documented_operations do
    Enum.reduce(OpenAPIContracts.bundle_files(), MapSet.new(), fn file_path, acc ->
      spec = file_path |> File.read!() |> Jason.decode!()
      paths = Map.get(spec, "paths", %{})

      Enum.reduce(paths, acc, fn {path, methods}, inner_acc ->
        if is_map(methods) do
          Enum.reduce(methods, inner_acc, fn {method, _operation_schema}, methods_acc ->
            normalized_method = String.downcase(to_string(method))

            if normalized_method in @http_methods do
              MapSet.put(methods_acc, {normalized_method, path})
            else
              methods_acc
            end
          end)
        else
          inner_acc
        end
      end)
    end)
  end

  defp operation_key(operation) do
    method = operation[:method] |> to_string() |> String.downcase()
    path = operation[:path]
    {method, path}
  end
end
