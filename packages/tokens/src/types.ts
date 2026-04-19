/**
 * TokenSet — the canonical brand foundation token shape.
 *
 * Every tenant has exactly one TokenSet, edited via the Brand panel in
 * apps/admin. Used by `templates/site-starter` to render `:root` CSS custom
 * properties at build time.
 */

export interface TokenSet {
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
    sizes: Record<TypographySize, string>;
    weights: { regular: number; medium: number; bold: number };
    tracking: { tight: string; wide: string };
    leading: { tight: string; normal: string; loose: string };
  };
  spacing: Record<SpacingStep, string>;
  radii: { sm: string; md: string; lg: string; xl: string; full: string };
  motion: {
    durationFast: string;
    durationBase: string;
    durationSlow: string;
    easingOut: string;
  };
  shadows: { sm: string; md: string; lg: string };
  /** 0..1 per category + overall. <0.5 overall halts the pipeline. */
  confidence: {
    colors: number;
    typography: number;
    spacing: number;
    radii: number;
    overall: number;
  };
  warnings: string[];
}

export type TypographySize =
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl";

export type SpacingStep =
  | "1" | "2" | "3" | "4" | "5" | "6" | "8" | "10" | "12" | "16" | "20";

/** Sensible neutral defaults used as the base for low-confidence extractions. */
export const DEFAULT_TOKEN_SET: TokenSet = {
  colors: {
    bg: "#ffffff",
    bgAlt: "#fafafa",
    bgCard: "#ffffff",
    bgDark: "#0a0a0a",
    primary: "#0a0a0a",
    secondary: "#525252",
    accent: "#0066ff",
    text: "#0a0a0a",
    textMuted: "#737373",
    border: "#e5e5e5",
  },
  typography: {
    fontDisplay: "Inter, system-ui, sans-serif",
    fontBody: "Inter, system-ui, sans-serif",
    fontMono: "ui-monospace, SFMono-Regular, monospace",
    sizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
    },
    weights: { regular: 400, medium: 500, bold: 700 },
    tracking: { tight: "-0.025em", wide: "0.05em" },
    leading: { tight: "1.2", normal: "1.5", loose: "1.75" },
  },
  spacing: {
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
    "12": "3rem",
    "16": "4rem",
    "20": "5rem",
  },
  radii: { sm: "0.25rem", md: "0.5rem", lg: "0.75rem", xl: "1rem", full: "9999px" },
  motion: {
    durationFast: "150ms",
    durationBase: "250ms",
    durationSlow: "400ms",
    easingOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  shadows: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 12px rgba(0,0,0,0.08)",
    lg: "0 12px 32px rgba(0,0,0,0.12)",
  },
  confidence: { colors: 0, typography: 0, spacing: 0, radii: 0, overall: 0 },
  warnings: ["Default token set — extraction did not run or produced low-confidence output."],
};
