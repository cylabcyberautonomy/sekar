import { execFileSync } from "child_process";
import { children, complete, violations, type Design } from "./design";
import { gate } from "./implement";

// Mermaid source for mmdflux. Node ids are design IDs, labels are names (ID when unnamed). Data are rounded nodes,
// leaf modules are rectangles, a module with children is a subgraph holding its leaf children, its internal data,
// and its composite children as nested subgraphs. Edges run only to and from leaf modules.
//
// Reading direction is top-down so the width stays near the widest rank and tall graphs scroll. Two kinds of
// invisible links (~~~), which mmdflux ranks but never draws, shape the layout:
//   anchors: the last root input in the stagger chain links to every first-stage leaf (a leaf consuming only root
//            inputs) it does not already feed, so inputs stay above the modules instead of dropping to the rank of
//            their consumers. Every invisible link costs a dummy node per rank it crosses, and dummies push each
//            other sideways into jogs, so no link is added where a real edge or the chain already pins the node;
//   stagger: root inputs are chained in ID order so each sits one rank below the previous, and sibling leaves that
//            would land on the same rank and share an input are chained the same way. Level nodes compete for the
//            same three rows of edge channels and mmdflux then runs edges along node borders; staggering gives each
//            its own band. Root outputs are the exception: every one is pulled down to the rank below the deepest
//            producing leaf, so the outputs stay on one bottom row.
//
// Color. Modules mint, data baby blue, tints on a dark terminal and shades on a light one. Yellow replaces the base
// color on an element with an open comment; red on one that blocks: named by a current rule violation, or, after an
// /implement attempt was refused, the focused module and each of its inputs and outputs no scenario assigns.
// The focused module is marked by shape, not color: a leaf is drawn with a double-line box (╔═╗ ║ ║ ╚═╝), a composite's
// frame title gets a "* " prefix (ASCII, so column counts stay exact). Edges keep the terminal's foreground.
// mmdflux colors nodes through classes but paints subgraph frames bare, so frames are painted afterwards: each is
// found by its title row, walked down its two side columns to the bottom corners, and wrapped in the composite
// module's state color, leaving cells where an edge crosses the frame untouched.

export type Theme = "dark" | "light";
type State = "mod" | "data" | "warn" | "block";
const palettes: Record<Theme, Record<State, string>> = {
  dark: { mod: "#a7f3d0", data: "#a9d7ff", warn: "#ffe066", block: "#ff5c5c" },
  light: { mod: "#047857", data: "#1d4ed8", warn: "#a16207", block: "#b91c1c" },
};

export const states = (d: Design, focus: string | null = null, attempted = false): Record<string, State> => {
  const out: Record<string, State> = {};
  for (const id of Object.keys(d.data)) out[id] = "data";
  for (const id of Object.keys(d.modules)) out[id] = "mod";
  for (const c of Object.values(d.comments)) if (c.status === "open") c.regarding.forEach((id) => (out[id] = "warn"));
  for (const v of violations(d)) v.about.forEach((id) => (out[id] = "block"));
  if (focus && attempted && d.modules[focus]) {
    const m = d.modules[focus];
    if (gate(d, focus).length) out[focus] = "block";
    if (!m.scenarios?.some((s) => complete(d, focus, s)))
      [...m.inputs, ...m.outputs].filter((x) => !m.scenarios?.some((s) => s[x])).forEach((x) => (out[x] = "block"));
  }
  return out;
};

// A composite module's frame title; the focused one is prefixed so the frame can be told apart.
export const frameTitle = (d: Design, m: string, focus: string | null) => `${m === focus ? "* " : ""}${d.modules[m].name || m}`;

