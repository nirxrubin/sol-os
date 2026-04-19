/**
 * @hostaposta/ingest — top-level pipeline orchestration.
 *
 * Public API:
 *   ingestFromZip(zipPath, opts) → IngestionResult
 *
 * Future ingestion sources (GitHub, URL, Figma, description) plug into the
 * same `IngestionResult` output via similar entry points.
 */

import path from "node:path";
import { detectArchetype, ARCHETYPES } from "./archetype.js";
import { buildProject } from "./build.js";
import { parseBuildOutput } from "./parse.js";
import { extractZip } from "./zip.js";
import type { IngestionResult } from "./types.js";

export * from "./types.js";
export { extractZip } from "./zip.js";
export { detectArchetype, ARCHETYPES } from "./archetype.js";
export { buildProject } from "./build.js";
export { parseBuildOutput } from "./parse.js";

export interface IngestFromZipOptions {
  /** Workspace dir for extraction + build. Created if missing. */
  workspaceDir: string;
  /** Optional logger — receives stage transitions. Defaults to console.log. */
  log?: (msg: string) => void;
}

export async function ingestFromZip(
  zipPath: string,
  opts: IngestFromZipOptions,
): Promise<IngestionResult> {
  const log = opts.log ?? ((m) => console.log(`[ingest] ${m}`));
  const warnings: string[] = [];
  const origin = path.basename(zipPath);

  log(`extracting ${origin} → ${opts.workspaceDir}`);
  const extract = await extractZip(zipPath, { destDir: opts.workspaceDir });
  log(`extracted ${extract.files.length} files (${(extract.bytes / 1024).toFixed(1)} KB), root: ${extract.projectRoot}`);

  log("detecting archetype + generator");
  const detection = await detectArchetype(extract.projectRoot);
  log(`archetype: ${detection.archetype} (${(detection.archetypeConfidence * 100).toFixed(0)}%) generator: ${detection.generator}`);

  const archetype = ARCHETYPES[detection.archetype];

  log(`building (${archetype.build.command})`);
  const buildResult = await buildProject(extract.projectRoot, archetype);
  if (buildResult.success) {
    log(`build ok in ${(buildResult.durationMs ?? 0) / 1000}s → ${buildResult.outputPath}`);
  } else {
    log(`build FAILED: ${buildResult.error?.slice(0, 200)}`);
    warnings.push(`Build failed: ${buildResult.error?.slice(0, 200)}`);
  }

  let parse: import("./parse.js").ParseResult = {
    pages: [],
    assets: [],
    routes: { tree: null, patterns: [] },
    warnings: [],
  };
  if (buildResult.success && buildResult.outputPath) {
    log(`parsing build output at ${buildResult.outputPath}`);
    parse = await parseBuildOutput(buildResult.outputPath);
    log(`parsed ${parse.pages.length} pages, ${parse.assets.length} assets, ${parse.routes.patterns.length} dynamic patterns`);
  }

  warnings.push(...parse.warnings);

  const htmlBytes = parse.pages.reduce((n, p) => n + p.html.length, 0);
  const cssBytes = parse.pages.reduce((n, p) => n + p.css.length, 0);

  return {
    source: { kind: "zip", origin },
    archetype: detection.archetype,
    archetypeConfidence: detection.archetypeConfidence,
    generator: detection.generator,
    generatorConfidence: detection.generatorConfidence,
    buildPath: extract.projectRoot,
    pages: parse.pages,
    assets: parse.assets,
    routes: parse.routes,
    build: {
      attempted: buildResult.attempted,
      success: buildResult.success,
      durationMs: buildResult.durationMs,
      output: buildResult.output,
      error: buildResult.error,
      outputPath: buildResult.outputPath,
    },
    warnings,
    metrics: {
      pagesCount: parse.pages.length,
      assetsCount: parse.assets.length,
      htmlBytes,
      cssBytes,
    },
  };
}
