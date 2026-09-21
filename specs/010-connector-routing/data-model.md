# Phase 1 Data Model: Connector Routing

No database schema change. Everything here is in-memory geometry, computed per render.

## Inputs

### `RoutedStep`

A step as it is actually drawn. Supplied by whichever renderer is drawing it — the live
canvas from its lane layout and any drag in progress, the print diagram from the
serpentine wrap.

| Field | Meaning |
|---|---|
| `id` | The step's id, used to match connections to it. |
| `x`, `y` | Centre of the drawn card, in canvas coordinates. |
| `width`, `height` | The card's full drawn size. Differs by step kind: a task is 214x112, a decision 230x140, a terminal 126x54, all from `NODE_HALF_SIZE` in `process-layout.ts`. |

Validation: a step with a non-finite coordinate or a non-positive size is ignored, and any
connection touching it is returned unrouted, so one bad measurement cannot take the map
down.

### `RoutedConnection`

| Field | Meaning |
|---|---|
| `id` | The connection's id. The route is returned under this key. |
| `fromStepId`, `toStepId` | Endpoints. A connection naming a step that is not in the input is skipped. |

## Derived, internal

### `Row`

A horizontal band of steps sharing a drawn centre-y, found by clustering. Carries the
steps in it (sorted by x), the lowest card bottom and the highest card top in it.

### `Band`

The empty strip between two adjacent rows: from the lower edge of the upper row's deepest
card to the upper edge of the lower row's tallest card. Carries its own usable top and
bottom, inset by a margin so a line never touches a card.

Two extra bands exist at the outside: above the first row and below the last, each given
a default depth, so a connector between two steps in the *same* row still has somewhere
to run.

### `Channel`

A vertical strip clear of every card on the map — not merely of the cards in one row. For
one card and one direction (left or right), it starts at that card's edge, stepped past
any card whose horizontal span contains that edge (a decision is wider than a task, so a
task's right edge can begin inside the decision below it), and ends at the nearest card
edge beyond it taken across all rows. Where there is nothing beyond, a default width.

Channels are allocated **globally, per channel** rather than per card: two cards in the
same column but different rows share one channel, and a connector descending past a row
would otherwise be free to pick the same x as one starting there.

## Output

### `ConnectorRoute`

One per routable connection, keyed by connection id.

| Variant | Fields | Meaning |
|---|---|---|
| `direct` | `source`, `target` | The straight line between the two attachments. |
| `routed` | `source`, `target`, `corridorY` | Leave the source's attachment, turn at its `turnOffsetX`, run along `corridorY`, turn at the target's `turnOffsetX`, meet the target's attachment. |

Each end is a **`ConnectorEnd`**: which `side` of the card it meets, how far `alongOffset`
that edge it attaches, how far `inset` toward the card's centre the drawn shape has
brought it, and the `turnOffsetX` at which the path's vertical run sits.

A `left` or `right` end turns out in a strip beside the card. A `top` or `bottom` end's
turn is its own attachment, so the path drops straight into the band — the only way off a
card that has another card sitting across its edge.

`corridorY` is an absolute canvas y; every offset is measured from the handle, which is
what the renderer is given.

**Direction is not in the route.** Whether a connector reads as a loop is the renderer's
call, not the router's — see the contract.

### Guarantees the routing makes

These are the properties the unit tests assert, and they are why the success criteria
hold:

1. Every corridor y assigned within one band is distinct.
2. Every corridor y lies strictly inside its band's usable range — never on or inside a
   card.
3. Every exit distance lies strictly inside its channel, which is clear of every card
   on the map at every height the vertical travels through.
4. Two connectors using the same channel get different distances within it, whether they
   are leaving a card, arriving at one, or passing a row on the way.
5. The same input produces the same output, every time (SC-004).
6. No connection is added, dropped or re-pointed: the returned map has one entry per
   routable input connection and none other (FR-013).
