import "dotenv/config";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import {
  makeTangledProcess,
  removeTangledProcess,
  TANGLED_PROCESS_ID,
} from "../fixtures/tangled-process";

/**
 * How the Process Map routes its connectors, measured off the rendered page.
 *
 * Nothing here reads the source. It samples every connector's drawn path and
 * every card's drawn box out of the DOM and counts two things:
 *
 *   - connectors whose path enters a card that is not one of their own two
 *     endpoints, which makes the map assert a relationship that isn't there;
 *   - pairs of connectors that run along the same line far enough that a
 *     reader would see one arrow where there are two.
 *
 * Both must be zero. Measured before the router existed, on this same
 * fixture, they were 9 and 3 — the numbers recorded in research.md.
 */
const WORKSPACE = "workspace-acme";

test.beforeAll(async () => {
  await makeTangledProcess();
});

test.afterAll(async () => {
  await removeTangledProcess();
});

/** A card as drawn, and a connector as drawn, both in one flat page coordinate space. */
type Box = { id: string; left: number; right: number; top: number; bottom: number };
type Wire = { id: string; points: [number, number][] };

/**
 * Reads the map out of the page.
 *
 * Both nodes and edges are read in viewport coordinates via getBoundingClientRect
 * and getPointAtLength, so the canvas's own zoom and pan are already applied to
 * both and cancel out of every comparison.
 */
async function readMap(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const flow = document.querySelector(".react-flow");
    if (!flow) throw new Error("no map on the page");

    // Everything below is read in viewport pixels, which the canvas's zoom has
    // already been applied to. Distances are therefore reported back in canvas
    // units, so a threshold means the same thing whatever zoom fitView landed
    // on — routing is a property of the layout, not of how far you happen to
    // be zoomed out.
    const viewport = flow.querySelector<HTMLElement>(".react-flow__viewport")!;
    const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a || 1;

    // Lane bands, the branch gutter and the branch entry are nodes too. Only
    // the three step kinds are cards a connector must not be drawn through,
    // and React Flow puts the node's type in its class, so ask for those.
    const CARD = ".react-flow__node-task, .react-flow__node-decision, .react-flow__node-terminal";
    const boxes: Box[] = [];
    for (const el of Array.from(flow.querySelectorAll<HTMLElement>(CARD))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      boxes.push({
        id: el.getAttribute("data-id") ?? "",
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      });
    }

    const wires: Wire[] = [];
    for (const el of Array.from(flow.querySelectorAll<SVGGElement>(".react-flow__edge"))) {
      // The interaction path is a second, much wider copy of the same line;
      // reading both would count every connector as overlapping itself.
      const path = el.querySelector<SVGPathElement>("path.react-flow__edge-path");
      if (!path) continue;
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length === 0) continue;
      // getPointAtLength answers in the path's own user space, which the
      // canvas's pan-and-zoom transform has not been applied to; the cards are
      // measured in viewport space. Without getScreenCTM the two never meet and
      // every check silently passes — which is what the first version of this
      // spec did, reporting no card crossings on a map that was full of them.
      const ctm = path.getScreenCTM();
      if (!ctm) continue;
      const points: [number, number][] = [];
      const SAMPLES = 220;
      for (let i = 0; i <= SAMPLES; i++) {
        const p = path.getPointAtLength((length * i) / SAMPLES).matrixTransform(ctm);
        points.push([p.x, p.y]);
      }
      wires.push({ id: el.getAttribute("data-id") ?? "", points });
    }
    return { boxes, wires, zoom };
  });
}

/** True when a sampled path enters the inside of a box, ignoring its rim. */
function entersBox(points: [number, number][], box: Box, inset: number): boolean {
  return points.some(
    ([x, y]) =>
      x > box.left + inset && x < box.right - inset && y > box.top + inset && y < box.bottom - inset
  );
}

