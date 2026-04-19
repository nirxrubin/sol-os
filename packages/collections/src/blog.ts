import type { CollectionSchema } from "./types.js";

export const BlogCollection: CollectionSchema = {
  slug: "blog",
  label: "Blog post",
  labelPlural: "Blog",
  description: "Blog posts, news articles, journal entries.",
  enabledByDefault: false,
  uniqueKey: ["slug"],
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "slug", label: "URL slug", type: "slug", required: true },
    { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "richtext", required: true },
    { name: "author", label: "Author", type: "relation", relation: "team" },
    { name: "publishDate", label: "Publish date", type: "datetime" },
    { name: "featuredImage", label: "Featured image", type: "media" },
    { name: "tags", label: "Tags", type: "tags" },
    { name: "seoTitle", label: "SEO title", type: "text" },
    { name: "seoDescription", label: "SEO description", type: "textarea" },
  ],
  detection: {
    routePatterns: ["/blog", "/blog/:slug", "/posts", "/posts/:slug", "/news", "/articles"],
    jsonLdTypes: ["BlogPosting", "Article", "NewsArticle"],
    ogTypes: ["article"],
    notes: "Collapse Blog/News/Articles unless source clearly separates them.",
  },
};
