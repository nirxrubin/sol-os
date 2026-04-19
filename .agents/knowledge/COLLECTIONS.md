# Knowledge — Shared Collections

The platform's shared collection set. Defined in code at `packages/collections/`,
used by every tenant, tenant-scoped via `tenantId`. Editing UX in `apps/admin`
is built once per collection — not per tenant.

## Always-on collections

| Collection | Purpose |
|---|---|
| `Page` | Each tenant's pages; holds slug, SEO, list of block instances |
| `Media` | Assets in R2 |
| `Brand` (global) | Foundation design tokens |
| `SiteSettings` (global) | SEO defaults, analytics integrations, social handles |
| `Navigation` (global) | Header/footer nav structure |

## Optional collections (enabled per tenant)

Enabled when ingestion detects them OR when the client adds them post-launch
("Add a blog" → enable `Blog` + generate matching blocks in tenant style).

| Collection | Core fields | Detection signals |
|---|---|---|
| `Blog` | title, slug, body (richtext), author→Team, publishDate, featuredImage, tags | `/blog`, `/posts`, `/news`, `/articles`; paginated index + detail pages; JSON-LD `BlogPosting` |
| `Testimonial` | quote, author, role, company, avatar, featured | Repeating quote+attribution pattern; often homepage section; JSON-LD `Review` |
| `Team` | name, role, bio, photo, social[] | Grid of people on `/team` or `/about/team` |
| `CaseStudy` | title, client, summary, body, results, gallery, tags | `/work`, `/case-studies`, `/projects`; detail pages with client + results |
| `Service` | name, slug, description, icon, features[], pricing | Numbered/bulleted services with pricing or feature lists |
| `FAQ` | question, answer, category | Q&A repeating pattern; accordions labeled "FAQ" / "Questions" |
| `Product` | name, price, description, images[], sku, variants[] | Shopify/Stripe-shaped listings with price; JSON-LD `Product` |
| `Event` | title, datetime, location, description, image | Date + location + description pattern; JSON-LD `Event` |
| `Job` | title, department, location, description, applyUrl | `/careers`, `/jobs`; department + apply URL |

## Detection rules (Collection Parser uses these)

1. **JSON-LD wins.** If `application/ld+json` declares `@type: "BlogPosting"`,
   `Review`, `Product`, `Event`, etc., trust it. Highest-confidence signal
   available.
2. **Open Graph type is a strong secondary signal** (`og:type=article` →
   blog/news).
3. **Route patterns over DOM patterns.** A `/blog/:slug` pattern with paginated
   index + detail layouts is more reliable than vibes about "this looks bloggy."
4. **Repetition is a collection.** ≥3 structurally similar items in one section
   is collection-shaped. <3 is probably one-offs.
5. **Cross-page reuse implies a collection.** A testimonial appearing on the
   homepage AND `/about` is a `Testimonial` record, not inline copy.

## Known confusions (resolve these explicitly)

- **Blog vs News vs Articles** → collapse to `Blog` unless the source clearly
  separates them (separate routes, separate index pages, distinctly different
  content shape). Emit a warning when collapsing.
- **Blog vs Case Study** → presence of `client` field + dedicated long-form
  detail + results section + in `/work` / `/cases` route = `CaseStudy`.
  Dated, authored, shorter form = `Blog`.
- **Testimonial vs inline quote** → `Testimonial` if it appears on multiple
  pages OR a dedicated `/testimonials` listing exists. Inline quote in a body
  → leave as richtext, don't extract.
- **Team vs Partners vs Advisors** → all look structurally similar. Use the
  surrounding label text. If multiple distinct sections, extract all to `Team`
  with the `category` field — don't propose new collections unless clearly
  warranted (then: surface to `unmappedStructured`).
- **Service vs Pricing Tier** → `Service` is descriptive (what we do).
  `pricing` is a sub-field on `Service`, not its own collection.

## Adding a new collection (platform team only)

Per-tenant invented collections are not allowed. New shared collection types
are added by:
1. Aggregating `unmappedStructured` signals across tenants (Collection
   Proposer agent — Phase 4).
2. Platform team reviews, defines a typed schema in `packages/collections/`.
3. Detection heuristics added to this file.
4. `apps/admin` collection editor built once.
5. Existing tenants can opt in.

Why: collection schemas are a contract. Per-tenant invention makes them
non-portable, breaks shared editing UX, and turns migrations into a
combinatorial nightmare.
