import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { createProcess, addProcessStep } = await import("@/lib/actions/process");
const { reviewProcessWithAI, updateReviewFinding, deleteReviewFinding, integrateReviewFinding } = await import(
  "@/lib/actions/ai-review"
);
const { prisma } = await import("@/lib/db/client");

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

  // GEMINI_API_KEY is never set in the test environment, so this exercises
  // the same graceful no-op path used when a deployment hasn't configured it.
  it("returns AI_UNAVAILABLE instead of calling the API when GEMINI_API_KEY isn't configured", async () => {
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

describe("Review finding edit/delete/integrate actions", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let processId: string;
  let stepId: string;
  let findingId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });

    const process = await createProcess({ workspaceId: fixture.workspace.id, name: "Purchase to Pay" });
    if (!process.ok) throw new Error("setup failed");
    processId = process.data.id;

    const step = await addProcessStep({
      workspaceId: fixture.workspace.id,
      processId,
      step: { type: "TASK", label: "Match Invoice to PO", linkedProcessIds: [] },
    });
    if (!step.ok) throw new Error("setup failed");
    stepId = step.data.id;

    const finding = await prisma.reviewFinding.create({
      data: {
        processId,
        category: "RISK",
        area: "PROCESS_MAP",
        severity: "HIGH",
        title: "No tolerance rule on three-way match",
        description: "Any variance stalls payment or gets waved through inconsistently.",
        recommendation: "Add an explicit tolerance threshold to the matching step.",
      },
    });
    findingId = finding.id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("edits a finding's text and marks it EDITED", async () => {
    const result = await updateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      title: "Tolerance rule missing",
      description: "Updated description.",
      recommendation: "Updated recommendation.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("EDITED");
    expect(result.data.title).toBe("Tolerance rule missing");

    const row = await prisma.reviewFinding.findUnique({ where: { id: findingId } });
    expect(row?.status).toBe("EDITED");
    expect(row?.title).toBe("Tolerance rule missing");
  });

  it("rejects editing a finding that's already integrated", async () => {
    await prisma.reviewFinding.update({
      where: { id: findingId },
      data: { status: "INTEGRATED", integratedStepId: stepId, integrationMode: "MERGED" },
    });

    const result = await updateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      title: "New title",
      description: "New description",
      recommendation: "New recommendation",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
  });

  it("dismisses a finding (soft delete), hiding it from the active workspace query", async () => {
    const result = await deleteReviewFinding({ workspaceId: fixture.workspace.id, findingId });
    expect(result.ok).toBe(true);

    const row = await prisma.reviewFinding.findUnique({ where: { id: findingId } });
    expect(row?.status).toBe("DISMISSED");
  });

  it("merges a finding into a step: appends a note, leaves the label untouched", async () => {
    const result = await integrateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      stepId,
      mode: "MERGED",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("INTEGRATED");
    expect(result.data.integrationMode).toBe("MERGED");
    expect(result.data.integratedStepLabel).toBe("Match Invoice to PO");

    const step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.label).toBe("Match Invoice to PO");
    expect(step?.reviewNotes).toContain("Add an explicit tolerance threshold");
  });

  it("replaces a step's label with the finding's title, keeping the step's id", async () => {
    const result = await integrateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      stepId,
      mode: "REPLACED",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.integrationMode).toBe("REPLACED");

    const step = await prisma.processStep.findUnique({ where: { id: stepId } });
    expect(step?.id).toBe(stepId);
    expect(step?.label).toBe("No tolerance rule on three-way match");
    expect(step?.reviewNotes).toBe("Add an explicit tolerance threshold to the matching step.");
  });

  it("rejects a VIEWER attempting to edit, delete, or integrate a finding", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });

    const editResult = await updateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      title: "x",
      description: "x",
      recommendation: "x",
    });
    expect(editResult.ok).toBe(false);
    if (!editResult.ok) expect(editResult.error).toBe("FORBIDDEN");

    const deleteResult = await deleteReviewFinding({ workspaceId: fixture.workspace.id, findingId });
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) expect(deleteResult.error).toBe("FORBIDDEN");

    const integrateResult = await integrateReviewFinding({
      workspaceId: fixture.workspace.id,
      findingId,
      stepId,
      mode: "MERGED",
    });
    expect(integrateResult.ok).toBe(false);
    if (!integrateResult.ok) expect(integrateResult.error).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND when the finding belongs to a different workspace", async () => {
    const otherFixture = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: otherFixture.adminUser.id } });

    const result = await deleteReviewFinding({ workspaceId: otherFixture.workspace.id, findingId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");

    await otherFixture.cleanup();
  });
});
