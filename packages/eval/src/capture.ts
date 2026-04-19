/**
 * Persist an ingestion run as an eval case.
 *
 * Writes three files per case:
 *   <dir>/snapshot.json  — machine-readable capture
 *   <dir>/feedback.json  — starts empty; user edits to override label/notes
 *   <dir>/case.md        — human-readable summary for quick review
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { IngestionResult } from "@hostaposta/ingest";
import type { CollectionExtractionResult } from "@hostaposta/collection-parser";
import type { CaseFingerprint, CaseQuality, CaseSnapshot, Label } from "./types.js";
import { PROMPT_VERSION } from "./types.js";

export interface CaptureOptions {
  /** Root of the eval store — typically `<repo>/.eval`. */
  evalDir: string;
  /** The ingestion result. */
  ingestion: IngestionResult;
  /** Collection extraction output. */
  collections: CollectionExtractionResult;
  /** Whether the detector had to retry — caller passes this since it's a
   *  trace-level signal, not in the output shape. */
  detectorRetried: boolean;
}

export async function captureCase(opts: CaptureOptions): Promise<CaseSnapshot> {
  const caseId = buildCaseId(opts.ingestion.source.origin);
  const dir = path.join(opts.evalDir, "cases", caseId);
  await fs.mkdir(dir, { recursive: true });

  const fingerprint = computeFingerprint(opts.ingestion);
  const quality = computeQuality(opts.collections, opts.detectorRetried);

  // Trim detection input pages so snapshot stays manageable. We keep the
  // first ~3000 chars of each page — enough context for few-shot later.
  const detectionPages = opts.ingestion.pages.slice(0, 10).map((p) => ({
    route: p.route,
    title: p.meta.title,
    htmlSnippet: p.html.replace(/\s+/g, " ").slice(0, 3000),
  }));

  const snapshot: CaseSnapshot = {
    caseId,
    capturedAt: new Date().toISOString(),
    source: opts.ingestion.source,
    fingerprint,
    quality,
    detection: {
      pages: detectionPages,
      output: opts.collections,
    },
    label: "unlabeled",
    promptVersion: PROMPT_VERSION,
  };

  await fs.writeFile(path.join(dir, "snapshot.json"), JSON.stringify(snapshot, null, 2));

  // Sidecar: full IngestionResult. The snapshot trims page HTML to 3000 chars
  // for the few-shot corpus; the generator needs the full pages (not just a
  // snippet) to produce per-page block compositions that match the source.
  await fs.writeFile(
    path.join(dir, "ingestion.json"),
    JSON.stringify(opts.ingestion, null, 2),
  );

  // Empty feedback file — user fills in to override label/notes
  const feedbackPath = path.join(dir, "feedback.json");
  try {
    await fs.access(feedbackPath);
  } catch {
    await fs.writeFile(feedbackPath, JSON.stringify({ label: "unlabeled", notes: "" }, null, 2));
  }

  await fs.writeFile(path.join(dir, "case.md"), renderMarkdown(snapshot));

  await updateIndex(opts.evalDir, snapshot);

  return snapshot;
}

// ─── fingerprint + quality ────────────────────────────────────────────────

function computeFingerprint(ingest: IngestionResult): CaseFingerprint {
  const pageCount = ingest.pages.length;
  const pageBucket: CaseFingerprint["pageBucket"] =
    pageCount <= 1 ? "small" : pageCount <= 6 ? "medium" : "large";

  // Heuristic non-Latin check: sample page bodies; if >10% chars are
  // outside latin/punct, mark as non-latin. Catches RTL (Hebrew/Arabic)
  // and CJK sites.
  const sample = ingest.pages.map((p) => p.html).join(" ").slice(0, 4000);
  const nonLatinChars = sample.match(/[^\u0000-\u007F\s]/g);
  const hasNonLatin = !!nonLatinChars && nonLatinChars.length / Math.max(1, sample.length) > 0.1;

  return {
    archetype: ingest.archetype,
    generator: ingest.generator,
    pageBucket,
    hasNonLatin,
    routes: ingest.pages.map((p) => p.route).sort(),
  };
}

