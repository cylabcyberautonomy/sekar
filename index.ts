import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stringify } from "yaml";
import { load, save, apply, setProject, getProject } from "./design";
import { buildSchema } from "./schema";
import { prompt } from "./prompt";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("project", {
    description: "Set the active project (defaults to current directory name)",
    handler: async (name, ctx) => {
      if (name) { setProject(name); pi.appendEntry("sekar-project", { name }); }
      ctx.ui.notify(`project: ${getProject()}`, "info");
    },
  });

  pi.on("session_start", (_, ctx) => {
    pi.setActiveTools([]);
    const saved = ctx.sessionManager.getBranch().filter((e: any) => e.customType === "sekar-project").at(-1);
    if (saved) setProject(saved.data.name);
  });

  pi.on("before_agent_start", () => ({ systemPrompt: `${prompt}\n\nCurrent design.yaml:\n${stringify(load())}` }));

  pi.on("before_provider_request", (event) => {
    const body = event.payload as Record<string, unknown>;
    const output_config = { ...((body.output_config as object) ?? {}), format: { type: "json_schema", schema: buildSchema(load()) } };
    return { ...body, output_config };
  });

  pi.on("turn_end", (event: any) => {
    const text = event.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    save(apply(load(), JSON.parse(text).ops));
  });
}