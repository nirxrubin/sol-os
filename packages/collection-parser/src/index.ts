/**
 * Collection Parser agent — orchestrates detect → extract → dedupe.
 *
 * The fourth skill (`flag-unmapped`) is a Phase 0 stub — implemented as a
 * pass-through that emits an empty unmapped list. Wire it up properly when
 * the platform team is ready to consume unmapped patterns.
 */

import type { IngestionResult } from "@hostaposta/ingest";
import type { CollectionExtractionResult, DetectedCollection, ExtractedEntry } from "./types.js";
import { detectCollectionTypes } from "./detect.js";
import { extractEntriesForType } from "./extract.js";
import { dedupeAndValidate } from "./dedupe.js";
import {
  scanDataFilesForCollections,
  type CollectionKind,
  type ScannedCollections,
} from "./scan-data-files.js";

export * from "./types.js";
export { detectCollectionTypes } from "./detect.js";
export { extractEntriesForType } from "./extract.js";
export { dedupeAndValidate } from "./dedupe.js";
export { scanDataFilesForCollections, classifyArrayShape } from "./scan-data-files.js";

const HIGH_CONFIDENCE_FLOOR = 0.6; // entries below this go to "low" bucket

export interface ParseCollectionsOptions {
  /** Optional few-shot block injected into the detector prompt (from the eval corpus). */
  fewShotBlock?: string;
  /** Called if the detector had to retry due to malformed JSON. Used by eval to score quality. */
  onDetectorRetry?: () => void;
  /** Root dir to scan for static data files (blogPosts / testimonials / etc.
   *  arrays). Defaults to `ingest.buildPath` when unset. Pass `null` to skip. */
  scanSourceDir?: string | null;
}

