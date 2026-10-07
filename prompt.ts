import { stringify } from "yaml";
import { label, scope, type Design } from "./design";

const base = `You work on a system design with two namespaces: data (things that flow) and modules (things that transform data; inputs and outputs are data). Every element has an ID (D1, M1) and a human-readable name. Comments (C1) record open problems; each has a title, the elements it regards, a status, and a history of critic remarks and human answers.

Transcription rules: record only what the human stated. Every op carries a quote: the positions of the words in the human's message it is based on (word positions are listed below). If the message is ambiguous or incomplete, transcribe nothing; return only "unclear" with quotes and the questions that would resolve them.

Critic rules: poke holes. Follow-ups on open comments come first and usually challenge the human's latest answer. New comments get a title of two to four words, the IDs they regard, and the problem stated as a question the human must answer. You may reopen resolved comments whose concern has returned. Do not propose, fix, or complete anything. You never resolve comments; the human does.`;

const global = `Mode: unfocused design over the whole system. Each human message is processed in three phases, announced in the latest message: data (add/update data, mark given, set example), modules (add/update modules; inputs and outputs are data IDs), critic. Data is never given by default; mark it given only when the human stated it comes from outside the system. An example is one concrete value of the data.`;

const focused = (d: Design, m: string) => `Mode: focused design on ${label(d, m)}. Its inputs and outputs are frozen; data cannot be changed here. Two phases: scribe (set pseudocode as a list of lines, set the file path, update the description; all ops apply to ${m}) and critic (restricted to ${scope(d, m).join(", ")}). Pseudocode describes the module's operation at the level of an academic paper; its lines will become the only comments in the implementation.`;

const implement = (d: Design, m: string) => {
  const mod = d.modules[m];
  const data = (ids: string[]) => ids.map((id) => `  ${label(d, id)}: ${d.data[id].description ?? ""}\n    example: ${d.data[id].example}`).join("\n");
  return `Mode: implementation of ${label(d, m)} in ${mod.file}. Only that file may be written. Its comments must be exactly these pseudocode lines, in order, and nothing else:\n${mod.pseudocode!.map((l) => `  ${l}`).join("\n")}\n\nInputs:\n${data(mod.inputs)}\nOutputs:\n${data(mod.outputs)}\n\nDescription: ${mod.description ?? ""}`;
};

export const systemPrompt = (d: Design, mode: string, focus: string | null, pool: string[]) =>
  [
    base,
    mode === "global" ? global : mode === "focused" ? focused(d, focus!) : implement(d, focus!),
    `Current design.yaml:\n${stringify(d)}`,
    ...(mode === "implement" ? [] : [`Word positions:\n${pool.map((w, i) => `${i}:${w}`).join(" ")}`]),
  ].join("\n\n");