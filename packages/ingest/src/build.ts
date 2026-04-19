/**
 * Build orchestration — port of hp-server/src/analyze/build.ts adapted for
 * the new "build to parse, not build to deploy" use case.
 *
 * Key differences from the hp-server version:
 *  - No preview-base patching (basename injection). The output is for parsing,
 *    not for serving from /preview/.
 *  - No router patching for SPA fallback. We only need the build artifact.
 *  - Same install/build/timeout/output-discovery logic (battle-tested).
 *
 * Future: Build Repair agent integrates here on failure (see
 * .agents/skills/build-repair/).
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ArchetypeDefinition } from "./archetype.js";

const execAsync = promisify(exec);

export interface BuildResult {
  attempted: boolean;
  success: boolean;
  /** Absolute path to the built static output (containing index.html). */
  outputPath?: string;
  durationMs?: number;
  output?: string;
  error?: string;
}

const FALLBACK_OUTPUT_DIRS = ["dist", "build", "out", ".next/out", "public"];

export async function buildProject(
  projectRoot: string,
  archetype: ArchetypeDefinition,
): Promise<BuildResult> {
  if (archetype.build.command === "none") {
    // Static HTML — no build, project root IS the serve path
    return { attempted: false, success: true, outputPath: projectRoot };
  }

  // Patch Next.js for static export so we get a parseable out/ directory
  if (archetype.id === "nextjs-app-router" || archetype.id === "nextjs-pages-router") {
    await patchNextConfigForStaticExport(projectRoot);
  }

  const startTime = Date.now();

  try {
    // Install
    await execAsync("npm install --legacy-peer-deps", {
      cwd: projectRoot,
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: "development" },
    });

    // Build
    const buildResult = await execAsync(archetype.build.command, {
      cwd: projectRoot,
      timeout: 240_000,
      env: { ...process.env, NODE_ENV: "production", CI: "true" },
    });

    const durationMs = Date.now() - startTime;

    // Find the output
    const expected = archetype.build.outputDir === "."
      ? projectRoot
      : path.join(projectRoot, archetype.build.outputDir);

    if (existsSync(path.join(expected, "index.html"))) {
      return {
        attempted: true,
        success: true,
        outputPath: expected,
        durationMs,
        output: buildResult.stdout.slice(-500),
      };
    }

    for (const alt of FALLBACK_OUTPUT_DIRS) {
      const altPath = path.join(projectRoot, alt);
      if (existsSync(path.join(altPath, "index.html"))) {
        return {
          attempted: true,
          success: true,
          outputPath: altPath,
          durationMs,
          output: buildResult.stdout.slice(-500),
        };
      }
    }

    return {
      attempted: true,
      success: false,
      durationMs,
      output: buildResult.stdout.slice(-500),
      error: `Build completed but no index.html found (looked in ${archetype.build.outputDir}/, ${FALLBACK_OUTPUT_DIRS.join("/, ")}/)`,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const e = err as { stderr?: string; message?: string };
    const error = (e.stderr || e.message || String(err)).slice(0, 2000);
    return { attempted: true, success: false, durationMs, error };
  }
}

/**
 * Patch next.config.{ts,js,mjs} to force static export. Without
 * `output: "export"`, Next.js produces .next/ which requires a server.
 *
 * Lifted nearly verbatim from hp-server/src/analyze/build.ts —
 * battle-tested.
 */
async function patchNextConfigForStaticExport(projectRoot: string): Promise<void> {
  const candidates = ["next.config.ts", "next.config.mts", "next.config.js", "next.config.mjs"];
  for (const name of candidates) {
    const configPath = path.join(projectRoot, name);
    if (!existsSync(configPath)) continue;
    let content: string;
    try {
      content = await fs.readFile(configPath, "utf-8");
    } catch {
      return;
    }

    if (content.includes("output: 'export'") || content.includes('output: "export"')) return;

    const stripped = content
      .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, "")
      .replace(/,(\s*,)+/g, ",")
      .replace(/\{(\s*,)/g, "{")
      .trim();

    let patched = stripped.replace(
      /(\bconst\s+\w+\s*(?::\s*\w+\s*)?=\s*\{|export\s+default\s+\{)([\s\S]*?)(\})\s*;?\s*$/m,
      (_match, open, inner, close) => {
        const additions: string[] = [];
        if (!inner.includes("output")) additions.push("  output: 'export'");
        if (!inner.includes("images")) additions.push("  images: { unoptimized: true }");
        if (additions.length === 0) return _match;
        const cleanInner = inner.replace(/^\s*,/, "").trimEnd();
        const sep = cleanInner.endsWith(",") || cleanInner.trim() === "" ? "\n" : ",\n";
        return open + cleanInner + sep + additions.join(",\n") + ",\n" + close + ";";
      },
    );

    if (patched === content) {
      patched = content.replace(
        /nextConfig\s*=\s*\{/,
        "nextConfig = {\n  output: 'export',\n  images: { unoptimized: true },",
      );
    }

    if (patched !== content) {
      await fs.writeFile(configPath, patched);
    }
    return;
  }
}