function computeQuality(
  collections: CollectionExtractionResult,
  detectorRetried: boolean,
): CaseQuality {
  const avgExtractionConfidence = collections.metrics.averageConfidence;
  const warningCount = collections.warnings.length;
  // We don't have a direct droppedCount post-dedupe in the result shape,
  // so derive: any "entries dropped from X" warnings are a proxy.
  const droppedCount = collections.warnings.filter((w) => /entries dropped/.test(w)).length;

  // Weighted score. Heuristic but tunable.
  let score = 0.5;
  if (!detectorRetried) score += 0.15;
  score += Math.max(0, Math.min(0.3, avgExtractionConfidence * 0.3));
  if (warningCount === 0) score += 0.1;
  if (droppedCount === 0) score += 0.05;

  // Clamp
  score = Math.max(0, Math.min(1, score));

  return { score, detectorRetried, avgExtractionConfidence, droppedCount, warningCount };
}

// ─── case id ──────────────────────────────────────────────────────────────

function buildCaseId(origin: string): string {
  const base = origin.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-");
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/T/, "_")
    .replace(/Z$/, "");
  return `${ts}-${base}`;
}

// ─── index ────────────────────────────────────────────────────────────────

interface IndexEntry {
  caseId: string;
  capturedAt: string;
  origin: string;
  fingerprint: CaseFingerprint;
  quality: CaseQuality;
  label: Label;
  promptVersion: string;
}

async function updateIndex(evalDir: string, snapshot: CaseSnapshot): Promise<void> {
  const indexPath = path.join(evalDir, "index.json");
  let entries: IndexEntry[] = [];
  try {
    entries = JSON.parse(await fs.readFile(indexPath, "utf-8")) as IndexEntry[];
  } catch {
    // no index yet
  }

  // Replace any prior entry with the same caseId, then add
  entries = entries.filter((e) => e.caseId !== snapshot.caseId);
  entries.push({
    caseId: snapshot.caseId,
    capturedAt: snapshot.capturedAt,
    origin: snapshot.source.origin,
    fingerprint: snapshot.fingerprint,
    quality: snapshot.quality,
    label: snapshot.label,
    promptVersion: snapshot.promptVersion,
  });
  entries.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  await fs.writeFile(indexPath, JSON.stringify(entries, null, 2));
}

// ─── markdown renderer ────────────────────────────────────────────────────

function renderMarkdown(s: CaseSnapshot): string {
  const { detection, quality, fingerprint } = s;
  const out: string[] = [];
  out.push(`# Case ${s.caseId}`);
  out.push(`*captured ${s.capturedAt}*`);
  out.push("");
  out.push(`**Source:** ${s.source.kind} / ${s.source.origin}`);
  out.push(`**Archetype:** ${fingerprint.archetype} / **Generator:** ${fingerprint.generator}`);
  out.push(`**Pages:** ${fingerprint.pageBucket} (${fingerprint.routes.length} routes) / **Non-latin:** ${fingerprint.hasNonLatin}`);
  out.push(`**Quality:** ${(quality.score * 100).toFixed(0)}% — avg conf ${(quality.avgExtractionConfidence * 100).toFixed(0)}%, retried: ${quality.detectorRetried}, warnings: ${quality.warningCount}`);
  out.push(`**Label:** ${s.label} (edit \`feedback.json\` to change)`);
  out.push(`**Prompt:** ${s.promptVersion}`);
  out.push("");
  out.push("## Routes");
  for (const r of fingerprint.routes) out.push(`- ${r}`);
  out.push("");
  out.push("## Detected collections");
  for (const col of detection.output.detectedCollections) {
    out.push(`### ${col.type} — det conf ${(col.confidence * 100).toFixed(0)}% — ${col.entries.length} entries`);
    for (const ev of col.evidence) out.push(`- ${ev}`);
    if (col.entries.length > 0) {
      out.push("");
      out.push("Entries:");
      for (const e of col.entries.slice(0, 5)) {
        const title = e.data["title"] ?? e.data["name"] ?? e.data["quote"] ?? e.data["question"] ?? "(untitled)";
        out.push(`  - [${(e.confidence * 100).toFixed(0)}%] ${String(title).slice(0, 100)}`);
      }
    }
    out.push("");
  }
  if (detection.output.warnings.length) {
    out.push("## Warnings");
    for (const w of detection.output.warnings) out.push(`- ${w}`);
  }
  return out.join("\n");
}
