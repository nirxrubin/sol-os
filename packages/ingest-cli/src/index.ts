#!/usr/bin/env tsx
/**
 * pnpm ingest <zip-path>
 *
 * End-to-end Phase 0 + Phase 1 pipeline:
 *   1. Extract ZIP, detect archetype + generator
 *   2. Build the project (npm install + npm run build)
 *   3. Parse build output → IngestionResult
 *   4. Run extract-tokens skill (parallel)
 *   5. Run collection-parser agent (parallel)
 *   6. Write SiteIntelligenceReport.json
 *
 * Reports back to stdout. Designed to be tested on real Lovable / v0 / bolt
 * demo ZIPs.
 */

import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from repo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

import { ingestFromZip } from "@hostaposta/ingest";
import { extractTokens } from "@hostaposta/tokens";
import { parseCollections } from "@hostaposta/collection-parser";
import { captureCase, selectFewShotCases, formatFewShotPrompt } from "@hostaposta/eval";

interface ReportShape {
  generatedAt: string;
  source: { kind: string; origin: string };
  ingestion: {
    archetype: string;
    archetypeConfidence: number;
    generator: string;
    generatorConfidence: number;
    build: {
      attempted: boolean;
      success: boolean;
      durationMs?: number;
      error?: string;
    };
    metrics: {
      pagesCount: number;
      assetsCount: number;
      htmlBytes: number;
      cssBytes: number;
    };
    routes: { patterns: string[] };
    warnings: string[];
  };
  tokens: unknown;
  collections: unknown;
  diagnostics: {
    totalDurationMs: number;
    stages: Record<string, number>;
  };
}

