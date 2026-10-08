// Deterministic style check for the critic's questions, run after the critic call. Any violation sends the critic
// back once or twice with the exact problems and the rules below; the grammar cannot bound string length or count.
// The structural rules follow ASD-STE100 (one sentence, short, active, simple tenses, no phrasal verbs, no
// semicolons); the rest is stricter than STE because the goal is brevity, not only clarity.

export const MAX_QUESTIONS = 3;
export const MAX_WORDS = 15;
export const MAX_TITLE_WORDS = 4;

export const STYLE_RULES = `Question style, checked by code after every critic reply:
- At most ${MAX_QUESTIONS} questions per turn, follow-ups and new comments together. Choose the most pertinent; drop the rest.
- Each question is one sentence of at most ${MAX_WORDS} words and ends with a question mark.
- Start with the question itself. No preamble, no restatement of the answer, no praise, no "please".
- Active voice, simple present or past, one plain verb per action. No phrasal verbs (set up, figure out, carry out). No semicolons.
- Name the element by its ID or name. Say what is missing or wrong, as a question.
- Titles: ${MAX_TITLE_WORDS} words or fewer.
Example: "[D3] Which file format does the spec use?" Not: "This answers the original question, so what remains is whether the spec format is the one you intended?"`;

const BANNED = [
  "this answers", "this addresses", "this resolves", "that answers", "what remains", "now that", "given that", "note that",
  "it is worth", "it seems", "it appears", "i see", "i notice", "i wonder", "i assume", "as you", "as stated", "as mentioned",
  "as noted", "your intent", "intended", "please", "could you", "would you", "can you", "clarify", "elaborate", "perhaps", "maybe", "potentially",
];
const PHRASAL = ["set up", "spin up", "reach out", "dive into", "kick off", "figure out", "come up with", "deal with", "end up", "take into account", "carry out", "look into", "point out", "make sure", "sort out", "work out"];
const NOMINAL = /\b(perform|make|do|conduct|provide|carry out)\s+(a|an|the)\s+(analysis|decision|assessment|evaluation|validation|verification|check|assistance|review|comparison|implementation|determination)\b/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.replace(/\?+$/, "?").split(/(?<=[.?!])\s+/).filter((x) => x.trim()).length;

export const checkQuestion = (q: string): string[] => {
  const out: string[] = [];
  const t = q.trim();
  const lower = t.toLowerCase();
  if (!t.endsWith("?")) out.push("does not end with a question mark");
  if (sentences(t) > 1) out.push(`${sentences(t)} sentences; one only`);
  if (words(t) > MAX_WORDS) out.push(`${words(t)} words; cap ${MAX_WORDS}`);
  if (/;/.test(t)) out.push("semicolon");
  if (/—|--/.test(t)) out.push("dash joining clauses");
  for (const b of BANNED) if (new RegExp(`(^|\\W)${b.replace(/ /g, "\\s+")}(\\W|$)`).test(lower)) out.push(`contains "${b}"`);
  for (const p of PHRASAL) if (new RegExp(`\\b${p.replace(/ /g, "\\s+")}\\b`).test(lower)) out.push(`phrasal verb "${p}"`);
  const n = NOMINAL.exec(t);
  if (n) out.push(`nominalization "${n[0]}"; use the verb`);
  return out;
};

// Problems in a critic reply: `{comments: [{title, regarding, comment}], followups: [{comment, text}]}`.
export const checkReply = (reply: any): string[] => {
  const comments = reply.comments ?? [], followups = reply.followups ?? [];
  const out: string[] = [];
  const total = comments.length + followups.length;
  if (total > MAX_QUESTIONS) out.push(`${total} questions; keep the ${MAX_QUESTIONS} most pertinent`);
  followups.forEach((f: any, i: number) => checkQuestion(f.text).forEach((p) => out.push(`follow-up ${i + 1} on ${f.comment}: ${p} — "${f.text}"`)));
  comments.forEach((c: any, i: number) => {
    if (words(c.title) > MAX_TITLE_WORDS) out.push(`comment ${i + 1} title: ${words(c.title)} words; cap ${MAX_TITLE_WORDS} — "${c.title}"`);
    checkQuestion(c.comment).forEach((p) => out.push(`comment ${i + 1} (${c.title}): ${p} — "${c.comment}"`));
  });
  return out;
};
