# Skill: Extract Brand Tokens

**Type:** Skill (single Claude call, not a loop)
**Lives at:** `packages/ingest/` calls into `.agents/skills/extract-tokens/`

## When to use

Runs in parallel with `collection-parser` after `IngestionResult` is produced.
Output (a `TokenSet`) feeds `generate-block` and is persisted as the tenant's
`Brand` global.

## Prerequisites to read

- `.agents/AGENTS.md`
- `.agents/knowledge/DESIGN.md` — the 3-layer system + extraction rules
- `packages/tokens/src/` — the canonical `TokenSet` type

## Inputs

- Parsed CSS (from `IngestionResult.pages[].css`) — resolved Tailwind etc.
- Sampled screenshots — for visual color extraction (image palette analysis)
- Computed style snapshots when available

## Output: `TokenSet`

```ts
type TokenSet = {
  colors: {
    bg: string;
    bgAlt: string;
    bgCard: string;
    bgDark: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    textMuted: string;
    border: string;
  };
  typography: {
    fontDisplay: string;
    fontBody: string;
    fontMono?: string;
    sizes: Record<"xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl", string>;
    weights: { regular: number; medium: number; bold: number };
    tracking: { tight: string; wide: string };
    leading: { tight: string; normal: string; loose: string };
  };
  spacing: Record<"1" | "2" | "3" | "4" | "5" | "6" | "8" | "10" | "12" | "16" | "20", string>;
  radii: { sm: string; md: string; lg: string; xl: string; full: string };
  motion: { durationFast: string; durationBase: string; durationSlow: string; easingOut: string };
  shadows: { sm: string; md: string; lg: string };
  confidence: { colors: number; typography: number; spacing: number; radii: number; overall: number };
  warnings: string[];
};
```

## Extraction rules (per `.agents/knowledge/DESIGN.md`)

### Colors
- Sample dominant colors via image palette analysis on screenshots.
- Cross-reference with resolved CSS (most-used non-bg color = primary).
- Map to roles by position + frequency + contrast pairing.
- When uncertain, prefer null + warning over guess.

### Typography
- Extract `font-family` from `<h1>..<h6>`, `<p>`, `<button>`, `<small>`.
- Build a size scale from observed font-sizes (cluster, normalize to xs..5xl).
- Detect weights, tracking, leading.

### Spacing / Radii
- Sample margin/padding values from sections; cluster to a minimal scale.
- Sample border-radius values; cluster.

### Motion / Shadows
- Extract from observed CSS; default to a conservative set if absent.

## Confidence

Per category + overall. When `overall < 0.5`, the orchestrator halts the
pipeline and asks for clarification rather than proceeding with a poor token
set (everything downstream depends on this).

## Failure modes

- No CSS available → fallback to vision-only extraction with lower confidence.
- Site uses inline styles only → use defaults + warning.
- Screenshots all dark / all light → still produce both light and dark
  variants when possible.

## Implementation notes

- Single Claude call with vision; no recovery loop needed (a skill, not an
  agent).
- Output is shape-validated against the `TokenSet` Zod schema before
  persistence.
- Tenant-edit-friendly: every field is later editable in the Brand panel.
