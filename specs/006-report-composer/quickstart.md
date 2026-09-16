# Quickstart: Report Composer

How to prove the feature works. Assumes `pnpm dev` and a seeded demo workspace
(`SEED_DEMO_WORKSPACE=1 pnpm exec tsx prisma/seed.ts`).

## Run the automated checks

```bash
pnpm test                                             # domain rules, incl. merge + numbering
pnpm exec playwright test tests/e2e/report-composer.spec.ts
pnpm exec playwright test tests/e2e/report-order.spec.ts tests/e2e/export.spec.ts
pnpm exec playwright test tests/e2e/viewer-read-only.spec.ts
```

The last two are regression guards, not new work: `export.spec.ts` and `report-order.spec.ts`
cover the behaviour this feature must not disturb, and the viewer spec covers controls a
read-only user must never see.

## Walk it by hand

**Excluding (User Story 1)**

1. Open a workspace's Export Report page as an editor. The new panels list the pack
   sections, the per-process sections with their blocks, and the processes.
2. Note that every process section is numbered `1.0`–`4.0` and every block `N.M`.
3. Untick **Executive Summary**. Process Map should immediately become `1.0`, its blocks
   `1.1`–`1.3`, and everything below shift up.
4. Preview the report. No process has an Executive Summary, and the headings match the
   numbers from step 3.

**Ordering (User Story 2)**

5. Move **RACI & Authority Matrix** above Process Map. It becomes `1.0`; its blocks become
   `1.1` and `1.2`.
6. Press ↓ on **RACI grid**. The authority rules travel with it — they have no arrows of
   their own, and the row says so.
7. Preview again: the document order and every number match the screen.
8. Download the slide deck. The deck's sections follow the same order.

**Per client (User Story 3)**

9. Note the arrangement, then switch to another workspace's Export Report page. It shows
   the default arrangement, untouched.
10. Return to the first workspace. Your arrangement is as you left it.
11. Sign in as a different editor and open the same workspace: the same arrangement.

**Empty but included (User Story 4)**

12. Pick a process with no KPIs — seeded `PUR100` has almost nothing. With the KPI block
    ticked, preview: the block appears in place, numbered, marked as having nothing
    recorded.
13. Untick it and preview again: gone entirely, and the numbers close up.
14. Check the preview-only banner above the report: it now lists what is empty and still
    printed, rather than claiming sections were left out.

**Nothing included (edge case)**

15. Untick every section. The preview should say the pack is empty rather than render a
    blank page or fail.

**Access (FR-017, FR-018)**

16. Sign in as a viewer and open the Export Report page. No arranging control anywhere —
    and **Preview report** and the deck download still work. That second half is the point:
    reading and exporting is most of why a client is given an account.

## The regression that matters most

17. On a workspace **nobody has arranged**, preview the report and compare it against the
    same report before this feature. It must be the same document. SC-007 is the guard
    against a 1,092-line restructuring quietly changing every existing client pack, and it
    is worth checking by eye as well as by test.

## Keyboard check (Principle IV)

18. Reach every tick and every arrow by Tab alone, operate them with Enter or Space, and
    confirm a visible focus ring throughout. The arrows are buttons, not drag handles,
    precisely so this works.
