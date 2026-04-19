/**
 * Archetype + Generator detection — adapted from
 * hp-server/src/analyze/archetypes.ts. Pure data + signal-based detection;
 * no filesystem mutation.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ArchetypeId, GeneratorId } from "./types.js";

export interface ArchetypeDefinition {
  id: ArchetypeId;
  displayName: string;
  build: {
    command: "npm run build" | "none";
    outputDir: string;
  };
  routing: "react-router" | "vue-router" | "file-based" | "hash" | "none";
  needsBackend: boolean;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDefinition> = {
  "nextjs-app-router": {
    id: "nextjs-app-router",
    displayName: "Next.js (App Router)",
    build: { command: "npm run build", outputDir: "out" },
    routing: "file-based",
    needsBackend: true,
  },
  "nextjs-pages-router": {
    id: "nextjs-pages-router",
    displayName: "Next.js (Pages Router)",
    build: { command: "npm run build", outputDir: "out" },
    routing: "file-based",
    needsBackend: true,
  },
  "vite-react": {
    id: "vite-react",
    displayName: "Vite + React",
    build: { command: "npm run build", outputDir: "dist" },
    routing: "react-router",
    needsBackend: false,
  },
  "vite-vue": {
    id: "vite-vue",
    displayName: "Vite + Vue",
    build: { command: "npm run build", outputDir: "dist" },
    routing: "vue-router",
    needsBackend: false,
  },
  astro: {
    id: "astro",
    displayName: "Astro",
    build: { command: "npm run build", outputDir: "dist" },
    routing: "file-based",
    needsBackend: false,
  },
  cra: {
    id: "cra",
    displayName: "Create React App",
    build: { command: "npm run build", outputDir: "build" },
    routing: "react-router",
    needsBackend: false,
  },
  "vanilla-html": {
    id: "vanilla-html",
    displayName: "Static HTML",
    build: { command: "none", outputDir: "." },
    routing: "none",
    needsBackend: false,
  },
  unknown: {
    id: "unknown",
    displayName: "Unknown",
    build: { command: "npm run build", outputDir: "dist" },
    routing: "none",
    needsBackend: false,
  },
};

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectionResult {
  archetype: ArchetypeId;
  archetypeConfidence: number;
  generator: GeneratorId;
  generatorConfidence: number;
  signals: string[];
}

/** Walks signals → archetype + generator. Adapted from hp-server detector. */
export async function detectArchetype(projectRoot: string): Promise<DetectionResult> {
  const signals: string[] = [];

  // Vanilla HTML check first
  const pkgPath = path.join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      archetype: "vanilla-html",
      archetypeConfidence: 0.95,
      generator: "UNKNOWN",
      generatorConfidence: 0,
      signals: ["no package.json present"],
    };
  }

  let pkg: PackageJson = {};
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as PackageJson;
  } catch {
    signals.push("package.json present but unparseable");
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Generator detection
  let generator: GeneratorId = "UNKNOWN";
  let generatorConfidence = 0;

  if (deps["lovable-tagger"]) {
    generator = "LOVABLE";
    generatorConfidence = 1;
    signals.push("dep: lovable-tagger");
  } else if (deps["@base44/sdk"]) {
    generator = "BASE44";
    generatorConfidence = 1;
    signals.push("dep: @base44/sdk");
  } else if (existsSync(path.join(projectRoot, ".bolt"))) {
    generator = "BOLT";
    generatorConfidence = 0.9;
    signals.push("dir: .bolt");
  } else if (existsSync(path.join(projectRoot, "v0-user-next.config.ts"))) {
    generator = "V0";
    generatorConfidence = 0.8;
    signals.push("file: v0-user-next.config.ts");
  } else if (existsSync(path.join(projectRoot, ".cursor")) || existsSync(path.join(projectRoot, ".cursorrules"))) {
    generator = "CURSOR";
    generatorConfidence = 0.7;
    signals.push("dir: .cursor or .cursorrules");
  } else if (existsSync(path.join(projectRoot, "CLAUDE.md"))) {
    generator = "CLAUDE_CODE";
    generatorConfidence = 0.6;
    signals.push("file: CLAUDE.md");
  }

  // Archetype detection
  if (deps["next"]) {
    const hasAppDir = existsSync(path.join(projectRoot, "app")) || existsSync(path.join(projectRoot, "src/app"));
    const hasPagesDir = existsSync(path.join(projectRoot, "pages")) || existsSync(path.join(projectRoot, "src/pages"));
    if (hasAppDir) {
      signals.push("dep: next + app/ directory");
      return { archetype: "nextjs-app-router", archetypeConfidence: 0.95, generator, generatorConfidence, signals };
    }
    if (hasPagesDir) {
      signals.push("dep: next + pages/ directory");
      return { archetype: "nextjs-pages-router", archetypeConfidence: 0.95, generator, generatorConfidence, signals };
    }
    // Default to App Router (Next 13+ default)
    signals.push("dep: next (defaulting to app router)");
    return { archetype: "nextjs-app-router", archetypeConfidence: 0.7, generator, generatorConfidence, signals };
  }

  if (deps["astro"]) {
    signals.push("dep: astro");
    return { archetype: "astro", archetypeConfidence: 0.95, generator, generatorConfidence, signals };
  }

  if (deps["vite"]) {
    if (deps["vue"]) {
      signals.push("deps: vite + vue");
      return { archetype: "vite-vue", archetypeConfidence: 0.95, generator, generatorConfidence, signals };
    }
    signals.push("deps: vite (+ react)");
    return { archetype: "vite-react", archetypeConfidence: 0.9, generator, generatorConfidence, signals };
  }

  if (deps["react-scripts"]) {
    signals.push("dep: react-scripts");
    return { archetype: "cra", archetypeConfidence: 0.95, generator, generatorConfidence, signals };
  }

  if (pkg.scripts?.build) {
    signals.push("has build script but no recognized framework");
    return { archetype: "unknown", archetypeConfidence: 0.3, generator, generatorConfidence, signals };
  }

  signals.push("package.json present but no build script");
  return { archetype: "vanilla-html", archetypeConfidence: 0.5, generator, generatorConfidence, signals };
}
