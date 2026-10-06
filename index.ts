import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stringify } from "yaml";
import { load, save, apply, setProject, getProject } from "./design";
import { buildSchema } from "./schema";
import { prompt } from "./prompt";
import { render } from "./graph";

export default function (pi: ExtensionAPI) {
  let auto = true;
  const last = (ctx: any, type: string) => ctx.sessionManager.getBranch().filter((e: any) => e.customType === type).at(-1)?.data;

  pi.registerCommand("project", {
    description: "Set the active project (defaults to current directory name)",
    handler: async (name, ctx) => {
      if (name) { setProject(name); pi.appendEntry("sekar-project", { name }); }
      ctx.ui.notify(`project: ${getProject()}`, "info");
    },
  });

  pi.registerCommand("graph", {
    description: "Render the design graph; `/graph auto on|off` sets auto-render",
    handler: async (args, ctx) => {
      const m = args?.match(/^auto\s+(on|off)$/);
      if (m) { auto = m[1] === "on"; pi.appendEntry("sekar-graph-auto", { auto }); return ctx.ui.notify(`graph auto: ${m[1]}`, "info"); }
      ctx.ui.notify(render(load()), "info");
    },
  });

  pi.on("session_start", (_, ctx) => {
    pi.setActiveTools([]);
    const project = last(ctx, "sekar-project");
    if (project) setProject(project.name);
    const graph = last(ctx, "sekar-graph-auto");
    if (graph) auto = graph.auto;
  });

  pi.on("before_agent_start", () => ({ systemPrompt: `${prompt}\n\nCurrent design.yaml:\n${stringify(load())}` }));

  pi.on("before_provider_request", (event) => {
    const body = event.payload as Record<string, unknown>;
    const output_config = { ...((body.output_config as object) ?? {}), format: { type: "json_schema", schema: buildSchema(load()) } };
    return { ...body, output_config };
  });

  pi.on("turn_end", (event: any, ctx) => {
    const text = event.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    save(apply(load(), JSON.parse(text).ops));
    if (auto) ctx.ui.notify(render(load()), "info");
  });
}