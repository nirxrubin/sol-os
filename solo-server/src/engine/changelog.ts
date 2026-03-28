/**
 * Changelog Engine
 *
 * Records every source mutation as an append-only log.
 * Foundation for: undo/redo, deploy diffs, activity timeline, collaboration.
 *
 * Uses JSONL (newline-delimited JSON) for O(1) appends — no need to
 * parse the entire history on every write.
 *
 * In-memory cache avoids re-reading/parsing the full file on every query.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { SourceEditResult } from './source.js';

// ─── Types ────────────────────────────────────────────────────────

export type ChangeSource = 'canvas' | 'cms' | 'provider' | 'system' | 'import';

export interface ChangelogEntry {
  id: string;              // Unique change ID (also used as SourceEditResult.changeId)
  version: number;         // Monotonic version counter
  timestamp: string;       // ISO 8601
  source: ChangeSource;    // Origin of the change
  page: string;            // File path within project
  selector: string;        // CSS selector of edited element
  editType: string;        // 'text' | 'image' | 'attribute' | 'file-add' | 'file-delete'
  oldValue: string;        // Previous content (for undo)
  newValue: string;        // New content
  metadata?: Record<string, unknown>; // Extensible: { contentTypeId, itemId, fieldName, userId, ... }
}

export interface ChangelogSummary {
  totalChanges: number;
  lastChange?: ChangelogEntry;
  changesBySource: Record<ChangeSource, number>;
  changedPages: string[];
}

// ─── State ────────────────────────────────────────────────────────

let logFile: string | null = null;
let versionCounter = 0;

// In-memory cache — always in sync since changelog is append-only
let entriesCache: ChangelogEntry[] | null = null;

// ─── Init ─────────────────────────────────────────────────────────

export function initChangelog(workspacePath: string): void {
  logFile = path.join(workspacePath, '.sol-changelog.jsonl');
  entriesCache = null; // Reset cache on init

  // Read existing entries to set version counter and warm cache
  try {
    const { readFileSync } = require('fs');
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const parsed = lines.map((line: string) => JSON.parse(line) as ChangelogEntry);
    entriesCache = parsed;
    if (parsed.length > 0) {
      versionCounter = parsed[parsed.length - 1].version;
    }
  } catch {
    versionCounter = 0;
    entriesCache = [];
  }
}

// ─── Record ───────────────────────────────────────────────────────

export async function recordChange(
  result: SourceEditResult,
  source: ChangeSource,
  metadata?: Record<string, unknown>,
): Promise<ChangelogEntry | null> {
  if (!result.success || !logFile) return null;

  versionCounter++;
  const entry: ChangelogEntry = {
    id: result.changeId,
    version: versionCounter,
    timestamp: new Date().toISOString(),
    source,
    page: result.page,
    selector: result.selector,
    editType: result.editType,
    oldValue: result.oldValue,
    newValue: result.newValue,
    metadata,
  };

  // Append-only write — O(1) regardless of history length
  try {
    await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
    // Keep cache in sync
    if (entriesCache) {
      entriesCache.push(entry);
    }
  } catch {
    // Non-blocking — changelog failure should never block edits
  }

  return entry;
}

export async function recordChanges(
  results: SourceEditResult[],
  source: ChangeSource,
  metadata?: Record<string, unknown>,
): Promise<ChangelogEntry[]> {
  const entries: ChangelogEntry[] = [];
  for (const result of results) {
    const entry = await recordChange(result, source, metadata);
    if (entry) entries.push(entry);
  }
  return entries;
}

// ─── Read (cache-first) ──────────────────────────────────────────

async function getAllEntries(): Promise<ChangelogEntry[]> {
  // Return cache if available
  if (entriesCache) return entriesCache;

  if (!logFile) return [];

  try {
    const content = await fs.readFile(logFile, 'utf-8');
    entriesCache = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChangelogEntry);
    return entriesCache;
  } catch {
    entriesCache = [];
    return [];
  }
}

export async function getChangelog(options?: {
  limit?: number;
  offset?: number;
  page?: string;
  source?: ChangeSource;
}): Promise<ChangelogEntry[]> {
  let entries = await getAllEntries();

  // Filter
  if (options?.page) {
    entries = entries.filter((e) => e.page === options.page);
  }
  if (options?.source) {
    entries = entries.filter((e) => e.source === options.source);
  }

  // Most recent first (copy to avoid mutating cache)
  const reversed = [...entries].reverse();

  // Pagination
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return reversed.slice(offset, offset + limit);
}

export async function getChangelogSummary(): Promise<ChangelogSummary> {
  const entries = await getAllEntries();

  const changesBySource: Record<string, number> = {};
  const changedPagesSet = new Set<string>();

  for (const entry of entries) {
    changesBySource[entry.source] = (changesBySource[entry.source] ?? 0) + 1;
    changedPagesSet.add(entry.page);
  }

  return {
    totalChanges: entries.length,
    lastChange: entries[entries.length - 1],
    changesBySource: changesBySource as Record<ChangeSource, number>,
    changedPages: Array.from(changedPagesSet),
  };
}

// ─── Changes since a specific version (for deploy diffs) ──────────

export async function getChangesSince(version: number): Promise<ChangelogEntry[]> {
  const all = await getAllEntries();
  return all.filter((e) => e.version > version); // chronological order (already sorted)
}

// ─── Clear (for project re-import) ────────────────────────────────

export async function clearChangelog(): Promise<void> {
  if (!logFile) return;
  try {
    await fs.writeFile(logFile, '');
    versionCounter = 0;
    entriesCache = [];
  } catch { /* ignore */ }
}
