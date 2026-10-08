import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { complete, type Design } from "./design";

const markers: Record<string, string> = { ".py": "#", ".sh": "#", ".rb": "#", ".ts": "//", ".js": "//", ".go": "//", ".rs": "//", ".c": "//", ".h": "//", ".java": "//" };

export const gate = (d: Design, m: string) => {
  const mod = d.modules[m];
  return [
    ...(mod.scenarios?.some((s) => complete(d, m, s)) ? [] : ["no complete scenario (a value for every input and output)"]),
    ...(mod.pseudocode?.length ? [] : ["no pseudocode"]),
    ...(mod.file ? [] : ["no file"]),
  ];
};

export const resulting = (toolName: string, input: any) => {
  if (toolName === "write") return input.content as string;
  const current = existsSync(input.path) ? readFileSync(input.path, "utf8") : "";
  return current.replace(input.oldText, input.newText);
};

export const checkWrite = (d: Design, m: string, toolName: string, input: any): string | null => {
  const mod = d.modules[m];
  if (resolve(input.path) !== resolve(mod.file!)) return `only ${mod.file} may be written while implementing ${label(d, m)}`;
  const marker = markers[extname(mod.file!)];
  if (!marker) return `unknown comment syntax for ${mod.file}`;
  const comments = resulting(toolName, input).split("\n").map((l) => l.trim()).filter((l) => l.startsWith(marker)).map((l) => l.slice(marker.length).trim());
  const expected = mod.pseudocode!.map((l) => l.trim());
  if (comments.length === expected.length && comments.every((c, i) => c === expected[i])) return null;
  return `comments must be exactly the pseudocode, in order:\n${expected.map((l) => `${marker} ${l}`).join("\n")}\n\nfound:\n${comments.map((l) => `${marker} ${l}`).join("\n") || "(none)"}`;
};