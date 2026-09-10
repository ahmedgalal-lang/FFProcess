# FFProcess

Process mapping, RACI matrices, and authority (delegation-of-authority) matrices for
consulting engagements — one shared org model (Roles, People, Processes) reused across all
three views, scoped per client Workspace under a single Firm.

Full product spec, plan, and task breakdown: [`specs/001-process-mapping-raci-authority/`](specs/001-process-mapping-raci-authority/).
Governing principles: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Stack

Next.js 16 (App Router, TypeScript strict) · PostgreSQL via Prisma 7 (driver adapters) ·
Auth.js v5 (Credentials, JWT sessions) · Zod · Vitest · Playwright.

## Setup

1. **Database**: point `DATABASE_URL` (see `.env.example`) at a PostgreSQL 16 instance.
2. **Install & configure**:
   ```bash
   pnpm install
   cp .env.example .env   # fill in DATABASE_URL and AUTH_SECRET
   pnpm db:migrate         # applies prisma/migrations
   pnpm db:seed            # seeds the Firm and its Firm Owner (see below)
   pnpm dev
   ```
3. Open http://localhost:3000 — sign in as the seeded **Firm Owner**,
   `ahmed.galal@forefront.consulting`, password `password123` (it reaches every client
   Workspace via the Constitution Principle V carve-out, even without an explicit Member
   record). Change this password on any deployment: the seed's is public, in this file.

   The seed creates no other sign-in, and no Workspaces, people or processes — you make
   your first Workspace in the app. It used to build a fictional client ("Acme
   Industrial") complete with invented staff, one of whom had a working Editor login on
   the password above. That put a made-up client and four made-up employees into every
   database the seed had ever been pointed at, deployed ones included.

### The demo Workspace

That demo content still exists, because the e2e suite asserts against it — it is just
opt-in now, and only the tests opt in:

```bash
SEED_DEMO_WORKSPACE=1 pnpm db:seed
```

It creates one Workspace ("Acme Industrial") with a Purchase-to-Pay process (`PUR101`,
under program `PUR100`), its RACI matrix (with one intentional validation gap to
demonstrate FR-006), an Authority Matrix for "Purchase Order" approvals, and cross-process
links to `PUR102` (Vendor Onboarding) and `SAL101` (Sales Order Fulfillment). The people
and the non-owner account the org-chart and permission specs need are created separately,
in `tests/e2e/global-setup.ts`.

Never run it against a deployment.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / start |
| `pnpm lint` | ESLint |
| `pnpm test` / `pnpm test:watch` | Vitest — business-rule unit tests (`tests/unit/`) and Server Action integration tests (`tests/integration/`) |
| `pnpm test:e2e` | Playwright — end-to-end workflows (`tests/e2e/`), auto-starts the dev server |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:generate` | `prisma generate` (also runs on `postinstall`) |
| `pnpm db:seed` | Runs `prisma/seed.ts` |
| `pnpm db:studio` | `prisma studio` — browse the database |

## What's implemented

- Auth (email/password via Credentials + JWT sessions), Firm Owner cross-workspace carve-out;
  Firm Settings page for Firm Owners to promote/demote other Firm Owners (`/firm/settings`,
  linked from the header only when signed in as one), with a guard against removing the last one
- Org Directory (Roles, People) with archive-not-delete semantics
- Processes: creation with unique Process Codes, main/sub-process hierarchy, cross-process
  step links (one step can link to multiple other Processes)
- Process Map: React Flow diagram canvas (swimlanes, decision diamonds, drag-to-reposition
  with autosave, drag-to-connect between step handles, click-to-select + Delete a connector)
  with a Diagram/Steps-List toggle over the same underlying data (FR-027); add-step flow with
  auto-layout (lane by Role, appended left-to-right); PNG export of the live canvas
- RACI Matrix: live grid, validation (missing/multiple Accountable, missing Responsible),
  finalize/reopen lifecycle, PDF/Excel export
- Authority Matrix: threshold + co-approval rules, approver query tool, gap/conflict detection,
  PDF/Excel export
- Members: invite by email with a tokenized accept link (7-day expiry) — sent via Resend when
  `RESEND_API_KEY` is configured, otherwise shown directly in the UI as a shareable link;
  the accept page creates an account for brand-new invitees or signs an existing account in;
  access-level management, last-Admin protection
- All business rules (`lib/domain/*`) are unit-tested first, per Constitution Principle III;
  the Server Action layer itself has integration tests (`tests/integration/`) against a real
  Postgres DB, each using its own throwaway Firm/Workspace fixture
- Accessibility: keyboard node focus/move + ARIA labeling on the Process Map canvas, arrow-key
  grid navigation + ARIA semantics on the RACI grid, and an automated axe-core scan
  (`tests/e2e/accessibility.spec.ts`) covering the Process Map, RACI, Authority, Firm Settings,
  Members, Org Directory, Processes, and Workspace picker pages with zero violations
- Export downloads (PDF/Excel/PNG headers and file signatures, plus the unauthenticated-request
  case) are covered by `tests/e2e/export.spec.ts`

## Not yet built

A full manual screen-reader walkthrough (the accessibility pass so far is keyboard nav + ARIA +
automated axe-core scanning, not hands-on assistive-tech testing), and optimistic-concurrency
handling on the Process Map (two people editing the same map at once isn't detected — fine for
the current single-editor-at-a-time assumption). See
`specs/001-process-mapping-raci-authority/tasks.md` for the full remaining task list.
