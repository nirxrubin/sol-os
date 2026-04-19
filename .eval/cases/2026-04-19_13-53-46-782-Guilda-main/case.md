# Case 2026-04-19_13-53-46-782-Guilda-main
*captured 2026-04-19T13:53:46.784Z*

**Source:** zip / Guilda-main.zip
**Archetype:** vanilla-html / **Generator:** UNKNOWN
**Pages:** medium (4 routes) / **Non-latin:** true
**Quality:** 100% — avg conf 88%, retried: false, warnings: 0
**Label:** unlabeled (edit `feedback.json` to change)
**Prompt:** detect-v2+digest-v2

## Routes
- /
- /about
- /blog
- /blog-post

## Detected collections
### blog — det conf 100% — 0 entries
- Dedicated /blog route with <div class='blog-grid' id='cms-blog-grid'> — CMS-powered index
- Dedicated /blog-post route with <article id='cms-post'> — CMS-powered detail page
- Home page (/) contains 'קול קורא' (Call for entries) section with id='cms-slider' linking to blog.html — confirms blog feed on home

### team — det conf 85% — 0 entries
- Home page (/) contains <div class='contact-grid' id='cms-team'> under a 'צרו קשר' (Contact) heading — CMS-keyed team grid
- /about page contains <div class='contact-grid' id='cms-team-about'> under the same 'צרו קשר' heading — identical pattern on two pages
- Cross-page reuse of the cms-team grid (/ and /about) confirms a reusable people collection, not inline copy

### service — det conf 80% — 4 entries
- Section heading 'מה אנחנו עושים' (What we do) on /about — strong semantic anchor for service collection
- about-services-grid contains 4 structurally parallel about-service-item elements, each with icon + <h3> + <p>: מידע מקצועי, שמירת יצירה, ייעוץ ותמיכה, קשרים בתעשייה
- Each item is an independent offerable unit with its own title and description — not a process flow (items have no step numbers and are not sequentially dependent)

Entries:
  - [88%] מידע מקצועי
  - [88%] שמירת יצירה
  - [88%] ייעוץ ותמיכה
  - [88%] קשרים בתעשייה
