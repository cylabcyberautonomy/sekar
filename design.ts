import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "yaml";

export type Data = { description?: string; given?: boolean };
export type Module = { inputs: string[]; outputs: string[]; description?: string };
export type Design = { data: Record<string, Data>; modules: Record<string, Module> };

const root = join(dirname(fileURLToPath(import.meta.url)), "projects");
let project = basename(process.cwd());

export const setProject = (name: string) => (project = name);
export const getProject = () => project;

const file = () => {
  mkdirSync(join(root, project), { recursive: true });
  return join(root, project, "design.yaml");
};

export const load = (): Design =>
  existsSync(file()) ? parse(readFileSync(file(), "utf8")) : { data: {}, modules: {} };

export const save = (d: Design) => writeFileSync(file(), stringify(d));

export const apply = (d: Design, ops: any[]): Design => {
  const port = (p: any) => {
    if (p.data_new) d.data[p.data_new.name] = { description: p.data_new.description, given: p.data_new.given };
    return p.data_ref ?? p.data_new.name;
  };
  for (const op of ops) {
    if (op.op === "add_data") d.data[op.name] = { description: op.description, given: op.given };
    if (op.op === "update_data") d.data[op.name] = { ...d.data[op.name], ...pick(op, ["description", "given"]) };
    if (op.op === "set_data_as_given") d.data[op.name].given = true;
    if (op.op === "add_module")
      d.modules[op.name] = { inputs: op.inputs.map(port), outputs: op.outputs.map(port), description: op.description };
    if (op.op === "update_module")
      d.modules[op.name] = {
        ...d.modules[op.name],
        ...(op.inputs && { inputs: op.inputs.map(port) }),
        ...(op.outputs && { outputs: op.outputs.map(port) }),
        ...(op.description && { description: op.description }),
      };
  }
  return d;
};

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));