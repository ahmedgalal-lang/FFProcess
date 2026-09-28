import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { logEthicsCase, updateEthicsCaseStatus, assignEthicsInvestigator, addEthicsCaseNote, deleteEthicsCase } =
  await import("@/lib/actions/ethics");
const actions = await import("@/lib/actions/ethics");
const { prisma } = await import("@/lib/db/client");

describe("Ethics case register (spec 022)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function log(overrides: Partial<Parameters<typeof logEthicsCase>[0]> = {}) {
    const result = await logEthicsCase({
      workspaceId,
      receivedOn: "2026-09-20",
      channel: "HOTLINE",
      category: "FRAUD",
      severity: "HIGH",
      description: "Expense claims for a cancelled trip.",
      anonymous: true,
      ...overrides,
    });
    if (!result.ok) throw new Error(`setup failed: ${result.error}`);
    return result.data;
  }
  const read = (id: string) => prisma.ethicsCase.findUniqueOrThrow({ where: { id }, include: { notes: true } });

  it("logs cases under references that are never reused, even after a delete", async () => {
    const first = await log();
    expect(first.reference).toBe("CASE-0001");
    expect(await read(first.id)).toMatchObject({ number: 1, status: "NEW", anonymous: true, reporterName: null });

    const second = await log();
    expect(second.reference).toBe("CASE-0002");
    expect((await deleteEthicsCase({ workspaceId, caseId: second.id })).ok).toBe(true);

    const third = await log();
    expect(third.reference).toBe("CASE-0003");
  });

  it("numbers each workspace's cases on their own", async () => {
    await log();
    const other = await createFixtureWorkspace();
    mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
    const theirs = await logEthicsCase({
      workspaceId: other.workspace.id,
      receivedOn: "2026-09-20",
      channel: "EMAIL",
      category: "OTHER",
      severity: "LOW",
      description: "x",
      anonymous: true,
    });
    expect(theirs.ok && theirs.data.reference).toBe("CASE-0001");
    await other.cleanup();
  });

  it("records a named reporter only when the report isn't anonymous", async () => {
    const refused = await logEthicsCase({
      workspaceId,
      receivedOn: "2026-09-20",
      channel: "IN_PERSON",
      category: "HARASSMENT_DISCRIMINATION",
      severity: "MEDIUM",
      description: "x",
      anonymous: true,
      reporterName: "Pat Doe",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

    const named = await log({ anonymous: false, reporterName: "Pat Doe" });
    expect((await read(named.id)).reporterName).toBe("Pat Doe");
  });

  it("moves a case through triage and investigation, and closing needs an outcome and summary", async () => {
    const { id } = await log();
    await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "TRIAGED" });
    await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "UNDER_INVESTIGATION" });
    expect((await read(id)).status).toBe("UNDER_INVESTIGATION");

    for (const partial of [{}, { outcome: "SUBSTANTIATED" as const }, { closingSummary: "Repaid." }]) {
      const refused = await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "CLOSED", ...partial });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");
    }

    await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "CLOSED", outcome: "SUBSTANTIATED", closingSummary: "Repaid; warning issued." });
    const closed = await read(id);
    expect(closed).toMatchObject({ status: "CLOSED", outcome: "SUBSTANTIATED", closingSummary: "Repaid; warning issued." });
    expect(closed.closedAt).not.toBeNull();

    await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "UNDER_INVESTIGATION" });
    expect(await read(id)).toMatchObject({ outcome: null, closingSummary: null, closedAt: null });
  });

  it("refuses to delete a case once triaged, and has no way back to New", async () => {
    const { id } = await log();
    await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "TRIAGED" });
    const refused = await deleteEthicsCase({ workspaceId, caseId: id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

    const backToNew = await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "NEW" as never });
    expect(backToNew.ok).toBe(false);
  });

  it("assigns a directory person (keeping their name) or an outside name, and clears it", async () => {
    const { id } = await log();
    const person = await prisma.person.create({ data: { workspaceId, name: "Morgan Reyes" } });
    await assignEthicsInvestigator({ workspaceId, caseId: id, investigatorPersonId: person.id });
    expect(await read(id)).toMatchObject({ investigatorPersonId: person.id, investigatorName: "Morgan Reyes" });

    await prisma.person.delete({ where: { id: person.id } });
    expect(await read(id)).toMatchObject({ investigatorPersonId: null, investigatorName: "Morgan Reyes" });

    await assignEthicsInvestigator({ workspaceId, caseId: id, investigatorName: "External counsel" });
    expect(await read(id)).toMatchObject({ investigatorPersonId: null, investigatorName: "External counsel" });

    await assignEthicsInvestigator({ workspaceId, caseId: id, investigatorPersonId: null, investigatorName: null });
    expect(await read(id)).toMatchObject({ investigatorPersonId: null, investigatorName: null });

    const archived = await prisma.person.create({ data: { workspaceId, name: "Former", archivedAt: new Date() } });
    const refused = await assignEthicsInvestigator({ workspaceId, caseId: id, investigatorPersonId: archived.id });
    expect(refused.ok).toBe(false);
  });

  it("appends notes attributed to their author, and offers no way to change one", async () => {
    const { id } = await log();
    await addEthicsCaseNote({ workspaceId, caseId: id, body: "Interviewed the line manager." });
    await addEthicsCaseNote({ workspaceId, caseId: id, body: "Requested card statements." });
    const notes = (await read(id)).notes;
    expect(notes.map((n) => n.body).sort()).toEqual(["Interviewed the line manager.", "Requested card statements."]);
    expect(notes.every((n) => n.authorUserId === fixture.adminUser.id)).toBe(true);

    const exported = Object.keys(actions).filter((k) => /note/i.test(k));
    expect(exported).toEqual(["addEthicsCaseNote"]);
  });

  it("refuses Editors and Viewers on every action, and another workspace's case", async () => {
    const { id } = await log();
    for (const level of ["EDITOR", "VIEWER"] as const) {
      const { user } = await fixture.addMember(level);
      mockAuth.mockResolvedValue({ user: { id: user.id } });
      for (const result of [
        await logEthicsCase({ workspaceId, receivedOn: "2026-09-20", channel: "HOTLINE", category: "FRAUD", severity: "LOW", description: "x", anonymous: true }),
        await updateEthicsCaseStatus({ workspaceId, caseId: id, status: "TRIAGED" }),
        await assignEthicsInvestigator({ workspaceId, caseId: id, investigatorName: "x" }),
        await addEthicsCaseNote({ workspaceId, caseId: id, body: "x" }),
        await deleteEthicsCase({ workspaceId, caseId: id }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("FORBIDDEN");
      }
    }

    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    const other = await createFixtureWorkspace();
    const theirs = await prisma.ethicsCase.create({
      data: {
        workspaceId: other.workspace.id,
        number: 1,
        receivedOn: new Date(),
        channel: "OTHER",
        category: "OTHER",
        severity: "LOW",
        description: "x",
        anonymous: true,
      },
    });
    for (const result of [
      await updateEthicsCaseStatus({ workspaceId, caseId: theirs.id, status: "TRIAGED" }),
      await addEthicsCaseNote({ workspaceId, caseId: theirs.id, body: "x" }),
      await deleteEthicsCase({ workspaceId, caseId: theirs.id }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("NOT_FOUND");
    }
    await other.cleanup();
  });
});
