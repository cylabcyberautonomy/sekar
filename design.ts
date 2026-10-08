import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "yaml";

export type Data = { name: string; description?: string; scoped_to: string | null; filled: boolean; ready: boolean; source?: string[] };
// A scenario is one case for a module: a value for each of its inputs and outputs, keyed by data ID.
export type Scenario = Record<string, string>;
export type Module = { name: string; parent: string | null; inputs: string[]; outputs: string[]; description?: string; file?: string; pseudocode?: string[]; scenarios?: Scenario[]; source?: string[] };
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

const blank = (): Design => ({ next: { D: 1, M: 1, C: 1 }, data: {}, modules: {}, comments: {} });
const unfilledData = (): Data => ({ name: "", scoped_to: null, filled: false, ready: false });

// Every new project starts as D1 -> M1 -> D2: the root module with one external input and one external output, nothing filled in.
export const template = (): Design => ({
  next: { D: 3, M: 2, C: 1 },
  data: { D1: unfilledData(), D2: unfilledData() },
  modules: { M1: { name: "", parent: null, inputs: ["D1"], outputs: ["D2"] } },
  comments: {},
});

export const exists = () => existsSync(file());
export const load = (): Design => (exists() ? { ...blank(), ...parse(readFileSync(file(), "utf8")) } : template());

// filled and ready are owned by the checker: recomputed on every save, never set by the model.
const refresh = (d: Design) => {
  for (const [id, x] of Object.entries(d.data)) {
    x.filled = !!x.name && !!x.description;
    x.ready = x.filled && !Object.values(d.comments).some((c) => c.status === "open" && c.regarding.includes(id));
  }
};

export const save = (d: Design) => {
  refresh(d);
  writeFileSync(file(), stringify(d));
};

export const label = (d: Design, id: string) => {
  const name = d.data[id]?.name ?? d.modules[id]?.name ?? d.comments[id]?.title;
  return name ? `[${id}][${name}]` : `[${id}]`;
};

// A scenario is complete when every current input and output of the module has a value.
export const complete = (d: Design, m: string, s: Scenario) => [...d.modules[m].inputs, ...d.modules[m].outputs].every((x) => s[x] !== undefined && s[x] !== "");

export const scope = (d: Design, m: string) => [...new Set([m, ...d.modules[m].inputs, ...d.modules[m].outputs])];
export const children = (d: Design, parent: string | null) => Object.entries(d.modules).filter(([, m]) => m.parent === parent).map(([id]) => id);
const producers = (d: Design, x: string) => Object.entries(d.modules).filter(([, m]) => m.outputs.includes(x)).map(([id]) => id);

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
      d.data[op.id] = { ...unfilledData(), name: op.name, description: op.description, scoped_to: op.scoped_to ?? null, source: src(op.quote) };
    }
    if (op.op === "update_data")
      patch(op.id, { ...(op.name && { name: op.name }), ...(op.description && { description: op.description }), ...(op.scoped_to !== undefined && { scoped_to: op.scoped_to }) }, op.quote);
    if (op.op === "add_module") {
      op.id = newId(d, "M");
      d.modules[op.id] = { name: op.name, parent: op.parent, inputs: op.inputs, outputs: op.outputs, description: op.description, source: src(op.quote) };
    }
    if (op.op === "update_module")
      patch(
        op.id,
        { ...(op.name && { name: op.name }), ...(op.inputs && { inputs: op.inputs }), ...(op.outputs && { outputs: op.outputs }), ...(op.description && { description: op.description }) },
        op.quote,
      );
    if (op.op === "delete_data") { op.label = label(d, op.id); op.removed = []; removeData(d, [op.id], touched); }
    if (op.op === "delete_module") {
      const subtree = descendants(d, op.id);
      const inside = Object.keys(d.data).filter((x) => subtree.includes(d.data[x].scoped_to!));
      op.label = label(d, op.id);
      op.removed = [...subtree.slice(1), ...inside].map((id) => label(d, id));
      removeData(d, inside, touched);
      for (const m of subtree) { delete d.modules[m]; touched.delete(m); }
      dropFromComments(d, subtree, op.quote ? quoteText(op.quote, words) : "");
    }
  }
  return reopen(d, touched);
};

