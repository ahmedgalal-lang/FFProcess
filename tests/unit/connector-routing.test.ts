import { describe, expect, it } from "vitest";
import {
  routeConnectors,
  type ConnectorRoute,
  type RoutedConnection,
  type RoutedStep,
} from "@/lib/domain/connector-routing";
import { LANE_HEIGHT, LANE_TOP_OFFSET, NODE_HALF_SIZE, STEP_X_SPACING, FIRST_STEP_X } from "@/lib/domain/process-layout";

/**
 * The router's guarantees, on geometry laid out the way the map lays it out.
 *
 * Each test names the mutation it catches. A geometric invariant is cheap to
 * assert and impossible to eyeball, which is the whole reason these exist —
 * three previous fixes to this map looked right in a screenshot and were not.
 */

type Kind = "task" | "decision" | "terminal";

/** A step where the auto-layout would put it: column `col`, lane `lane`. */
function step(id: string, col: number, lane: number, kind: Kind = "task"): RoutedStep {
  const half = NODE_HALF_SIZE[kind];
  return {
    id,
    x: FIRST_STEP_X + col * STEP_X_SPACING,
    y: lane * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_HEIGHT / 2,
    width: half.x * 2,
    height: half.y * 2,
  };
}

function link(id: string, from: string, to: string): RoutedConnection {
  return { id, fromStepId: from, toStepId: to };
}

/** The ten-step, three-lane shape the e2e fixture draws. */
function tangled() {
  const steps = [
    step("s1", 0, 0, "terminal"),
    step("s2", 1, 1),
    step("s3", 2, 2),
    step("s4", 3, 1),
    step("s5", 4, 2, "decision"),
    step("s6", 5, 0),
    step("s7", 6, 1),
    step("s8", 7, 2, "decision"),
    step("s9", 8, 1),
    step("s10", 9, 0, "terminal"),
  ];
  const connections = [
    ...Array.from({ length: 9 }, (_, i) => link(`c${i + 1}`, `s${i + 1}`, `s${i + 2}`)),
    link("c10", "s2", "s7"),
    link("c11", "s3", "s8"),
    link("c12", "s8", "s3"),
    link("c13", "s5", "s8"),
  ];
  return { steps, connections };
}

function boxOf(s: RoutedStep) {
  return {
    left: s.x - s.width / 2,
    right: s.x + s.width / 2,
    top: s.y - s.height / 2,
    bottom: s.y + s.height / 2,
  };
}

/**
 * The polyline a renderer draws from a route — the same six points
 * routed-edge.tsx builds, so this tests what actually reaches the screen and
 * not just the numbers on the way there.
 */
function polyline(route: ConnectorRoute, from: RoutedStep, to: RoutedStep): [number, number][] {
  // The same arithmetic routed-edge.tsx does, from the handle positions React
  // Flow would hand it — so this tests what actually reaches the screen and
  // not just the numbers on the way there.
  const place = (step: RoutedStep, end: ConnectorRoute["source"]) => {
    const box = boxOf(step);
    const vertical = end.side === "top" || end.side === "bottom";
    const handleX = end.side === "right" ? box.right : end.side === "left" ? box.left : step.x;
    const handleY = end.side === "bottom" ? box.bottom : end.side === "top" ? box.top : step.y;
    const attachX = vertical ? handleX + end.alongOffset : handleX + (end.side === "left" ? end.inset : -end.inset);
    const attachY = vertical ? handleY + (end.side === "top" ? end.inset : -end.inset) : handleY + end.alongOffset;
    return { attach: [attachX, attachY] as [number, number], turnX: handleX + end.turnOffsetX };
  };
  const a = place(from, route.source);
  const b = place(to, route.target);
  if (route.kind === "direct") return [a.attach, b.attach];
  return [
    a.attach,
    [a.turnX, a.attach[1]],
    [a.turnX, route.corridorY],
    [b.turnX, route.corridorY],
    [b.turnX, b.attach[1]],
    b.attach,
  ];
}

/** Does an axis-aligned segment pass through the inside of a box? */
function segmentEntersBox(
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
  box: { left: number; right: number; top: number; bottom: number }
): boolean {
  const loX = Math.min(x1, x2);
  const hiX = Math.max(x1, x2);
  const loY = Math.min(y1, y2);
  const hiY = Math.max(y1, y2);
  // Strict overlap on both axes: touching a card's edge is fine, entering is not.
  return hiX > box.left && loX < box.right && hiY > box.top && loY < box.bottom;
}

