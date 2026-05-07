import { compactPrompt, safeJsonParse, validateModelOutput } from "../util.js";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
};

function extractText(r: OpenAIResponse): string {
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  const chunks =
    r.output
      ?.flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" || c.type === "text") ?? [];
  const text = chunks.map((c) => c.text ?? "").join("");
  if (!text.trim()) throw new Error("OpenAI response missing output text.");
  return text;
}

export async function callOpenAI(question: string, opts?: { timeoutMs?: number }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);
  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["answer", "key_points", "sources", "missing_info", "assumptions", "confidence"],
      properties: {
        answer: { type: "string" },
        key_points: { type: "array", items: { type: "string" }, maxItems: 6 },
        sources: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "url"],
            properties: {
              title: { type: "string" },
              url: { type: "string" }
            }
          }
        },
        missing_info: { type: "array", items: { type: "string" }, maxItems: 4 },
        assumptions: { type: "array", items: { type: "string" }, maxItems: 4 },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      }
    } as const;

    const body = {
      model,
      input: compactPrompt(question),
      temperature: 0.2,
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? "750"),
      // Responses API structured output
      text: {
        format: {
          type: "json_schema",
          name: "research_answer",
          strict: true,
          schema
        }
      }
    };

    const url = "https://api.openai.com/v1/responses";
    const makeReq = () =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

    let resp: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        resp = await makeReq();
        if ([502, 503, 504, 429].includes(resp.status)) {
          const waitMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      } catch (e) {
        lastErr = e;
        const waitMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    if (!resp) throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Fetch failed")));

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${resp.status}: ${errText.slice(0, 600)}`);
    }

    const json = (await resp.json()) as OpenAIResponse;
    const text = extractText(json);
    const parsed = safeJsonParse(text);
    return { model, rawText: text, parsed: validateModelOutput(parsed) };
  } finally {
    clearTimeout(t);
  }
}

/*
  Previous request shape used `text.format.json_schema`.
  Current Responses API expects `text.format.name` at top level.
*/