const descendants = (d: Design, m: string): string[] => [m, ...children(d, m).flatMap((c) => descendants(d, c))];

// Remove data everywhere it is referenced: module ports and scenarios (those modules count as touched), then comments.
const removeData = (d: Design, ids: string[], touched: Set<string>) => {
  for (const [m, mod] of Object.entries(d.modules)) {
    const before = mod.inputs.length + mod.outputs.length;
    mod.inputs = mod.inputs.filter((x) => !ids.includes(x));
    mod.outputs = mod.outputs.filter((x) => !ids.includes(x));
    if (mod.inputs.length + mod.outputs.length !== before) touched.add(m);
    mod.scenarios?.forEach((s) => ids.forEach((x) => delete s[x]));
  }
  ids.forEach((x) => delete d.data[x]);
  dropFromComments(d, ids, "");
};

// Deleted elements leave every comment's `regarding`; a comment left with no subject is resolved, with the deletion in its history.
const dropFromComments = (d: Design, ids: string[], why: string) => {
  for (const c of Object.values(d.comments)) {
    const kept = c.regarding.filter((id) => !ids.includes(id));
    if (kept.length === c.regarding.length) continue;
    c.regarding = kept;
    if (!kept.length && c.status === "open") { c.status = "resolved"; c.history.push({ by: "human", text: `deleted ${ids.join(", ")}${why ? `: ${why}` : ""}` }); }
  }
};

