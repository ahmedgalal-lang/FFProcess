# Research: Governance Dashboard

## Decision 1 — Tiles are computed server-side by one pure function

`lib/domain/governance-dashboard.ts`: `buildDashboardTiles(input, today)`
takes whatever registers exist and returns an ordered list of tiles `{ id,
label, count, tone, href }`. Tiles for a register that isn't built yet are
simply never produced (FR-005) — the input type grows a field as each spec
ships. Counts are computed at page load from data `page.tsx` already
fetches (no stored snapshots, SC-002).

## Decision 2 — Links go to the section; risk tiles also filter, across aspects

Every register gets a stable section anchor (`#risk-register`,
`#policy-library`, `#checklist`, `#incidents`, …). Dashboard counts are
workspace-wide, but the Risk Register is scoped to the active aspect tab,
so a "3 High risks" link that landed on a tab showing one of them would be
wrong. Risk-level tiles therefore link to `?riskLevel=HIGH#risk-register`,
and the register, when given a level, shows every open risk at that level
*across all aspects*, labelled as such, with a way to clear it. Other tiles
link to their section, where the counted records are already flagged.

## Decision 3 — Ethics count is Admin-only by never computing it otherwise

`page.tsx` only loads ethics cases for Admins (spec 022), so for anyone
else the ethics field of the tile input is absent and no tile is produced —
not a zero (FR-006).

## Decision 4 — "Nothing recorded yet" is a distinct state

When every register is empty, the panel shows one explicit message instead
of a row of zero tiles that reads like a clean bill of health (FR-003).

## Decision 5 — Delivery order

Built after specs 028, 027, 024, 025, 021, 023 and 022, so every tile in
User Story 2 has its data on day one; the function is still written so a
missing register just drops its tiles.
