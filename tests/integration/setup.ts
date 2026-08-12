import { vi } from "vitest";

// Server Actions call revalidatePath/revalidateTag, which require an active Next.js
// request/build context that doesn't exist when Vitest calls them directly.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
