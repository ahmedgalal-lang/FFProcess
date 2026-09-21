# Contract: `lib/domain/connector-routing.ts`

The one interface this feature exposes. Both renderers call it; nothing else routes.

```ts
export type RouteSide = "left" | "right" | "top" | "bottom";

export type RoutedStep = {
  id: string;
  /** Centre of the drawn card. */
  x: number;
  y: number;
  /** Full drawn size of the card. */
  width: number;
  height: number;
  /** The shape drawn inside that box. Defaults to a rectangle. */
  shape?: "rect" | "diamond";
};

export type RoutedConnection = {
  id: string;
  fromStepId: string;
  toStepId: string;
};

export type ConnectorEnd = {
  side: RouteSide;
  /** Where along that edge the line attaches, measured from the handle. */
  alongOffset: number;
  /** Pulled toward the card's centre, for a shape that is not a rectangle. */
  inset: number;
  /** x of the vertical run, measured from the handle's x. */
  turnOffsetX: number;
};

export type ConnectorRoute =
  | { kind: "direct"; source: ConnectorEnd; target: ConnectorEnd }
  | { kind: "routed"; source: ConnectorEnd; target: ConnectorEnd; corridorY: number };

/**
 * Works out how every connector should be drawn so that none runs along
 * another and none crosses a card it does not belong to.
 *
 * Pure: same input, same output, no clock, no randomness, no DOM.
 */
export function routeConnectors(
  steps: RoutedStep[],
  connections: RoutedConnection[]
): Map<string, ConnectorRoute>;
```

## Drawing a route

The renderer has the handle position for each end, from which the path is:

```text
attach → (turnX, attach.y) → (turnX, corridorY) → (turnX', corridorY) → (turnX', attach'.y) → attach'
```

`attach` is the handle offset by `alongOffset` along its edge and `inset` toward the
card's centre. For a `top` or `bottom` end the turn *is* the attachment, so the first and
last segments have zero length and the path simply drops into the band — which is what a
card with no room beside it needs. A `direct` route is the straight line between the two
attachments.

## Behaviour the callers may rely on

- The returned map has an entry for every connection whose two steps are both present in
  `steps` and both well-formed, and no entry for any other connection. A caller that
  finds no entry draws the connector the way it draws one today.
- A connection from a step to itself is not routed (no entry).
- Duplicate connection ids are not expected; if present, the last wins.
- `steps` may be in any order. `connections` order affects only which connector gets
  which line where two are otherwise indistinguishable, and is stable for a stable input
  order.
- **The router does not say whether a connector is a loop.** That is not geometry: a card
  whose neighbours sit under its own edges is left through its bottom whichever way the
  process runs, and on the print diagram's serpentine map a whole row runs right to left
  without a single step in it being a loop. Each renderer decides, and passes it to its
  own styling.

## What the renderers must supply

`width` and `height` must be the card's *drawn* size, from `NODE_HALF_SIZE` in
`process-layout.ts` — doubled, and using `PRINT_NODE_HALF_SIZE` where the print diagram
draws smaller cards. Supplying a uniform size would put corridors inside decision
diamonds.

`x` and `y` must be the card's *centre*. ReactFlow positions nodes by their top-left, so
both renderers convert.

`shape` must be `"diamond"` for a decision. Without it the arrow attaches beside the
diamond's corner rather than on it.
