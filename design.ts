import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "yaml";

export type Data = { name: string; description?: string; given?: boolean; example?: string; source?: string[] };
export type Module = { name: string; inputs: string[]; outputs: string[]; description?: string; file?: string; pseudocode?: string[]; source?: string[] };
export type Entry = { by: "critic" | "human"; text: string };
export type Comment = { title: string; regarding: string[]; status: "open" | "resolved"; history: Entry[] };
export type Design = { next: { D: number; M: number; C: number }; data: Record<string, Data>; modules: Record<string, Module>; comments: Record<string, Comment> };

const root = join(dirname(fileURLToPath(import.meta.url)), "projects");
let project = basename(process.cwd());

export const setProject = (name: string) => (project = name);
export const getProject = () => project;
export const listProjects = () => (existsSync(root) ? readdirSync(root) : []);
export const deleteProject = (name: string) => rmSync(join(root, name), { recursive: true, force: true });

const file = () => {
  mkdirSync(join(root, project), { recursive: true });
  return join(root, project, "design.yaml");
};

const empty = (): Design => ({ next: { D: 1, M: 1, C: 1 }, data: {}, modules: {}, comments: {} });

export const load = (): Design => (existsSync(file()) ? { ...empty(), ...parse(readFileSync(file(), "utf8")) } : empty());

export const save = (d: Design) => writeFileSync(file(), stringify(d));

export const label = (d: Design, id: string) => `[${id}][${d.data[id]?.name ?? d.modules[id]?.name ?? d.comments[id]?.title}]`;

export const scope = (d: Design, m: string) => [...new Set([m, ...d.modules[m].inputs, ...d.modules[m].outputs])];

const newId = (d: Design, kind: "D" | "M" | "C") => `${kind}${d.next[kind]++}`;

export const quoteText = (q: string[], words: string[]) => {
  const idx = [...new Set(q.map(Number))].sort((a, b) => a - b);
  return idx.map((i, k) => (k && i !== idx[k - 1] + 1 ? `… ${words[i]}` : words[i])).join(" ");
};

const reopen = (d: Design, touched: Set<string>) => {
  const ids = Object.entries(d.comments).filter(([, c]) => c.status === "resolved" && c.regarding.some((id) => touched.has(id))).map(([id]) => id);
  ids.forEach((id) => (d.comments[id].status = "open"));
  return ids;
};

export const apply = (d: Design, ops: any[], words: string[]) => {
  const touched = new Set<string>();
  const src = (q: string[]) => [quoteText(q, words)];
  const merge = (prev: string[] = [], q: string[]) => [...prev, ...src(q)];
  const patch = (id: string, fields: object, q: string[]) => {
    touched.add(id);
    const t = d.data[id] ?? d.modules[id];
    Object.assign(t, fields, { source: merge(t.source, q) });
  };
  for (const op of ops) {
    if (op.op === "add_data") {
      op.id = newId(d, "D");
      d.data[op.id] = { name: op.name, description: op.description, source: src(op.quote) };
    }
    if (op.op === "update_data") patch(op.id, op.description ? { description: op.description } : {}, op.quote);
    if (op.op === "set_data_as_given") patch(op.id, { given: true }, op.quote);
    if (op.op === "set_example") patch(op.id, { example: op.example }, op.quote);
    if (op.op === "add_module") {
      op.id = newId(d, "M");
      d.modules[op.id] = { name: op.name, inputs: op.inputs, outputs: op.outputs, description: op.description, source: src(op.quote) };
    }
    if (op.op === "update_module")
      patch(op.id, { ...(op.inputs && { inputs: op.inputs }), ...(op.outputs && { outputs: op.outputs }), ...(op.description && { description: op.description }) }, op.quote);
  }
  return reopen(d, touched);
};

export const applyFocused = (d: Design, m: string, ops: any[], words: string[]) => {
  const t = d.modules[m];
  for (const op of ops) {
    if (op.op === "set_pseudocode") t.pseudocode = op.lines;
    if (op.op === "set_file") t.file = op.path;
    if (op.op === "update_description") t.description = op.description;
    t.source = [...(t.source ?? []), quoteText(op.quote, words)];
  }
  return ops.length ? reopen(d, new Set([m])) : [];
};

export const critique = (d: Design, reply: any) => {
  reply.followups ??= [];
  reply.comments ??= [];
  for (const f of reply.followups) d.comments[f.comment].history.push({ by: "critic", text: f.text });
  for (const c of reply.comments) {
    c.id = newId(d, "C");
    d.comments[c.id] = { title: c.title, regarding: c.regarding, status: "open", history: [{ by: "critic", text: c.comment }] };
  }
  (reply.reopen ?? []).forEach((id: string) => (d.comments[id].status = "open"));
};

export const answer = (d: Design, id: string, text: string) => d.comments[id].history.push({ by: "human", text });
export const resolve = (d: Design, id: string) => (d.comments[id].status = "resolved");

export const structural = (d: Design): string[] => {
  const produced = new Set(Object.values(d.modules).flatMap((m) => m.outputs));
  const consumed = new Set(Object.values(d.modules).flatMap((m) => m.inputs));
  return [
    ...Object.entries(d.data).filter(([id, x]) => !x.given && !produced.has(id)).map(([id]) => `${label(d, id)}: not given and produced by no module`),
    ...Object.keys(d.data).filter((id) => !consumed.has(id)).map((id) => `${label(d, id)}: consumed by no module`),
    ...Object.entries(d.modules).filter(([, m]) => !m.outputs.length).map(([id]) => `${label(d, id)}: module with no outputs`),
  ];
};