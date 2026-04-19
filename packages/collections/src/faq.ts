import type { CollectionSchema } from "./types.js";

export const FAQCollection: CollectionSchema = {
  slug: "faq",
  label: "FAQ",
  labelPlural: "FAQs",
  description: "Question and answer pairs.",
  enabledByDefault: false,
  uniqueKey: ["question"],
  fields: [
    { name: "question", label: "Question", type: "text", required: true },
    { name: "answer", label: "Answer", type: "richtext", required: true },
    { name: "category", label: "Category", type: "text" },
  ],
  detection: {
    jsonLdTypes: ["FAQPage", "Question"],
    notes: "Q&A repeating pattern; accordions labeled 'FAQ' or 'Questions'.",
  },
};
