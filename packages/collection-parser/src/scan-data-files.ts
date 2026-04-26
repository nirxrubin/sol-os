/**
 * Static-data-file scanner.
 *
 * Many tool-generated sites store their CMS-like content in a plain JS/JSON
 * file that's fetched at runtime (Guilda: `public/assets/js/data.js` with a
 * `blogPosts` array; other Lovable/Bolt sites do similar). The DOM-based
 * collection detector can't see this data because the page ships an empty
 * container that's populated client-side — headless rendering often races
 * the fetch or hits a framework quirk and produces an empty grid.
 *
 * This scanner walks the ingested source/build tree for small `.js`, `.mjs`,
 * `.ts`, `.json` files and extracts any top-level array-of-objects whose
 * shape matches a known collection (blog, testimonial, team, service) using
 * field heuristics.
 *
 * AST parse via acorn — we never `eval`. A small safe evaluator handles the
 * subset of literal expressions that data files actually use:
 *   - Literal, TemplateLiteral (no interpolation)
 *   - ObjectExpression, ArrayExpression, SpreadElement
 *   - UnaryExpression (+, -)
 *   - Identifier → looked up in a binding table of earlier top-level consts
 * Anything fancier (function calls, computed keys) makes the evaluator bail
 * on that subtree and leave it out.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse as babelParse } from "@babel/parser";
import type { ExtractedEntry } from "./types.js";

export type CollectionKind = "blog" | "testimonial" | "team" | "service" | "product";

export type ScannedEntryMap = Partial<Record<CollectionKind, ExtractedEntry[]>>;

export interface ScannedCollections {
  entries: ScannedEntryMap;
  /** Paths scanned (relative to rootDir). */
  filesScanned: string[];
  /** Paths that yielded entries. */
  filesHit: string[];
  warnings: string[];
}

/** Cap the work: don't walk forever on huge trees. */
const MAX_FILES = 500;
const MAX_FILE_BYTES = 400 * 1024; // 400 KB — enough for CMS JSON, small enough to skip bundles
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".astro",
  ".svelte-kit",
  ".parcel-cache",
  ".turbo",
  "dist",
  "build",
  "out",
  ".output",
  ".vercel",
  "coverage",
]);
/** File patterns that are never data files (runtime code / framework bundles). */
const SKIP_FILE_RE = /\.(min|bundle|runtime|chunk|vendor|polyfill|framework)\./i;

export async function scanDataFilesForCollections(rootDir: string): Promise<ScannedCollections> {
  const out: ScannedCollections = {
    entries: {},
    filesScanned: [],
    filesHit: [],
    warnings: [],
  };

  const files = await walk(rootDir);
  for (const abs of files) {
    const rel = path.relative(rootDir, abs);
    const ext = path.extname(abs).toLowerCase();
    if (![".js", ".mjs", ".ts", ".tsx", ".jsx", ".json"].includes(ext)) continue;
    if (SKIP_FILE_RE.test(path.basename(abs))) continue;
    let stat;
    try { stat = await fs.stat(abs); } catch { continue; }
    if (stat.size > MAX_FILE_BYTES) continue;
    out.filesScanned.push(rel);

    let raw: string;
    try { raw = await fs.readFile(abs, "utf-8"); } catch { continue; }

    const arrays = ext === ".json" ? extractArraysFromJson(raw) : extractArraysFromJs(raw);
    if (arrays.length === 0) continue;

    let hit = false;
    for (const { name, items } of arrays) {
      if (!Array.isArray(items) || items.length < 2) continue;
      const kind = classifyArrayShape(name, items);
      if (!kind) continue;
      const normalized = items
        .filter((raw): raw is Record<string, unknown> => raw !== null && typeof raw === "object" && !Array.isArray(raw))
        .map((raw) => normalizeEntry(kind, raw));
      const bucket = (out.entries[kind] ||= []);
      for (const data of normalized) {
        bucket.push({
          data,
          sourceProvenance: { sourceUrl: rel, domPath: `${name}[]` },
          confidence: 0.9,
        });
      }
      hit = true;
    }
    if (hit) out.filesHit.push(rel);
  }
  return out;
}

