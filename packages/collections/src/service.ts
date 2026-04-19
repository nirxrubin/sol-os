import type { CollectionSchema } from "./types.js";

export const ServiceCollection: CollectionSchema = {
  slug: "service",
  label: "Service",
  labelPlural: "Services",
  description: "Service offerings — name, description, features, pricing.",
  enabledByDefault: false,
  uniqueKey: ["slug"],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "slug", label: "URL slug", type: "slug", required: true },
    { name: "description", label: "Description", type: "textarea" },
    { name: "icon", label: "Icon", type: "media" },
    { name: "features", label: "Features", type: "repeater", fields: [
      { name: "label", label: "Feature", type: "text", required: true },
    ]},
    {
      name: "pricing",
      label: "Pricing",
      type: "repeater",
      fields: [
        { name: "tierName", label: "Tier name", type: "text", required: true },
        { name: "price", label: "Price", type: "text" },
        { name: "billing", label: "Billing period", type: "text" },
        { name: "highlight", label: "Highlight tier", type: "boolean" },
        { name: "features", label: "Tier features", type: "tags" },
      ],
    },
  ],
};
