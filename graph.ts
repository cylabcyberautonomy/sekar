import { execFileSync } from "child_process";
import type { Design } from "./design";

export const toEasy = (d: Design) => {
  const lines = ["graph { flow: east; }"];
  for (const name of Object.keys(d.data)) lines.push(`[ ${name} ] { shape: none; }`);
  for (const [name, m] of Object.entries(d.modules)) {
    m.inputs.forEach((i) => lines.push(`[ ${i} ] -> [ ${name} ]`));
    m.outputs.forEach((o) => lines.push(`[ ${name} ] -> [ ${o} ]`));
  }
  return lines.join("\n");
};

export const render = (d: Design) => execFileSync("graph-easy", ["--as_boxart"], { input: toEasy(d), encoding: "utf8" });