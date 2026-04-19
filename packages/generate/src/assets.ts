/**
 * Copy referenced assets (images/videos/fonts) from the source workspace
 * into the tenant's `public/` dir + return a remap from source URL → new
 * tenant-served path. Generated block data gets rewritten via the remap.
 *
 * Rules:
 *  - External URLs (http://, https://, data:) — skipped, left as-is
 *  - Rooted paths (starting with /) — copied preserving the path
 *  - Relative paths (assets/images/X.svg) — copied to /<original path>
 *  - Missing files on disk — left in place with a warning (template renders
 *    a broken image rather than crashing)
 *
 * The generator walks the IngestionResult.assets list (already populated
 * by the parser) and everything referenced there gets copied if we can
 * resolve it on disk.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { IngestionResult } from "@hostaposta/ingest";

export interface AssetCopyResult {
  /** Map from original URL (as seen in source) → new path (served from tenant). */
  remap: Map<string, string>;
  copied: Array<{ from: string; to: string; bytes: number }>;
  skipped: Array<{ url: string; reason: string }>;
}

export interface AssetCopyOptions {
  /** Full ingestion result — source of the asset list + paths. */
  ingestion: IngestionResult;
  /** Root of the source build output (where relative paths resolve from). */
  sourceBuildRoot: string;
  /** Tenant directory — assets land in <tenantDir>/public/. */
  tenantDir: string;
  log?: (msg: string) => void;
}

export async function copyAssets(opts: AssetCopyOptions): Promise<AssetCopyResult> {
  const log = opts.log ?? (() => {});
  const result: AssetCopyResult = {
    remap: new Map(),
    copied: [],
    skipped: [],
  };

  const publicDir = path.join(opts.tenantDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  for (const asset of opts.ingestion.assets) {
    const url = asset.url;

    // External / data URLs — nothing to copy, nothing to remap.
    if (/^(https?:|data:|\/\/)/.test(url)) {
      result.skipped.push({ url, reason: "external or data URL" });
      continue;
    }

    // Resolve the source path. Prefer the parser's localPath; otherwise
    // treat the url as relative to the source build root.
    const cleanUrl = url.replace(/^\/+/, "");
    const sourcePath = asset.localPath ?? path.join(opts.sourceBuildRoot, cleanUrl);

    if (!existsSync(sourcePath)) {
      result.skipped.push({ url, reason: `source file not found: ${sourcePath}` });
      continue;
    }

    // Destination: mirror the source path under public/, always rooted.
    const destRelative = cleanUrl;
    const destPath = path.join(publicDir, destRelative);
    const servedPath = "/" + destRelative;

    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(sourcePath, destPath);
      const stat = await fs.stat(destPath);
      result.copied.push({ from: sourcePath, to: destPath, bytes: stat.size });
      result.remap.set(url, servedPath);
    } catch (err) {
      result.skipped.push({ url, reason: `copy failed: ${(err as Error).message}` });
    }
  }

  log(`copied ${result.copied.length} assets, skipped ${result.skipped.length}`);
  return result;
}

/**
 * Apply an asset-path remap to any string field on any block/collection.
 * Walks the object tree in-place and rewrites values that match remap keys.
 */
export function applyAssetRemap<T>(value: T, remap: Map<string, string>): T {
  if (remap.size === 0) return value;
  return walk(value, remap) as T;
}

function walk(value: unknown, remap: Map<string, string>): unknown {
  if (typeof value === "string") {
    const mapped = remap.get(value);
    return mapped ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, remap));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v, remap);
    }
    return out;
  }
  return value;
}
