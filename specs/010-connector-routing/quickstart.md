# Quickstart: validating connector routing

## Prerequisites

```bash
pnpm install
SEED_DEMO_WORKSPACE=1 pnpm db:seed     # the Acme workspace, with a 22-step process
nohup pnpm dev > /tmp/dev.log 2>&1 &   # never `pkill -f "next dev"` — it kills the shell
```

## 1. The routing itself (fast, no browser)

```bash
pnpm test tests/unit/connector-routing.test.ts
```

Proves the guarantees in `data-model.md` on hand-built geometry: distinct corridor lines,
lines inside their band, exits inside their gutter, determinism, and one entry per input
connection.

**Mutation check** — these tests are only worth running if they fail when the routing is
wrong. Break each of these one at a time and confirm a test goes red:

- make all connectors in a band share one corridor y
- let a corridor y sit at a band edge instead of inside it
- give two connectors leaving the same card the same exit distance
- route an adjacent pair instead of drawing it direct

## 2. The drawn result (the measurement that matters)

```bash
pnpm test:e2e tests/e2e/connector-routing.spec.ts
```

This does not read the source. It opens the demo workspace's largest process map, reads
every connector's rendered SVG path and every card's rendered box out of the page, and
computes the two numbers from the spec:

- **connectors crossing a card that is not their own endpoint** — must be 0 (SC-001)
- **pairs of connectors sharing a line for a readable distance** — must be 0 (SC-002)

Baselines to beat, measured on the mockup's sample before the change: 9 and 4.

The same spec drags a card to a new lane and re-reads the paths, so FR-010 is measured
rather than assumed.

## 3. Screen and print agree

```bash
pnpm test:e2e tests/e2e/report-diagram.spec.ts
```

The existing diagram spec already compares the static report diagram against the live
canvas; it gains a check that a connector's route shape matches in both (SC-005).

## 4. Read the PDF

Automated checks do not catch "this looks wrong". Export the report for the demo
workspace, rasterise it, and look at the process pages:

```bash
pdftoppm -r 110 -png /tmp/report.pdf /tmp/page
```

Look for: an arrow entering a card it should not, an arrow leaving the map's bounds, a
label sitting on the wrong line.
