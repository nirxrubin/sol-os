#!/usr/bin/env tsx
/**
 * pnpm edit <tenant-slug> <editId> <value>
 * pnpm edit <tenant-slug> --list
 * pnpm edit <tenant-slug> --show
 *
 * Edits a tenant's .hostaposta/edits.json. The next `pnpm build` (or
 * `pnpm generate --no-carve`) applies the edits to the fossilized HTML.
 *
 * Usage:
 *   pnpm edit Guilda-main --list
 *     → prints every editable node from the carve map
 *   pnpm edit Guilda-main about_hero_headline "New headline"
 *     → sets that edit's value
 *   pnpm edit Guilda-main --show
 *     → prints the current edits.json contents
 */

import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

const TENANTS_DIR = path.join(repoRoot, ".tenants");

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0) {
    return usage();
  }

  const tenantSlug = args[0]!;
  const tenantDir = path.join(TENANTS_DIR, tenantSlug);
  const hostapostaDir = path.join(tenantDir, ".hostaposta");
  const carveMapPath = path.join(hostapostaDir, "carve-map.json");
  const editsPath = path.join(hostapostaDir, "edits.json");

  if (!(await fileExists(tenantDir))) {
    console.error(`[edit] tenant not found: ${tenantDir}`);
    console.error(`        generate it first: pnpm generate <caseId>`);
    process.exit(1);
    return;
  }

  if (args.includes("--list")) {
    return listEdits(carveMapPath, editsPath);
  }
  if (args.includes("--show")) {
    return showEdits(editsPath);
  }

  const editId = args[1];
  const value = args.slice(2).join(" ");
  if (!editId || value === "") {
    return usage();
  }

  // Validate editId against carve map
  if (!(await fileExists(carveMapPath))) {
    console.error(`[edit] no carve map at ${carveMapPath}`);
    console.error(`        run \`pnpm generate <caseId>\` first (it runs carve)`);
    process.exit(1);
    return;
  }
  const carveMap = JSON.parse(await fs.readFile(carveMapPath, "utf-8"));
  const allEditIds = new Set<string>();
  for (const p of carveMap.pages ?? []) {
    for (const e of p.edits ?? []) allEditIds.add(e.id);
  }
  if (!allEditIds.has(editId)) {
    console.error(`[edit] unknown editId: ${editId}`);
    console.error(`        list available ids: pnpm edit ${tenantSlug} --list`);
    process.exit(1);
    return;
  }

  // Load + update edits.json
  const current = (await fileExists(editsPath))
    ? JSON.parse(await fs.readFile(editsPath, "utf-8"))
    : {};
  current[editId] = value;
  await fs.writeFile(editsPath, JSON.stringify(current, null, 2));

  console.log(`[edit] ${tenantSlug}:${editId} → ${value.slice(0, 80)}${value.length > 80 ? "…" : ""}`);
  console.log(`[edit] re-run \`pnpm generate <caseId> --no-carve\` to apply (or \`pnpm build\` inside the tenant).`);
}

function usage(): void {
  console.error(
    "usage: pnpm edit <tenant-slug> <editId> <value>\n" +
    "       pnpm edit <tenant-slug> --list\n" +
    "       pnpm edit <tenant-slug> --show\n",
  );
  process.exit(1);
}

async function listEdits(carveMapPath: string, editsPath: string): Promise<void> {
  if (!(await fileExists(carveMapPath))) {
    console.error(`[edit] no carve map (run \`pnpm generate\` first)`);
    process.exit(1);
    return;
  }
  const carveMap = JSON.parse(await fs.readFile(carveMapPath, "utf-8"));
  const edits: Record<string, string> = (await fileExists(editsPath))
    ? JSON.parse(await fs.readFile(editsPath, "utf-8"))
    : {};

  for (const page of carveMap.pages ?? []) {
    console.log(`\n── ${page.route} (${page.edits?.length ?? 0} edits)`);
    for (const e of page.edits ?? []) {
      const label = e.label ? ` — ${e.label}` : "";
      const edited = edits[e.id] !== undefined ? "  [EDITED]" : "";
      console.log(`  ${pad(e.id, 40)}${pad(e.kind, 12)}${truncate(e.current, 60)}${label}${edited}`);
    }
  }
  console.log("");
}

async function showEdits(editsPath: string): Promise<void> {
  if (!(await fileExists(editsPath))) {
    console.log("(no edits)");
    return;
  }
  const edits = JSON.parse(await fs.readFile(editsPath, "utf-8"));
  const entries = Object.entries(edits);
  if (entries.length === 0) {
    console.log("(no edits)");
    return;
  }
  for (const [id, value] of entries) {
    console.log(`${pad(id, 40)} → ${truncate(String(value), 80)}`);
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function pad(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n);
}

function truncate(s: string, n: number): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

main().catch((err) => {
  console.error("[hp-edit] fatal:", err);
  process.exit(1);
});
