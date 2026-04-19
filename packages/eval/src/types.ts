/**
 * Eval case — a captured ingestion run + its quality signal.
 *
 * Stored under `.eval/cases/<caseId>/` with sidecar files:
 *   snapshot.json    — the captured run data (inputs + outputs)
 *   feedback.json    — user annotations (optional, auto-created empty)
 *   case.md          — human-readable summary for quick review
 */

import type { ArchetypeId, GeneratorId } from "@hostaposta/ingest";
import type { CollectionExtractionResult } from "@hostaposta/collection-parser";

export type Label = "good" | "bad" | "unlabeled";

export interface CaseFingerprint {
  /** Archetype — coarse site-type bucket. */
  archetype: ArchetypeId;
  generator: GeneratorId;
  /** Page count bucket — small (1), medium (2–6), large (7+). */
  pageBucket: "small" | "medium" | "large";
  /** Has RTL / non-latin content? Rough heuristic from HTML digest. */
  hasNonLatin: boolean;
  /** Top-level routes seen. */
  routes: string[];
}

export interface CaseQuality {
  /** 0..1 — higher = more confident this case's outputs can be trusted as few-shot. */
  score: number;
  /** True when the detector had to retry for malformed JSON. */
  detectorRetried: boolean;
  /** Average entry extraction confidence. */
  avgExtractionConfidence: number;
  /** Number of entries dropped by dedupe-and-validate. */
  droppedCount: number;
  /** Warnings count from the collection extraction. */
  warningCount: number;
}

export interface CaseSnapshot {
  /** Stable identifier — `<YYYYMMDD-hhmmss>-<zip-basename>`. */
  caseId: string;
  capturedAt: string;
  source: {
    kind: string;
    origin: string;
  };
  fingerprint: CaseFingerprint;
  quality: CaseQuality;
  detection: {
    /** Trimmed input we fed the detector — enough to reconstruct context. */
    pages: Array<{ route: string; title?: string; htmlSnippet: string }>;
    output: CollectionExtractionResult;
  };
  label: Label;
  /** Freeform user notes. */
  notes?: string;
  /** Version of the prompt/code that produced this case (for drift detection). */
  promptVersion: string;
}

export const PROMPT_VERSION = "detect-v2+digest-v2";
