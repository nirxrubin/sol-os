#!/usr/bin/env tsx
/**
 * pnpm generate <caseId> [--name <slug>] [--deterministic]
 *
 * Load an eval case snapshot + its full IngestionResult sidecar + the
 * matching ingest report → fork the site-starter template into
 * `.tenants/<slug>/` with:
 *   - tokens.css from the extracted TokenSet
 *   - assets copied from the source build output to /public
 *   - tenant-data.ts composed by the Block Generator (Claude, per page)
 *   - package.json renamed for isolation
 *
 * After generation: `cd .tenants/<slug> && pnpm install --ignore-workspace && pnpm dev`
 */

import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

import { generate } from "@hostaposta/generate";
import type { IngestionResult } from "@hostaposta/ingest";
import type { TokenSet } from "@hostaposta/tokens";
import type { CollectionExtractionResult } from "@hostaposta/collection-parser";

const EVAL_DIR = path.join(repoRoot, ".eval");
const REPORT_DIR = path.join(repoRoot, ".ingest-out");
const TEMPLATE_DIR = path.join(repoRoot, "templates/site-starter");
const TENANTS_DIR = path.join(repoRoot, ".tenants");

interface ReportShape {
  source: { kind: string; origin: string };
  tokens: unknown;
  collections: unknown;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0) {
    console.error(
      "usage: pnpm generate <caseId> [--name <slug>] [--mode fossilize|pixel-rewrite] [--force-recarve] [--no-carve] [--no-vision]\n\n" +
      "  --mode            fossilize (default) — copy source verbatim + carve editable points\n" +
      "                    pixel-rewrite      — Claude re-authors as Astro components\n" +
      "  --force-recarve   Re-run the carve step even if .hostaposta/carve-map.json exists\n" +
      "  --no-carve        Skip carve entirely (fossilize without editability layer)\n" +
      "  --no-vision       For pixel-rewrite only. Skip screenshot input.\n\n" +
      "List caseIds: pnpm eval list",
    );
    process.exit(1);
  }

  const caseId = args[0]!;
  const nameFlagIdx = args.indexOf("--name");
  const customSlug = nameFlagIdx >= 0 ? args[nameFlagIdx + 1] : undefined;
  const modeFlagIdx = args.indexOf("--mode");
  const modeArg = modeFlagIdx >= 0 ? args[modeFlagIdx + 1] : "fossilize";
  if (modeArg !== "fossilize" && modeArg !== "pixel-rewrite") {
    console.error(`[generate] invalid --mode: ${modeArg} (expected fossilize or pixel-rewrite)`);
    process.exit(1);
    return;
  }
  const mode = modeArg;
  const useVision = !args.includes("--no-vision");
  const forceRecarve = args.includes("--force-recarve");
  const runCarve = !args.includes("--no-carve");

  // 1. Load eval case snapshot (metadata + collection output)
  const caseDir = path.join(EVAL_DIR, "cases", caseId);
  const snapshotPath = path.join(caseDir, "snapshot.json");
  let snapshot: {
    caseId: string;
    source: { kind: IngestionResult["source"]["kind"]; origin: string };
    detection: { output: CollectionExtractionResult };
  };
  try {
    snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8"));
  } catch {
    console.error(`[generate] case not found: ${caseId}\n  looked at: ${snapshotPath}`);
    process.exit(1);
    return;
  }

  // 2. Load the full ingestion sidecar — the snapshot only has 3KB HTML
  //    snippets; Block Generator needs full page HTML to match the layout.
  const ingestionSidecarPath = path.join(caseDir, "ingestion.json");
  let ingestion: IngestionResult;
  try {
    ingestion = JSON.parse(await fs.readFile(ingestionSidecarPath, "utf-8"));
  } catch {
    console.error(`[generate] ingestion sidecar not found: ${ingestionSidecarPath}`);
    console.error(`  this case was captured before the sidecar was added. re-ingest with:`);
    console.error(`    pnpm ingest <path-to-zip>`);
    process.exit(1);
    return;
  }

  // 3. Tokens live in the report (not the snapshot)
  const reportPath = path.join(
    REPORT_DIR,
    snapshot.source.origin.replace(/\.zip$/i, "") + "-report.json",
  );
  let report: ReportShape;
  try {
    report = JSON.parse(await fs.readFile(reportPath, "utf-8")) as ReportShape;
  } catch {
    console.error(`[generate] ingest report not found: ${reportPath}\n  re-ingest with: pnpm ingest <zip>`);
    process.exit(1);
    return;
  }
  const tokens = report.tokens as TokenSet | null;
  if (!tokens?.colors) {
    console.error("[generate] report has no valid tokens field — aborting");
    process.exit(1);
    return;
  }

  // 4. Slug + tenant dir
  const slug = customSlug ?? caseIdToSlug(caseId, snapshot.source.origin);
  const tenantDir = path.join(TENANTS_DIR, slug);

  console.log(`\n[hp-generate] case: ${caseId}`);
  console.log(`[hp-generate] tenant: ${tenantDir}`);
  console.log(`[hp-generate] mode: ${mode}${mode === "pixel-rewrite" ? ` (vision ${useVision ? "on" : "off"})` : ""}\n`);

  // 5. Generate!
  const result = await generate({
    templateDir: TEMPLATE_DIR,
    tenantDir,
    ingestion,
    tokens,
    collections: snapshot.detection.output,
    mode,
    useVision,
    runCarve,
    forceRecarve,
  });

  console.log(`\n[hp-generate] DONE (${result.mode})`);
  console.log(`  pages:        ${result.pagesCount}`);
  if (result.filesWritten !== undefined) console.log(`  files:        ${result.filesWritten}`);
  if (result.blockInstancesCount !== undefined) console.log(`  blocks:       ${result.blockInstancesCount}`);
  if (result.editsCarved !== undefined) {
    console.log(`  edits carved: ${result.editsCarved} (applied: ${result.editsApplied ?? 0})`);
  }
  if (result.componentsWritten) {
    const list = result.componentsWritten.slice(0, 5).join(", ") + (result.componentsWritten.length > 5 ? "…" : "");
    console.log(`  components:   ${result.componentsWritten.length} (${list})`);
  }
  console.log(`  assets:       ${result.assetsCopied} copied`);
  console.log(
    `  collections:  blog=${result.collectionsCount.blog} testimonial=${result.collectionsCount.testimonial} team=${result.collectionsCount.team} service=${result.collectionsCount.service}`,
  );
  console.log(`\nTo preview:`);
  console.log(`  cd ${path.relative(repoRoot, tenantDir)}`);
  console.log(`  pnpm install --ignore-workspace && pnpm dev\n`);
}

function caseIdToSlug(caseId: string, origin: string): string {
  return origin.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-") || caseId;
}

main().catch((err) => {
  console.error("[hp-generate] fatal:", err);
  process.exit(1);
});