async function main(): Promise<void> {
  // Filter the "--" separator pnpm/npm pass through
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0) {
    console.error("usage: pnpm ingest <zip-path> [--out <report.json>] [--workspace <dir>] [--skip-ai]");
    process.exit(1);
  }

  const zipPath = path.resolve(args[0]!);
  const outFlag = args.indexOf("--out");
  const workspaceFlag = args.indexOf("--workspace");
  const skipAi = args.includes("--skip-ai");

  const outPath = outFlag >= 0
    ? path.resolve(args[outFlag + 1]!)
    : path.join(repoRoot, ".ingest-out", `${path.basename(zipPath, ".zip")}-report.json`);
  const workspaceDir = workspaceFlag >= 0
    ? path.resolve(args[workspaceFlag + 1]!)
    : path.join(repoRoot, ".workspace", path.basename(zipPath, ".zip"));

  // Verify ZIP exists
  try {
    await fs.access(zipPath);
  } catch {
    console.error(`ZIP not found: ${zipPath}`);
    process.exit(1);
  }

  // Clean workspace
  await fs.rm(workspaceDir, { recursive: true, force: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const totalStart = Date.now();
  const stages: Record<string, number> = {};

  console.log(`\n[hp-ingest] zip: ${zipPath}`);
  console.log(`[hp-ingest] workspace: ${workspaceDir}`);
  console.log(`[hp-ingest] out: ${outPath}`);
  console.log(`[hp-ingest] ai: ${skipAi ? "SKIPPED" : "enabled"}\n`);

  // Stage 1: ingestion
  const ingestStart = Date.now();
  const ingest = await ingestFromZip(zipPath, { workspaceDir });
  stages.ingest = Date.now() - ingestStart;

  console.log(`\n[hp-ingest] ingestion: ${stages.ingest}ms`);
  console.log(`  archetype: ${ingest.archetype} (${(ingest.archetypeConfidence * 100).toFixed(0)}%)`);
  console.log(`  generator: ${ingest.generator}`);
  console.log(`  build:    ${ingest.build.success ? "ok" : "FAILED"}${ingest.build.error ? " — " + ingest.build.error.slice(0, 200) : ""}`);
  console.log(`  pages:    ${ingest.metrics.pagesCount}`);
  console.log(`  assets:   ${ingest.metrics.assetsCount}`);
  console.log(`  patterns: ${ingest.routes.patterns.join(", ") || "(none)"}`);

  // Stages 2 + 3: tokens + collections (parallel)
  let tokens: unknown = null;
  let collections: unknown = null;

  const evalDir = path.join(repoRoot, ".eval");
  let detectorRetried = false;

  if (skipAi) {
    console.log("\n[hp-ingest] skipping AI stages (--skip-ai)");
  } else if (!ingest.build.success) {
    console.log("\n[hp-ingest] build failed — skipping AI stages");
  } else {
    // Pull few-shot examples from the eval corpus before detection runs.
    const fewShot = await selectFewShotCases({ evalDir, target: ingest, limit: 2 });
    const fewShotBlock = formatFewShotPrompt(fewShot);
    if (fewShot.length > 0) {
      console.log(`\n[hp-ingest] few-shot: ${fewShot.length} prior cases (${fewShot.map((c) => c.reason).join(" | ")})`);
    } else {
      console.log("\n[hp-ingest] few-shot: no matching prior cases (first of its kind)");
    }

    console.log("[hp-ingest] running tokens + collections in parallel…");
    const aiStart = Date.now();
    const [tokensResult, collectionsResult] = await Promise.all([
      extractTokens(ingest).catch((err) => ({ error: (err as Error).message })),
      parseCollections(ingest, {
        fewShotBlock,
        onDetectorRetry: () => { detectorRetried = true; },
      }).catch((err) => ({ error: (err as Error).message })),
    ]);
    stages.ai = Date.now() - aiStart;
    tokens = tokensResult;
    collections = collectionsResult;

    console.log(`[hp-ingest] ai stages: ${stages.ai}ms`);
    if (tokens && typeof tokens === "object" && "confidence" in tokens) {
      const conf = (tokens as { confidence: { overall: number } }).confidence.overall;
      console.log(`  tokens overall confidence: ${(conf * 100).toFixed(0)}%`);
    }
    if (collections && typeof collections === "object" && "metrics" in collections) {
      const m = (collections as { metrics: ReportShape["ingestion"]["metrics"] & { totalEntriesExtracted: number; averageConfidence: number } }).metrics;
      console.log(`  collections: ${m.totalEntriesExtracted} entries (avg conf ${(m.averageConfidence * 100).toFixed(0)}%)`);
    }
  }

  const report: ReportShape = {
    generatedAt: new Date().toISOString(),
    source: ingest.source,
    ingestion: {
      archetype: ingest.archetype,
      archetypeConfidence: ingest.archetypeConfidence,
      generator: ingest.generator,
      generatorConfidence: ingest.generatorConfidence,
      build: {
        attempted: ingest.build.attempted,
        success: ingest.build.success,
        durationMs: ingest.build.durationMs,
        error: ingest.build.error,
      },
      metrics: ingest.metrics,
      routes: { patterns: ingest.routes.patterns },
      warnings: ingest.warnings,
    },
    tokens,
    collections,
    diagnostics: {
      totalDurationMs: Date.now() - totalStart,
      stages,
    },
  };

  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[hp-ingest] report written → ${outPath}`);

  // Capture the case into the eval corpus for future few-shot and learning.
  if (!skipAi && ingest.build.success && collections && typeof collections === "object" && "detectedCollections" in collections) {
    try {
      const snapshot = await captureCase({
        evalDir,
        ingestion: ingest,
        collections: collections as import("@hostaposta/collection-parser").CollectionExtractionResult,
        detectorRetried,
      });
      console.log(`[hp-ingest] eval case captured → ${snapshot.caseId} (quality ${(snapshot.quality.score * 100).toFixed(0)}%)`);
    } catch (err) {
      console.log(`[hp-ingest] eval capture failed: ${(err as Error).message}`);
    }
  }

  console.log(`[hp-ingest] total: ${report.diagnostics.totalDurationMs}ms\n`);
}

main().catch((err) => {
  console.error("\n[hp-ingest] fatal:", err);
  process.exit(1);
});
