import type { Design } from "./design";

const str = { type: "string" };
const obj = (properties: any, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

export const buildSchema = (d: Design) => {
  const dataNames = Object.keys(d.data);
  const moduleNames = Object.keys(d.modules);
  const data_new = obj({ data_new: obj({ name: str, description: str, given: { type: "boolean" } }, ["name", "description"]) }, ["data_new"]);
  const data_ref = obj({ data_ref: { type: "string", enum: dataNames } }, ["data_ref"]);
  const data = { anyOf: dataNames.length ? [data_ref, data_new] : [data_new] };
  const ports = { type: "array", items: data };
  const ops: any[] = [
    obj({ op: { const: "add_data" }, name: str, description: str, given: { type: "boolean" } }, ["op", "name", "description"]),
    obj({ op: { const: "add_module" }, name: str, inputs: ports, outputs: ports, description: str }, ["op", "name", "inputs", "outputs", "description"]),
  ];
  if (dataNames.length) {
    const name = { type: "string", enum: dataNames };
    ops.push(obj({ op: { const: "update_data" }, name, description: str, given: { type: "boolean" } }, ["op", "name"]));
    ops.push(obj({ op: { const: "set_data_as_given" }, name }, ["op", "name"]));
  }
  if (moduleNames.length)
    ops.push(obj({ op: { const: "update_module" }, name: { type: "string", enum: moduleNames }, inputs: ports, outputs: ports, description: str }, ["op", "name"]));
  return obj({ ops: { type: "array", items: { anyOf: ops } } }, ["ops"]);
};