# Case 2026-04-23_11-41-03-541-casa-do-brasil-main
*captured 2026-04-23T11:41:03.550Z*

**Source:** zip / casa-do-brasil-main.zip
**Archetype:** vite-react / **Generator:** UNKNOWN
**Pages:** large (10 routes) / **Non-latin:** false
**Quality:** 97% — avg conf 90%, retried: false, warnings: 1
**Label:** unlabeled (edit `feedback.json` to change)
**Prompt:** detect-v2+digest-v2

## Routes
- /
- /404
- /benefits
- /blog
- /faq
- /gallery
- /menu
- /playlist
- /story
- /vip

## Detected collections
### blog — det conf 95% — 0 entries
- dedicated /blog index route with grid of article cards
- 3+ visible articles (Picanha — The Crown Cut of Brasil, What is Churrascaria?, Caipirinha Recipe) each with date, category tag, thumbnail image, excerpt
- each card links to /blog/:slug detail pages (e.g. /blog/picanha-the-crown-cut, /blog/churrascaria-experience, /blog/caipirinha-recipe)

### faq — det conf 90% — 0 entries
- dedicated /faq route with accordion-style Q&A pairs
- 4+ visible Q&A items: 'Do I need a reservation?', 'What are your opening hours?', 'Is the restaurant kosher?', 'Do you have a menu for children?'
- each item uses consistent button[aria-expanded] + collapsible answer pattern

### product — det conf 72% — 0 entries
- dedicated /menu route with tabbed category navigation: Churrascaria, Specials, Under 12, Desserts, Lunch Set, Fresh Meat By Weight
- structured menu items with names, descriptions, and likely prices within each tab
- category field maps naturally to the tab taxonomy; no individual detail pages detected

### testimonial — det conf 85% — 20 entries
- static data file: client/src/components/ReviewsSection.tsx

Entries:
  - [90%] Noa S.
  - [90%] Daniel K.
  - [90%] Maya R.
  - [90%] Avi L.
  - [90%] Sarah M.

## Warnings
- scanned data files (client/src/components/ReviewsSection.tsx) → testimonial=20