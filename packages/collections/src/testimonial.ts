import type { CollectionSchema } from "./types.js";

export const TestimonialCollection: CollectionSchema = {
  slug: "testimonial",
  label: "Testimonial",
  labelPlural: "Testimonials",
  description: "Quotes from customers, partners, advisors.",
  enabledByDefault: false,
  uniqueKey: ["quote", "author"],
  fields: [
    { name: "quote", label: "Quote", type: "textarea", required: true },
    { name: "author", label: "Author name", type: "text", required: true },
    { name: "role", label: "Role / title", type: "text" },
    { name: "company", label: "Company", type: "text" },
    { name: "avatar", label: "Avatar / photo", type: "media" },
    { name: "featured", label: "Featured", type: "boolean" },
  ],
  detection: {
    jsonLdTypes: ["Review"],
    notes: "Repeating quote+attribution pattern. ≥3 instances or cross-page reuse → Testimonial. <3 inline → leave as richtext.",
  },
};
