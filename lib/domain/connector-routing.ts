/**
 * Where every connector on a Process Map should be drawn.
 *
 * The map used to draw all of its connectors the same way: one built-in edge,
 * turning at the same fixed distance from its card whatever else was on the
 * page. Two connectors leaving one step were therefore drawn along the same
 * line, and a connector between distant steps was drawn straight across
 * whatever lay between them — asserting, wrongly, that those steps were on its
 * path.
 *
 * This replaces that with a route per connector, built out of three regions
 * that are empty by construction:
 *
 *   - a **row** is a group of cards drawn at the same height;
 *   - a **band** is the full-width strip between two rows, so nothing is drawn
 *     in it at any x;
 *   - a **strip** is a gap between two cards, wide open at the height the
 *     connector leaves its card.
 *
 * A connector either goes straight to its target (when nothing is in the way),
 * or leaves sideways through a strip and travels along a band, or — when its
 * card has no room beside it — drops straight out of the card's top or bottom
 * into the band instead.
 *
 * Two rules keep a route off the cards, and both were learned by getting them
 * wrong:
 *
 *   1. **A sideways stub only ever uses the strip immediately beside its
 *      card.** If anything sits across that card's edge there is no room, and
 *      the connector leaves through the top or the bottom instead. An earlier
 *      version went hunting for a clear strip further out, found one past the
 *      next card along, and drew the stub straight through that card.
 *   2. **The vertical run must be clear in every row it passes**, not merely in
 *      the row it lands in. A connector from the first row to the fourth
 *      descends through the rows in between; a strip that is clear in the
 *      target's own row says nothing about those.
 *
 * Pure and framework-free, like process-layout.ts beside it: no DOM, no clock,
 * no randomness. The live canvas and the static print diagram both call it, so
 * the screen and the PDF agree by construction rather than by inspection.
 */

export type RouteSide = "left" | "right" | "top" | "bottom";

/** A step as it is actually drawn — centre position and full drawn size. */
export type RoutedStep = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The shape drawn inside that box. A decision is a diamond, so a point part
   * way along its side is further in than the box's edge; the router pulls the
   * attachment back onto the polygon rather than leaving the arrow floating
   * beside a corner. Defaults to a rectangle.
   */
  shape?: "rect" | "diamond";
};

export type RoutedConnection = {
  id: string;
  fromStepId: string;
  toStepId: string;
};

/**
 * Where one end of a connector meets its card, and where its vertical run sits.
 *
 * `alongOffset` is how far along the edge it attaches — down the side for a
 * left or right attachment, across for a top or bottom one. It is what stops
 * two connectors sharing a card from running along the same stretch beside it;
 * without it every arrow into a card converges on one point and the last
 * stretch of each is drawn on top of the others.
 *
 * `inset` pulls the attachment back from the bounding box onto the drawn
 * shape — zero for a rectangle, and for a diamond however far its sloping side
 * has come in by that point.
 *
 * `turnOffsetX` is where the path turns to run to the band, measured from the
 * handle. For a sideways attachment it is out in a strip beside the card; for
 * a top or bottom attachment it is the attachment itself, and the path simply
 * drops.
 */
export type ConnectorEnd = {
  side: RouteSide;
  alongOffset: number;
  inset: number;
  turnOffsetX: number;
};

export type ConnectorRoute =
  | { kind: "direct"; source: ConnectorEnd; target: ConnectorEnd }
  | { kind: "routed"; source: ConnectorEnd; target: ConnectorEnd; corridorY: number };

/** Two cards whose centres are within this of each other are in the same row. */
const ROW_TOLERANCE = 24;
/** How close a corridor line or a vertical run may come to a card. */
const CLEARANCE = 10;
/** Depth invented for the band above the first row and below the last. */
const OUTER_BAND_DEPTH = 96;
/** Reach invented for a stub with no card beyond it in its row. */
const OUTER_STRIP_WIDTH = 56;
/** Comfortable separations; the real ones shrink to fit the region. */
const MAX_CORRIDOR_SPACING = 18;
const MAX_STRIP_SPACING = 12;
const MAX_EDGE_SPACING = 22;
/** How close to a card's corner a connector may attach. */
const EDGE_INSET = 14;

type Card = RoutedStep & { left: number; right: number; top: number; bottom: number; row: number };
type Row = { cards: Card[]; top: number; bottom: number };
type Band = { usableTop: number; usableBottom: number };
/**
 * A clear vertical strip, and the part of it a run may use.
 *
 * The key is the strip's own edges, so the gap between two cards is the *same*
 * strip whether it was found by looking right from the left-hand one or left
 * from the right-hand one. It has to be: the two are one piece of empty space,
 * and giving each its own allocation lets a connector leaving one card pick
 * the same line as a connector arriving at the other.
 */
