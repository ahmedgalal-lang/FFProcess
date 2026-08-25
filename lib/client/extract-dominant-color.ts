/**
 * Samples a dominant accent color out of an uploaded logo image, client-side
 * (needs canvas/DOM — there's no server-side equivalent). Quantizes pixels
 * into coarse RGB buckets and picks the most common bucket that isn't
 * near-white, near-black, or low-saturation gray, since those are almost
 * always background rather than brand color. Returns null if the image has
 * no such pixels (e.g. a pure black-and-white logo) — the caller falls back
 * to a neutral default.
 */
export function extractDominantColor(imageUrl: string): Promise<string | null> {
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
        if (!ctx) return resolve(null);

        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 200) continue; // skip transparent pixels

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lightness = (max + min) / 2 / 255;
          const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          if (lightness < 0.12 || lightness > 0.92 || saturation < 0.25) continue; // near-black/white/gray

          const key = `${r >> 4}-${g >> 4}-${b >> 4}`; // 16 levels per channel
          const bucket = buckets.get(key) ?? { count: 0, r, g, b };
          bucket.count += 1;
          buckets.set(key, bucket);
        }

        let best: { count: number; r: number; g: number; b: number } | null = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.count > best.count) best = bucket;
        }
        if (!best) return resolve(null);

        const toHex = (n: number) => n.toString(16).padStart(2, "0");
        resolve(`#${toHex(best.r)}${toHex(best.g)}${toHex(best.b)}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
