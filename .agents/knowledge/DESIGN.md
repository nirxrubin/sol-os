# Knowledge — Design Token System

The token system is HostaPosta's only mechanism for global visual edits when
blocks are visually baked per-tenant. Without it, "change the brand color"
requires editing every block. With it, foundation token edits propagate via
the CSS cascade with zero code changes.

This is **mandatory infrastructure**, not convention. Verify gates fail blocks
that hardcode brand-relevant values.

## Three layers

### Layer 1 — Foundation tokens (`:root`)

The tenant's brand system. One source of truth, edited via the Brand panel in
`apps/admin`, propagates everywhere.

Required token sets per tenant:

```css
:root {
  /* Color */
  --color-bg: ...;
  --color-bg-alt: ...;
  --color-bg-card: ...;
  --color-bg-dark: ...;
  --color-primary: ...;
  --color-secondary: ...;
  --color-accent: ...;
  --color-text: ...;
  --color-text-muted: ...;
  --color-border: ...;

  /* Typography */
  --font-display: ...;
  --font-body: ...;
  --font-mono: ...;
  --font-size-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}: ...;
  --tracking-tight: -0.025em;
  --tracking-wide: 0.05em;
  --leading-{tight,normal,loose}: ...;

  /* Spacing */
  --space-{1..16}: ...;
  --section-padding-y: ...;
  --container-max-w: ...;

  /* Radii */
  --radius-{sm,md,lg,xl,full}: ...;

  /* Motion */
  --duration-{fast,base,slow}: ...;
  --easing-{out,in-out,bounce}: ...;

  /* Shadows */
  --shadow-{sm,md,lg}: ...;
}
```

### Layer 2 — Page-level overrides (`[data-page="<slug>"]`)

Per-page variants. Optional. Use when a single page (e.g., a dark-themed
campaign page) overrides the default tokens but is otherwise on-brand.

```css
[data-page="dark-launch"] {
  --color-bg: #0a0a0a;
  --color-text: #ffffff;
}
```

### Layer 3 — Component-scoped (inside the block's `<style>`)

Only for genuinely block-internal values that shouldn't leak (e.g., a
specific grid measurement unique to that block's layout). **Never** for
brand-relevant values (colors, type sizes, spacing scale, radii) — those
must reference Layer 1.

```astro
<style>
  .hero-mockup-grid {
    grid-template-columns: 1.2fr 0.8fr; /* unique internal layout */
    gap: var(--space-4);                /* still token-driven */
  }
</style>
```

## Generation rules (`generate-block` follows these)

1. **Default to a foundation token** for every brand-relevant property.
2. **If a token doesn't exist** that captures the value AND the value is unique
   to this block — use Layer 3 inline.
3. **If a value clearly recurs** across 3+ blocks — propose a new Layer 1
   token via the token-extractor agent rather than inlining N times.
4. **Never hardcode** hex colors, raw px font sizes, raw px spacing values, or
   font family names in components. Verify gate enforces this.

## Extraction rules (`extract-tokens` follows these)

Extract from the parsed CSS + screenshots of the source:

1. **Color palette** — sample dominant colors via image analysis +
   resolved CSS values; cluster perceptually; map to roles (bg, primary,
   secondary, text, etc.) using:
   - Position (background of large surfaces → bg)
   - Frequency of use (most-used non-bg color → primary)
   - Contrast pairing (color used on bg-dark → text-on-dark)
2. **Typography** — extract font-family, weight, size, line-height, tracking
   from `<h1>..<h6>`, `<p>`, `<button>`, `<small>`. Build a scale.
3. **Spacing** — sample margins/padding from major sections; cluster to a
   minimal scale.
4. **Radii** — sample border-radius values; cluster.
5. **Motion** — extract any `transition-duration` values; default to a
   conservative set if none present.

Confidence per token category. Fallback to a sensible default scale when
extraction confidence is low.

## Editing flow in `apps/admin`

Brand panel exposes Layer 1 tokens as editable controls:
- Color pickers per role
- Type scale slider + family selector
- Spacing scale control
- Radius control

A token edit triggers a tenant rebuild + redeploy via Vercel ISR. Changes
propagate everywhere the token is referenced — no per-block edits needed.

This is the **highest-leverage edit path** for a client. Optimize the UX
accordingly.
