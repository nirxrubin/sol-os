import type { CollectionSchema } from "./types.js";

export const ProductCollection: CollectionSchema = {
  slug: "product",
  label: "Product",
  labelPlural: "Products",
  description: "Shop products — name, price, image, description, category.",
  enabledByDefault: false,
  uniqueKey: ["slug"],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "slug", label: "URL slug", type: "slug", required: true },
    { name: "price", label: "Price", type: "text" },
    { name: "currency", label: "Currency", type: "text" },
    { name: "image", label: "Image", type: "media" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "category", label: "Category", type: "text" },
    { name: "inStock", label: "In stock", type: "boolean" },
    { name: "features", label: "Features", type: "tags" },
  ],
  detection: {
    routePatterns: ["/shop/:slug", "/products/:slug", "/store/:slug"],
    jsonLdTypes: ["Product"],
    ogTypes: ["product"],
  },
};
