#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateSpecPages } from "./generate-spec-pages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const config = JSON.parse(
  readFileSync(join(__dirname, "spec-mapping.json"), "utf8"),
);
const committedDir = resolve(ROOT, config.outputDir);

// Generate to a temp directory
const tempDir = mkdtempSync(join(tmpdir(), "spec-freshness-"));

try {
  generateSpecPages(tempDir);

  const staleFiles = [];

  for (const file of readdirSync(tempDir)) {
    const generated = readFileSync(join(tempDir, file), "utf8");
    const committedPath = join(committedDir, file);

    let committed;
    try {
      committed = readFileSync(committedPath, "utf8");
    } catch {
      staleFiles.push(`${file} (missing from ${config.outputDir})`);
      continue;
    }

    if (generated !== committed) {
      staleFiles.push(file);
    }
  }

  if (staleFiles.length > 0) {
    console.error(
      "Spec pages are stale. Regenerate with: npm run generate:spec\n",
    );
    console.error("Stale files:");
    for (const f of staleFiles) {
      console.error(`  ${f}`);
    }
    process.exit(1);
  }

  console.log("All spec pages are up to date.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
