# HostaPosta — Deploy Platform Design
**Date:** 2026-04-06
**Status:** Approved, pending implementation

---

## 1. Vision

HostaPosta is the one-stop platform for deploying AI-generated websites and handing them off to clients. No external accounts, no multiple tabs, no DevOps knowledge required.

**Core promise:** Upload a ZIP → site is live in 2 clicks → client owns and manages it from HostaPosta directly.

**Positioning:** "Squarespace for AI-generated sites" — but built for the builder who delivers, not the end user who starts from scratch.

---

## 2. What Was Cut

The following features are removed from scope (not deprecated — deferred until deploy story is solid):

- Canvas / iframe editing (bridge script, hover/select/edit mode)
- CMS table view and source file injection
- Autonomous AI analysis agent (deep page/content analysis)
- Insights tab
- Content tab
- Source binding (`data-sol-field`, `__HP_DATA` injection)

**What stays:**
- Upload + zip extraction
- Archetype detection + build pipeline (needed for Next.js / Vite / CRA projects)
- Read-only preview iframe
- Supabase project tracking
- Resend email

---

## 3. Two Roles

### Builder
The person who built the site (freelancer, agency, developer using Lovable/Base44/Cursor).

- Uses HostaPosta as a deploy tool
- Uploads ZIP, previews, deploys
- Purchases or connects a domain
- Invites the client via email
- Optionally retains collaborator access after handoff

### Client
The business owner receiving the finished site.

- Has their own HostaPosta account (not a sub-account of the builder)
- Sees only their site — feels like their platform, not the builder's CRM
- Pays HostaPosta directly for hosting + domain renewal
- Can contact their builder from the dashboard
- Never sees builder's other projects

**Key UX principle:** After transfer, the builder disappears from the client's experience. The client logs into HostaPosta and it's *their* website — same feeling as logging into Squarespace.

---

## 4. Core Flows

### Builder: Deploy Flow
```
1. Upload ZIP
      ↓
2. Archetype detected (<100ms, deterministic)
   Build runs if needed (Next.js, Vite, CRA)
      ↓
3. Read-only preview at localhost:3002
      ↓
4. Click "Deploy"
   → Cloudflare Pages creates project
   → Site live at slug.hostaposta.app
      ↓
5. Optional: Buy domain / connect existing domain
   → Cloudflare Registrar API
   → DNS auto-configured
   → SSL automatic (Cloudflare)
      ↓
6. Click "Invite client"
   → Email sent via Resend
   → Client creates HostaPosta account
   → Site ownership transfers to client
```

### Client: First Login Flow
```
1. Gets email: "Your website is ready on HostaPosta"
      ↓
2. Creates HostaPosta account (email + password)
      ↓
3. Lands on personal dashboard:
   - Live site preview
   - Domain status
   - Hosting plan + next billing date
      ↓
4. Adds payment method → owns subscription
```

---

## 5. Dashboard Design

### Builder Dashboard (post-upload)

```
┌─────────────────────────────────────────────────────────┐
│  [Site Preview — read-only iframe]                      │
│                                                         │
│  calculator-main                                        │
│  ─────────────────────────────────────────────────────  │
│  Status:   ● Not deployed                               │
│  URL:      [Deploy →]                                   │
│                                                         │
│  Domain:   [Buy domain]  [Connect existing]             │
│                                                         │
│  Client:   [Invite client]                              │
└─────────────────────────────────────────────────────────┘
```

After deploy:
```
│  Status:   ● Live
│  URL:      calculator-main.hostaposta.app  [Copy] [Open]
│  Domain:   yoursite.com  ✓ Connected
│  Client:   jaco@techstura.com  · Invite pending
```

### Client Dashboard (personal, post-transfer)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  [Your Website — read-only preview]                     │
│                                                         │
│  ● Live  ·  yoursite.com                [Open site ↗]  │
│  ─────────────────────────────────────────────────────  │
│  Hosting     Starter · $X/mo                            │
│              Renews 1 May 2026          [Manage]        │
│                                                         │
│  Domain      yoursite.com                               │
│              Expires 6 Apr 2027 · Auto-renew on        │
│                                                         │
│  Builder     Nir Rubin                 [Send message]   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

