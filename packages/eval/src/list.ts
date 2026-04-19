/**
 * List + summarize captured cases. Used by the eval CLI.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { CaseFingerprint, CaseQuality, Label } from "./types.js";
import { loadFeedback } from "./select.js";

export interface IndexEntry {
  caseId: string;
  capturedAt: string;
  origin: string;
  fingerprint: CaseFingerprint;
  quality: CaseQuality;
  label: Label;
  promptVersion: string;
}

export interface ListedCase extends IndexEntry {
  effectiveLabel: Label;
  feedbackNotes?: string;
}

export async function listCases(evalDir: string): Promise<ListedCase[]> {
  const indexPath = path.join(evalDir, "index.json");
  let entries: IndexEntry[] = [];
  try {
    entries = JSON.parse(await fs.readFile(indexPath, "utf-8")) as IndexEntry[];
  } catch {
    return [];
  }

  const out: ListedCase[] = [];
  for (const e of entries) {
    const fb = await loadFeedback(evalDir, e.caseId);
    out.push({
      ...e,
      effectiveLabel: fb?.label ?? e.label,
      feedbackNotes: fb?.notes || undefined,
    });
  }
  return out;
}

export async function setLabel(
  evalDir: string,
  caseId: string,
  label: Label,
  notes?: string,
): Promise<void> {
  const fbPath = path.join(evalDir, "cases", caseId, "feedback.json");
  let current: { label?: Label; notes?: string } = {};
  try {
    current = JSON.parse(await fs.readFile(fbPath, "utf-8"));
  } catch {
    // ok, file might not exist yet
  }
  const next = { label, notes: notes ?? current.notes ?? "" };
  await fs.mkdir(path.dirname(fbPath), { recursive: true });
  await fs.writeFile(fbPath, JSON.stringify(next, null, 2));
}

export function summarizeCorpus(cases: ListedCase[]): {
  total: number;
  byLabel: Record<Label, number>;
  byArchetype: Record<string, number>;
  byGenerator: Record<string, number>;
  avgQuality: number;
} {
  const byLabel: Record<Label, number> = { good: 0, bad: 0, unlabeled: 0 };
  const byArchetype: Record<string, number> = {};
  const byGenerator: Record<string, number> = {};
  let sumQ = 0;
  for (const c of cases) {
    byLabel[c.effectiveLabel] = (byLabel[c.effectiveLabel] ?? 0) + 1;
    byArchetype[c.fingerprint.archetype] = (byArchetype[c.fingerprint.archetype] ?? 0) + 1;
    byGenerator[c.fingerprint.generator] = (byGenerator[c.fingerprint.generator] ?? 0) + 1;
    sumQ += c.quality.score;
  }
  return {
    total: cases.length,
    byLabel,
    byArchetype,
    byGenerator,
    avgQuality: cases.length > 0 ? sumQ / cases.length : 0,
  };
}
