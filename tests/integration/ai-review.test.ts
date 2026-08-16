import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createProcess } = await import("@/lib/actions/process");
const { reviewProcessWithAI } = await import("@/lib/actions/ai-review");

describe("reviewProcessWithAI", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Purchase to Pay" });
    if (!process.ok) throw new Error("setup failed");
    processId = process.data.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ANTHROPIC_API_KEY is never set in the test environment, so this exercises
  // the same graceful no-op path used when a deployment hasn't configured it.
  it("returns AI_UNAVAILABLE instead of calling the API when ANTHROPIC_API_KEY isn't configured", async () => {
    const result = await reviewProcessWithAI({ workspaceId: fixture.workspace.id, processId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("AI_UNAVAILABLE");
  });

  it("allows a VIEWER to run a review (read-only, like the export routes)", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await reviewProcessWithAI({ workspaceId: fixture.workspace.id, processId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("AI_UNAVAILABLE"); // reaches the AI call, not FORBIDDEN
  });

  it("rejects an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await reviewProcessWithAI({ workspaceId: fixture.workspace.id, processId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("UNAUTHORIZED");
  });

  it("returns NOT_FOUND for a process that belongs to a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });

    const result = await reviewProcessWithAI({ workspaceId: otherFixture.workspace.id, processId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });
});
