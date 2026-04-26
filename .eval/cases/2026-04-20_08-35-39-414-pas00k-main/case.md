# Case 2026-04-20_08-35-39-414-pas00k-main
*captured 2026-04-20T08:35:39.415Z*

**Source:** zip / pas00k-main.zip
**Archetype:** vite-react / **Generator:** LOVABLE
**Pages:** medium (6 routes) / **Non-latin:** false
**Quality:** 90% — avg conf 82%, retried: false, warnings: 2
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
  - [72%] משקל המילים
  - [72%] חוט ומסורת
  - [55%] אופנה איטית, מטרה קדושה

### service — det conf 85% — 6 entries
- static data file: src/pages/Journal.tsx

Entries:
  - [90%] מכנסי תורה
  - [90%] קפוצ׳ון תורה
  - [90%] חולצת תורה
  - [90%] כובע תורה
  - [90%] מכנסי תורה — כחול

## Warnings
- scanned data files (src/pages/Journal.tsx, src/pages/Shop.tsx, src/components/home/ProductGrid.tsx) → blog=4, service=10
- 1 entries dropped from blog