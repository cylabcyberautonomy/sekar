import { label, quoteText, type Design } from "./design";

const unclear = (reply: any, q: (quote: string[]) => string) => reply.unclear.map((u: any) => `unclear ${q(u.quote)}: ${u.question}`);
const quoter = (words: string[]) => (quote: string[]) => `"${quoteText(quote, words)}"`;

export const dataLines = (reply: any, d: Design, words: string[]) => {
  const q = quoter(words);
  const verb: Record<string, string> = { add_data: "added", update_data: "updated", set_data_as_given: "marked given", set_example: "set example on" };
  const lines = reply.unclear ? unclear(reply, q) : reply.ops.map((op: any) => `${verb[op.op]} ${label(d, op.id)} from ${q(op.quote)}`);
  return ["DATA", ...lines].join("\n");
};

export const moduleLines = (reply: any, d: Design, words: string[], findings: string[]) => {
  const q = quoter(words);
  const ports = (ids: string[]) => ids.map((id) => label(d, id)).join(", ");
  const lines = reply.unclear
    ? unclear(reply, q)
    : reply.ops.flatMap((op: any) => [
        `${op.op === "add_module" ? "added" : "updated"} ${label(d, op.id)} from ${q(op.quote)}`,
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