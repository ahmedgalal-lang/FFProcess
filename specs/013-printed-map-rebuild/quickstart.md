# Quickstart: validating the rebuilt printed map

How to prove this feature works, end to end, against the shape that caused it.

## Prerequisites

```bash
pnpm install
pnpm exec prisma migrate dev     # picks up Workspace.reportMapLayout
pnpm db:seed
pnpm dev                          # http://localhost:3000
```

The fixture that reproduces the reported defects is `tests/fixtures/tender-process.ts` — 18
steps, 4 roles, two decisions that each fork, and one label long enough to overflow today's
card. It is what every measurement below runs against.

## 1. See it

```bash
pnpm exec tsx -e "import('./tests/fixtures/tender-process.ts').then(m => m.makeTenderProcess())"
```

Sign in as the seeded Firm Owner, then open:

```
/reports/workspace-acme?ids=tender-process-fixture
```

Expect, on the map section:

- every card showing its whole label, including *"Internal resources evaluation and needs
  (e.g.; Hr, staffing, salaries, etc..)"* — no ellipsis, no text running past the card;
- the process reading top to bottom, with nothing anywhere telling you which way to read;
- the two decisions showing their branches with **their own** labels — `Yes`/`No` on the
  first, `Locally`/`Internationally` on the second;
- no stub, arrow or marker beside a card that does not lead somewhere.

Switch **Map layout** in the toolbar to **Roles**: the same 18 steps redraw as four columns,
one per role. Reload — it is still Roles.

## 2. Measure it

The success criteria are measurements, so they are asserted rather than eyeballed:

```bash
pnpm exec playwright test tests/e2e/printed-map.spec.ts
```

This renders the fixture in **both** layouts and asserts, per layout:

| Assertion | Today | Required |
|---|---|---|
| cards whose text overflows their box | 18 | **0** |
| elements clipped by the region they are drawn in | 1 | **0** |
| row labels overlapping a connector | 1 | **0** |
| stubs further than 120px from any card | 1 | **0** |
| parts of the drawing stating a reading direction | 2 rows | **0** |
| connections neither drawn nor back-referenced | — | **0** |
| stored `positionX`/`positionY` changed by exporting | — | **0** |

## 3. The domain logic, on its own

```bash
pnpm exec vitest run tests/unit/print-map-layout.test.ts
```

Covers what the module decides rather than how it looks: which connection continues the
spine, that a branch carries its own label and not a neighbour's, that the indent cap holds,
that a cycle terminates, and that a 6-role process asked for `ROLES` comes back as `FLOW`
with a stated reason.

Each of these is mutation-checked: break the rule in the source, confirm the test goes red,
restore.

## 4. The role ceiling

```bash
pnpm exec tsx -e "import('./tests/fixtures/wide-process.ts').then(m => m.makeWideProcess())"
```

Open the report for `wide-process-fixture` (6 roles) with the client set to **Roles**. Expect
the map to print in Flow, with a line where it is drawn saying it fell back and why — not six
unreadably narrow columns, and not an error page.

## 5. Nothing else moved

```bash
pnpm exec playwright test tests/e2e/wrapped-process-map.spec.ts tests/e2e/connector-routing.spec.ts
pnpm exec playwright test tests/e2e/core-workflows.spec.ts
```

The interactive canvas and the PPTX deck are out of scope and must be unchanged: the deck
still wraps its map serpentine, and the canvas still routes its connectors. If either of
these suites moves, the blast radius is wrong.

## 6. The whole gate

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm exec playwright test
```
