import type { Design } from "./design";

const str = { type: "string" };
const obj = (properties: any, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const list = (items: any, min = 0) => ({ type: "array", items, ...(min && { minItems: min }) });
const en = (values: string[]) => ({ type: "string", enum: values });
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const quote = ref("quote");

const scribe = (ops: any[], n: number) => {
  const $defs = { quote: list(en(Array.from({ length: n }, (_, i) => String(i))), 1) };
  const unclear = list(obj({ quote, question: str }, ["quote", "question"]), 1);
  return { ...obj({ reply: { anyOf: [obj({ ops: list({ anyOf: ops }) }, ["ops"]), obj({ unclear }, ["unclear"])] } }, ["reply"]), $defs };
};

export const dataSchema = (d: Design, n: number) => {
  const ids = Object.keys(d.data);
  const ops: any[] = [obj({ op: { const: "add_data" }, name: str, description: str, quote }, ["op", "name", "description", "quote"])];
  if (ids.length) {
    ops.push(obj({ op: { const: "update_data" }, id: en(ids), description: str, quote }, ["op", "id", "quote"]));
    ops.push(obj({ op: { const: "set_data_as_given" }, id: en(ids), quote }, ["op", "id", "quote"]));
    ops.push(obj({ op: { const: "set_example" }, id: en(ids), example: str, quote }, ["op", "id", "example", "quote"]));
  }
  return scribe(ops, n);
};

export const moduleSchema = (d: Design, n: number) => {
  const ports = list(en(Object.keys(d.data)));
  const ops: any[] = [obj({ op: { const: "add_module" }, name: str, inputs: ports, outputs: ports, description: str, quote }, ["op", "name", "inputs", "outputs", "description", "quote"])];
  const ids = Object.keys(d.modules);
  if (ids.length) ops.push(obj({ op: { const: "update_module" }, id: en(ids), inputs: ports, outputs: ports, description: str, quote }, ["op", "id", "quote"]));
  return scribe(ops, n);
};

export const focusedSchema = (n: number) =>
  scribe(
    [
      obj({ op: { const: "set_pseudocode" }, lines: list(str, 1), quote }, ["op", "lines", "quote"]),
      obj({ op: { const: "set_file" }, path: str, quote }, ["op", "path", "quote"]),
      obj({ op: { const: "update_description" }, description: str, quote }, ["op", "description", "quote"]),
    ],
    n,
  );

export const criticSchema = (d: Design, elements = [...Object.keys(d.data), ...Object.keys(d.modules)]) => {
  const inScope = ([, c]: [string, any]) => c.regarding.some((id: string) => elements.includes(id));
  const open = Object.entries(d.comments).filter(([, c]) => c.status === "open").filter(inScope).map(([id]) => id);
  const resolved = Object.entries(d.comments).filter(([, c]) => c.status === "resolved").filter(inScope).map(([id]) => id);
  const comment = obj({ title: str, regarding: list(en(elements), 1), comment: str }, ["title", "regarding", "comment"]);
  const followup = obj({ comment: en(open), text: str }, ["comment", "text"]);
  const extra: any = resolved.length ? { reopen: list(en(resolved)) } : {};
  const branches = [obj({ comments: list(comment, 1), ...(open.length && { followups: list(followup) }), ...extra }, ["comments"])];
  if (open.length) branches.push(obj({ followups: list(followup, 1), comments: list(comment), ...extra }, ["followups"]));
  return obj({ reply: { anyOf: branches } }, ["reply"]);
};