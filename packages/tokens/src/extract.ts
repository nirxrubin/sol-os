/**
 * Extract a TokenSet from an IngestionResult.
 *
 * Strategy:
 *  1. Build a compact CSS digest (the most signal-bearing parts of all
 *     pages' CSS — :root, h1-h6, p, button, body, custom properties).
 *  2. Sample a few page screenshots if available (deferred — Phase 0 ships
 *     without vision; tokens come from CSS digest only).
 *  3. Hand digest to Claude with a strict JSON output contract.
 *  4. Validate, merge with defaults for missing fields, return.
 *
 * Implementation note: this is the skill's runtime — the prompt is loaded
 * from .agents/skills/extract-tokens/SKILL.md by reference, not duplicated
 * here. The actual prompt below is a focused operational version.
 */

import { callClaudeJson } from "@hostaposta/agent-runtime";
import type { IngestionResult } from "@hostaposta/ingest";
import { DEFAULT_TOKEN_SET, type TokenSet } from "./types.js";

const SYSTEM_PROMPT = `You are HostaPosta's brand token extractor.

Your job: given a digest of a website's CSS (and optionally screenshots),
output a TokenSet that captures the site's brand foundation — colors,
typography, spacing, radii, motion, shadows.

Rules:
- Output strict JSON matching the TokenSet schema. No prose, no code fences.
- Confidence per category (0..1) — be honest. If you're inferring rather
  than reading from the source, lower the confidence.
- For colors: identify the dominant background, the primary brand color, the
  text color, and supporting roles. When uncertain, prefer the inferred value
  + lower confidence over null.
- For typography: extract font-family for display + body. Build the size
  scale from observed values (cluster to xs/sm/base/lg/xl/2xl/3xl/4xl/5xl).
- For spacing: cluster observed margin/padding values to a minimal scale.
- For radii / motion / shadows: extract observed values; if absent, leave
  defaults and lower confidence accordingly.
- Warnings: list anything you couldn't extract with reasonable confidence.

Output schema (TypeScript):

interface TokenSet {
  colors: { bg, bgAlt, bgCard, bgDark, primary, secondary, accent, text, textMuted, border: string };
  typography: {
    fontDisplay: string; fontBody: string; fontMono?: string;
    sizes: { xs, sm, base, lg, xl, "2xl", "3xl", "4xl", "5xl": string };
    weights: { regular: number; medium: number; bold: number };
    tracking: { tight: string; wide: string };
    leading: { tight: string; normal: string; loose: string };
  };
  spacing: { "1","2","3","4","5","6","8","10","12","16","20": string };
  radii: { sm, md, lg, xl, full: string };
  motion: { durationFast, durationBase, durationSlow, easingOut: string };
  shadows: { sm, md, lg: string };
  confidence: { colors, typography, spacing, radii, overall: number };
  warnings: string[];
}`;

const MAX_CSS_DIGEST_BYTES = 60_000;

export async function extractTokens(ingest: IngestionResult): Promise<TokenSet> {
  const digest = buildCssDigest(ingest);
  if (!digest) {
    return {
      ...DEFAULT_TOKEN_SET,
      warnings: ["No parseable CSS in IngestionResult — using default token set."],
    };
  }

  const userPrompt = [
    `Site origin: ${ingest.source.origin}`,
    `Archetype: ${ingest.archetype}`,
    `Pages parsed: ${ingest.pages.length}`,
    `Generator: ${ingest.generator}`,
    "",
    `CSS digest (${digest.length} chars):`,
    "```css",
    digest,
    "```",
    "",
    "Output the TokenSet as JSON.",
  ].join("\n");

  try {
    const result = await callClaudeJson<TokenSet>({
      tier: "sonnet",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      trace: "extract-tokens",
      maxTokens: 3000,
    });
    return mergeWithDefaults(result);
  } catch (err) {
    return {
      ...DEFAULT_TOKEN_SET,
      warnings: [
        ...DEFAULT_TOKEN_SET.warnings,
        `extract-tokens failed: ${(err as Error).message}`,
      ],
    };
  }
}

/** Pull the most signal-bearing parts of all pages' CSS into a compact digest. */
function buildCssDigest(ingest: IngestionResult): string {
  const all = ingest.pages.map((p) => p.css).join("\n\n");
  if (!all) return "";

  // Prioritize :root rules, body/html, h1-h6, p, button, a, custom properties
  const priorityPatterns = [
    /:root\s*\{[\s\S]*?\}/g,
    /\bbody\s*\{[\s\S]*?\}/g,
    /\bhtml\s*\{[\s\S]*?\}/g,
    /\bh[1-6]\s*\{[\s\S]*?\}/g,
    /\bp\s*\{[\s\S]*?\}/g,
    /\bbutton\s*\{[\s\S]*?\}/g,
    /\ba\s*\{[\s\S]*?\}/g,
    /\.btn[a-z-]*\s*\{[\s\S]*?\}/gi,
  ];

  const chunks: string[] = [];
  for (const re of priorityPatterns) {
    const matches = all.match(re);
    if (matches) chunks.push(...matches);
  }

  let digest = chunks.join("\n\n");

  // Backfill with the head of the full CSS if we have room
  if (digest.length < MAX_CSS_DIGEST_BYTES) {
    const remaining = MAX_CSS_DIGEST_BYTES - digest.length - 200;
    digest += "\n\n/* additional CSS */\n" + all.slice(0, remaining);
  }

  return digest.slice(0, MAX_CSS_DIGEST_BYTES);
}

function mergeWithDefaults(partial: Partial<TokenSet>): TokenSet {
  return {
    colors: { ...DEFAULT_TOKEN_SET.colors, ...(partial.colors ?? {}) },
    typography: {
      ...DEFAULT_TOKEN_SET.typography,
      ...(partial.typography ?? {}),
      sizes: { ...DEFAULT_TOKEN_SET.typography.sizes, ...(partial.typography?.sizes ?? {}) },
      weights: { ...DEFAULT_TOKEN_SET.typography.weights, ...(partial.typography?.weights ?? {}) },
      tracking: { ...DEFAULT_TOKEN_SET.typography.tracking, ...(partial.typography?.tracking ?? {}) },
      leading: { ...DEFAULT_TOKEN_SET.typography.leading, ...(partial.typography?.leading ?? {}) },
    },
    spacing: { ...DEFAULT_TOKEN_SET.spacing, ...(partial.spacing ?? {}) },
    radii: { ...DEFAULT_TOKEN_SET.radii, ...(partial.radii ?? {}) },
    motion: { ...DEFAULT_TOKEN_SET.motion, ...(partial.motion ?? {}) },
    shadows: { ...DEFAULT_TOKEN_SET.shadows, ...(partial.shadows ?? {}) },
    confidence: {
      colors: partial.confidence?.colors ?? 0,
      typography: partial.confidence?.typography ?? 0,
      spacing: partial.confidence?.spacing ?? 0,
      radii: partial.confidence?.radii ?? 0,
      overall: partial.confidence?.overall ?? 0,
    },
    warnings: partial.warnings ?? [],
  };
}
