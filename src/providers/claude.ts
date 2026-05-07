import { compactPrompt, safeJsonParse, validateModelOutput } from "../util.js";

type ClaudeMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

function extractText(r: ClaudeMessageResponse): string {
  const text =
    r.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("") ?? "";
  if (!text.trim()) throw new Error("Claude response missing text content.");
  return text;
}

export async function callClaude(question: string, opts?: { timeoutMs?: number }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);
  try {
    const schemaHint = {
      answer: "string",
      key_points: ["string"],
      sources: [{ title: "string", url: "https://..." }],
      missing_info: ["string"],
      assumptions: ["string"],
      confidence: 0.0
    };

    const model = process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-20241022";
    const body = {
      // Default to a pinned, commonly-available model; override via CLAUDE_MODEL.
      model,
      max_tokens: Number(process.env.CLAUDE_MAX_TOKENS ?? "800"),
      temperature: 0.2,
      system:
        "Return ONLY valid JSON (no markdown, no extra text). " +
        "Match this shape exactly, omit uncertain source URLs. " +
        `Shape example: ${JSON.stringify(schemaHint)}`,
      messages: [{ role: "user", content: compactPrompt(question) }]
    };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Anthropic HTTP ${resp.status}: ${errText.slice(0, 600)}`);
    }

    const json = (await resp.json()) as ClaudeMessageResponse;
    const text = extractText(json);
    const parsed = safeJsonParse(text);
    return { model, rawText: text, parsed: validateModelOutput(parsed) };
  } finally {
    clearTimeout(t);
  }
}

