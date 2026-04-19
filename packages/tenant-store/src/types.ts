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
}