export const toMermaid = (d: Design, theme: Theme = "dark", focus: string | null = null, attempted = false) => {
  const label = (id: string) => `"${(d.data[id]?.name || d.modules[id]?.name || id).replace(/"/g, "'")}"`;
  const leaf = (m: string) => !children(d, m).length;
  const leaves = Object.entries(d.modules).filter(([m]) => leaf(m));
  const produced = new Set(Object.values(d.modules).flatMap((m) => m.outputs));
  const rootInputs = Object.keys(d.data).filter((x) => d.data[x].scoped_to === null && !produced.has(x));
  const firstStage = leaves.filter(([, m]) => m.inputs.every((x) => rootInputs.includes(x))).map(([m]) => m);
  const state = states(d, focus, attempted);
  const palette = palettes[theme];

  // Longest-path rank over the leaf data flow plus the invisible links added so far, which mmdflux ranks like real
  // edges. Cycles, which the checker rejects anyway, are cut. The memo is cleared whenever a link is added.
  const producers: Record<string, string[]> = {};
  leaves.forEach(([m, mod]) => mod.outputs.forEach((o) => (producers[o] ??= []).push(m)));
  const before: Record<string, string[]> = {};
  const stagger: string[] = [];
  const memo = new Map<string, number>();
  const link = (a: string, b: string) => { (before[b] ??= []).push(a); stagger.push(`  ${a} ~~~ ${b}`); memo.clear(); };
  const visiting = new Set<string>();
  const rank = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = [...(d.data[id] ? producers[id] ?? [] : d.modules[id].inputs), ...(before[id] ?? [])];
    const r = preds.length ? 1 + Math.max(...preds.map(rank)) : 0;
    visiting.delete(id);
    memo.set(id, r);
    return r;
  };
  for (let i = 0; i + 1 < rootInputs.length; i++) link(rootInputs[i], rootInputs[i + 1]);
  const last = rootInputs.at(-1);
  if (last) firstStage.filter((m) => !d.modules[m].inputs.includes(last)).forEach((m) => link(last, m));
  for (const parent of new Set(Object.values(d.modules).map((m) => m.parent))) {
    const byRank = new Map<number, string[]>();
    children(d, parent).filter(leaf).forEach((m) => byRank.set(rank(m), [...(byRank.get(rank(m)) ?? []), m]));
    for (const level of byRank.values()) {
      const shares = (a: string, b: string) => d.modules[a].inputs.some((x) => d.modules[b].inputs.includes(x));
      const chain = level.filter((m) => level.some((o) => o !== m && shares(m, o)));
      for (let i = 0; i + 1 < chain.length; i++) link(chain[i], chain[i + 1]);
    }
  }
  const rootOutputs = Object.keys(d.data).filter((x) => d.data[x].scoped_to === null && produced.has(x));
  const deepest = rootOutputs.flatMap((o) => producers[o] ?? []).sort((a, b) => rank(b) - rank(a))[0];
  if (deepest) rootOutputs.filter((o) => !(producers[o] ?? []).includes(deepest)).forEach((o) => link(deepest, o));

  const emit = (parent: string | null, pad: string): string[] => [
    ...Object.entries(d.data).filter(([, x]) => x.scoped_to === parent).map(([id]) => `${pad}${id}([${label(id)}]):::${state[id]}`),
    ...children(d, parent).flatMap((m) =>
      leaf(m)
        ? [m === focus ? `${pad}${m}[[${label(m)}]]:::${state[m]}` : `${pad}${m}[${label(m)}]:::${state[m]}`]
        : [`${pad}subgraph ${m}["${frameTitle(d, m, focus).replace(/"/g, "'")}"]`, ...emit(m, pad + "  "), `${pad}end`]),
  ];
  return [
    "graph TD",
    ...(Object.keys(palette) as State[]).map((s) => `  classDef ${s} color:${palette[s]},stroke:${palette[s]}`),
    ...emit(null, "  "),
    ...leaves.flatMap(([id, m]) => [...m.inputs.map((i) => `  ${i} --> ${id}`), ...m.outputs.map((o) => `  ${id} --> ${o}`)]),
    ...stagger,
  ].join("\n");
};

