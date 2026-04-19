/**
 * Mock data — demo content the pristine template renders.
 *
 * The generator overwrites `tenant-data.ts` per tenant; this stays put so
 * the template always has something to render without a generation step.
 *
 * Uses the pristine-template block components (Hero, FeatureGrid, CTABanner)
 * which live under `src/components/blocks/tenant/`.
 */

import type { TenantData } from './types.js';

export const MOCK_DATA: TenantData = {
  lang: 'en',
  dir: 'ltr',
  settings: {
    siteName: 'HostaPosta Demo',
    tagline: 'A template waiting for tenant data',
    navigation: [{ label: 'Home', href: '/' }],
    footerText: 'HostaPosta starter template — overwritten per tenant by `pnpm generate`',
  },
  pages: [
    {
      slug: '/',
      title: 'Home',
      description: 'Starter template waiting for tenant data.',
      dataPage: 'home',
      blocks: [
        {
          componentName: 'Hero',
          props: {
            eyebrow: 'Starter',
            headline: 'A template, not a site — yet',
            subtitle:
              'Run the generator against an ingested case to populate this shell with real content, brand tokens, and per-tenant block components.',
            ctaText: 'Get started',
            ctaHref: '#',
          },
        },
        {
          componentName: 'FeatureGrid',
          props: {
            eyebrow: 'Pipeline',
            heading: 'Three capabilities',
            columns: 3,
            items: [
              { title: 'Ingest', description: 'ZIP → extract → build → parse → typed intelligence.' },
              { title: 'Generate', description: 'Claude writes per-tenant Astro components matching the source.' },
              { title: 'Handoff', description: 'Tenant edits content in admin. Brand tokens propagate everywhere.' },
            ],
          },
        },
        {
          componentName: 'CTABanner',
          props: {
            heading: 'Ready to see your brand here?',
            subheading: 'Throw a ZIP at `pnpm ingest`, then run `pnpm generate <caseId>`.',
            ctaText: 'Read the docs',
            ctaHref: '#',
            variant: 'dark',
          },
        },
      ],
    },
  ],
  collections: { blog: [], testimonial: [], team: [], service: [] },
};
