/**
 * Select high-quality, similar past cases as few-shot examples for a new
 * detector invocation. Fast attribute-based matching — no embeddings yet.
 *
 * Selection weights (higher = keep):
 *   +archetype match:       3.0
 *   +generator match:       1.5
 *   +same page bucket:      1.5
 *   +same non-latin:        1.0
 *   +1 point per route in common (capped at 5)
 *
 * Then sort by (quality × similarity) descending and return top N.
 * Cases labeled "bad" are excluded. Manual "good" label gets a 1.0 quality
 * floor so it's always preferred over auto-scored cases.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { IngestionResult } from "@hostaposta/ingest";
import type { CaseFingerprint, CaseSnapshot, Label } from "./types.js";
import { PROMPT_VERSION } from "./types.js";

export interface SelectOptions {
  evalDir: string;
  /** New ingestion we're about to run detection on. */
  target: IngestionResult;
  /** Max cases to return. Default 2 — enough few-shot signal, keeps prompt tight. */
  limit?: number;
  /** Only consider cases captured under this prompt version. Default: all. */
  promptVersion?: string;
}

export interface SelectedCase {
  snapshot: CaseSnapshot;
  similarity: number;
  reason: string;
}

export async function selectFewShotCases(opts: SelectOptions): Promise<SelectedCase[]> {
  const indexPath = path.join(opts.evalDir, "index.json");
  let index: any[] = [];
  try {
    index = JSON.parse(await fs.readFile(indexPath, "utf-8"));
  } catch {
    return [];
  }

  const targetFp = fingerprintFromIngest(opts.target);

  const scored = await Promise.all(
    index.map(async (entry) => {
      // Load live feedback (may override the label in the index)
      const feedback = await loadFeedback(opts.evalDir, entry.caseId);
      const effectiveLabel: Label = feedback?.label ?? entry.label;

      if (effectiveLabel === "bad") return null;
      if (opts.promptVersion && entry.promptVersion !== opts.promptVersion) return null;

      const sim = computeSimilarity(targetFp, entry.fingerprint as CaseFingerprint);
      if (sim <= 0) return null;

      // Manual "good" gets a quality floor of 0.9 so hand-labeled cases
      // always beat auto-scored ones of equal similarity.
      const q = effectiveLabel === "good" ? Math.max(0.9, entry.quality.score) : entry.quality.score;

      const score = sim * q;
      return { entry, sim, score };
    }),
  );

  const ranked = scored
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 2);

  // Load full snapshots for the picks
  const out: SelectedCase[] = [];
  for (const r of ranked) {
    const snap = await loadSnapshot(opts.evalDir, r.entry.caseId);
    if (!snap) continue;
    out.push({
      snapshot: snap,
      similarity: r.sim,
      reason: describeMatch(targetFp, snap.fingerprint),
    });
  }
  return out;
}

// ─── feedback ─────────────────────────────────────────────────────────────

export async function loadFeedback(
  evalDir: string,
  caseId: string,
): Promise<{ label?: Label; notes?: string } | null> {
  const p = path.join(evalDir, "cases", caseId, "feedback.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

async function loadSnapshot(evalDir: string, caseId: string): Promise<CaseSnapshot | null> {
  const p = path.join(evalDir, "cases", caseId, "snapshot.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as CaseSnapshot;
  } catch {
    return null;
  }
}

// ─── similarity ───────────────────────────────────────────────────────────

function computeSimilarity(a: CaseFingerprint, b: CaseFingerprint): number {
  let s = 0;
  if (a.archetype === b.archetype) s += 3.0;
  if (a.generator === b.generator) s += 1.5;
  if (a.pageBucket === b.pageBucket) s += 1.5;
  if (a.hasNonLatin === b.hasNonLatin) s += 1.0;

  const routeSet = new Set(a.routes);
  const commonRoutes = b.routes.filter((r) => routeSet.has(r)).length;
  s += Math.min(5, commonRoutes);

  return s;
}

function describeMatch(target: CaseFingerprint, match: CaseFingerprint): string {
  const parts: string[] = [];
  if (target.archetype === match.archetype) parts.push(`archetype:${match.archetype}`);
  if (target.generator === match.generator) parts.push(`generator:${match.generator}`);
  if (target.pageBucket === match.pageBucket) parts.push(`pages:${match.pageBucket}`);
  if (target.hasNonLatin === match.hasNonLatin && match.hasNonLatin) parts.push("non-latin");
  const common = target.routes.filter((r) => match.routes.includes(r));
  if (common.length > 0) parts.push(`routes:${common.slice(0, 3).join(",")}`);
  return parts.join(" · ");
}

// ─── fingerprint from a live ingestion (mirrors capture.ts) ───────────────

function fingerprintFromIngest(ingest: IngestionResult): CaseFingerprint {
  const pageCount = ingest.pages.length;
  const pageBucket = pageCount <= 1 ? "small" : pageCount <= 6 ? "medium" : "large";
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

// ─── few-shot prompt builder ──────────────────────────────────────────────

/** Format selected cases as a prompt block ready to inject into the detector's user prompt. */
export function formatFewShotPrompt(cases: SelectedCase[]): string {
  if (cases.length === 0) return "";
  const parts: string[] = [
    "",
    "── Reference cases from prior successful detections ──────────────",
    "These are real prior ingestions that produced good results. Use them",
    "as style/structure hints — your current task is a NEW site, don't",
    "copy their specific entries. Only use them to calibrate what signal",
    "strength maps to what confidence.",
    "",
  ];
  for (const c of cases) {
    parts.push(`### Example case (${c.reason})`);
    parts.push(`Archetype: ${c.snapshot.fingerprint.archetype}, Generator: ${c.snapshot.fingerprint.generator}`);
    parts.push(`Routes: ${c.snapshot.fingerprint.routes.join(", ")}`);
    parts.push(`Detected (this was considered correct):`);
    const summary = c.snapshot.detection.output.detectedCollections.map((col) => ({
      type: col.type,
      confidence: col.confidence,
      evidence: col.evidence.slice(0, 3),
      entriesCount: col.entries.length,
    }));
    parts.push("```json");
    parts.push(JSON.stringify({ candidates: summary }, null, 2));
    parts.push("```");
    parts.push("");
  }
  parts.push("── End reference cases ───────────────────────────────────────────");
  parts.push("");
  return parts.join("\n");
}

export { PROMPT_VERSION };
