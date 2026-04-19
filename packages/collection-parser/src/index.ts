/**
 * Collection Parser agent — orchestrates detect → extract → dedupe.
 *
 * The fourth skill (`flag-unmapped`) is a Phase 0 stub — implemented as a
 * pass-through that emits an empty unmapped list. Wire it up properly when
 * the platform team is ready to consume unmapped patterns.
 */

import type { IngestionResult } from "@hostaposta/ingest";
import type { CollectionExtractionResult, DetectedCollection } from "./types.js";
import { detectCollectionTypes } from "./detect.js";
import { extractEntriesForType } from "./extract.js";
import { dedupeAndValidate } from "./dedupe.js";

export * from "./types.js";
export { detectCollectionTypes } from "./detect.js";
export { extractEntriesForType } from "./extract.js";
export { dedupeAndValidate } from "./dedupe.js";

const HIGH_CONFIDENCE_FLOOR = 0.6; // entries below this go to "low" bucket

export async function parseCollections(ingest: IngestionResult): Promise<CollectionExtractionResult> {
  const warnings: string[] = [];

  if (ingest.pages.length === 0) {
    return {
      detectedCollections: [],
      unmappedStructured: [],
      warnings: ["No pages in IngestionResult — nothing to detect"],
      metrics: emptyMetrics(),
    };
  }

  // Skill 1: detect
  const detection = await detectCollectionTypes(ingest);

  if (detection.candidates.length === 0) {
    return {
      detectedCollections: [],
      unmappedStructured: [],
      warnings: ["No collection types detected"],
      metrics: { ...emptyMetrics(), pagesAnalyzed: ingest.pages.length },
    };
  }

  // Skill 2: extract per type, in parallel
  const extractionResults = await Promise.all(
    detection.candidates.map(async (candidate) => {
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