async function walk(root: string): Promise<string[]> {
  const results: string[] = [];
  const queue: string[] = [root];
  while (queue.length && results.length < MAX_FILES) {
    const dir = queue.shift()!;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith(".") && SKIP_DIRS.has(e.name)) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) queue.push(abs);
      else if (e.isFile()) results.push(abs);
      if (results.length >= MAX_FILES) break;
    }
  }
  return results;
}

// ── JSON fast path ──────────────────────────────────────────────────────

function extractArraysFromJson(raw: string): Array<{ name: string; items: unknown[] }> {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const out: Array<{ name: string; items: unknown[] }> = [];
  if (Array.isArray(data)) {
    out.push({ name: "(root)", items: data });
  } else if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) out.push({ name: key, items: value });
    }
  }
  return out;
}

// ── JS / MJS / TS path via acorn ────────────────────────────────────────

interface Binding { value: unknown; }

function extractArraysFromJs(raw: string): Array<{ name: string; items: unknown[] }> {
  // @babel/parser with the `estree` plugin emits ESTree-compatible nodes
  // (Literal, Property) so one evaluator handles JS, TS, JSX, TSX uniformly.
  let ast;
  try {
    ast = babelParse(raw, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: ["estree", "typescript", "jsx"],
    });
  } catch {
    try {
      ast = babelParse(raw, {
        sourceType: "script",
        allowReturnOutsideFunction: true,
        errorRecovery: true,
        plugins: ["estree", "typescript", "jsx"],
      });
    } catch {
      return [];
    }
  }
  const bindings = new Map<string, Binding>();
  const out: Array<{ name: string; items: unknown[] }> = [];
  const body = ((ast as unknown as { program?: { body: unknown[] } }).program?.body
    ?? (ast as unknown as { body: unknown[] }).body
    ?? []) as Array<Record<string, unknown>>;
  for (const stmt of body) {
    visitTopLevel(stmt, bindings, out);
  }
  return out;
}

function visitTopLevel(
  stmt: Record<string, unknown>,
  bindings: Map<string, Binding>,
  out: Array<{ name: string; items: unknown[] }>,
): void {
  // `const X = …;` / `let X = …;` / `var X = …;`
  if (stmt.type === "VariableDeclaration") {
    const decls = (stmt as { declarations: Array<Record<string, unknown>> }).declarations;
    for (const d of decls) captureDeclarator(d, bindings, out);
    return;
  }
  // `export const X = …;` / `export default X`
  if (stmt.type === "ExportNamedDeclaration") {
    const inner = (stmt as { declaration?: Record<string, unknown> }).declaration;
    if (inner && inner.type === "VariableDeclaration") {
      for (const d of (inner as { declarations: Array<Record<string, unknown>> }).declarations) {
        captureDeclarator(d, bindings, out);
      }
    }
    return;
  }
  // `module.exports = { blogPosts, testimonials }` — recognize object literal at RHS.
  if (stmt.type === "ExpressionStatement") {
    const expr = (stmt as { expression: Record<string, unknown> }).expression;
    if (expr && expr.type === "AssignmentExpression") {
      const a = expr as { left: Record<string, unknown>; right: Record<string, unknown> };
      if (isModuleExports(a.left) && a.right.type === "ObjectExpression") {
        const props = (a.right as { properties: Array<Record<string, unknown>> }).properties;
        for (const p of props) {
          if (p.type !== "Property") continue;
          const keyName = propertyKeyName(p);
          if (!keyName) continue;
          const value = evalNode((p as { value: Record<string, unknown> }).value, bindings);
          if (Array.isArray(value)) out.push({ name: keyName, items: value });
        }
      }
    }
    return;
  }
}