type Strip = { key: string; usableFrom: number; usableTo: number };

function wellFormed(step: RoutedStep): boolean {
  return (
    Number.isFinite(step.x) &&
    Number.isFinite(step.y) &&
    Number.isFinite(step.width) &&
    Number.isFinite(step.height) &&
    step.width > 0 &&
    step.height > 0
  );
}

/**
 * Groups cards into rows by where they are drawn rather than by a lane index
 * handed in from outside. A lane index is a lie the moment somebody drags a
 * card, and the print diagram's serpentine wrap does not have one at all.
 */
function buildRows(cards: Card[]): Row[] {
  const sorted = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  let anchor = Number.NaN;
  for (const card of sorted) {
    if (rows.length === 0 || Math.abs(card.y - anchor) > ROW_TOLERANCE) {
      rows.push({ cards: [card], top: card.top, bottom: card.bottom });
      anchor = card.y;
      continue;
    }
    const row = rows[rows.length - 1]!;
    row.cards.push(card);
    row.top = Math.min(row.top, card.top);
    row.bottom = Math.max(row.bottom, card.bottom);
  }
  rows.forEach((row, index) => {
    row.cards.sort((a, b) => a.x - b.x);
    for (const card of row.cards) card.row = index;
  });
  return rows;
}

/**
 * One band per gap between adjacent rows, plus an outer band above the first
 * row and below the last so a connector between two cards in the *same* row
 * still has somewhere to run. Indexed so that `bands[i]` is the band above
 * row `i`, which makes `bands[min(rowA, rowB) + 1]` the band under the upper of
 * any two rows.
 */
function buildBands(rows: Row[]): Band[] {
  const edges: [number, number][] = [[rows[0]!.top - OUTER_BAND_DEPTH, rows[0]!.top]];
  for (let i = 1; i < rows.length; i++) edges.push([rows[i - 1]!.bottom, rows[i]!.top]);
  const last = rows[rows.length - 1]!;
  edges.push([last.bottom, last.bottom + OUTER_BAND_DEPTH]);

  return edges.map(([top, bottom]) => {
    // Clearance shrinks rather than inverting the band, so two rows drawn
    // unusually close together still yield a usable strip instead of one whose
    // top is below its bottom.
    const inset = Math.min(CLEARANCE, Math.max(0, (bottom - top) / 4));
    const usableTop = top + inset;
    const usableBottom = bottom - inset;
    if (usableBottom - usableTop >= 2) return { usableTop, usableBottom };
    const middle = (top + bottom) / 2;
    return { usableTop: middle - 1, usableBottom: middle + 1 };
  });
}

/**
 * The strip a sideways stub from `card` may turn in, or null when there is no
 * room beside the card at all.
 *
 * The search window runs from the card's edge only as far as the nearest card
 * **in its own row** — the stub travels level with the card, so those are the
 * only ones it could hit, and walking past one to find a clear strip further
 * out means drawing through it. Within that window the strip must be clear of
 * every card on the map, because the vertical run that follows descends past
 * rows the stub never touches.
 */
function stripBeside(card: Card, side: "left" | "right", cards: Card[]): Strip | null {
  const others = cards.filter((other) => other.id !== card.id);

  if (side === "right") {
    const from = card.right;
    // Anything sitting across the card's own edge means there is no room
    // beside it, and the connector leaves through the top or the bottom
    // instead. An earlier version went looking for a clear strip further out:
    // it found one on the far side of the next card along, drew the stub
    // straight through that card, and on a map where the strip it settled on
    // was nowhere near either endpoint sent the connector out to the right,
    // back across the whole row and in again from the left.
    if (others.some((other) => other.left <= from && other.right > from)) return null;
    let to = Number.POSITIVE_INFINITY;
    for (const other of others) if (other.left >= from && other.left < to) to = other.left;
    if (!Number.isFinite(to)) to = from + OUTER_STRIP_WIDTH;
    return usable(from, to);
  }

  const to = card.left;
  if (others.some((other) => other.left < to && other.right >= to)) return null;
  let from = Number.NEGATIVE_INFINITY;
  for (const other of others) if (other.right <= to && other.right > from) from = other.right;
  if (!Number.isFinite(from)) from = to - OUTER_STRIP_WIDTH;
  return usable(from, to);
}

