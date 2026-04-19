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
import { discoverSpaRoutes, isSpaArchetype } from "./spa-routes.js";
import { renderSpa } from "./render.js";
import { extractZip } from "./zip.js";
import type { IngestionResult } from "./types.js";

export * from "./types.js";
export { extractZip } from "./zip.js";
export { detectArchetype, ARCHETYPES } from "./archetype.js";
export { buildProject } from "./build.js";
export { parseBuildOutput } from "./parse.js";
export { discoverSpaRoutes, isSpaArchetype } from "./spa-routes.js";
export { renderSpa } from "./render.js";

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
  let renderedOutputPath: string | undefined;
  if (buildResult.success && buildResult.outputPath) {
    let outputToParse = buildResult.outputPath;

    // SPA archetypes ship a single index.html shell; headless-render discovered
    // routes into a proper multi-page tree before parsing.
    const routeScreenshots = new Map<string, string>();
    if (isSpaArchetype(detection.archetype)) {
      log("SPA detected — discovering routes from source");
      const discovery = await discoverSpaRoutes(extract.projectRoot);
      log(`discovered ${discovery.routes.length} routes via ${discovery.source}: ${discovery.routes.join(", ")}`);

      const renderedDir = path.join(opts.workspaceDir, "__rendered");
      log(`rendering ${discovery.routes.length} routes → ${renderedDir}`);
      const renderResult = await renderSpa({
        buildOutputPath: buildResult.outputPath,
        renderedOutputPath: renderedDir,
        routes: discovery.routes,
        log,
      });

      const okCount = renderResult.renderedRoutes.filter((r) => r.ok).length;
      log(`rendered ${okCount}/${discovery.routes.length} routes successfully`);
      for (const r of renderResult.renderedRoutes.filter((r) => !r.ok)) {
        warnings.push(`render ${r.route} failed: ${r.error}`);
      }
      for (const r of renderResult.renderedRoutes.filter((r) => r.ok && r.screenshot)) {
        routeScreenshots.set(r.route, r.screenshot!);
      }

      outputToParse = renderResult.renderedOutputPath;
      renderedOutputPath = renderResult.renderedOutputPath;
    } else {
      // Non-SPA archetypes (static HTML, Astro, Next static export) — the
      // build output is already parseable. For visual-fidelity generation
      // later we'd also want screenshots of these pages; skipped for now
      // since the parse step is direct-from-disk.
    }

    log(`parsing build output at ${outputToParse}`);
    parse = await parseBuildOutput(outputToParse);
    // Attach per-route screenshots captured during the SPA render step.
    if (routeScreenshots.size > 0) {
      for (const page of parse.pages) {
        const shot = routeScreenshots.get(page.route);
        if (shot) page.screenshot = shot;
      }
    }
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
    renderedOutputPath,
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