export const applyFocused = (d: Design, m: string, ops: any[], words: string[]) => {
  const t = d.modules[m];
  for (const op of ops) {
    if (op.op === "set_pseudocode") t.pseudocode = op.lines;
    if (op.op === "set_file") t.file = op.path;
    if (op.op === "update_description") t.description = op.description;
    if (op.op === "add_scenario") (t.scenarios ??= []).push({ ...op.values });
    if (op.op === "update_scenario") Object.assign((t.scenarios ??= [])[Number(op.index)] ??= {}, op.values);
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

// Rule violations. Any of these blocks the chain after the modules phase; each names the rule broken.
//   root             exactly one module has no parent; every parent exists
//   root-boundary    the root's inputs and outputs are external data
//   external-boundary external data is an input or output of the root
//   input-scope      a module's input is an input of its parent or an output of a sibling
//   output-scope     a module's output is an output of its parent or an input of a sibling
//   scope            internal data scoped to S surfaces from a child of S and is not on S's boundary
//   cycle            within a sibling group, data flow between modules has no cycle (reported as the node path)
//   duplicate-producer two siblings do not produce the same data
//   collective       a module with children has every output produced by a child and every input consumed by a child
// Cycles within one sibling group. Nodes are the group's modules and the data they touch; edges run input -> module -> output.
const cycles = (d: Design, members: string[]): string[][] => {
  const edges = new Map<string, string[]>();
  const add = (a: string, b: string) => edges.set(a, [...(edges.get(a) ?? []), b]);
  for (const m of members) {
    d.modules[m].inputs.forEach((x) => add(x, m));
    d.modules[m].outputs.forEach((x) => add(m, x));
  }
  const found: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (n: string) => {
    state.set(n, "visiting");
    stack.push(n);
    for (const next of edges.get(n) ?? []) {
      if (state.get(next) === "visiting") found.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(n, "done");
  };
  for (const n of edges.keys()) if (!state.has(n)) visit(n);
  return found;
};

export type Violation = { rule: string; text: string; about: string[] };

export const violations = (d: Design): Violation[] => {
  const out: Violation[] = [];
  const v = (rule: string, text: string, about: string[]) => out.push({ rule, text, about });
  const roots = children(d, null);
  if (roots.length !== 1) v("root", `expected exactly one module without a parent, found ${roots.length ? roots.map((id) => label(d, id)).join(", ") : "none"}`, roots);
  for (const [id, m] of Object.entries(d.modules)) {
    if (m.parent === null) {
      for (const x of [...m.inputs, ...m.outputs]) if (d.data[x]?.scoped_to !== null) v("root-boundary", `${label(d, id)} uses ${label(d, x)}, which is not external`, [id, x]);
      continue;
    }
    if (!d.modules[m.parent]) { v("root", `${label(d, id)} has unknown parent ${m.parent}`, [id]); continue; }
    const P = d.modules[m.parent];
    const siblings = children(d, m.parent).filter((s) => s !== id).map((s) => d.modules[s]);
    for (const x of m.inputs)
      if (!P.inputs.includes(x) && !siblings.some((s) => s.outputs.includes(x)))
        v("input-scope", `${label(d, id)} input ${label(d, x)} is neither an input of ${label(d, m.parent)} nor produced by a sibling`, [id, x]);
    for (const x of m.outputs)
      if (!P.outputs.includes(x) && !siblings.some((s) => s.inputs.includes(x)))
        v("output-scope", `${label(d, id)} output ${label(d, x)} is neither an output of ${label(d, m.parent)} nor consumed by a sibling`, [id, x]);
  }
  for (const [x, data] of Object.entries(d.data)) {
    const S = data.scoped_to;
    if (S === null) {
      if (roots.length === 1 && !d.modules[roots[0]].inputs.includes(x) && !d.modules[roots[0]].outputs.includes(x))
        v("external-boundary", `${label(d, x)} is external but is not an input or output of ${label(d, roots[0])}`, [x]);
      continue;
    }
    if (!d.modules[S]) { v("scope", `${label(d, x)} is scoped to unknown module ${S}`, [x]); continue; }
    if (d.modules[S].inputs.includes(x) || d.modules[S].outputs.includes(x)) v("scope", `${label(d, x)} is scoped to ${label(d, S)} but is on its boundary`, [x, S]);
    const prod = producers(d, x);
    if (!prod.length) v("scope", `${label(d, x)} is scoped to ${label(d, S)} but no module produces it`, [x]);
    // Outermost producers: those whose parent does not itself output x. A nested producer that hands x up through its
    // parent's outputs is covered by output-scope; only where x surfaces must the parent be S.
    for (const p of prod.filter((p) => !prod.includes(d.modules[p].parent!)))
      if (d.modules[p].parent !== S)
        v("scope", `${label(d, x)} is scoped to ${label(d, S)} but surfaces from ${label(d, p)}, whose parent is ${d.modules[p].parent ? label(d, d.modules[p].parent!) : "none"}`, [x, p]);
  }
  const groups = new Map<string | null, string[]>();
  for (const [id, m] of Object.entries(d.modules)) groups.set(m.parent, [...(groups.get(m.parent) ?? []), id]);
  for (const [P, members] of groups) {
    for (const c of cycles(d, members)) v("cycle", c.map((n) => label(d, n)).join(" -> "), c.slice(0, -1));
    const by = new Map<string, string[]>();
    members.forEach((m) => d.modules[m].outputs.forEach((x) => by.set(x, [...(by.get(x) ?? []), m])));
    for (const [x, ms] of by) if (ms.length > 1) v("duplicate-producer", `${label(d, x)} is produced by ${ms.map((m) => label(d, m)).join(" and ")}`, [x, ...ms]);
    if (P === null || !d.modules[P]) continue;
    for (const x of d.modules[P].outputs) if (!members.some((m) => d.modules[m].outputs.includes(x))) v("collective", `${label(d, P)} output ${label(d, x)} is produced by none of its children`, [P, x]);
    for (const x of d.modules[P].inputs) if (!members.some((m) => d.modules[m].inputs.includes(x))) v("collective", `${label(d, P)} input ${label(d, x)} is consumed by none of its children`, [P, x]);
  }
  return out;
};

const missing = (x: { name: string; description?: string }) => [...(x.name ? [] : ["name"]), ...(x.description ? [] : ["description"])];

// Non-blocking findings: readiness and shape, reported but never a reason to stop.
export const structural = (d: Design): string[] => [
  ...Object.entries({ ...d.data, ...d.modules }).filter(([, x]) => missing(x).length).map(([id, x]) => `${label(d, id)}: not filled in (${missing(x).join(", ")})`),
  ...Object.entries(d.modules).filter(([, m]) => !m.outputs.length).map(([id]) => `${label(d, id)}: module with no outputs`),
];
