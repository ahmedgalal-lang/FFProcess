import { expect, type Locator } from "@playwright/test";

/**
 * Asserts a Process Map node is drawn as a flowchart diamond.
 *
 * Checking that *a* polygon exists is not enough — it would pass for any
 * four-sided blob — so this reads the points back and checks they are the
 * four vertices of a rhombus: two at the horizontal midpoint (top and
 * bottom), two at the vertical midpoint (left and right).
 */
export async function expectDiamond(node: Locator): Promise<void> {
  const polygon = node.locator("svg polygon");
  await expect(polygon).toHaveCount(1);

  const points = (await polygon.getAttribute("points")) ?? "";
  const vertices = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .map(([x, y]) => ({ x: x ?? NaN, y: y ?? NaN }));

  expect(vertices, `expected 4 vertices, got "${points}"`).toHaveLength(4);

  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;

  // Two vertices sit on the vertical centre line, two on the horizontal one.
  // A tolerance of 2px absorbs the 1px inset that keeps the stroke from being
  // clipped by the viewBox.
  const onVerticalAxis = vertices.filter((v) => Math.abs(v.x - midX) <= 2);
  const onHorizontalAxis = vertices.filter((v) => Math.abs(v.y - midY) <= 2);
  expect(onVerticalAxis, `not a rhombus: "${points}"`).toHaveLength(2);
  expect(onHorizontalAxis, `not a rhombus: "${points}"`).toHaveLength(2);
}