const ESC = /\x1b\[[0-9;]*m/g;
const junction = /[┼┬┴├┤▼▲◄►]/;
const sideChar = /[│┼├┤]/;

// Paint each composite module's frame. The frame's title row is `┌─── title ───┐` (edges crossing it turn `─` into
// junction glyphs); the matching corner pair is the one whose two columns run down through side glyphs to a `└ ┘`
// row. Only bare frame glyphs and the title text are recolored; junctions where edges cross stay as they are.
export const paintFrames = (colored: string, frames: { title: string; color: string }[]) => {
  const lines = colored.split("\n");
  const plain = lines.map((l) => l.replace(ESC, ""));
  const cells = new Map<string, string>();
  const used = new Set<number>();
  for (const { title, color } of frames) {
    const t = title;
    const bar = (c: string | undefined) => /[─┼┬┴]/.test(c ?? "");
    for (let r = 0; r < plain.length; r++) {
      if (used.has(r)) continue;
      let ti = -1;
      while ((ti = plain[r].indexOf(t, ti + 1)) >= 0) {
        // the title sits in the top border: `─ title ─`, where an edge crossing may have replaced either space
        const row = plain[r], te = ti + t.length;
        if (!((row[ti - 1] === " " && bar(row[ti - 2])) || bar(row[ti - 1]))) continue;
        if (!((row[te] === " " && bar(row[te + 1])) || bar(row[te]))) continue;
        const lefts = [...row.slice(0, ti).matchAll(/┌/g)].map((m) => m.index!).reverse();
        const rights = [...row.slice(te).matchAll(/┐/g)].map((m) => m.index! + te);
        let found: { x0: number; x1: number; rb: number } | null = null;
        for (const x0 of lefts) {
          for (const x1 of rights) {
            let rb = -1;
            for (let rr = r + 1; rr < plain.length; rr++) {
              const a = plain[rr][x0] ?? "", b = plain[rr][x1] ?? "";
              if (a === "└" && b === "┘") { rb = rr; break; }
              if (!sideChar.test(a) || !sideChar.test(b)) break;
            }
            if (rb > 0) { found = { x0, x1, rb }; break; }
          }
          if (found) break;
        }
        if (!found) continue;
        const { x0, x1, rb } = found;
        for (let c = x0; c <= x1; c++) { cells.set(`${r},${c}`, color); cells.set(`${rb},${c}`, color); }
        for (let rr = r + 1; rr < rb; rr++) { cells.set(`${rr},${x0}`, color); cells.set(`${rr},${x1}`, color); }
        used.add(r);
        break;
      }
      if (used.has(r)) break;
    }
  }
  if (!cells.size) return colored;
  const rgb = (hex: string) => hex.slice(1).match(/../g)!.map((h) => parseInt(h, 16)).join(";");
  return lines
    .map((line, r) => {
      let out = "", col = 0, inSpan = false, open: string | null = null;
      const close = () => { if (open) { out += "\x1b[0m"; open = null; } };
      for (let i = 0; i < line.length; ) {
        const m = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
        if (m) { close(); inSpan = m[0] !== "\x1b[0m"; out += m[0]; i += m[0].length; continue; }
        const ch = line[i];
        const color = cells.get(`${r},${col}`);
        if (color && !inSpan && ch !== " " && !junction.test(ch)) {
          if (open !== color) { close(); out += `\x1b[38;2;${rgb(color)}m`; open = color; }
        } else close();
        out += ch;
        col++; i++;
      }
      close();
      return out;
    })
    .join("\n");
};

// Complete the focused leaf's outline: mmdflux draws the subroutine shape with double side bars only, so the border
// rows above and below the `║ name ║` row are rewritten with double-line glyphs. Node border cells are never shared
// with edges, so a plain replacement is safe.
const rewriteCells = (line: string, edits: Map<number, string>) => {
  let out = "", col = 0;
  for (let i = 0; i < line.length; ) {
    const m = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
    if (m) { out += m[0]; i += m[0].length; continue; }
    out += edits.get(col) ?? line[i];
    col++; i++;
  }
  return out;
};
export const doubleBox = (colored: string, name: string) => {
  const lines = colored.split("\n");
  const plain = lines.map((l) => l.replace(ESC, ""));
  const r = plain.findIndex((l) => l.includes(`║ ${name} ║`));
  if (r < 1 || r + 1 >= plain.length) return colored;
  const x0 = plain[r].indexOf(`║ ${name} ║`), x1 = x0 + name.length + 3;
  if (plain[r - 1][x0] !== "┌" || plain[r - 1][x1] !== "┐" || plain[r + 1][x0] !== "└" || plain[r + 1][x1] !== "┘") return colored;
  const row = (l: string, r2: string) => { const e = new Map<number, string>(); e.set(x0, l); e.set(x1, r2); for (let c = x0 + 1; c < x1; c++) e.set(c, "═"); return e; };
  lines[r - 1] = rewriteCells(lines[r - 1], row("╔", "╗"));
  lines[r + 1] = rewriteCells(lines[r + 1], row("╚", "╝"));
  return lines.join("\n");
};

export const render = (d: Design, opts: { theme?: Theme; focus?: string | null; attempted?: boolean } = {}) => {
  const theme = opts.theme ?? "dark", focus = opts.focus ?? null, attempted = opts.attempted ?? false;
  const colored = execFileSync("mmdflux", ["--color", "always", "--quiet"], { input: toMermaid(d, theme, focus, attempted), encoding: "utf8" });
  const state = states(d, focus, attempted);
  const frames = Object.keys(d.modules).filter((m) => children(d, m).length).map((m) => ({ title: frameTitle(d, m, focus), color: palettes[theme][state[m]] }));
  const painted = paintFrames(colored, frames);
  return focus && d.modules[focus] && !children(d, focus).length ? doubleBox(painted, d.modules[focus].name || focus) : painted;
};
