import { callClaude } from "./providers/claude.js";
import { callOpenAI } from "./providers/openai.js";
import { mergeRoundTable } from "./util.js";
import type { ResearchResult } from "./schema.js";
import type { ModelOutput } from "./schema.js";

type ProviderResult = { model: string; rawText: string; parsed: ModelOutput };
type ProviderTrace = {
  ok: boolean;
  model?: string;
  parsed?: ModelOutput;
  rawText?: string;
  error?: string;
};

function maybeSynthesize(): boolean {
  const v = (process.env.AIR_SYNTH ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function synthesizeWithOpenAI(question: string, a?: ModelOutput, b?: ModelOutput) {
  // Minimal, token-cheap reconciliation: feed compact JSON, get same schema back.
  const { callOpenAI } = await import("./providers/openai.js");
  const prompt =
    question +
    "\n\nTwo candidate JSON answers:\n" +
    JSON.stringify({ openai: a ?? null, claude: b ?? null }) +
    "\n\nProduce the best single JSON answer, correcting any invalid claims and keeping it concise.";
  const res = await callOpenAI(prompt);
  return res.parsed;
}

export async function runResearch(
  question: string
): Promise<
  ResearchResult & {
    traces: { openai: ProviderTrace; claude: ProviderTrace };
  }
> {
  const [openaiRes, claudeRes] = await Promise.allSettled([
    callOpenAI(question),
    callClaude(question)
  ]);

  const openai: ProviderResult | undefined =
    openaiRes.status === "fulfilled" ? (openaiRes.value as ProviderResult) : undefined;
  const claude: ProviderResult | undefined =
    claudeRes.status === "fulfilled" ? (claudeRes.value as ProviderResult) : undefined;

  if (!openai && !claude) {
    const reasons = [openaiRes, claudeRes]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    throw new Error(
      ["Both providers failed.", ...reasons.map((m) => `- ${m}`)].join("\n")
    );
  }

  const openaiParsed = openai?.parsed;
  const claudeParsed = claude?.parsed;

  let merged = mergeRoundTable(openaiParsed, claudeParsed);

  if (maybeSynthesize() && openaiParsed && claudeParsed) {
    // Only pay for synthesis when explicitly enabled.
    merged = await synthesizeWithOpenAI(question, openaiParsed, claudeParsed).catch(() => merged);
  }

  const openaiTrace: ProviderTrace =
    openaiRes.status === "fulfilled"
      ? {
          ok: true,
          model: openaiRes.value.model,
          parsed: openaiParsed,
          rawText: openaiRes.value.rawText
        }
      : { ok: false, error: openaiRes.reason instanceof Error ? openaiRes.reason.message : String(openaiRes.reason) };
  const claudeTrace: ProviderTrace =
    claudeRes.status === "fulfilled"
      ? {
          ok: true,
          model: claudeRes.value.model,
          parsed: claudeParsed,
          rawText: claudeRes.value.rawText
        }
      : { ok: false, error: claudeRes.reason instanceof Error ? claudeRes.reason.message : String(claudeRes.reason) };

  return {
    question,
    merged,
    providers: {
      openai: openaiParsed,
      claude: claudeParsed
    },
    traces: {
      openai: openaiTrace,
      claude: claudeTrace
    }
  };
}

