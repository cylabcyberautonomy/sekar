import { label, quoteText, type Design } from "./design";

const unclear = (reply: any, q: (quote: string[]) => string) => reply.unclear.map((u: any) => `unclear ${q(u.quote)}: ${u.question}`);
const quoter = (words: string[]) => (quote: string[]) => `"${quoteText(quote, words)}"`;

const where = (d: Design, m: string | null) => (m ? `in ${label(d, m)}` : "external");

export const dataLines = (reply: any, d: Design, words: string[]) => {
  const q = quoter(words);
  const verb: Record<string, string> = { add_data: "added", update_data: "updated" };
  const lines = reply.unclear
    ? unclear(reply, q)
    : reply.ops.map((op: any) =>
        op.op === "delete_data"
          ? `deleted ${op.label} from ${q(op.quote)}`
          : `${verb[op.op]} ${label(d, op.id)}${op.op === "add_data" ? ` ${where(d, d.data[op.id].scoped_to)}` : ""} from ${q(op.quote)}`);
  return ["DATA", ...lines].join("\n");
};

export const moduleLines = (reply: any, d: Design, words: string[], findings: string[]) => {
  const q = quoter(words);
  const ports = (ids: string[]) => ids.map((id) => label(d, id)).join(", ");
  const lines = reply.unclear
    ? unclear(reply, q)
    : reply.ops.flatMap((op: any) =>
        op.op === "delete_module"
          ? [`deleted ${op.label} from ${q(op.quote)}`, ...(op.removed.length ? [`    with: ${op.removed.join(", ")}`] : [])]
          : [
              `${op.op === "add_module" ? `added ${label(d, op.id)} ${where(d, d.modules[op.id].parent)}` : `updated ${label(d, op.id)}`} from ${q(op.quote)}`,
              ...(op.inputs ? [`    inputs: ${ports(op.inputs)}`] : []),
              ...(op.outputs ? [`    outputs: ${ports(op.outputs)}`] : []),
            ]);
  return ["MODULES", ...lines, ...findings].join("\n");
};

export const focusedLines = (reply: any, d: Design, m: string, words: string[], findings: string[]) => {
  const q = quoter(words);
  const lines = reply.unclear
    ? unclear(reply, q)
    : reply.ops.flatMap((op: any) =>
        op.op === "set_pseudocode" ? [`set pseudocode from ${q(op.quote)}`, ...op.lines.map((l: string) => `    ${l}`)]
        : op.op === "set_file" ? [`set file ${op.path} from ${q(op.quote)}`]
        : op.op === "add_scenario" || op.op === "update_scenario"
          ? [`${op.op === "add_scenario" ? "added scenario" : `updated scenario ${op.index}`} from ${q(op.quote)}`, ...Object.entries(op.values).map(([id, v]) => `    ${label(d, id)} = ${v}`)]
        : [`updated description from ${q(op.quote)}`]);
  return [`FOCUSED ${label(d, m)}`, ...lines, ...findings].join("\n");
};

export const commentLines = (reply: any, d: Design) =>
  [
    "COMMENTS",
    ...(reply.reopen ?? []).map((id: string) => `reopened ${label(d, id)}`),
    ...reply.followups.map((f: any) => `${label(d, f.comment)}\n    follow-up: ${f.text}`),
    ...reply.comments.map((c: any) => `${label(d, c.id)}\n    regarding: [${c.regarding.join(", ")}]\n    comment: ${c.comment}`),
  ].join("\n");