function captureDeclarator(
  d: Record<string, unknown>,
  bindings: Map<string, Binding>,
  out: Array<{ name: string; items: unknown[] }>,
): void {
  const id = d.id as Record<string, unknown> | undefined;
  const init = d.init as Record<string, unknown> | undefined;
  if (!id || !init || id.type !== "Identifier") return;
  const name = (id as { name: string }).name;
  const value = evalNode(init, bindings);
  if (value !== KBAIL) {
    bindings.set(name, { value });
    if (Array.isArray(value)) out.push({ name, items: value });
  }
}

function isModuleExports(node: Record<string, unknown>): boolean {
  if (node.type === "Identifier") return (node as { name: string }).name === "exports";
  if (node.type === "MemberExpression") {
    const obj = (node as { object: Record<string, unknown> }).object;
    const prop = (node as { property: Record<string, unknown> }).property;
    const objName = obj?.type === "Identifier" ? (obj as { name: string }).name : undefined;
    const propName = prop?.type === "Identifier" ? (prop as { name: string }).name : undefined;
    return objName === "module" && propName === "exports";
  }
  return false;
}

function propertyKeyName(p: Record<string, unknown>): string | undefined {
  const key = (p as { key: Record<string, unknown>; computed?: boolean });
  if (key.computed) return undefined;
  const k = key.key;
  if (k.type === "Identifier") return (k as { name: string }).name;
  if (k.type === "Literal" && typeof (k as { value: unknown }).value === "string") {
    return (k as { value: string }).value;
  }
  return undefined;
}

// ── Safe evaluator ──────────────────────────────────────────────────────

/** Sentinel — the evaluator bails on an unsupported subtree. */
const KBAIL = Symbol("bail");

function evalNode(node: Record<string, unknown>, bindings: Map<string, Binding>): unknown {
  if (!node || typeof node !== "object") return KBAIL;
  switch (node.type) {
    case "Literal":
      return (node as { value: unknown }).value;
    case "TemplateLiteral": {
      const n = node as {
        quasis: Array<{ value: { cooked?: string; raw: string } }>;
        expressions: unknown[];
      };
      if (n.expressions.length !== 0) return KBAIL;
      return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
    }
    case "UnaryExpression": {
      const n = node as { operator: string; argument: Record<string, unknown> };
      const v = evalNode(n.argument, bindings);
      if (v === KBAIL || typeof v !== "number") return KBAIL;
      if (n.operator === "-") return -v;
      if (n.operator === "+") return +v;
      return KBAIL;
    }
    case "Identifier": {
      const name = (node as { name: string }).name;
      if (name === "undefined") return undefined;
      if (name === "null") return null;
      const b = bindings.get(name);
      return b ? b.value : KBAIL;
    }
    case "ArrayExpression": {
      const elements = (node as { elements: Array<Record<string, unknown> | null> }).elements;
      const out: unknown[] = [];
      for (const el of elements) {
        if (el === null) { out.push(null); continue; }
        if (el.type === "SpreadElement") {
          const v = evalNode((el as { argument: Record<string, unknown> }).argument, bindings);
          if (Array.isArray(v)) out.push(...v);
          // else: bail silently on this element
          continue;
        }
        const v = evalNode(el, bindings);
        if (v === KBAIL) continue; // skip unsupported elements rather than failing whole array
        out.push(v);
      }
      return out;
    }
    case "ObjectExpression": {
      const props = (node as { properties: Array<Record<string, unknown>> }).properties;
      const obj: Record<string, unknown> = {};
      for (const p of props) {
        if (p.type === "SpreadElement") {
          const v = evalNode((p as { argument: Record<string, unknown> }).argument, bindings);
          if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(obj, v);
          continue;
        }
        if (p.type !== "Property") continue;
        const key = propertyKeyName(p);
        if (!key) continue;
        const valNode = (p as { value: Record<string, unknown> }).value;
        const v = evalNode(valNode, bindings);
        if (v === KBAIL) continue;
        obj[key] = v;
      }
      return obj;
    }
    default:
      return KBAIL;
  }
}

// ── Shape classification ────────────────────────────────────────────────

/**
 * Decide which collection kind an array-of-objects represents, if any. Uses
 * field-name heuristics across enough entries that one oddball doesn't skew
 * the result. Returns `null` when the shape doesn't match anything we model.
 */
