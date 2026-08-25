import { pickDistinctColors, type ColorBucket } from "@/lib/domain/color-extraction";

/**
 * Samples accent color candidates out of an uploaded logo image, client-side
 * (needs canvas/DOM — there's no server-side equivalent). Quantizes pixels
 * into coarse RGB buckets, skips near-white, near-black, or low-saturation
 * gray pixels (almost always background rather than brand color), and picks
 * up to `max` distinct colors by frequency (see pickDistinctColors). Returns
 * fewer than `max` — down to an empty array — if the image doesn't have that
 * many distinct non-background colors (e.g. a monochrome logo).
 */
export function extractDominantColors(imageUrl: string, max = 3): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve([]);

        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<string, ColorBucket>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 200) continue; // skip transparent pixels

          const channelMax = Math.max(r, g, b);
          const channelMin = Math.min(r, g, b);
          const lightness = (channelMax + channelMin) / 2 / 255;
          const saturation =
            channelMax === channelMin ? 0 : (channelMax - channelMin) / (255 - Math.abs(channelMax + channelMin - 255));
          if (lightness < 0.12 || lightness > 0.92 || saturation < 0.25) continue; // near-black/white/gray

          const key = `${r >> 4}-${g >> 4}-${b >> 4}`; // 16 levels per channel
          const bucket = buckets.get(key) ?? { count: 0, r, g, b };
          bucket.count += 1;
          buckets.set(key, bucket);
        }

        resolve(pickDistinctColors([...buckets.values()], max));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  const [first] = await extractDominantColors(imageUrl, 1);
  return first ?? null;
}
