"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import type { ConnectorRoute } from "@/lib/domain/connector-routing";

/**
 * Draws a connector along the route `connector-routing.ts` worked out for it.
 *
 * All the thinking happens in the router; this turns its answer into a path.
 * It renders through `<BaseEdge>` rather than a bare `<path>` so the connector
 * keeps the things the built-in edge gave it for free: the wide invisible
 * interaction path that makes it clickable, keyboard selection, and the label
 * with its background.
 *
 * `sourceX/Y` and `targetX/Y` arrive already resolved from the handles the
 * router chose, so nothing here needs to know where the cards are.
 */

export type RoutedEdgeData = { route: ConnectorRoute };

/** How much to round a corner. Clamped to whatever the shorter leg can spare. */
const CORNER = 8;

/**
 * An orthogonal path through `points`, with rounded corners.
 *
 * Corners are rounded rather than square because a right angle at the exact
 * moment two connectors pass each other is the hardest place to tell them
 * apart; a curve gives the eye something to follow through.
 */
export function orthogonalPath(points: [number, number][]): string {
  const cleaned = points.filter(
    ([x, y], i) => i === 0 || Math.abs(x - points[i - 1]![0]) > 0.01 || Math.abs(y - points[i - 1]![1]) > 0.01
  );
  if (cleaned.length < 2) return "";

  let d = `M${cleaned[0]![0]},${cleaned[0]![1]}`;
  for (let i = 1; i < cleaned.length - 1; i++) {
    const [px, py] = cleaned[i - 1]!;
    const [cx, cy] = cleaned[i]!;
    const [nx, ny] = cleaned[i + 1]!;
    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(CORNER, inLength / 2, outLength / 2);
    if (r <= 0.01) {
      d += ` L${cx},${cy}`;
      continue;
    }
    const startX = cx - ((cx - px) / inLength) * r;
    const startY = cy - ((cy - py) / inLength) * r;
    const endX = cx + ((nx - cx) / outLength) * r;
    const endY = cy + ((ny - cy) / outLength) * r;
    d += ` L${startX},${startY} Q${cx},${cy} ${endX},${endY}`;
  }
  const last = cleaned[cleaned.length - 1]!;
  return `${d} L${last[0]},${last[1]}`;
}

/** The corner points of a route, in order. Exported so tests can draw it too. */
export function routePoints(
  route: ConnectorRoute,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): [number, number][] {
  // React Flow hands over the handle's position, which sits at the middle of
  // the card's edge. The route says how far along that edge to attach, how far
  // the drawn shape has sloped in by that point — so the arrow meets a diamond
  // on its diamond and not beside its corner — and where the path turns to run
  // to its band.
  const place = (x: number, y: number, end: ConnectorRoute["source"]) => {
    const vertical = end.side === "top" || end.side === "bottom";
    const attachX = vertical ? x + end.alongOffset : x + (end.side === "left" ? end.inset : -end.inset);
    const attachY = vertical ? y + (end.side === "top" ? end.inset : -end.inset) : y + end.alongOffset;
    return { attach: [attachX, attachY] as [number, number], turnX: x + end.turnOffsetX };
  };

  const from = place(sourceX, sourceY, route.source);
  const to = place(targetX, targetY, route.target);
  if (route.kind === "direct") return [from.attach, to.attach];

  // On a top or bottom attachment the turn is the attachment itself, so the
  // first and last segments collapse to nothing and the path simply drops into
  // the band — which is exactly what a card with no room beside it needs.
  return [
    from.attach,
    [from.turnX, from.attach[1]],
    [from.turnX, route.corridorY],
    [to.turnX, route.corridorY],
    [to.turnX, to.attach[1]],
    to.attach,
  ];
}

export function RoutedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  markerEnd,
  style,
  ...rest
}: EdgeProps) {
  const route = (data as RoutedEdgeData | undefined)?.route;
  const points = route
    ? routePoints(route, sourceX, sourceY, targetX, targetY)
    : ([
        [sourceX, sourceY],
        [targetX, targetY],
      ] as [number, number][]);

  // The label sits on the corridor run for a routed connector and at the
  // midpoint for a direct one — on its own line either way, which is what
  // stops it landing on a neighbouring connector now running parallel.
  const [labelX, labelY] =
    route && route.kind === "routed"
      ? [(points[2]![0] + points[3]![0]) / 2, route.corridorY]
      : [(points[0]![0] + points[points.length - 1]![0]) / 2, (points[0]![1] + points[points.length - 1]![1]) / 2];

  return (
    <BaseEdge
      {...rest}
      path={orthogonalPath(points)}
      style={style}
      markerEnd={markerEnd}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelShowBg
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  );
}
