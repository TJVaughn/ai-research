import { z } from "zod";

function normalizeConfidence(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 0.5;
  // If a model returns 0..100, interpret as percent.
  const scaled = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}

export const ModelOutputSchema = z.object({
  answer: z.string().min(1),
  key_points: z.array(z.string().min(1)).max(6).default([]),
  sources: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url()
      })
    )
    .max(8)
    .default([]),
  missing_info: z.array(z.string().min(1)).max(4).default([]),
  assumptions: z.array(z.string().min(1)).max(4).default([]),
  confidence: z.preprocess(normalizeConfidence, z.number().min(0).max(1))
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export const ResearchResultSchema = z.object({
  question: z.string(),
  merged: ModelOutputSchema,
  providers: z.object({
    openai: ModelOutputSchema.optional(),
    claude: ModelOutputSchema.optional()
  })
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;