/**
 * Two connectors "share a line" when many of one's sampled points sit almost
 * on top of the other's. A single crossing touches at one point and does not
 * count — what makes a map unreadable is a shared run, not an intersection.
 */
function sharesLine(a: [number, number][], b: [number, number][], tolerance: number, minRun: number) {
  let shared = 0;
  for (const [x, y] of a) {
    if (b.some(([u, v]) => Math.abs(x - u) < tolerance && Math.abs(y - v) < tolerance)) shared++;
  }
  return shared >= minRun;
}


/** The same two measurements, over whatever canvases are on the page. */
function measure(boxes: Box[], wires: Wire[], zoom: number) {
  const crossings: string[] = [];
  for (const wire of wires) {
    for (const box of boxes) {
      const own =
        entersBox(wire.points.slice(0, 3), box, -4 * zoom) ||
        entersBox(wire.points.slice(-3), box, -4 * zoom);
      if (own) continue;
      if (entersBox(wire.points, box, 3 * zoom)) crossings.push(`${wire.id} through ${box.id}`);
    }
  }
  const pairs: string[] = [];
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      if (sharesLine(wires[i]!.points, wires[j]!.points, 6 * zoom, 20)) {
        pairs.push(`${wires[i]!.id} + ${wires[j]!.id}`);
      }
    }
  }
  return { crossings, pairs };
}

async function openMap(page: import("@playwright/test").Page) {
  // A stated viewport, not whatever the runner defaults to. The map fills the
  // width of the page it is on, so the window size decides the zoom, which
  // decides how big a connect handle is and where on screen it lands — at the
  // default 1280x720 a handle sat under the canvas's own hint panel, and a
  // mousedown aimed at it hit the panel instead.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page);
  await page.goto(`/workspaces/${WORKSPACE}/processes/${TANGLED_PROCESS_ID}/map`);
  await page.waitForSelector(".react-flow__edge-path");
  await page.waitForTimeout(1200);
}

test("no connector runs through a card it does not belong to", async ({ page }) => {
  await openMap(page);
  const { boxes, wires, zoom } = await readMap(page);
  expect(boxes.length).toBeGreaterThanOrEqual(10);
  expect(wires.length).toBeGreaterThanOrEqual(13);

  // A connector's own endpoints are where it starts and stops, so its first
  // and last samples are inside them by definition and are excluded. 3 canvas
  // px in: a connector grazing a card's rim is drawing to it, a connector 3px
  // inside it is drawing through it.
  const { crossings } = measure(boxes, wires, zoom);
  expect(crossings, `connectors crossing an unrelated card:\n${crossings.join("\n")}`).toEqual([]);
});

test("no two connectors are drawn along the same line", async ({ page }) => {
  await openMap(page);
  const { boxes, wires, zoom } = await readMap(page);

  // 6 canvas px apart, against a 2px stroke: three stroke widths of clear
  // space is the point at which two parallel lines stop reading as one.
  const { pairs } = measure(boxes, wires, zoom);
  expect(pairs, `connector pairs sharing a line:\n${pairs.join("\n")}`).toEqual([]);
});

test("the printed map is no longer drawn by the router at all", async ({ page }) => {
  // This used to assert that screen and print consumed one router, so they
  // could not disagree about how a connector was routed. Spec 013 ended that
  // contract deliberately: the printed map is now server-rendered HTML with no
  // canvas and no measured routing, because routing a wide drawing onto a
  // narrow page is what shrank its type to five points and clipped its cards.
  //
  // What still has to hold is the split — the report draws no canvas, and the
  // interactive map still does, routed exactly as before.
  await signIn(page);
  await page.goto(`/reports/${WORKSPACE}?ids=${TANGLED_PROCESS_ID}`);
  await page.waitForSelector(".report-paper");
  await page.waitForSelector(".printed-map");

  const onReport = await page.evaluate(() => ({
    maps: document.querySelectorAll(".printed-map").length,
    // The org chart is still a canvas; the map must not be.
    canvasesInsideAMap: document.querySelectorAll(".printed-map .react-flow").length,
    routedEdges: document.querySelectorAll(".printed-map .react-flow__edge-path").length,
  }));

  expect(onReport.maps).toBeGreaterThan(0);
  expect(onReport.canvasesInsideAMap, "the printed map draws no canvas").toBe(0);
  expect(onReport.routedEdges, "and no routed edges").toBe(0);
});

