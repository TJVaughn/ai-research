#!/usr/bin/env node
import { runResearch } from "./research.js";
import { appendJsonl } from "./log.js";

function usage() {
  console.log(
    [
      "air [--debug] [--log <path>] <question>",
      "",
      "Env:",
      "  OPENAI_API_KEY, ANTHROPIC_API_KEY",
      "  (optional) OPENAI_MODEL, CLAUDE_MODEL",
      "  (optional) OPENAI_MAX_OUTPUT_TOKENS, CLAUDE_MAX_TOKENS",
      "  (optional) AIR_SYNTH=1 (enable extra synthesis pass)",
      "",
      "Examples:",
      '  air "How do I run Postgres in Docker?"'
    ].join("\n")
  );
}

function formatSources(sources: Array<{ title: string; url: string }>) {
  if (!sources.length) return "Sources: (none provided)\n";
  return ["Sources:"]
    .concat(sources.map((s) => `- ${s.title} — ${s.url}`))
    .join("\n")
    .trimEnd()
    .concat("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }
  const debug = args.includes("--debug");
  const logIdx = args.indexOf("--log");
  const logPath = logIdx !== -1 ? args[logIdx + 1] : undefined;
  const question = args
    .filter((a, i) => a !== "--debug" && i !== logIdx && i !== logIdx + 1)
    .join(" ")
    .trim();
  if (!question) {
    usage();
    process.exitCode = 2;
    return;
  }

  const result = await runResearch(question);
  if (logPath) {
    await appendJsonl(logPath, {
      ts: new Date().toISOString(),
      question,
      providers: result.providers,
      traces: result.traces,
      merged: result.merged
    });
  }
  if (debug) {
    console.error(
      JSON.stringify(
        {
          question,
          providers: result.providers,
          traces: result.traces,
          merged: result.merged
        },
        null,
        2
      )
    );
  }
  const m = result.merged;

  const answer = m.answer.trim();
  if (!answer) {
    throw new Error("No answer returned. Check API keys and provider status.");
  }
  console.log(answer);
  if (m.key_points?.length) {
    console.log("\nKey points:");
    for (const p of m.key_points) console.log(`- ${p}`);
  }
  console.log("");
  process.stdout.write(formatSources(m.sources ?? []));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

