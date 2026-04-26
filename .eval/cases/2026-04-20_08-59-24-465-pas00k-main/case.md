# Case 2026-04-20_08-59-24-465-pas00k-main
*captured 2026-04-20T08:59:24.466Z*

**Source:** zip / pas00k-main.zip
**Archetype:** vite-react / **Generator:** LOVABLE
**Pages:** medium (6 routes) / **Non-latin:** false
**Quality:** 73% — avg conf 75%, retried: true, warnings: 2
**Label:** unlabeled (edit `feedback.json` to change)
**Prompt:** detect-v2+digest-v2

## Routes
- /
- /about
- /craft
- /journal
- /shop
- /verses

## Detected collections
### blog — det conf 95% — 3 entries
- Dedicated /journal route with heading 'יומן' (Journal) — strong semantic anchor for blog collection
- 4 structurally parallel <article> elements on /journal, each with category tag + date, <h2> title, description paragraph, and 'קראו עוד' (Read more) CTA
- Each article links to a detail-page slug: /journal/weight-of-words, /journal/thread-and-tradition, /journal/slow-fashion-sacred-purpose, /journal/hands-behind-label — confirming index + detail pattern

Entries:
  - [65%] משקל המילים
  - [65%] חוט ומסורת
  - [50%] אופנה איטית, מטרה קדושה

### product — det conf 97% — 6 entries
- Dedicated /shop route with heading 'חנות' (Shop) listing 6 product cards in a grid, each with image, product name, verse subtitle, and price (₪48–₪148)
- Category filter buttons present: מכנסיים, קפוצ׳ונים, חולצות, כובעים — confirming taxonomy-driven product collection
- Each product card links to /product/:slug (e.g. /product/torah-sweatpants, /product/torah-hoodie, /product/torah-tee, /product/torah-cap) — dedicated detail-page pattern confirmed
- Home page '/' also renders a 'הקולקציה' product grid with the same card structure and /product/:slug links, cross-page reuse confirming collection

Entries:
  - [82%] מכנסי תורה
  - [55%] קפוצ׳ון תורה
  - [90%] חולצת תורה
  - [90%] כובע תורה
  - [90%] מכנסי תורה — כחול

## Warnings
- scanned data files (src/pages/Journal.tsx, src/pages/Shop.tsx, src/components/home/ProductGrid.tsx) → blog=4, product=10
- 1 entries dropped from blog