export async function parseCollections(
  ingest: IngestionResult,
  opts: ParseCollectionsOptions = {},
): Promise<CollectionExtractionResult> {
  const warnings: string[] = [];

  if (ingest.pages.length === 0) {
    return {
      detectedCollections: [],
      unmappedStructured: [],
      warnings: ["No pages in IngestionResult — nothing to detect"],
      metrics: emptyMetrics(),
    };
  }

  // Short-circuit trivial single-page sites (tools / utilities / one-shot apps).
  // Saves ~40s + 2 Sonnet calls on ingests with no realistic collection content.
  const totalHtmlBytes = ingest.pages.reduce((n, p) => n + p.html.length, 0);
  const isTrivialSite =
    ingest.pages.length === 1 &&
    totalHtmlBytes < 10_000 &&
    ingest.routes.patterns.length === 0;

  if (isTrivialSite) {
    return {
      detectedCollections: [],
      unmappedStructured: [],
      warnings: [
        `Skipped detection: trivial single-page site (${totalHtmlBytes} bytes, no route patterns) — unlikely to contain collection content`,
      ],
      metrics: { ...emptyMetrics(), pagesAnalyzed: ingest.pages.length },
    };
  }

  // Skill 0: scan static data files (JS/JSON) — runs in parallel with detect.
  // Many tool-generated sites (Lovable, Bolt, vanilla HTML with a JS CMS) store
  // their list content here rather than in server-rendered DOM.
  const scanDir = opts.scanSourceDir === null
    ? null
    : (opts.scanSourceDir ?? ingest.buildPath ?? ingest.renderedOutputPath ?? null);

  const [detection, scanned] = await Promise.all([
    detectCollectionTypes(ingest, {
      fewShotBlock: opts.fewShotBlock,
      onRetry: opts.onDetectorRetry,
    }),
    scanDir
      ? scanDataFilesForCollections(scanDir).catch((err): ScannedCollections => {
          warnings.push(`scan-data-files failed: ${(err as Error).message}`);
          return { entries: {}, filesScanned: [], filesHit: [], warnings: [] };
        })
      : Promise.resolve<ScannedCollections>({ entries: {}, filesScanned: [], filesHit: [], warnings: [] }),
  ]);

  if (scanned.filesHit.length > 0) {
    const summary = (Object.keys(scanned.entries) as CollectionKind[])
      .map((k) => `${k}=${scanned.entries[k]?.length ?? 0}`)
      .join(", ");
    warnings.push(`scanned data files (${scanned.filesHit.join(", ")}) → ${summary}`);
  }
  warnings.push(...scanned.warnings);

  // If scan found types the LLM didn't detect, synthesize candidates so they
  // flow through dedupe-and-validate alongside the DOM-extracted entries.
  const detectedTypes = new Set(detection.candidates.map((c) => c.type));
  for (const kind of Object.keys(scanned.entries) as CollectionKind[]) {
    if (detectedTypes.has(kind)) continue;
    const entries = scanned.entries[kind];
    if (!entries || entries.length === 0) continue;
    detection.candidates.push({
      type: kind,
      confidence: 0.85,
      evidence: [`static data file: ${scanned.filesHit[0] ?? "(scanned)"}`],
    });
  }

  if (detection.candidates.length === 0) {
    return {
      detectedCollections: [],
      unmappedStructured: [],
      warnings: warnings.length ? warnings : ["No collection types detected"],
      metrics: { ...emptyMetrics(), pagesAnalyzed: ingest.pages.length },
    };
  }

  // Skill 2: extract per type, in parallel. Skip LLM extraction for types
  // that came purely from the data-file scanner (no DOM to extract from).
  const scanOnlyTypes = new Set<string>();
  for (const kind of Object.keys(scanned.entries) as CollectionKind[]) {
    const fromDetector = detection.candidates.find((c) => c.type === kind);
    const domEvidence = fromDetector?.evidence.some((e) => !e.startsWith("static data file")) ?? false;
    if (!domEvidence) scanOnlyTypes.add(kind);
  }

  const extractionResults = await Promise.all(
    detection.candidates.map(async (candidate) => {
      if (scanOnlyTypes.has(candidate.type)) {
        return { candidate, entries: [] as ExtractedEntry[], warnings: [] as string[] };
      }
      try {
        const result = await extractEntriesForType(ingest, candidate, detection);
        return { candidate, ...result };
      } catch (err) {
        const message = (err as Error).message;
        warnings.push(`extract-entries failed for ${candidate.type}: ${message}`);
        return { candidate, entries: [], warnings: [message] };
      }
    }),
  );

  // Merge scanner entries into each extraction, de-duping by slug so DOM and
  // scan don't double-count. DOM wins on conflict (richer provenance).
  for (const er of extractionResults) {
    const scanEntries = scanned.entries[er.candidate.type as CollectionKind];
    if (!scanEntries || scanEntries.length === 0) continue;
    const existingSlugs = new Set(
      er.entries
        .map((e) => (typeof e.data.slug === "string" ? e.data.slug : null))
        .filter((s): s is string => !!s),
    );
    for (const se of scanEntries) {
      const slug = typeof se.data.slug === "string" ? se.data.slug : null;
      if (slug && existingSlugs.has(slug)) continue;
      er.entries.push(se);
      if (slug) existingSlugs.add(slug);
    }
  }

  // Skill 3: dedupe + validate per type
  const detectedCollections: DetectedCollection[] = [];
  let totalEntries = 0;
  let confidenceSum = 0;
  let highCount = 0;
  let lowCount = 0;

  for (const { candidate, entries, warnings: extractWarnings } of extractionResults) {
    warnings.push(...extractWarnings);

    const dedupeResult = dedupeAndValidate(candidate.type, entries);
    warnings.push(...dedupeResult.warnings);

    for (const e of dedupeResult.entries) {
      totalEntries += 1;
      confidenceSum += e.confidence;
      if (e.confidence >= 0.85) highCount += 1;
      if (e.confidence < HIGH_CONFIDENCE_FLOOR) lowCount += 1;
    }

    detectedCollections.push({
      type: candidate.type,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      entries: dedupeResult.entries,
      indexPages: detection.indexPages[candidate.type]?.map((route) => ({ route })),
      detailPages: detection.detailPatterns[candidate.type]?.map((pattern) => ({
        pattern,
        exampleRoute: ingest.pages.find((p) => matches(p.route, pattern))?.route ?? pattern,
      })),
    });
  }

  // Skill 4: flag-unmapped — Phase 0 stub
  const unmappedStructured: CollectionExtractionResult["unmappedStructured"] = [];

  return {
    detectedCollections,
    unmappedStructured,
    warnings,
    metrics: {
      pagesAnalyzed: ingest.pages.length,
      totalEntriesExtracted: totalEntries,
      averageConfidence: totalEntries > 0 ? confidenceSum / totalEntries : 0,
      highConfidenceCount: highCount,
      lowConfidenceCount: lowCount,
    },
  };
}

function matches(route: string, pattern: string): boolean {
  const re = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
  return re.test(route);
}

function emptyMetrics(): CollectionExtractionResult["metrics"] {
  return {
    pagesAnalyzed: 0,
    totalEntriesExtracted: 0,
    averageConfidence: 0,
    highConfidenceCount: 0,
    lowConfidenceCount: 0,
  };
}
