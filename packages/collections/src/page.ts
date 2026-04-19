import type { CollectionSchema } from "./types.js";

export const PageCollection: CollectionSchema = {
  slug: "page",
  label: "Page",
  labelPlural: "Pages",
  description: "A tenant page composed of block instances.",
  enabledByDefault: true,
  uniqueKey: ["slug"],
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "slug", label: "URL slug", type: "slug", required: true },
    { name: "seoTitle", label: "SEO title", type: "text" },
    { name: "seoDescription", label: "SEO description", type: "textarea" },
    { name: "ogImage", label: "Social share image", type: "media" },
    {
      name: "blocks",
      label: "Blocks",
      type: "repeater",
      fields: [
        { name: "blockTypeId", label: "Block type", type: "relation", relation: "blockType", required: true },
        // `data` is JSON shaped by the BlockType's schema, edited via dynamic
        // form rendering in apps/admin.
      ],
    },
  ],
};
