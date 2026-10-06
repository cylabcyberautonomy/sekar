import { execFileSync } from "child_process";
import type { Design } from "./design";

export const toEasy = (d: Design) => {
  const name = (id: string) => d.data[id]?.name ?? d.modules[id].name;
  const lines = ["graph { flow: east; }", ...Object.values(d.data).map((x) => `[ ${x.name} ] { shape: none; }`)];
  for (const [id, m] of Object.entries(d.modules)) {
    m.inputs.forEach((i) => lines.push(`[ ${name(i)} ] -> [ ${name(id)} ]`));
    m.outputs.forEach((o) => lines.push(`[ ${name(id)} ] -> [ ${name(o)} ]`));
  }
  return lines.join("\n");
};

export const render = (d: Design) => execFileSync("graph-easy", ["--as_boxart"], { input: toEasy(d), encoding: "utf8" });