export function classifyArrayShape(name: string, items: unknown[]): CollectionKind | null {
  const objects = items.filter((i): i is Record<string, unknown> => i !== null && typeof i === "object" && !Array.isArray(i));
  if (objects.length < 2) return null;

  const keyCounts = new Map<string, number>();
  for (const o of objects) {
    for (const k of Object.keys(o)) {
      keyCounts.set(k.toLowerCase(), (keyCounts.get(k.toLowerCase()) ?? 0) + 1);
    }
  }
  const threshold = Math.max(1, Math.floor(objects.length * 0.5));
  const has = (...aliases: string[]) =>
    aliases.some((a) => (keyCounts.get(a) ?? 0) >= threshold);

  const nameLower = name.toLowerCase();

  // Strong signal from variable name, verified with field shape.
  if (/(blog|posts|articles|news|journal)/.test(nameLower) && has("title") && has("date", "publishdate", "publisheddate", "published")) {
    return "blog";
  }
  if (/(testimonial|review|quote)/.test(nameLower) && has("quote", "text", "review", "body") && has("name", "author", "customer", "client")) {
    return "testimonial";
  }
  if (/(team|staff|members|people|founders)/.test(nameLower) && has("name") && has("role", "title", "position", "bio")) {
    return "team";
  }
  // Products: strong signal from variable name + price-or-image shape.
  // Checked before "service" so a `products` array with {name, price, image}
  // (no description/features/pricing) goes to product, not service.
  if (/(products|items|shop|store|catalog)/.test(nameLower) && has("name", "title") && has("price", "image", "photo", "thumbnail")) {
    return "product";
  }
  if (/(services|plans|pricing|offerings)/.test(nameLower) && has("name", "title") && has("description", "features", "price", "pricing", "icon")) {
    return "service";
  }

  // Shape-only fallback (no hint from variable name).
  if (has("title") && (has("excerpt") || has("content") || has("body")) && (has("date") || has("publishdate") || has("author"))) {
    return "blog";
  }
  if ((has("quote") || has("review")) && (has("name") || has("author"))) {
    return "testimonial";
  }
  if (has("name") && has("role") && objects.length >= 2) {
    return "team";
  }
  if ((has("name") || has("title")) && has("price") && (has("image") || has("photo") || has("thumbnail") || has("category"))) {
    return "product";
  }
  if ((has("name") || has("title")) && (has("features") || has("pricing")) && has("description")) {
    return "service";
  }
  return null;
}

// ── Normalization ───────────────────────────────────────────────────────

/**
 * Coerce a scanned object into the canonical field set used by tenant-data
 * collections. We keep unknown fields through so nothing is lost — the admin
 * can surface them in the collection editor.
 */