No tabs. No sidebar with other projects. Just their site.

---

## 6. Infrastructure

| Layer | Provider | Notes |
|---|---|---|
| Client site hosting | Cloudflare Pages | `slug.hostaposta.app` subdomains |
| Custom domains | Cloudflare Registrar API | Purchase + DNS inside HostaPosta |
| SSL | Cloudflare | Automatic, included |
| Database / Auth | Supabase | Already wired, handles user accounts + project records |
| Email | Resend | Invites, transfer confirmation, renewal reminders |
| Billing | **Mocked for now** | See §7 |
| Dashboard app | `app.hostaposta.app` | Cloudflare Pages or current Vite dev build |

**Domain:** `hostaposta.app` purchased in Cloudflare account ✓
- Client sites: `slug.hostaposta.app`
- Dashboard: `app.hostaposta.app`

---

## 7. Billing — Mocked for Now

Stripe is not available in Israel and requires an LLC. The billing UI will be fully designed and rendered but non-functional until a payment processor is set up.

**Billing UI is mocked as:**
- Plan badge shown (Starter / Pro)
- Renewal date shown (static placeholder)
- "Manage billing" button → shows "Coming soon" modal

**When ready, preferred processors (support Israel, no LLC required):**
1. **Paddle** — merchant of record, handles VAT, supports IL
2. **Lemon Squeezy** — same model, easier onboarding
3. **Stripe** — requires non-IL entity (LLC or similar); possible later via US/EU entity

**Planned pricing (modelled on Jade Hosting):**

| Plan | Price | Projects | Bandwidth |
|---|---|---|---|
| Starter | $7/mo | 1 | 100 GB |
| Pro | $19/mo | 5 | Unlimited |
| Agency | $49/mo | Unlimited | Unlimited |

Domain registration: at-cost passthrough + $2 handling fee.

---

## 8. What Changes in the Codebase

### Remove
- `src/analyze/autonomousAgent.ts` — AI analysis agent
- `src/analyze/systemPrompt.ts` — AI system prompt
- `src/analyze/outputSchema.ts` — AI output schema
- `src/analyze/tools.ts` — AI file tools
- `src/analyze/localClaude.ts` — local Claude bridge
- `src/engine/injector.ts` — `__HP_DATA` source injection
- `src/edits.ts` — canvas + CMS write-back
- Bridge script in `src/preview.ts` — remove all edit-mode JS (keep read-only iframe serve)
- `solo-app/src/components/CMSTableView.tsx`
- `solo-app/src/components/PageEditor.tsx` (canvas edit controls only — keep preview iframe)

### Keep / Simplify
- `src/analyze/detector.ts` — archetype + generator detection (keep, used for build)
- `src/analyze/build.ts` — build pipeline (keep, needed for Next.js/Vite)
- `src/upload.ts` — zip extraction (keep)
- `src/preview.ts` — read-only file server (simplify, remove bridge)
- `src/state.ts` — project state (keep, simplify fields)
- Supabase integration (keep)
- Resend integration (keep)

### Add (new work)
- Cloudflare Pages deploy API (`src/deploy/cloudflarePages.ts`)
- Cloudflare Registrar domain search + purchase (`src/deploy/cloudflareDomain.ts`)
- Builder auth (Supabase Auth)
- Client auth + ownership transfer flow
- Client portal UI (`solo-app/src/components/ClientDashboard.tsx`)
- Builder project list UI
- Invite + transfer email templates

---

## 9. Out of Scope (for this phase)

- Canvas editing (deferred, not deleted from git)
- CMS editing (deferred)
- White-labelling (client sees HostaPosta brand, not builder's)
- Team seats / collaborator permissions
- Site analytics / traffic dashboard
- Database provisioning for client apps
- Git-based deploy (ZIP only for now)
