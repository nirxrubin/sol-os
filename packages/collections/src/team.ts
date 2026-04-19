import type { CollectionSchema } from "./types.js";

export const TeamCollection: CollectionSchema = {
  slug: "team",
  label: "Team member",
  labelPlural: "Team",
  description: "People — team, partners, advisors (use category to subdivide).",
  enabledByDefault: false,
  uniqueKey: ["name", "role"],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "role", label: "Role / title", type: "text" },
    { name: "category", label: "Category", type: "select", options: [
      { value: "team", label: "Team" },
      { value: "leadership", label: "Leadership" },
      { value: "advisor", label: "Advisor" },
      { value: "partner", label: "Partner" },
    ] },
    { name: "bio", label: "Bio", type: "richtext" },
    { name: "photo", label: "Photo", type: "media" },
    {
      name: "social",
      label: "Social links",
      type: "repeater",
      fields: [
        { name: "platform", label: "Platform", type: "select", options: [
          { value: "linkedin", label: "LinkedIn" },
          { value: "twitter", label: "Twitter / X" },
          { value: "github", label: "GitHub" },
          { value: "email", label: "Email" },
          { value: "website", label: "Website" },
          { value: "other", label: "Other" },
        ]},
        { name: "url", label: "URL", type: "url", required: true },
      ],
    },
  ],
  detection: {
    routePatterns: ["/team", "/about/team", "/people"],
    notes: "Grid of people with photo + name + role. Partners/Advisors map here with category, not new collection.",
  },
};
