import type { CollectionSchema } from "./types.js";

export const BrandGlobal: CollectionSchema = {
  slug: "brand",
  label: "Brand",
  labelPlural: "Brand",
  description: "Foundation design tokens (colors, type, spacing, radii, motion).",
  enabledByDefault: true,
  isGlobal: true,
  uniqueKey: [],
  fields: [
    // Colors
    { name: "colorBg", label: "Background", type: "color", required: true },
    { name: "colorBgAlt", label: "Background (alt)", type: "color" },
    { name: "colorBgCard", label: "Card surface", type: "color" },
    { name: "colorBgDark", label: "Dark surface", type: "color" },
    { name: "colorPrimary", label: "Primary", type: "color", required: true },
    { name: "colorSecondary", label: "Secondary", type: "color" },
    { name: "colorAccent", label: "Accent", type: "color" },
    { name: "colorText", label: "Text", type: "color", required: true },
    { name: "colorTextMuted", label: "Text (muted)", type: "color" },
    { name: "colorBorder", label: "Border", type: "color" },
    // Typography
    { name: "fontDisplay", label: "Display font", type: "text", required: true },
    { name: "fontBody", label: "Body font", type: "text", required: true },
    { name: "fontMono", label: "Mono font", type: "text" },
    // Radii
    { name: "radiusBase", label: "Base radius", type: "text" },
  ],
};

export const SiteSettingsGlobal: CollectionSchema = {
  slug: "siteSettings",
  label: "Site settings",
  labelPlural: "Site settings",
  description: "Site-wide SEO defaults, social, integrations.",
  enabledByDefault: true,
  isGlobal: true,
  uniqueKey: [],
  fields: [
    { name: "siteName", label: "Site name", type: "text", required: true },
    { name: "siteUrl", label: "Site URL", type: "url" },
    { name: "defaultSeoTitle", label: "Default SEO title", type: "text" },
    { name: "defaultSeoDescription", label: "Default SEO description", type: "textarea" },
    { name: "defaultOgImage", label: "Default share image", type: "media" },
    { name: "favicon", label: "Favicon", type: "media" },
    {
      name: "social",
      label: "Social handles",
      type: "repeater",
      fields: [
        { name: "platform", label: "Platform", type: "text", required: true },
        { name: "handle", label: "Handle", type: "text" },
        { name: "url", label: "URL", type: "url" },
      ],
    },
    {
      name: "integrations",
      label: "Integrations",
      type: "repeater",
      fields: [
        { name: "kind", label: "Kind", type: "select", options: [
          { value: "ga4", label: "Google Analytics 4" },
          { value: "gtm", label: "Google Tag Manager" },
          { value: "plausible", label: "Plausible" },
          { value: "posthog", label: "PostHog" },
          { value: "hubspot", label: "HubSpot" },
          { value: "intercom", label: "Intercom" },
        ]},
        { name: "id", label: "Account / property ID", type: "text" },
        { name: "consentCategory", label: "Consent category", type: "select", options: [
          { value: "necessary", label: "Necessary" },
          { value: "analytics", label: "Analytics" },
          { value: "marketing", label: "Marketing" },
        ]},
      ],
    },
  ],
};

export const NavigationGlobal: CollectionSchema = {
  slug: "navigation",
  label: "Navigation",
  labelPlural: "Navigation",
  description: "Header/footer navigation structure.",
  enabledByDefault: true,
  isGlobal: true,
  uniqueKey: [],
  fields: [
    {
      name: "header",
      label: "Header links",
      type: "repeater",
      fields: [
        { name: "label", label: "Label", type: "text", required: true },
        { name: "href", label: "URL or path", type: "text", required: true },
        { name: "external", label: "External link", type: "boolean" },
      ],
    },
    {
      name: "footer",
      label: "Footer columns",
      type: "repeater",
      fields: [
        { name: "title", label: "Column title", type: "text" },
        { name: "links", label: "Links", type: "repeater", fields: [
          { name: "label", label: "Label", type: "text", required: true },
          { name: "href", label: "URL or path", type: "text", required: true },
        ]},
      ],
    },
  ],
};

export const MediaCollection: CollectionSchema = {
  slug: "media",
  label: "Media",
  labelPlural: "Media",
  description: "Asset library — images, videos, files. Backed by R2.",
  enabledByDefault: true,
  uniqueKey: ["filename"],
  fields: [
    { name: "filename", label: "Filename", type: "text", required: true },
    { name: "alt", label: "Alt text", type: "text" },
    { name: "caption", label: "Caption", type: "text" },
    { name: "url", label: "R2 URL", type: "url", required: true },
    { name: "mimeType", label: "MIME type", type: "text" },
    { name: "width", label: "Width", type: "number" },
    { name: "height", label: "Height", type: "number" },
    { name: "sizeBytes", label: "Size (bytes)", type: "number" },
  ],
};