function normalizeEntry(kind: CollectionKind, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  switch (kind) {
    case "blog": {
      const title = asString(raw.title) ?? asString(raw.name) ?? "";
      out.title = title;
      if (raw.author !== undefined) out.author = asString(raw.author) ?? raw.author;
      const date = asString(raw.publishDate) ?? asString(raw.date) ?? asString(raw.published);
      if (date) out.publishDate = date;
      if (raw.excerpt !== undefined) out.excerpt = asString(raw.excerpt) ?? raw.excerpt;
      const bodyLike = raw.content ?? raw.body ?? raw.html;
      if (bodyLike !== undefined) out.body = stringifyContent(bodyLike);
      const hero = asString(raw.heroImage) ?? asString(raw.image) ?? asString(raw.cover) ?? asString(raw.thumbnail);
      if (hero) out.heroImage = hero;
      if (raw.category !== undefined) out.category = asString(raw.category) ?? raw.category;
      break;
    }
    case "testimonial": {
      const quote = asString(raw.quote) ?? asString(raw.text) ?? asString(raw.review) ?? asString(raw.body) ?? "";
      out.quote = quote;
      const name = asString(raw.name) ?? asString(raw.author) ?? asString(raw.customer) ?? asString(raw.client) ?? "";
      out.name = name;
      if (raw.role !== undefined) out.role = asString(raw.role) ?? raw.role;
      if (raw.company !== undefined) out.company = asString(raw.company) ?? raw.company;
      const photo = asString(raw.photo) ?? asString(raw.image) ?? asString(raw.avatar);
      if (photo) out.photo = photo;
      break;
    }
    case "team": {
      out.name = asString(raw.name) ?? "";
      if (raw.role !== undefined) out.role = asString(raw.role) ?? asString(raw.title) ?? asString(raw.position) ?? "";
      else if (raw.title) out.role = asString(raw.title);
      else if (raw.position) out.role = asString(raw.position);
      if (raw.bio !== undefined) out.bio = asString(raw.bio) ?? raw.bio;
      const photo = asString(raw.photo) ?? asString(raw.image) ?? asString(raw.avatar);
      if (photo) out.photo = photo;
      break;
    }
    case "service": {
      out.name = asString(raw.name) ?? asString(raw.title) ?? "";
      if (raw.description !== undefined) out.description = asString(raw.description) ?? raw.description;
      if (raw.icon !== undefined) out.icon = asString(raw.icon) ?? raw.icon;
      if (Array.isArray(raw.features)) out.features = raw.features;
      if (Array.isArray(raw.pricing)) out.pricing = raw.pricing;
      break;
    }
    case "product": {
      out.name = asString(raw.name) ?? asString(raw.title) ?? "";
      if (raw.price !== undefined) out.price = raw.price;
      if (raw.currency !== undefined) out.currency = asString(raw.currency) ?? raw.currency;
      const img = asString(raw.image) ?? asString(raw.photo) ?? asString(raw.thumbnail) ?? asString(raw.cover);
      if (img) out.image = img;
      if (raw.description !== undefined) out.description = asString(raw.description) ?? raw.description;
      if (raw.category !== undefined) out.category = asString(raw.category) ?? raw.category;
      if (raw.inStock !== undefined) out.inStock = raw.inStock;
      if (Array.isArray(raw.features)) out.features = raw.features;
      break;
    }
  }

  // Pass through any other scalar fields so nothing is lost.
  for (const [k, v] of Object.entries(raw)) {
    if (k in out) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
  }

  // Slug last — keyed off canonical output fields so per-kind identity works.
  // Falling back to `raw.title`/`raw.name` alone lost testimonials whose source
  // field is `author`: all 20 entries collapsed to `slug: "entry"` and the
  // pre-dedupe in index.ts dropped 19 before the real validator ran.
  out.slug =
    asString(raw.slug) ??
    asString(raw.id) ??
    slugify(slugSeed(kind, out, raw) ?? "entry");

  return out;
}

function slugSeed(
  kind: CollectionKind,
  out: Record<string, unknown>,
  raw: Record<string, unknown>,
): string | undefined {
  switch (kind) {
    case "blog":
      return asString(out.title) ?? asString(raw.title) ?? asString(raw.name);
    case "testimonial": {
      const who = asString(out.name) ?? asString(raw.author) ?? asString(raw.customer) ?? asString(raw.client);
      const quote = asString(out.quote);
      if (who && quote) return `${who}-${quote.slice(0, 40)}`;
      return who ?? quote;
    }
    case "team":
      return asString(out.name) ?? asString(raw.name);
    case "service":
    case "product":
      return asString(out.name) ?? asString(raw.name) ?? asString(raw.title);
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `entry-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Flatten structured "content" arrays (Guilda-style: `[{heading,text}, {text}]`)
 * into a single HTML-ish string. Plain strings pass through.
 */
function stringifyContent(v: unknown): string {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  const parts: string[] = [];
  for (const block of v) {
    if (typeof block === "string") { parts.push(`<p>${block}</p>`); continue; }
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (typeof b.heading === "string") parts.push(`<h2>${b.heading}</h2>`);
      if (typeof b.text === "string") parts.push(`<p>${b.text}</p>`);
      else if (typeof b.html === "string") parts.push(b.html);
    }
  }
  return parts.join("\n");
}
