/**
 * Normalized result of any ingestion source. Consumed by the generation
 * pipeline (token extractor, collection parser, block generator) regardless
 * of whether the source was a ZIP, GitHub repo, live URL, or Figma file.
 */

export type SourceKind = "zip" | "github" | "url" | "figma" | "description";

export type ArchetypeId =
  | "nextjs-app-router"
  | "nextjs-pages-router"
  | "vite-react"
  | "vite-vue"
  | "astro"
  | "cra"
  | "vanilla-html"
  | "unknown";

export type GeneratorId =
  | "LOVABLE"
  | "BASE44"
  | "CLAUDE_CODE"
  | "CURSOR"
  | "V0"
  | "BOLT"
  | "UNKNOWN";

export interface ParsedPage {
  /** Canonical route (`/`, `/blog`, `/blog/my-post`). */
  route: string;
  /** Rendered HTML — inner DOM, not a wrapper shell. */
  html: string;
  /** Resolved CSS used by this page (concatenated, deduped). */
  css: string;
  /** Path to a screenshot of the rendered page, when available. */
  screenshot?: string;
  /** Parsed JSON-LD blocks, if present. */
  jsonLd?: unknown[];
  meta: {
    title?: string;
    description?: string;
    ogType?: string;
    ogImage?: string;
    canonical?: string;
  };
}

export interface ParsedAsset {
  /** Path within the source / build output, or absolute URL for remote sources. */
  url: string;
  /** Local path on disk (may be the same as url for filesystem sources). */
  localPath?: string;
  type: "image" | "video" | "font" | "other";
  /** Best-guess context — e.g., "hero bg on /" or "blog featured image on /blog/my-post". */
  context?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface RouteNode {
  segment: string;
  route: string;
  isIndex: boolean;
  isDynamic: boolean;
  children: RouteNode[];
}

export interface IngestionResult {
  source: {
    kind: SourceKind;
    /** Filename for ZIP, repo URL for GitHub, live URL for URL, etc. */
    origin: string;
  };

  /** Detected framework / generator. */
  archetype: ArchetypeId;
  archetypeConfidence: number;
  generator: GeneratorId;
  generatorConfidence: number;

  /** Built filesystem path (when applicable) — useful for downstream tooling. */
  buildPath?: string;

  /** For SPA archetypes that went through headless rendering, the path to
   *  the per-route rendered HTML tree. Downstream (e.g. fossilize) should
   *  walk this instead of build.outputPath. */
  renderedOutputPath?: string;

  /** Parsed pages — keyed by route. Always present, may be empty if build failed. */
  pages: ParsedPage[];

  /** Parsed assets discovered across all pages. */
  assets: ParsedAsset[];

  /** Route structure. */
  routes: {
    tree: RouteNode | null;
    patterns: string[];
  };

  /** Build outcome. */
  build: {
    attempted: boolean;
    success: boolean;
    durationMs?: number;
    output?: string;
    error?: string;
    /** Path to the built output dir. */
    outputPath?: string;
  };

  warnings: string[];

  metrics: {
    pagesCount: number;
    assetsCount: number;
    htmlBytes: number;
    cssBytes: number;
  };
}
