# Quickstart: Wrapped Process Map

How to prove it works. Assumes `pnpm dev` and a seeded demo workspace.

## Run the automated checks

```bash
pnpm test                                       # the wrapping arithmetic
pnpm exec playwright test tests/e2e/report-print.spec.ts
pnpm exec playwright test tests/e2e/core-workflows.spec.ts tests/e2e/report-composer.spec.ts
```

The last two are regression guards. Most processes are short enough not to wrap, so the
likeliest damage this feature can do is to diagrams nobody asked it to change.

## Build a long process to look at

The seeded processes are all short. A 22-step one can be made directly:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/ffprocess?schema=public" \
  pnpm exec tsx ./scripts/make-long-process.ts
```

It creates `TES100 · End to end high-level` in the Acme workspace with 22 steps across
three roles, a decision that branches and rejoins, and one roleless step — enough to
exercise every story at once. Delete it with the same script's `--clean` flag.

The builder itself lives in `tests/fixtures/long-process.ts`, because the end-to-end spec
imports it and a module that runs work on import cannot be imported. It uses raw SQL
rather than Prisma, like every other fixture here: Playwright cannot import the generated
client.

## Walk it by hand

**Wrapping (User Story 1)**

1. Export a pack containing `TES100` and preview the report.
2. Its map should run onto more than one row, each step drawn at the same size a short
   process's steps are drawn at — not shrunk.
3. Count the steps on the page: 22, each once.
4. Print to PDF and read the step labels at 100%. They should be legible.
5. Preview a pack containing only the four-step `TES200` fixture. It should **not** wrap.
   Note that `PUR101` — nine steps — *does* wrap: the compact print card fits six to a row,
   so every seeded process with steps in it is now long enough. That is an improvement for
   it rather than a regression, but it is why "short enough not to wrap" needs a fixture of
   its own.

**Swimlanes (User Story 2)**

6. On the wrapped map, check every row carries its own labelled lanes.
7. Find a step on the second row and confirm it is in the lane of the role that performs it,
   with the label visible on that row.
8. Check a row whose steps are all one role: it should show that lane only, not three.

**Branches (User Story 3)**

9. Find the decision step. Both its outgoing paths should be drawn and reach their targets.
10. Find a connection whose two steps landed on different rows. The last step of the row
    should be marked as continuing onto the next, and the first step of the next as
    continuing from it — no line drawn across the page.

**The interactive map (User Story 4)**

11. Open `TES100` on the Process Map page. It should be **unwrapped**, panning and zooming
    as before.
12. Drag a step, reload, and confirm it stayed where you put it. Then export the report
    again: the wrap re-flows around the new order, and the stored position is still yours.

**The fallback**

13. Make a process long enough that even wrapping cannot keep it readable in the space the
    report gives it. It should render as one shrunk row — complete — rather than overflow
    the page or drop a row.

    In practice a tall wrapped map paginates across printed pages rather than hitting that
    cap: the 22-step fixture runs onto a second page, which the browser's own page
    breaking handles. Verified in a real PDF, not assumed.

## Read a real PDF

Not optional, and not replaceable by a test. Printing the 22-step fixture and reading it
is what caught the decision diamonds clipping their labels — "Evaluate the opportunity"
came out as "the opportunity", with the first word not merely hidden but absent from the
PDF's text layer. A step's name being wrong in a client's document is a correctness bug,
and nothing short of reading the output would have found it.

```bash
pdftotext -f 6 -l 9 report.pdf - | grep -iE "evaluate|CEO scenario"
pdftoppm -f 7 -l 7 -r 150 -png report.pdf page   # then look at it
```

## The regression that matters most

14. Preview a pack of only short processes and compare it against the same pack before this
    feature. It must be the same document. `report-print.spec.ts` covers the page-break
    behaviour that this change is most likely to disturb.
