import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function appendJsonl(path: string, record: unknown) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true }).catch(() => {});
  const line = JSON.stringify(record) + "\n";
  await appendFile(path, line, { encoding: "utf8" });
}

