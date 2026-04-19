/**
 * Skill 3 — dedupe-and-validate. Pure TypeScript, no Claude.
 *
 * - Dedupes by collection.uniqueKey
 * - Validates required fields
 * - Drops entries with no provenance (likely hallucinated)
 * - Drops entries that don't satisfy required fields after fallback
 * - Emits warnings inline on each entry
 */

import { getCollectionBySlug } from "@hostaposta/collections";
import type { ExtractedEntry } from "./types.js";

export interface DedupeResult {
  entries: ExtractedEntry[];
  dropped: Array<{ entry: ExtractedEntry; reason: string }>;
  warnings: string[];
}

export function dedupeAndValidate(
  collectionSlug: string,
  entries: ExtractedEntry[],
): DedupeResult {
  const schema = getCollectionBySlug(collectionSlug);
  if (!schema) {
    return {
      entries: [],
      dropped: entries.map((e) => ({ entry: e, reason: `Unknown collection ${collectionSlug}` })),
      warnings: [`Unknown collection slug: ${collectionSlug}`],
    };
  }

  const dropped: DedupeResult["dropped"] = [];
  const warnings: string[] = [];
  const requiredFields = schema.fields.filter((f) => f.required).map((f) => f.name);

  // Step 1: provenance check (non-negotiable — drops hallucinations)
  const withProvenance = entries.filter((e) => {
    if (!e.sourceProvenance || (!e.sourceProvenance.sourceUrl && !e.sourceProvenance.domPath)) {
      dropped.push({ entry: e, reason: "Missing source provenance — likely hallucinated" });
      return false;
    }
    return true;
  });

  // Step 2: required fields check
  const validated = withProvenance.filter((e) => {
    const missing = requiredFields.filter((f) => {
      const v = e.data[f];
      return v === undefined || v === null || v === "";
    });
    if (missing.length > 0) {
      dropped.push({ entry: e, reason: `Missing required fields: ${missing.join(", ")}` });
      return false;
    }
    return true;
  });

  // Step 3: dedupe by uniqueKey
  const seen = new Map<string, ExtractedEntry>();
  for (const entry of validated) {
    const key = canonicalKey(entry, schema.uniqueKey);
    if (key === null) {
      // No uniqueKey defined (e.g., singletons) — keep all
      seen.set(`__no_key__${seen.size}`, entry);
      continue;
    }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
    } else {
      // Keep the higher-confidence one
      if (entry.confidence > existing.confidence) {
        seen.set(key, entry);
        dropped.push({ entry: existing, reason: `Duplicate by ${schema.uniqueKey.join("+")} — kept higher-confidence` });
      } else {
        dropped.push({ entry, reason: `Duplicate by ${schema.uniqueKey.join("+")}` });
      }
    }
  }

  if (dropped.length > 0) {
    warnings.push(`${dropped.length} entries dropped from ${schema.slug}`);
  }

  return {
    entries: Array.from(seen.values()),
    dropped,
    warnings,
  };
}

function canonicalKey(entry: ExtractedEntry, uniqueKey: ReadonlyArray<string>): string | null {
  if (uniqueKey.length === 0) return null;
  const parts: string[] = [];
  for (const k of uniqueKey) {
    const v = entry.data[k];
    if (v === undefined || v === null) return null;
    parts.push(String(v).toLowerCase().trim());
  }
  return parts.join("::");
}
