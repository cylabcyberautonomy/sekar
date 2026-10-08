import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { load, save, exists, template, apply, applyFocused, critique, answer, resolve, structural, violations, scope, label, setProject, getProject, listProjects, deleteProject } from "./design";
import { dataSchema, moduleSchema, focusedSchema, criticSchema } from "./schema";
import { dataLines, moduleLines, focusedLines, commentLines } from "./format";
import { systemPrompt } from "./prompt";
import { gate, checkWrite } from "./implement";
import { checkReply, STYLE_RULES } from "./style";
import { render, type Theme } from "./graph";

type Mode = "global" | "focused" | "implement";
type Phase = "data" | "modules" | "focused" | "critic";

export default function (pi: ExtensionAPI) {
  let auto = true;
  let mode: Mode = "global";
  let focus: string | null = null;
  let phase: Phase = "data";
  let pool: string[] = [];
  let blocked = false; // the phase chain stops this turn (unclear reply or rule violation)
  let pooling = false; // the last scribe reply was unclear, so the next message's words join the pool
  let answering: string[] = [];
  let findings: string[] = [];
  let restyle: string[] = []; // style problems in the last critic reply; non-empty means ask the critic again
  let retries = 0; // critic re-asks this turn
  const MAX_RETRIES = 2;
  const last = (ctx: any, type: string) => ctx.sessionManager.getBranch().filter((e: any) => e.customType === type).at(-1)?.data;
  const text = (event: any) => event.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  let theme: Theme = "dark";
  let attempted = false; // an /implement on the current focus was refused; turns the gate failures red
  const draw = (d: any) => render(d, { theme, focus: mode === "global" ? null : focus, attempted });
  // ANSI-aware clip to a column width; every glyph the graph uses is one column wide
  const clip = (line: string, width: number) => {
    let out = "", cols = 0;
    for (let i = 0; i < line.length; ) {
      const m = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
      if (m) { out += m[0]; i += m[0].length; continue; }
      if (cols < width) { out += line[i]; cols++; }
      i++;
    }
    return out;
  };
  // The graph is a durable session entry: it prints inline in the transcript at the end of a turn, persists across
  // resumes, and is never sent to the model. `graph()` appends one; the renderer below draws every stored one.
  const graph = (_ctx: any, d: any) => { if (auto) pi.appendEntry("sekar-graph", { text: draw(d) }); };
  pi.registerEntryRenderer<{ text: string }>("sekar-graph", (entry) => {
    const lines = (entry.data?.text ?? "").split("\n");
    return { render: (width: number) => lines.map((l) => clip(l, width)), invalidate() {} };
  });
  const banner = (ctx: any) => {
    if (!exists()) save(template());
    const d = load();
    ctx.ui.notify(`project: ${getProject()}\nmode: ${mode}${focus ? ` on ${label(d, focus)}` : ""}`, "info");
    if (!last(ctx, "sekar-graph")) graph(ctx, d);
  };
  const firstPhase = (): Phase => (mode === "focused" ? "focused" : "data");
  const setMode = (m: Mode, f: string | null, ctx: any) => {
    if (f !== focus || m === "global") attempted = false;
    mode = m; focus = f;
    pi.setActiveTools(m === "implement" ? ["read", "grep", "find", "ls", "write", "edit"] : []);
    pi.appendEntry("sekar-mode", { mode, focus, attempted });
    const d = load();
    ctx.ui.notify(m === "global" ? "mode: global" : `mode: ${m} on ${label(d, f!)}`, "info");
    graph(ctx, d);
  };

  pi.registerCommand("project", {
    description: "/project | /project list | /project new <name> | /project select <name> | /project delete <name>",
    handler: async (args, ctx) => {
      const [cmd, name] = (args ?? "").trim().split(/\s+/);
      if (!cmd) return ctx.ui.notify(`project: ${getProject()}`, "info");
      if (cmd === "list") return ctx.ui.notify(listProjects().map((p) => (p === getProject() ? `* ${p}` : `  ${p}`)).join("\n"), "info");
      if (!name) return ctx.ui.notify("name required", "error");
      if (cmd === "new" || cmd === "select") {
        if (cmd === "new" && listProjects().includes(name)) return ctx.ui.notify(`${name} already exists`, "error");
        if (cmd === "select" && !listProjects().includes(name)) return ctx.ui.notify(`no project ${name}`, "error");
        setProject(name);
        if (cmd === "new") save(template());
        pi.appendEntry("sekar-project", { name });
        mode = "global"; focus = null;
        pi.setActiveTools([]);
        pi.appendEntry("sekar-mode", { mode, focus });
        return banner(ctx);
      }
      if (cmd === "delete") {
        if (!listProjects().includes(name)) return ctx.ui.notify(`no project ${name}`, "error");
        if (!(await ctx.ui.confirm(`Delete project ${name}?`, "This removes its design.yaml permanently."))) return;
        deleteProject(name);
        return ctx.ui.notify(`deleted ${name}${name === getProject() ? " (current project; select another)" : ""}`, "info");
      }
      ctx.ui.notify(`unknown subcommand ${cmd}`, "error");
    },
  });

  pi.registerCommand("graph", {
    description: "Print the design graph; `/graph auto on|off` prints it after every turn; `/graph theme dark|light` picks the palette",
    handler: async (args, ctx) => {
      const m = args?.match(/^auto\s+(on|off)$/);
      if (m) { auto = m[1] === "on"; pi.appendEntry("sekar-graph-auto", { auto }); return ctx.ui.notify(`graph auto: ${m[1]}`, "info"); }
      const t = args?.match(/^theme\s+(dark|light)$/);
      if (t) { theme = t[1] as Theme; pi.appendEntry("sekar-graph-theme", { theme }); return ctx.ui.notify(`graph theme: ${theme}`, "info"); }
      pi.appendEntry("sekar-graph", { text: draw(load()) });
    },
  });

  pi.registerCommand("resolve", {
    description: "Resolve a comment: /resolve C3",
    handler: async (id, ctx) => {
      const d = load();
      if (!d.comments[id]) return ctx.ui.notify(`no comment ${id}`, "error");
      resolve(d, id);
      save(d);
      ctx.ui.notify(`resolved ${label(d, id)}`, "info");
      graph(ctx, d);
    },
  });

  pi.registerCommand("focus", {
    description: "Focus design on one module: /focus M1",
    handler: async (id, ctx) => {
      if (!load().modules[id]) return ctx.ui.notify(`no module ${id}`, "error");
      setMode("focused", id, ctx);
    },
  });

  pi.registerCommand("unfocus", {
    description: "Return to unfocused design",
    handler: async (_, ctx) => setMode("global", null, ctx),
  });

  pi.registerCommand("implement", {
    description: "Implement the focused module (requires a complete scenario, pseudocode, file)",
    handler: async (_, ctx) => {
      if (mode !== "focused") return ctx.ui.notify("focus a module first", "error");
      const missing = gate(load(), focus!);
      if (missing.length) {
        attempted = true;
        pi.appendEntry("sekar-mode", { mode, focus, attempted });
        graph(ctx, load());
        return ctx.ui.notify(`cannot implement:\n${missing.join("\n")}`, "error");
      }
      setMode("implement", focus, ctx);
    },
  });

  pi.on("session_start", (_, ctx) => {
    const project = last(ctx, "sekar-project");
    if (project) setProject(project.name);
    const g = last(ctx, "sekar-graph-auto");
    if (g) auto = g.auto;
    const th = last(ctx, "sekar-graph-theme");
    if (th) theme = th.theme;
    const saved = last(ctx, "sekar-mode");
    mode = saved?.mode ?? "global"; focus = saved?.focus ?? null; attempted = saved?.attempted ?? false;
    if (focus && !load().modules[focus]) { mode = "global"; focus = null; } // the focused module was deleted
    pi.setActiveTools(mode === "implement" ? ["read", "grep", "find", "ls", "write", "edit"] : []);
    banner(ctx);
  });

  pi.on("input", (event: any, ctx) => {
    if (mode === "implement") return;
    phase = firstPhase();
    retries = 0; restyle = [];
    const parts = [...event.text.matchAll(/(C\d+):\s*([\s\S]*?)(?=\s*C\d+:|$)/g)];
    answering = [];
    if (parts.length) {
      const d = load();
      const bad = parts.find(([, id]) => d.comments[id]?.status !== "open");
      if (bad) { ctx.ui.notify(`${bad[1]} is not an open comment`, "error"); return { action: "handled" }; }
      parts.forEach(([, id, t]) => answer(d, id, t.trim()));
      save(d);
      answering = parts.map(([, id]) => id);
    }
    const body = parts.length ? parts.map(([, , t]) => t).join(" ") : event.text;
    const words = body.split(/\s+/).filter(Boolean);
    pool = pooling ? [...pool, ...words] : words;
  });

  pi.on("before_agent_start", () => ({ systemPrompt: systemPrompt(load(), mode, focus, pool) }));

  pi.on("before_provider_request", (event) => {
    if (mode === "implement") return;
    const body = event.payload as Record<string, unknown>;
    const d = load();
    const schema =
      phase === "data" ? dataSchema(d, pool.length)
      : phase === "modules" ? moduleSchema(d, pool.length)
      : phase === "focused" ? focusedSchema(d, focus!, pool.length)
      : criticSchema(d, mode === "focused" ? scope(d, focus!) : undefined);
    return { ...body, output_config: { ...((body.output_config as object) ?? {}), format: { type: "json_schema", schema } } };
  });

  pi.on("message_end", (event: any, ctx) => {
    if (mode === "implement" || event.message.role !== "assistant") return;
    const raw = text(event);
    if (!raw.trim()) return;
    const reply = JSON.parse(raw).reply;
    const d = load();
    let shown: string;
    if (phase === "critic") {
      restyle = checkReply(reply);
      if (restyle.length && retries < MAX_RETRIES) {
        retries++;
        shown = [`COMMENTS (style check failed, asking again: ${retries}/${MAX_RETRIES})`, ...restyle.map((p) => `    ${p}`)].join("\n");
      } else {
        if (restyle.length) shown = `[style] accepted after ${MAX_RETRIES} retries with ${restyle.length} problem(s) left\n`;
        else shown = "";
        restyle = [];
        critique(d, reply);
        save(d);
        shown += commentLines(reply, d);
        graph(ctx, d);
      }
    } else {
      pooling = blocked = !!reply.unclear;
      const reopened = blocked ? [] : phase === "focused" ? applyFocused(d, focus!, reply.ops, pool) : apply(d, reply.ops, pool);
      if (!blocked) save(d);
      findings = reopened.map((id) => `reopened ${label(d, id)}`);
      if (phase === "data") shown = dataLines(reply, d, pool);
      else if (phase === "focused") shown = focusedLines(reply, d, focus!, pool, findings);
      else {
        const broken = violations(d);
        findings.push(...broken.map((v) => `[violation] ${v.rule}: ${v.text}`), ...structural(d).map((i) => `[structural] ${i}`));
        if (broken.length) { blocked = true; findings.push(`[blocked] ${broken.length} rule violation(s); critic skipped`); }
        shown = moduleLines(reply, d, pool, findings);
        if (blocked) graph(ctx, d);
      }
    }
    return { message: { ...event.message, content: [{ type: "text", text: shown }] } };
  });

  pi.on("turn_end", (event: any) => {
    if (mode === "implement") return;
    const d = load();
    const next = (content: string) => ({ entries: [...event.entries, { type: "custom_message", customType: "sekar-phase", content, display: false }], continue: true });
    const critic = () => {
      phase = "critic";
      const note = answering.length ? ` The human answered ${answering.join(", ")}; their histories are in design.yaml.` : "";
      return next(`Phase critic.${note}\nStructural findings:\n${findings.join("\n") || "none"}`);
    };
    if (phase === "data") {
      if (blocked || !Object.keys(d.data).length) return;
      phase = "modules";
      return next(`Phase modules. Data IDs available: ${Object.keys(d.data).join(", ")}.`);
    }
    if (phase === "modules" || phase === "focused") return blocked ? undefined : critic();
    if (restyle.length) return next(`Phase critic, again. Your last reply failed the style check:\n${restyle.map((p) => `- ${p}`).join("\n")}\n\nRewrite the whole reply. ${STYLE_RULES}`);
    phase = firstPhase();
    answering = [];
    retries = 0;
  });

  pi.on("tool_call", (event: any) => {
    if (mode !== "implement" || !["write", "edit"].includes(event.toolName)) return;
    const reason = checkWrite(load(), focus!, event.toolName, event.input);
    if (reason) return { block: true, reason };
  });
}