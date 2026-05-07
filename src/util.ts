import { ModelOutputSchema, type ModelOutput } from "./schema.js";
import { jsonrepair } from "jsonrepair";

export function compactPrompt(question: string) {
  return (
    "Answer the user's question accurately and concretely. " +
    "If the question is underspecified, say so in missing_info and proceed with minimal assumptions. " +
    "Do not invent facts; if unsure, say so. " +
    "Prefer official documentation URLs for sources; omit any source you cannot confidently URL-cite. " +
    "Keep the answer concise but correct."
  ).trim() + "\n\nUser question: " + question.trim();
}

export function safeJsonParse(input: string): unknown {
  // Best-effort: allow models that accidentally wrap JSON in extra text.
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return JSON.parse(jsonrepair(trimmed));
    }
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return JSON.parse(jsonrepair(slice));
    }
  }
  throw new Error("No JSON object found in output.");
}

export function validateModelOutput(raw: unknown): ModelOutput {
  return ModelOutputSchema.parse(raw);
}

function uniqBy<T>(arr: T[], key: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = key(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function mergeRoundTable(a?: ModelOutput, b?: ModelOutput): ModelOutput {
  const base: ModelOutput = {
    answer: "",
    key_points: [],
    sources: [],
    missing_info: [],
    assumptions: [],
    confidence: 0
  };

  const candidates = [a, b].filter(Boolean) as ModelOutput[];
  if (candidates.length === 0) return base;

  const best = candidates
    .slice()
    .sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0))[0]!;

  const sources = uniqBy(
    candidates.flatMap((c) => c.sources ?? []),
    (s) => s.url
  ).slice(0, 8);

  const key_points = uniqBy(
    candidates.flatMap((c) => c.key_points ?? []),
    (p) => p.toLowerCase()
  ).slice(0, 6);

  const missing_info = uniqBy(
    candidates.flatMap((c) => c.missing_info ?? []),
    (p) => p.toLowerCase()
  ).slice(0, 4);

  const assumptions = uniqBy(
    candidates.flatMap((c) => c.assumptions ?? []),
    (p) => p.toLowerCase()
  ).slice(0, 4);

  // Prefer the higher-confidence answer; if tie, prefer shorter.
  const bestAnswer = candidates
    .slice()
    .sort((x, y) => {
      const dc = (y.confidence ?? 0) - (x.confidence ?? 0);
      if (dc !== 0) return dc;
      return (x.answer?.length ?? 0) - (y.answer?.length ?? 0);
    })[0]!.answer;

  const mergedRaw = {
    ...best,
    answer: bestAnswer,
    key_points,
    sources,
    missing_info,
    assumptions,
    confidence: Math.max(...candidates.map((c) => c.confidence ?? 0))
  };

  // Enforce schema defaults/limits.
  return validateModelOutput(mergedRaw);
}
