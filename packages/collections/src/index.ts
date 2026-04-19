export * from "./types.js";
export { PageCollection } from "./page.js";
export { BlogCollection } from "./blog.js";
export { TestimonialCollection } from "./testimonial.js";
export { TeamCollection } from "./team.js";
export { CaseStudyCollection } from "./case-study.js";
export { ServiceCollection } from "./service.js";
export { FAQCollection } from "./faq.js";
export {
  BrandGlobal,
  SiteSettingsGlobal,
  NavigationGlobal,
  MediaCollection,
} from "./globals.js";

import type { CollectionSchema } from "./types.js";
import { PageCollection } from "./page.js";
import { BlogCollection } from "./blog.js";
import { TestimonialCollection } from "./testimonial.js";
import { TeamCollection } from "./team.js";
import { CaseStudyCollection } from "./case-study.js";
import { ServiceCollection } from "./service.js";
import { FAQCollection } from "./faq.js";
import {
  BrandGlobal,
  SiteSettingsGlobal,
  NavigationGlobal,
  MediaCollection,
} from "./globals.js";

/** All shared collection schemas, in the order they're listed in the platform docs. */
export const ALL_COLLECTIONS: ReadonlyArray<CollectionSchema> = [
  // Always-on
  PageCollection,
  MediaCollection,
  BrandGlobal,
  SiteSettingsGlobal,
  NavigationGlobal,
  // Optional (enabled per tenant)
  BlogCollection,
  TestimonialCollection,
  TeamCollection,
  CaseStudyCollection,
  ServiceCollection,
  FAQCollection,
];

/** Collections enabled by default for every new tenant. */
export const DEFAULT_COLLECTIONS: ReadonlyArray<CollectionSchema> =
  ALL_COLLECTIONS.filter((c) => c.enabledByDefault);

/** Collections clients can opt-in to per-tenant. */
export const OPTIONAL_COLLECTIONS: ReadonlyArray<CollectionSchema> =
  ALL_COLLECTIONS.filter((c) => !c.enabledByDefault);

export function getCollectionBySlug(slug: string): CollectionSchema | undefined {
  return ALL_COLLECTIONS.find((c) => c.slug === slug);
}
