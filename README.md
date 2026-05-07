# AI Research Tool (CLI)

Calls OpenAI + Claude concurrently (JSON-only), merges results via a lightweight round-table step, then prints a brief answer and source links.

## Setup

```bash
npm install
```

Set environment variables:

```bash
export OPENAI_API_KEY="..."
export ANTHROPIC_API_KEY="..."
```

Optional model selection:

```bash
export OPENAI_MODEL="gpt-5.4-mini"
export CLAUDE_MODEL="claude-sonnet-4-6"
```

Optional token budgets (increase if answers are too thin):

```bash
export OPENAI_MAX_OUTPUT_TOKENS="750"
export CLAUDE_MAX_TOKENS="800"
```

Optional synthesis pass (extra cost; can improve correctness when providers disagree):

```bash
export AIR_SYNTH="1"
```

## Run

```bash
npm run dev -- "What is speculative decoding?"
```

## Debug / Logging (raw provider outputs)

Print raw + parsed provider outputs and the merged final JSON to stderr:

```bash
npm run dev -- --debug "What is speculative decoding?"
```

Append one record per run to a JSONL file (includes raw provider JSON text, parsed JSON, and merged result):

```bash
npm run dev -- --log runs.jsonl "What is speculative decoding?"
```

Combine both:

```bash
npm run dev -- --debug --log runs.jsonl "What is speculative decoding?"
```

Build + use the installed CLI entrypoint:

```bash
npm run build
node dist/cli.js "Explain PPO vs DPO briefly"
```