test("a step that is dragged takes its connectors with it", async ({ page }) => {
  await openMap(page);
  const before = await readMap(page);

  // The last step, moved further right into empty space. Two things rule out
  // a bigger or more central move: dropping a card in a *different* lane
  // reassigns its role and the page reloads from the server, which would put
  // the card back where the new lane says it goes; and at this zoom a drag of
  // a few dozen screen pixels is several hundred on the canvas, enough to land
  // one card on top of another, which is an arrangement no routing can draw
  // cleanly and not what this is testing.
  const card = page.locator(`.react-flow__node[data-id="${TANGLED_PROCESS_ID}-step-10"]`);
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // A short move first, to get past the threshold that tells a drag from a click.
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const after = await readMap(page);
  const cardAt = (m: typeof before, id: string) => m.boxes.find((b) => b.id.endsWith(id))!;
  // If the drag itself did not take, everything below is meaningless — and a
  // mouse move to a point outside the window does nothing at all, which reads
  // exactly like a routing failure.
  expect(cardAt(after, "step-10").left).toBeGreaterThan(cardAt(before, "step-10").left + 30);

  const pathOf = (m: typeof before, id: string) => {
    const wire = m.wires.find((w) => w.id.endsWith(id));
    if (!wire) throw new Error(`no connector ${id} on the map`);
    return JSON.stringify(wire.points.map((p) => p.map(Math.round)));
  };

  // conn-9 (step 9 -> step 10) touches the card that moved, so its drawn path
  // must have moved too. A route frozen onto the edges when they were first
  // built leaves it pointing at where the card was.
  expect(pathOf(after, "conn-9")).not.toBe(pathOf(before, "conn-9"));

  // ...and the map is still clean afterwards.
  const { crossings, pairs } = measure(after.boxes, after.wires, after.zoom);
  expect([...crossings, ...pairs], `after dragging:\n${[...crossings, ...pairs].join("\n")}`).toEqual([]);
});

test("a connector drawn by hand is routed like the rest", async ({ page }) => {
  await openMap(page);
  const before = await readMap(page);

  // Step 1 to step 4, across lanes that already carry connectors. The drop has
  // to land on the target's own handle: React Flow's default connection mode
  // ignores a drop on the body of a card.
  const target = page.locator(`.react-flow__node[data-id="${TANGLED_PROCESS_ID}-step-4"]`);
  await target.scrollIntoViewIfNeeded();
  const source = page
    .locator(`.react-flow__node[data-id="${TANGLED_PROCESS_ID}-step-1"] .react-flow__handle-right`)
    .first();
  // The *target* handle, not the source one that shares its position and its
  // class: dropping on the source handle connects the two the other way round.
  const drop = page
    .locator(`.react-flow__node[data-id="${TANGLED_PROCESS_ID}-step-4"] .react-flow__handle-left.target`)
    .first();
  const a = (await source.boundingBox())!;
  const b = (await drop.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () => (await readMap(page)).wires.length, { timeout: 8000 })
    .toBe(before.wires.length + 1);

  // The new connector takes its own line rather than landing on one already
  // there, and nothing it shares a card or a band with is disturbed.
  const after = await readMap(page);
  const { crossings, pairs } = measure(after.boxes, after.wires, after.zoom);
  expect([...crossings, ...pairs], `after connecting:\n${[...crossings, ...pairs].join("\n")}`).toEqual([]);
});
