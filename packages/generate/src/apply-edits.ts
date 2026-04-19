/**
 * Apply a set of edit values to source HTML using the carve map.
 *
 * Pure deterministic transform — no Claude, no ambiguity. For each edit:
 *   - Resolve the carve entry by id
 *   - Walk the selector
 *   - Substitute text / attribute per the edit kind
 *
 * Unknown edit IDs silently skip (with a warning); the carve map is the
 * only source of truth for valid edits.
 */

import * as cheerio from "cheerio";
import type { CarveMap, CarvedEdit } from "./carve.js";

export interface EditsMap {
  [editId: string]: string;
}

export interface ApplyEditsResult {
  appliedCount: number;
  skipped: Array<{ id: string; reason: string }>;
}

export interface ApplyEditsToPageInput {
  html: string;
  edits: CarvedEdit[];
  values: EditsMap;
}

/** Apply all applicable edits to one page's HTML. Returns the modified HTML. */
export function applyEditsToPage(
  input: ApplyEditsToPageInput,
): { html: string; result: ApplyEditsResult } {
  const $ = cheerio.load(input.html);
  const skipped: ApplyEditsResult["skipped"] = [];
  let appliedCount = 0;

  for (const edit of input.edits) {
    const value = input.values[edit.id];
    if (value === undefined) continue; // not edited, leave as-is

    let nodes: cheerio.Cheerio<any>;
    try {
      nodes = $(edit.selector);
    } catch {
      skipped.push({ id: edit.id, reason: `invalid selector "${edit.selector}"` });
      continue;
    }

    if (nodes.length === 0) {
      skipped.push({ id: edit.id, reason: `selector "${edit.selector}" matched no nodes` });
      continue;
    }
    // Take the first match — carve validation ensured uniqueness at carve time
    const node = nodes.first();

    switch (edit.kind) {
      case "text":
        node.text(value);
        appliedCount += 1;
        break;

      case "richtext":
        node.html(value);
        appliedCount += 1;
        break;

      case "image":
      case "url": {
        const attr = edit.attribute ?? (edit.kind === "image" ? "src" : "href");
        node.attr(attr, value);
        appliedCount += 1;
        break;
      }

      case "background-image": {
        // Embedded in style attribute — parse, patch the url(...), write back.
        const style = node.attr("style") ?? "";
        const newStyle = style.replace(/url\((['"]?)[^)'"]*\1\)/, `url("${value}")`);
        node.attr("style", newStyle);
        appliedCount += 1;
        break;
      }

      default:
        skipped.push({ id: edit.id, reason: `unsupported kind "${edit.kind}"` });
    }
  }

  return {
    html: $.html(),
    result: { appliedCount, skipped },
  };
}

export interface ApplyEditsToMapInput {
  /** route → source HTML (pre-edit). */
  pagesHtml: Map<string, string>;
  /** Carve map produced by carveAll. */
  carveMap: CarveMap;
  /** Flat dict of edit id → value. */
  values: EditsMap;
}

export interface ApplyEditsToMapResult {
  pages: Map<string, string>; // route → edited HTML
  summary: {
    totalApplied: number;
    totalSkipped: number;
    perPage: Array<{ route: string; applied: number; skipped: number }>;
    warnings: string[];
  };
}

/** Apply edits across every page; returns modified HTML per route. */
export function applyEditsAcrossPages(input: ApplyEditsToMapInput): ApplyEditsToMapResult {
  const pages = new Map<string, string>();
  const perPage: ApplyEditsToMapResult["summary"]["perPage"] = [];
  const warnings: string[] = [];
  let totalApplied = 0;
  let totalSkipped = 0;

  for (const carved of input.carveMap.pages) {
    const sourceHtml = input.pagesHtml.get(carved.route);
    if (!sourceHtml) {
      warnings.push(`No source HTML for carved page ${carved.route}`);
      continue;
    }

    const { html, result } = applyEditsToPage({
      html: sourceHtml,
      edits: carved.edits,
      values: input.values,
    });
    pages.set(carved.route, html);
    totalApplied += result.appliedCount;
    totalSkipped += result.skipped.length;
    perPage.push({ route: carved.route, applied: result.appliedCount, skipped: result.skipped.length });
    for (const s of result.skipped) warnings.push(`${carved.route}: ${s.id} skipped — ${s.reason}`);
  }

  return { pages, summary: { totalApplied, totalSkipped, perPage, warnings } };
}
