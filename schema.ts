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
  const scoped_to = { anyOf: [{ type: "null" }, en(Object.keys(d.modules))] };
  const ops: any[] = [obj({ op: { const: "add_data" }, name: str, description: str, scoped_to, quote }, ["op", "name", "description", "scoped_to", "quote"])];
  if (ids.length) {
    ops.push(obj({ op: { const: "update_data" }, id: en(ids), name: str, description: str, scoped_to, quote }, ["op", "id", "quote"]));
    ops.push(obj({ op: { const: "delete_data" }, id: en(ids), quote }, ["op", "id", "quote"]));
  }
  return scribe(ops, n);
};

export const moduleSchema = (d: Design, n: number) => {
  const ports = list(en(Object.keys(d.data)));
  const parent = en(Object.keys(d.modules));
  const ops: any[] = [obj({ op: { const: "add_module" }, name: str, parent, inputs: ports, outputs: ports, description: str, quote }, ["op", "name", "parent", "inputs", "outputs", "description", "quote"])];
  const ids = Object.keys(d.modules);
  if (ids.length) ops.push(obj({ op: { const: "update_module" }, id: en(ids), name: str, inputs: ports, outputs: ports, description: str, quote }, ["op", "id", "quote"]));
  const nonRoot = ids.filter((m) => d.modules[m].parent !== null);
  if (nonRoot.length) ops.push(obj({ op: { const: "delete_module" }, id: en(nonRoot), quote }, ["op", "id", "quote"]));
  return scribe(ops, n);
};

export const focusedSchema = (d: Design, m: string, n: number) => {
  const io = [...new Set([...d.modules[m].inputs, ...d.modules[m].outputs])];
  const values = (required: boolean) => obj(Object.fromEntries(io.map((x) => [x, str])), required ? io : []);
  const ops: any[] = [
    obj({ op: { const: "set_pseudocode" }, lines: list(str, 1), quote }, ["op", "lines", "quote"]),
    obj({ op: { const: "set_file" }, path: str, quote }, ["op", "path", "quote"]),
    obj({ op: { const: "update_description" }, description: str, quote }, ["op", "description", "quote"]),
    obj({ op: { const: "add_scenario" }, values: values(true), quote }, ["op", "values", "quote"]),
  ];
  const count = d.modules[m].scenarios?.length ?? 0;
  if (count) ops.push(obj({ op: { const: "update_scenario" }, index: en(Array.from({ length: count }, (_, i) => String(i))), values: values(false), quote }, ["op", "index", "values", "quote"]));
  return scribe(ops, n);
};

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