import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCS_DIR = "docs";

export function getConfig() {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    const envPath = resolve(import.meta.dir, "..", ".env.local");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("CONVEX_URL=")) {
          return { convexUrl: trimmed.slice("CONVEX_URL=".length) };
        }
      }
    }
    throw new Error("CONVEX_URL not set. Set it as env var or in .env.local");
  }
  return { convexUrl };
}

export function isFullRun(): boolean {
  return process.argv.includes("--full");
}

export function getDocsDir(): string {
  return resolve(import.meta.dir, "..", DOCS_DIR);
}
