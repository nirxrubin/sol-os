/**
 * TenantStore — the abstraction layer between everything editorial
 * (admin UI, API, edit CLI) and the underlying persistence (file system
 * today, Payload + R2 tomorrow).
 *
 * Design goals:
 *  - Same interface backs FileTenantStore (today) and PayloadTenantStore (later).
 *  - Per-tenant scoping is explicit in every method signature — no global state.
 *  - Returns plain data (not FS paths, not Payload records) so the
 *    upstream consumer doesn't care about the backend.
 */

import type { CarveMap, EditsMap } from "@hostaposta/generate";

export interface TenantInfo {
  /** Filesystem slug / Payload tenantId — stable identifier. */
  slug: string;
  /** Human-readable site name (from tenant-data.ts). */
  siteName: string;
  /** Language / direction so admin can render correctly. */
  lang: string;
  dir: "ltr" | "rtl";
  /** Route list from the carve map, in file order. */
  routes: string[];
  /** Convenience flags for the dashboard. */
  hasCarveMap: boolean;
  hasEdits: boolean;
}

export interface PageInfo {
  route: string;
  /** Total edit points on this page. */
  totalEdits: number;
  /** How many of those have been edited. */
  editedCount: number;
}

export interface PageDetail {
  route: string;
  title?: string;
  /** All edit points from the carve map for this page. */
  edits: Array<{
    id: string;
    kind: string;
    label?: string;
    current: string;
    /** CSS selector — the on-canvas editor uses this to locate the DOM node. */
    selector: string;
    /** For image/url/link kinds: which attribute the editor should patch. */
    attribute?: string;
    /** The live value (from edits.json) or null if unedited. */
    value: string | null;
  }>;
  notes: string[];
}

export interface RebuildResult {
  ok: boolean;
  durationMs: number;
  /** Stdout/stderr tail, truncated. */
  log?: string;
  error?: string;
}

export interface MediaAsset {
  /** URL served by the tenant (rooted at /). */
  url: string;
  /** Filename only. */
  filename: string;
  /** Size on disk, bytes. */
  bytes: number;
  /** Best-effort kind tag. */
  kind: "image" | "video" | "font" | "other";
  /** True if uploaded via admin; false if copied from the source during fossilize. */
  uploaded: boolean;
}

export interface UploadMediaInput {
  filename: string;
  /** Raw file bytes. */
  data: Buffer;
  /** Content type (image/png, image/jpeg, etc.). */
  contentType: string;
}

export interface UploadMediaResult {
  asset: MediaAsset;
  /** Compression metadata for images. */
  compression?: {
    originalBytes: number;
    outputBytes: number;
    format: string;
    width: number;
    height: number;
  };
}

export interface TenantStore {
  listTenants(): Promise<TenantInfo[]>;
  getTenant(slug: string): Promise<TenantInfo | null>;

  getCarveMap(slug: string): Promise<CarveMap | null>;
  getEdits(slug: string): Promise<EditsMap>;

  /** Merge edits into the tenant's edits.json. Replaces values at provided ids. */
  setEdits(slug: string, patch: EditsMap): Promise<void>;
  /** Remove an edit (reverts to source value). */
  clearEdit(slug: string, editId: string): Promise<void>;

  /** Helpers for the page editor. */
  listPages(slug: string): Promise<PageInfo[]>;
  getPage(slug: string, route: string): Promise<PageDetail | null>;

  /** Trigger `apply-edits + build` for this tenant. Backend chooses how. */
  rebuild(slug: string): Promise<RebuildResult>;

  /** List all assets available to the tenant (source-originated + uploaded). */
  listMedia(slug: string): Promise<MediaAsset[]>;

  /** Upload a new asset. Images get compressed to reasonable web delivery sizes. */
  uploadMedia(slug: string, input: UploadMediaInput): Promise<UploadMediaResult>;

  /** Return the tenant's collections (blog, testimonial, team, service) —
   *  sourced from src/data/tenant-data.ts with any admin overlay merged in. */
  getCollections(slug: string): Promise<TenantCollections>;

  /** Patch a single collection entry. Entry is matched by its `slug` field.
   *  Patch is shallow-merged on top of the base entry via the overlay file
   *  (.hostaposta/collection-edits.json) — tenant-data.ts is never touched. */
  updateCollectionEntry(
    slug: string,
    kind: CollectionKind,
    entrySlug: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** Per-page SEO / head metadata overrides. Stored in .hostaposta/meta.json. */
  getPageMeta(slug: string, route: string): Promise<PageMeta>;
  setPageMeta(slug: string, route: string, meta: PageMeta): Promise<void>;
}

export interface TenantCollections {
  blog: Array<Record<string, unknown>>;
  testimonial: Array<Record<string, unknown>>;
  team: Array<Record<string, unknown>>;
  service: Array<Record<string, unknown>>;
  product: Array<Record<string, unknown>>;
}

export type CollectionKind = "blog" | "testimonial" | "team" | "service" | "product";

/**
 * Per-page SEO / head-injection metadata. Stored separately from the
 * carved editable fields because these target the document head, not
 * body content — they don't have a DOM selector on the page.
 *
 * All fields optional — any missing field falls back to the fossilized
 * source <head>. Applied by apply-edits when present.
 */
export interface PageMeta {
  /** <title> text. */
  title?: string;
  /** <meta name="description"> content. */
  description?: string;
  /** Open Graph image URL (absolute or /rooted). */
  ogImage?: string;
  /** Full JSON-LD object for <script type="application/ld+json">. */
  schema?: unknown;
}