describe("routeConnectors", () => {
  it("returns one route per connection and invents none", () => {
    // Catches: dropping a connector, or emitting a route for one that isn't there.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    expect(routes.size).toBe(connections.length);
    expect([...routes.keys()].sort()).toEqual(connections.map((c) => c.id).sort());
  });

  it("skips a connection naming a step that is not on the map", () => {
    const { steps } = tangled();
    const routes = routeConnectors(steps, [link("ghost", "s1", "nowhere"), link("self", "s1", "s1")]);
    expect(routes.size).toBe(0);
  });

  it("draws a lone connector between same-lane neighbours direct", () => {
    // Catches: routing everything, which detours a short hop into a band for
    // no reason and makes the map busier than it was.
    const steps = [step("a", 0, 0), step("b", 1, 0)];
    const routes = routeConnectors(steps, [link("c", "a", "b")]);
    const route = routes.get("c");
    expect(route?.kind).toBe("direct");
    expect(route?.source.side).toBe("right");
    expect(route?.target.side).toBe("left");
  });

  it("routes a connector whose straight line would cross a card", () => {
    // Catches: treating "same lane" alone as enough to draw direct.
    const steps = [step("a", 0, 0), step("mid", 1, 0), step("b", 2, 0)];
    const routes = routeConnectors(steps, [link("c", "a", "b")]);
    expect(routes.get("c")?.kind).toBe("routed");
  });

  it("routes both connectors when a pair of steps has two between them", () => {
    // Catches: drawing A->B and B->A direct, which puts two arrows on one line.
    const steps = [step("a", 0, 0), step("b", 1, 0)];
    const routes = routeConnectors(steps, [link("there", "a", "b"), link("back", "b", "a")]);
    expect(routes.get("there")?.kind).toBe("routed");
    expect(routes.get("back")?.kind).toBe("routed");
  });

  it("gives every connector sharing a band its own line, inside that band", () => {
    // Catches: a fixed corridor offset shared by all of them, and a line
    // allowed to sit outside its band and so on top of a card.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    const ys = [...routes.values()]
      .filter((r): r is Extract<ConnectorRoute, { kind: "routed" }> => r.kind === "routed")
      .map((r) => r.corridorY);
    expect(ys.length).toBeGreaterThan(1);

    const byY = new Map<number, number>();
    for (const y of ys) byY.set(y, (byY.get(y) ?? 0) + 1);
    // Two connectors may legitimately share a y only if they are in different
    // bands, which cannot happen here: every band's lines are distinct, and
    // bands do not overlap.
    expect([...byY.values()].every((n) => n === 1)).toBe(true);

    // And none of them sits within a card's vertical extent at a card's x.
    for (const s of steps) {
      const box = boxOf(s);
      for (const y of ys) {
        const insideCard = y > box.top && y < box.bottom;
        expect(insideCard).toBe(false);
      }
    }
  });

  it("gives two connectors leaving one card different verticals", () => {
    // Catches: a fixed turn distance, which puts both on the same vertical for
    // the whole stretch between the card and the band.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    // c2 (s2->s3) and c10 (s2->s7) both leave s2 on the same side.
    const a = routes.get("c2")!;
    const b = routes.get("c10")!;
    expect(a.kind).toBe("routed");
    expect(b.kind).toBe("routed");
    expect(a.source.side).toBe(b.source.side);
    expect(a.source.turnOffsetX).not.toBe(b.source.turnOffsetX);
  });

  it("gives two connectors arriving at one card different approaches", () => {
    // Catches: a fixed approach distance, which puts two arrivals on the same
    // vertical into the target.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    // c7 (s7->s8, crossing lanes) and c11 (s3->s8, blocked by s5) both route
    // into s8's left side.
    const a = routes.get("c7")!;
    const b = routes.get("c11")!;
    expect(a.kind).toBe("routed");
    expect(b.kind).toBe("routed");
    expect(a.target.side).toBe(b.target.side);
    expect(a.target.turnOffsetX).not.toBe(b.target.turnOffsetX);
  });

  it("draws a clear same-lane connector direct however many columns it spans", () => {
    // s5 and s8 are both in the bottom lane with nothing between them in it,
    // so the straight line is safe even though it spans three columns and
    // passes over cards in the lanes above. Routing it anyway would detour a
    // line that was already correct — this pins the rule as "is anything in
    // the way", not "are they adjacent".
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    expect(routes.get("c13")?.kind).toBe("direct");
  });

  it("draws no route through a card that is not one of its own endpoints", () => {
    // The guarantee the whole feature exists for, asserted on the polyline a
    // renderer actually draws. Catches any offset that escapes its band or its
    // channel — including a channel measured per-row, which is clear in the
    // target's own lane and not in the lanes a connector descends past.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    const byId = new Map(steps.map((s) => [s.id, s]));

    const offenders: string[] = [];
    for (const connection of connections) {
      const route = routes.get(connection.id)!;
      const from = byId.get(connection.fromStepId)!;
      const to = byId.get(connection.toStepId)!;
      const points = polyline(route, from, to);
      for (const s of steps) {
        if (s.id === from.id || s.id === to.id) continue;
        const box = boxOf(s);
        for (let i = 0; i < points.length - 1; i++) {
          if (segmentEntersBox(points[i]!, points[i + 1]!, box)) {
            offenders.push(`${connection.id} through ${s.id}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("descends past a lane it merely passes, not only the lane it lands in", () => {
    // The shape a per-row channel measurement gets wrong, and the reason the
    // router measures channels across the whole map.
    //
    // A connector runs from the top lane to the bottom one, so it travels
    // along a band near the top and then descends three lanes. A card sits in
    // a lane in between, off the column grid — where a dragged card ends up.
    // The strip just left of the target is empty *in the target's own lane*,
    // so a per-row measurement happily puts the descent there; that strip runs
    // straight through the card in the middle lane.
    //
    // On the auto-layout's tidy grid the two measurements agree, which is why
    // the first version of this test — built from the grid helper — passed
    // against the per-row bug. Real geometry is what separates them.
    const at = (id: string, x: number, y: number): RoutedStep => ({ id, x, y, width: 214, height: 112 });
    const src = at("src", 210, 147); // top lane
    const passed = at("passed", 810, 361); // middle lane, off-grid: spans 703..917
    const tgt = at("tgt", 996, 789); // bottom lane, spans 889..1103
    const steps = [src, passed, tgt];

    const routes = routeConnectors(steps, [link("long", "src", "tgt")]);
    const points = polyline(routes.get("long")!, src, tgt);
    const box = boxOf(passed);
    for (let i = 0; i < points.length - 1; i++) {
      expect(
        segmentEntersBox(points[i]!, points[i + 1]!, box),
        `segment ${i} of the route runs through the card it only passes`
      ).toBe(false);
    }
  });

  it("attaches connectors sharing a card side at different heights", () => {
    // Catches: every arrow into a card converging on one point, which draws
    // the last stretch of each on top of the others. Two connectors turning at
    // different distances is not enough — they still share the stub from the
    // card's edge to the first turn.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    // c7, c11 and c13 all meet s8 on its left.
    const offsets = ["c7", "c11", "c13"].map((id) => routes.get(id)!.target.alongOffset);
    expect(new Set(offsets).size).toBe(3);
  });

  it("keeps attachments on the card when many connectors meet one side", () => {
    // Catches an offset that runs off the end of the edge it is spread along.
    // It takes a crowd to catch: with two or three connectors the comfortable
    // spacing cap binds first and hides a reach that is far too generous, so
    // this uses eight arrivals on one side, where nothing but the reach is
    // holding them on the card.
    // Every feeder is to the left of the hub, so all eight arrive on the same
    // side of it — put half of them to its right and they split across two
    // sides, which is four apiece and not the crowd this is testing.
    const hub = step("hub", 9, 0);
    const feeders = Array.from({ length: 8 }, (_, i) => step(`f${i}`, i, 1));
    const steps = [hub, ...feeders];
    const connections = feeders.map((f, i) => link(`c${i}`, f.id, "hub"));
    const routes = routeConnectors(steps, connections);

    const reachable = hub.height / 2;
    for (const connection of connections) {
      const end = routes.get(connection.id)!.target;
      expect(Math.abs(end.alongOffset), `${connection.id} attaches off the end of the card`).toBeLessThan(reachable);
    }
    // ...and they are still eight distinct heights, not eight copies of one.
    expect(new Set(connections.map((c) => routes.get(c.id)!.target.alongOffset)).size).toBe(8);
  });

  it("keeps every attachment on its own card", () => {
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    const byId = new Map(steps.map((st) => [st.id, st]));
    for (const connection of connections) {
      const route = routes.get(connection.id)!;
      for (const [end, stepId] of [
        [route.source, connection.fromStepId],
        [route.target, connection.toStepId],
      ] as const) {
        const card = byId.get(stepId)!;
        const reach = end.side === "top" || end.side === "bottom" ? card.width / 2 : card.height / 2;
        expect(Math.abs(end.alongOffset)).toBeLessThan(reach);
      }
    }
  });

  it("pulls an attachment onto a diamond, and leaves a rectangle alone", () => {
    // Catches: treating a decision's bounding box as its shape, which leaves
    // the arrow floating in the empty corner beside the diamond.
    const { steps, connections } = tangled();
    const decisions = new Set(["s5", "s8"]);
    const shaped = steps.map((st) => ({ ...st, shape: decisions.has(st.id) ? ("diamond" as const) : ("rect" as const) }));
    const routes = routeConnectors(shaped, connections);

    const intoDecision = routes.get("c7")!.target; // arrives at s8, a diamond
    expect(intoDecision.alongOffset).not.toBe(0);
    expect(intoDecision.inset).toBeGreaterThan(0);

    // A diamond's side slopes in proportionally: at the halfway point along it
    // it has come in half of the other half-axis.
    const s8 = shaped.find((st) => st.id === "s8")!;
    const vertical = intoDecision.side === "top" || intoDecision.side === "bottom";
    const half = vertical ? s8.width / 2 : s8.height / 2;
    const across = vertical ? s8.height / 2 : s8.width / 2;
    const expected = (Math.abs(intoDecision.alongOffset) / half) * across;
    expect(intoDecision.inset).toBeCloseTo(expected, 6);

    const intoTask = routes.get("c1")!.target; // arrives at s2, a task
    expect(intoTask.inset).toBe(0);
  });

  it("leaves a card vertically when it has no room beside it", () => {
    // The geometry of the printed map, read off the rendered report: a
    // backward serpentine row of compact cards where the decision in the lower
    // lane is wide enough to sit under both its neighbours in the upper one.
    //
    // There is no clear strip beside those cards at all, and an earlier
    // version went looking for one anyway — walking past the neighbour in the
    // card's own row and drawing the connector straight through it. Cards with
    // nothing beside them have to be left through the top or the bottom.
    const box = (id: string, l: number, r: number, t: number, b: number, shape?: "diamond"): RoutedStep => ({
      id,
      x: (l + r) / 2,
      y: (t + b) / 2,
      width: r - l,
      height: b - t,
      ...(shape ? { shape } : {}),
    });
    const steps = [
      box("s7", 930, 1060, 468, 532),
      box("s8", 757, 933, 540, 644, "diamond"),
      box("s9", 630, 760, 468, 532),
      box("s10", 501, 589, 390, 427),
    ];
    const connections = [link("c7", "s7", "s8"), link("c8", "s8", "s9"), link("c9", "s9", "s10")];
    const routes = routeConnectors(steps, connections);
    const byId = new Map(steps.map((st) => [st.id, st]));

    // s7 and s8 overlap horizontally, so neither can be left sideways.
    expect(["top", "bottom"]).toContain(routes.get("c7")!.source.side);

    const offenders: string[] = [];
    for (const connection of connections) {
      const points = polyline(
        routes.get(connection.id)!,
        byId.get(connection.fromStepId)!,
        byId.get(connection.toStepId)!
      );
      for (const st of steps) {
        if (st.id === connection.fromStepId || st.id === connection.toStepId) continue;
        for (let i = 0; i < points.length - 1; i++) {
          if (segmentEntersBox(points[i]!, points[i + 1]!, boxOf(st))) {
            offenders.push(`${connection.id} through ${st.id}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is deterministic", () => {
    // Catches anything reaching for a clock, a random number or a Set's order.
    const { steps, connections } = tangled();
    const once = routeConnectors(steps, connections);
    const twice = routeConnectors(steps, connections);
    expect([...twice.entries()]).toEqual([...once.entries()]);
  });

  it("ignores a step with a broken measurement rather than taking the map down", () => {
    const steps = [step("a", 0, 0), { id: "bad", x: Number.NaN, y: 0, width: 0, height: 0 }, step("b", 2, 0)];
    const routes = routeConnectors(steps, [link("c", "a", "b"), link("d", "a", "bad")]);
    expect(routes.has("c")).toBe(true);
    expect(routes.has("d")).toBe(false);
  });

  it("routes a loop backward, out of the left and into the right", () => {
    // Catches losing the direction cue that makes a loop read as going back.
    const { steps, connections } = tangled();
    const routes = routeConnectors(steps, connections);
    const loop = routes.get("c12"); // s8 -> s3, against the flow
    expect(loop?.source.side).toBe("left");
    expect(loop?.target.side).toBe("right");
  });

  it("handles an empty map and a map with no connectors", () => {
    expect(routeConnectors([], []).size).toBe(0);
    expect(routeConnectors([step("a", 0, 0)], []).size).toBe(0);
  });
});