function usable(from: number, to: number): Strip {
  const inset = Math.min(CLEARANCE, Math.max(0, (to - from) / 4));
  let usableFrom = from + inset;
  let usableTo = to - inset;
  if (usableTo - usableFrom < 2) {
    const middle = (from + to) / 2;
    usableFrom = middle - 1;
    usableTo = middle + 1;
  }
  return { key: `${Math.round(from)}:${Math.round(to)}`, usableFrom, usableTo };
}

/**
 * Spreads n things across a strip, centred, never wider apart than
 * `maxSpacing` and never outside the strip. Every returned value is distinct
 * for any n, which is the property that keeps two connectors off one line
 * however many of them want the same band.
 *
 * The divisor is `count - 1`, not `count + 1`: with n things the strip holds
 * n - 1 gaps, so dividing by n + 1 leaves two gaps' worth of it unused and
 * squeezes everything into the middle. That is not a rounding detail — six
 * connectors in an 82px band came out 11.7px apart instead of 16.4px — and the
 * strip has already had its clearance taken off, so there is nothing left to
 * protect by hanging back from its edges.
 */
function spread(from: number, to: number, count: number, maxSpacing: number): number[] {
  const middle = (from + to) / 2;
  if (count <= 1) return count === 1 ? [middle] : [];
  const spacing = Math.min(maxSpacing, (to - from) / (count - 1));
  const start = middle - (spacing * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

/** Is the straight line between two same-row cards clear of everything else in that row? */
function nothingBetween(a: Card, b: Card, row: Row): boolean {
  const left = Math.min(a.right, b.right);
  const right = Math.max(a.left, b.left);
  if (right <= left) return false; // the two cards overlap horizontally
  return !row.cards.some(
    (card) => card.id !== a.id && card.id !== b.id && card.right > left && card.left < right
  );
}

export function routeConnectors(
  steps: RoutedStep[],
  connections: RoutedConnection[]
): Map<string, ConnectorRoute> {
  const routes = new Map<string, ConnectorRoute>();
  const cards: Card[] = steps.filter(wellFormed).map((step) => ({
    ...step,
    left: step.x - step.width / 2,
    right: step.x + step.width / 2,
    top: step.y - step.height / 2,
    bottom: step.y + step.height / 2,
    row: 0,
  }));
  if (cards.length === 0) return routes;

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const rows = buildRows(cards);
  const bands = buildBands(rows);

  // A pair of steps with more than one connector between it can have at most
  // one of them drawn direct: a second straight line between the same two
  // cards lands exactly on the first. So when there is more than one, all of
  // them are routed and each gets its own corridor.
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const c of connections) {
    const key = pairKey(c.fromStepId, c.toStepId);
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }

  type End = { card: Card; side: RouteSide; strip: Strip | null };
  type Pending = { id: string; direct: boolean; bandIndex: number; source: End; target: End };
  const pending: Pending[] = [];

  for (const connection of connections) {
    const from = cardById.get(connection.fromStepId);
    const to = cardById.get(connection.toStepId);
    if (!from || !to || from.id === to.id) continue;

    const forward = to.x >= from.x;
    const onlyOne = (pairCount.get(pairKey(from.id, to.id)) ?? 0) === 1;
    const direct = onlyOne && from.row === to.row && nothingBetween(from, to, rows[from.row]!);
    if (direct) {
      pending.push({
        id: connection.id,
        direct: true,
        bandIndex: from.row + 1,
        source: { card: from, side: forward ? "right" : "left", strip: null },
        target: { card: to, side: forward ? "left" : "right", strip: null },
      });
      continue;
    }

    // Sideways if there is room beside both cards; otherwise straight out of
    // the top or the bottom, which is the only way off a card whose
    // neighbours in the next row sit right under its own edges.
    const fromStrip = stripBeside(from, forward ? "right" : "left", cards);
    const toStrip = stripBeside(to, forward ? "left" : "right", cards);
    const sideways = fromStrip !== null && toStrip !== null;
    const targetBelow = to.row > from.row || (to.row === from.row && to.y >= from.y);

    pending.push({
      id: connection.id,
      direct: false,
      bandIndex: Math.min(from.row, to.row) + 1,
      source: sideways
        ? { card: from, side: forward ? "right" : "left", strip: fromStrip }
        : { card: from, side: targetBelow ? "bottom" : "top", strip: null },
      target: sideways
        ? { card: to, side: forward ? "left" : "right", strip: toStrip }
        : { card: to, side: targetBelow ? "top" : "bottom", strip: null },
    });
  }

  // Attachment points: one allocation per card side, covering direct, sideways
  // and vertical connectors alike. Every connector touching that side gets its
  // own place on it, so the short stretch beside a card — which every arrow
  // into it would otherwise share — is a fan rather than a single line.
  const byCardSide = new Map<
    string,
    { id: string; which: "source" | "target"; end: End; other: Card }[]
  >();
  for (const item of pending) {
    for (const which of ["source", "target"] as const) {
      const end = item[which];
      const other = which === "source" ? item.target.card : item.source.card;
      const key = `${end.card.id}:${end.side}`;
      const list = byCardSide.get(key);
      if (list) list.push({ id: item.id, which, end, other });
      else byCardSide.set(key, [{ id: item.id, which, end, other }]);
    }
  }
  const attachments = new Map<string, { alongOffset: number; inset: number }>();
  for (const [, list] of byCardSide) {
    const { card, side } = list[0]!.end;
    // Attach in the order the connectors arrive from, so the one coming from
    // furthest left takes the leftmost place on the edge. Taking them in
    // whatever order the connections happened to be listed crosses them over
    // each other in front of the card, and on a map whose bands are only a few
    // pixels deep — the compact print layout — two crossed connectors then run
    // alongside each other all the way to the card instead of parting company.
    // The id is the tie-break, so the answer is the same every time.
    const alongAxis = side === "top" || side === "bottom" ? "x" : "y";
    list.sort((a, b) => a.other[alongAxis] - b.other[alongAxis] || (a.id < b.id ? -1 : 1));
    const vertical = side === "top" || side === "bottom";
    const half = vertical ? card.width / 2 : card.height / 2;
    const across = vertical ? card.height / 2 : card.width / 2;
    const reach = Math.max(0, half - EDGE_INSET);
    const offsets = spread(-reach, reach, list.length, MAX_EDGE_SPACING);
    list.forEach((use, i) => {
      const alongOffset = offsets[i] ?? 0;
      // On a diamond the drawn edge has sloped inward by this much at that
      // point along it; on a rectangle it has not moved at all.
      const inset = card.shape === "diamond" && half > 0 ? (Math.abs(alongOffset) / half) * across : 0;
      attachments.set(`${use.id}:${use.which}`, { alongOffset, inset });
    });
  }

  // Corridor lines: one allocation per band, so every connector crossing that
  // band gets a line of its own within it.
  const routable = pending.filter((item) => !item.direct);
  const byBand = new Map<number, Pending[]>();
  for (const item of routable) {
    const list = byBand.get(item.bandIndex);
    if (list) list.push(item);
    else byBand.set(item.bandIndex, [item]);
  }
  const corridorY = new Map<string, number>();
  for (const [index, list] of byBand) {
    const band = bands[index]!;
    const ys = spread(band.usableTop, band.usableBottom, list.length, MAX_CORRIDOR_SPACING);
    list.forEach((item, i) => corridorY.set(item.id, ys[i]!));
  }

  // Vertical runs: one allocation per strip, not per card. Two cards in the
  // same column but different rows share a strip, and a connector descending
  // past a row would otherwise be free to pick the same x as one starting
  // there.
  const byStrip = new Map<string, { id: string; which: "source" | "target"; strip: Strip }[]>();
  for (const item of routable) {
    for (const which of ["source", "target"] as const) {
      const strip = item[which].strip;
      if (!strip) continue;
      const list = byStrip.get(strip.key);
      if (list) list.push({ id: item.id, which, strip });
      else byStrip.set(strip.key, [{ id: item.id, which, strip }]);
    }
  }
  const turnX = new Map<string, number>();
  for (const [, list] of byStrip) {
    const strip = list[0]!.strip;
    const xs = spread(strip.usableFrom, strip.usableTo, list.length, MAX_STRIP_SPACING);
    list.forEach((use, i) => turnX.set(`${use.id}:${use.which}`, xs[i]!));
  }

  const buildEnd = (item: Pending, which: "source" | "target"): ConnectorEnd => {
    const { card, side, strip } = item[which];
    const { alongOffset, inset } = attachments.get(`${item.id}:${which}`)!;
    // The handle sits at the middle of the card's edge; everything is measured
    // from there because that is what the renderer is handed.
    const handleX = side === "right" ? card.right : side === "left" ? card.left : card.x;
    const turn = strip ? turnX.get(`${item.id}:${which}`)! : handleX + alongOffset;
    return { side, alongOffset, inset, turnOffsetX: turn - handleX };
  };

  for (const item of pending) {
    const source = buildEnd(item, "source");
    const target = buildEnd(item, "target");
    routes.set(
      item.id,
      item.direct
        ? { kind: "direct", source, target }
        : { kind: "routed", source, target, corridorY: corridorY.get(item.id)! }
    );
  }

  return routes;
}
