import type { CollectionSchema } from "./types.js";

export const CaseStudyCollection: CollectionSchema = {
  slug: "caseStudy",
  label: "Case study",
  labelPlural: "Case studies",
  description: "Long-form project / client work writeups with results.",
  enabledByDefault: false,
  uniqueKey: ["slug"],
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "slug", label: "URL slug", type: "slug", required: true },
    { name: "client", label: "Client", type: "text", required: true },
    { name: "summary", label: "Summary", type: "textarea" },
    { name: "body", label: "Body", type: "richtext", required: true },
    {
      name: "results",
      label: "Key results",
      type: "repeater",
      fields: [
        { name: "label", label: "Label", type: "text", required: true },
        { name: "value", label: "Value", type: "text", required: true },
      ],
    },
    { name: "gallery", label: "Gallery", type: "media", multiple: true },
    { name: "tags", label: "Tags", type: "tags" },
    { name: "publishDate", label: "Publish date", type: "datetime" },
  ],
  detection: {
    routePatterns: ["/work", "/case-studies", "/cases", "/projects", "/work/:slug", "/case-studies/:slug"],
    notes: "Distinguished from Blog by `client` + results section + `/work` routes.",
  },
};
