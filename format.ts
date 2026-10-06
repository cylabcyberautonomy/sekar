import { label, quoteText, type Design } from "./design";

const unclear = (reply: any, q: (quote: string[]) => string) => reply.unclear.map((u: any) => `unclear ${q(u.quote)}: ${u.question}`);

export const dataLines = (reply: any, d: Design, words: string[]) => {
  const q = (quote: string[]) => `"${quoteText(quote, words)}"`;
  const lines = reply.unclear
    ? unclear(reply, q)
    : reply.ops.map((op: any) =>
        op.op === "add_data" ? `added ${label(d, op.id)} from ${q(op.quote)}`
        : op.op === "update_data" ? `updated ${label(d, op.id)} from ${q(op.quote)}`
        : `marked ${label(d, op.id)} as given from ${q(op.quote)}`);
  return ["DATA", ...lines].join("\n");
};

export const moduleLines = (reply: any, d: Design, words: string[], findings: string[]) => {
  const q = (quote: string[]) => `"${quoteText(quote, words)}"`;
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

export const commentLines = (reply: any, d: Design) =>
  [
    "COMMENTS",
    ...(reply.reopen ?? []).map((id: string) => `reopened ${label(d, id)}`),
    ...reply.followups.map((f: any) => `${label(d, f.comment)}\n    follow-up: ${f.text}`),
    ...reply.comments.map((c: any) => `${label(d, c.id)}\n    regarding: [${c.regarding.join(", ")}]\n    comment: ${c.comment}`),
  ].join("\n");