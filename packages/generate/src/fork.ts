/**
 * Fork the site-starter template into a tenant directory.
 *
 * Preserves across regenerations:
 *   • node_modules — installing is slow
 *   • .hostaposta/ — carve map + edits (client's work; must not clobber)
 *
 * Everything else in tenantDir is wiped + rewritten from the template.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".astro", ".hostaposta"]);

export async function forkTemplate(
  templateDir: string,
  tenantDir: string,
  log: (msg: string) => void = () => {},
): Promise<void> {
  const preserveDirs = ["node_modules", ".hostaposta"];
  const stash = path.join(path.dirname(tenantDir), `__stash__${path.basename(tenantDir)}`);

  // Stash dirs we want to preserve, outside the tenant dir, before wiping it.
  const preserved: Array<{ name: string; stashedAt: string }> = [];
  for (const name of preserveDirs) {
    const src = path.join(tenantDir, name);
    if (existsSync(src)) {
      await fs.mkdir(stash, { recursive: true });
      const dest = path.join(stash, name);
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(src, dest);
      preserved.push({ name, stashedAt: dest });
    }
  }
  if (preserved.length > 0) {
    log(`preserving: ${preserved.map((p) => p.name).join(", ")}`);
  }

  // Wipe + recreate tenant dir
  await fs.rm(tenantDir, { recursive: true, force: true });
  await fs.mkdir(tenantDir, { recursive: true });

  log(`copying template → ${tenantDir}`);
  await copyDir(templateDir, tenantDir);

  // Restore preserved dirs
  for (const p of preserved) {
    await fs.rename(p.stashedAt, path.join(tenantDir, p.name));
  }
  if (preserved.length > 0) {
    log(`restored: ${preserved.map((p) => p.name).join(", ")}`);
  }
  // Clean up empty stash dir
  try {
    await fs.rmdir(stash);
  } catch {
    /* stash may still have lingering siblings; ignore */
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sp, dp);
    } else {
      await fs.copyFile(sp, dp);
    }
  }
}
