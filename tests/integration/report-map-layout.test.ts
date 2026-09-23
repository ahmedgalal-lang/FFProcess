import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { setReportMapLayout } = await import("@/lib/actions/report-map-layout");
const { prisma } = await import("@/lib/db/client");

/**
 * The server-side half of SC-010: T022. The e2e spec
 * (`tests/e2e/report-map-layout.spec.ts`) proves the control redraws and
 * persists through the UI; this proves the guarantee the UI depends on —
 * EDITOR-gated, validated, and scoped to one workspace — holds even when the
 * action is called directly, the same split `viewer-read-only.spec.ts` and
 * its own "the server refuses a Viewer's write even when the request is made
 * directly" test draw elsewhere in this suite.
 */
describe("setReportMapLayout", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("persists the chosen layout on the workspace", async () => {
    const result = await setReportMapLayout({ workspaceId: fixture.workspace.id, layout: "ROLES" });

    expect(result.ok).toBe(true);
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.reportMapLayout).toBe("ROLES");
  });

  it("refuses a VIEWER, and leaves the stored layout untouched", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const result = await setReportMapLayout({ workspaceId: fixture.workspace.id, layout: "ROLES" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.reportMapLayout).toBe("FLOW"); // schema default, unchanged
  });

  it("an EDITOR may also set it — the gate is EDITOR-or-above, not ADMIN-only", async () => {
    const { user: editor } = await fixture.addMember("EDITOR");
    mockAuth.mockResolvedValue({ user: { id: editor.id } });

    const result = await setReportMapLayout({ workspaceId: fixture.workspace.id, layout: "ROLES" });

    expect(result.ok).toBe(true);
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.reportMapLayout).toBe("ROLES");
  });

  it("refuses a layout the enum does not recognize", async () => {
    const result = await setReportMapLayout({
      workspaceId: fixture.workspace.id,
      // @ts-expect-error — deliberately outside the enum, the way a hand-edited request would be
      layout: "GANTT",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: fixture.workspace.id } });
    expect(workspace.reportMapLayout).toBe("FLOW");
  });

  it("does not touch another workspace's layout", async () => {
    const other = await createFixtureWorkspace();
    try {
      const result = await setReportMapLayout({ workspaceId: fixture.workspace.id, layout: "ROLES" });
      expect(result.ok).toBe(true);

      const untouched = await prisma.workspace.findUniqueOrThrow({ where: { id: other.workspace.id } });
      expect(untouched.reportMapLayout).toBe("FLOW");
    } finally {
      await other.cleanup();
    }
  });
});
