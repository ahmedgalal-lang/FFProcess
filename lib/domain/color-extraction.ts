export type ColorBucket = { r: number; g: number; b: number; count: number };

/**
 * Picks up to `max` hex colors from pixel-count buckets, most frequent
 * first, skipping any bucket too close (Euclidean RGB distance) to a color
 * already picked — otherwise the top few buckets are usually near-duplicate
 * shades of the same dominant color instead of genuinely distinct ones.
 */
export function pickDistinctColors(buckets: ColorBucket[], max: number, minDistance = 60): string[] {
  const sorted = [...buckets].sort((a, b) => b.count - a.count);
  const picked: ColorBucket[] = [];

  for (const candidate of sorted) {
    if (picked.length >= max) break;
    const tooClose = picked.some((p) => colorDistance(p, candidate) < minDistance);
    if (!tooClose) picked.push(candidate);
  }

  return picked.map((c) => toHex(c.r, c.g, c.b));
}

function colorDistance(a: ColorBucket, b: ColorBucket): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function toHex(r: number, g: number, b: number): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
