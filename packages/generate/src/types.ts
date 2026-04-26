/**
 * Generator-side shape, mirroring templates/site-starter/src/data/types.ts.
 *
 * Every block instance is `{ componentName, props }` — componentName resolves
 * to a file under the tenant's `src/components/blocks/tenant/` directory
 * (written by pixel-block-generator). The pristine template ships with
 * three reference components (Hero, FeatureGrid, CTABanner) that power
 * its mock demo; generated tenants get their own components.
 */

export interface GeneratedBlockInstance {
  componentName: string;
  props: Record<string, unknown>;
}

export interface PageDef {
  slug: string;
  title: string;
  description?: string;
  dataPage?: string;
  blocks: GeneratedBlockInstance[];
}

export interface BlogPost {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  author?: string;
  publishDate?: string;
  featuredImage?: string;
  tags?: string[];
}
export interface Testimonial {
  quote: string;
  author: string;
  role?: string;
  company?: string;
  avatar?: string;
  featured?: boolean;
}
export interface TeamMember {
  name: string;
  role?: string;
  category?: "team" | "leadership" | "advisor" | "partner";
  bio?: string;
  photo?: string;
  social?: Array<{ platform: string; url: string }>;
}
export interface Service {
  name: string;
  slug: string;
  description: string;
  icon?: string;
  features?: string[];
}
export interface Product {
  name: string;
  slug: string;
  price?: string | number;
  currency?: string;
  image?: string;
  description?: string;
  category?: string;
  inStock?: boolean;
  features?: string[];
}

export interface SiteSettings {
  siteName: string;
  tagline?: string;
  navigation: Array<{ label: string; href: string }>;
  footerText?: string;
}

export interface TenantData {
  settings: SiteSettings;
  pages: PageDef[];
  collections: {
    blog?: BlogPost[];
    testimonial?: Testimonial[];
    team?: TeamMember[];
    service?: Service[];
    product?: Product[];
  };
  lang: string;
  dir: "ltr" | "rtl";
}
