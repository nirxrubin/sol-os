/**
 * Render a TokenSet into the template's tokens.css layer 1 :root block.
 *
 * The output is a drop-in replacement for templates/site-starter/src/styles/
 * tokens.css — the generator overwrites that file in the tenant's fork.
 */

import type { TokenSet } from "@hostaposta/tokens";

export function renderTokensCss(tokens: TokenSet): string {
  const c = tokens.colors;
  const t = tokens.typography;
  const s = tokens.spacing;
  const r = tokens.radii;
  const m = tokens.motion;
  const sh = tokens.shadows;

  return `/* ────────────────────────────────────────────────────────────────
   TOKEN LAYER 1 — Foundation tokens (:root) — GENERATED
   Overwritten by @hostaposta/generate for this tenant.
   Confidence overall: ${(tokens.confidence.overall * 100).toFixed(0)}%
   ──────────────────────────────────────────────────────────────── */

:root {
  /* ── Colors ─────────────────────────────────────────── */
  --color-bg:         ${c.bg};
  --color-bg-alt:     ${c.bgAlt};
  --color-bg-card:    ${c.bgCard};
  --color-bg-dark:    ${c.bgDark};
  --color-primary:    ${c.primary};
  --color-secondary:  ${c.secondary};
  --color-accent:     ${c.accent};
  --color-text:       ${c.text};
  --color-text-muted: ${c.textMuted};
  --color-text-inverse: #ffffff;
  --color-border:     ${c.border};

  /* ── Typography ─────────────────────────────────────── */
  --font-display: ${t.fontDisplay};
  --font-body:    ${t.fontBody};
  --font-mono:    ${t.fontMono ?? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"};

  --text-xs:   ${t.sizes.xs};
  --text-sm:   ${t.sizes.sm};
  --text-base: ${t.sizes.base};
  --text-lg:   ${t.sizes.lg};
  --text-xl:   ${t.sizes.xl};
  --text-2xl:  ${t.sizes["2xl"]};
  --text-3xl:  ${t.sizes["3xl"]};
  --text-4xl:  ${t.sizes["4xl"]};
  --text-5xl:  ${t.sizes["5xl"]};
  --text-hero: clamp(2.25rem, 6vw, 4rem);

  --font-weight-regular: ${t.weights.regular};
  --font-weight-medium:  ${t.weights.medium};
  --font-weight-bold:    ${t.weights.bold};
  --tracking-tight:  ${t.tracking.tight};
  --tracking-normal: 0;
  --tracking-wide:   ${t.tracking.wide};
  --leading-tight:   ${t.leading.tight};
  --leading-normal:  ${t.leading.normal};
  --leading-loose:   ${t.leading.loose};

  /* ── Spacing scale ──────────────────────────────────── */
  --space-1:  ${s["1"]};
  --space-2:  ${s["2"]};
  --space-3:  ${s["3"]};
  --space-4:  ${s["4"]};
  --space-5:  ${s["5"]};
  --space-6:  ${s["6"]};
  --space-8:  ${s["8"]};
  --space-10: ${s["10"]};
  --space-12: ${s["12"]};
  --space-16: ${s["16"]};
  --space-20: ${s["20"]};

  --section-padding-y: var(--space-20);
  --container-max-w:   1200px;
  --container-px:      var(--space-6);

  /* ── Radii ──────────────────────────────────────────── */
  --radius-sm:   ${r.sm};
  --radius-md:   ${r.md};
  --radius-lg:   ${r.lg};
  --radius-xl:   ${r.xl};
  --radius-full: ${r.full};

  /* ── Motion ─────────────────────────────────────────── */
  --duration-fast: ${m.durationFast};
  --duration-base: ${m.durationBase};
  --duration-slow: ${m.durationSlow};
  --easing-out:    ${m.easingOut};

  /* ── Shadows ────────────────────────────────────────── */
  --shadow-sm: ${sh.sm};
  --shadow-md: ${sh.md};
  --shadow-lg: ${sh.lg};
}

/* Dark theme — flips foundation for sections inside dark surfaces */
[data-theme="dark"] {
  --color-bg:         var(--color-bg-dark);
  --color-text:       var(--color-text-inverse);
  --color-text-muted: rgba(255, 255, 255, 0.7);
  --color-border:     rgba(255, 255, 255, 0.15);
}
`;
}
