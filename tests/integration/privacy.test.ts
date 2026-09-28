import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const {
  addProcessingActivity,
  updateProcessingActivity,
  deleteProcessingActivity,
  addDpia,
  updateDpia,
  approveDpia,
  deleteDpia,
  linkBreachToActivity,
  unlinkBreachFromActivity,
} = await import("@/lib/actions/privacy");
const { prisma } = await import("@/lib/db/client");

describe("Data privacy register (spec 025)", () => {
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

  async function recordActivity(overrides: Partial<Parameters<typeof addProcessingActivity>[0]> = {}) {
    const result = await addProcessingActivity({
      workspaceId,
      name: "Payroll",
      purpose: "Paying employees and meeting tax obligations.",
      lawfulBasis: "LEGAL_OBLIGATION",
      dataSubjectCategories: ["Employees"],
      personalDataCategories: ["Bank details", "Salary", "Health (sick leave)"],
      recipients: ["Payroll bureau", "Tax authority"],
      retentionPeriod: "6 years after employment ends",
      ...overrides,
    });
    if (!result.ok) throw new Error(`setup failed: ${result.error}`);
    return result.data.id;
  }

  async function logBreach(personalDataBreach = true) {
    return prisma.governanceIncident.create({
      data: {
        workspaceId,
        title: "Payslips emailed to the wrong team",
        description: "x",
        occurredAt: new Date(),
        severity: "MEDIUM",
        category: "COMPLIANCE",
        personalDataBreach,
      },
    });
  }

  describe("processing activities (US1)", () => {
    it("records an activity with its Article 30 fields, owner, process and transfer", async () => {
      const role = await prisma.role.create({ data: { workspaceId, name: "HR Director" } });
      const process = await prisma.process.create({ data: { workspaceId, code: "HR-1", name: "Payroll run" } });
      const id = await recordActivity({
        specialCategory: true,
        transferDestination: "India",
        transferSafeguard: "Standard contractual clauses",
        processId: process.id,
        ownerRoleId: role.id,
      });
      expect(await prisma.processingActivity.findUniqueOrThrow({ where: { id } })).toMatchObject({
        workspaceId,
        lawfulBasis: "LEGAL_OBLIGATION",
        personalDataCategories: ["Bank details", "Salary", "Health (sick leave)"],
        recipients: ["Payroll bureau", "Tax authority"],
        specialCategory: true,
        transferDestination: "India",
        processId: process.id,
        ownerRoleId: role.id,
        ownerPersonId: null,
      });
    });

    it("updates only the fields given, replaces the owner as a pair, and deletes with its DPIAs and links", async () => {
      const person = await prisma.person.create({ data: { workspaceId, name: "Ana Silva" } });
      const role = await prisma.role.create({ data: { workspaceId, name: "HR Director" } });
      const id = await recordActivity({ ownerRoleId: role.id });

      await updateProcessingActivity({ workspaceId, activityId: id, retentionPeriod: "7 years", ownerPersonId: person.id });
      const updated = await prisma.processingActivity.findUniqueOrThrow({ where: { id } });
      expect(updated).toMatchObject({ retentionPeriod: "7 years", name: "Payroll", ownerRoleId: null, ownerPersonId: person.id });

      const dpia = await addDpia({ workspaceId, activityId: id, risksIdentified: "x", mitigations: "y", residualRisk: "LOW" });
      const breach = await logBreach();
      await linkBreachToActivity({ workspaceId, activityId: id, incidentId: breach.id });

      expect((await deleteProcessingActivity({ workspaceId, activityId: id })).ok).toBe(true);
      expect(await prisma.processingActivity.findUnique({ where: { id } })).toBeNull();
      if (dpia.ok) expect(await prisma.dpia.findUnique({ where: { id: dpia.data.id } })).toBeNull();
      expect(await prisma.processingBreachLink.count({ where: { incidentId: breach.id } })).toBe(0);
      expect(await prisma.governanceIncident.findUnique({ where: { id: breach.id } })).not.toBeNull();
    });

    it("refuses both owners, an archived owner or process, and another workspace's records", async () => {
      const role = await prisma.role.create({ data: { workspaceId, name: "HR Director" } });
      const person = await prisma.person.create({ data: { workspaceId, name: "Ana Silva", archivedAt: new Date() } });
      const archivedProcess = await prisma.process.create({ data: { workspaceId, code: "HR-2", name: "Old", archivedAt: new Date() } });

      for (const overrides of [{ ownerRoleId: role.id, ownerPersonId: "x" }, { ownerPersonId: person.id }, { processId: archivedProcess.id }]) {
        const result = await addProcessingActivity({
          workspaceId,
          name: "x",
          purpose: "x",
          lawfulBasis: "CONSENT",
          dataSubjectCategories: [],
          personalDataCategories: [],
          recipients: [],
          retentionPeriod: "x",
          ...overrides,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
      }

      const other = await createFixtureWorkspace();
      const theirs = await prisma.processingActivity.create({
        data: { workspaceId: other.workspace.id, name: "x", purpose: "x", lawfulBasis: "CONSENT", retentionPeriod: "x" },
      });
      const theirDpia = await prisma.dpia.create({ data: { activityId: theirs.id, risksIdentified: "x", mitigations: "x", residualRisk: "LOW" } });
      for (const result of [
        await updateProcessingActivity({ workspaceId, activityId: theirs.id, name: "Mine" }),
        await deleteProcessingActivity({ workspaceId, activityId: theirs.id }),
        await addDpia({ workspaceId, activityId: theirs.id, risksIdentified: "x", mitigations: "x", residualRisk: "LOW" }),
        await updateDpia({ workspaceId, dpiaId: theirDpia.id, mitigations: "z" }),
        await approveDpia({ workspaceId, dpiaId: theirDpia.id }),
        await deleteDpia({ workspaceId, dpiaId: theirDpia.id }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();
    });
  });

  describe("DPIAs (US2)", () => {
    it("starts a DPIA as Draft, approves it as an Admin, and an edit returns it to Draft", async () => {
      const activityId = await recordActivity({ specialCategory: true });
      const added = await addDpia({ workspaceId, activityId, risksIdentified: "Health data exposure", mitigations: "Access controls", residualRisk: "HIGH" });
      if (!added.ok) throw new Error("setup failed");
      const read = () => prisma.dpia.findUniqueOrThrow({ where: { id: added.data.id } });
      expect(await read()).toMatchObject({ status: "DRAFT", approvedAt: null, approvedByUserId: null });

      expect((await approveDpia({ workspaceId, dpiaId: added.data.id })).ok).toBe(true);
      const approved = await read();
      expect(approved).toMatchObject({ status: "APPROVED", approvedByUserId: fixture.adminUser.id });
      expect(approved.approvedAt).not.toBeNull();

      const again = await approveDpia({ workspaceId, dpiaId: added.data.id });
      expect(again.ok).toBe(false);

      // Saving unchanged content keeps the approval.
      await updateDpia({ workspaceId, dpiaId: added.data.id, mitigations: "Access controls" });
      expect((await read()).status).toBe("APPROVED");

      await updateDpia({ workspaceId, dpiaId: added.data.id, mitigations: "Access controls and pseudonymisation" });
      expect(await read()).toMatchObject({ status: "DRAFT", approvedAt: null, approvedByUserId: null });
    });

    it("lets an Editor draft and edit a DPIA but not approve it; a Viewer can do neither", async () => {
      const activityId = await recordActivity();
      const added = await addDpia({ workspaceId, activityId, risksIdentified: "x", mitigations: "y", residualRisk: "LOW" });
      if (!added.ok) throw new Error("setup failed");

      const { user: editor } = await fixture.addMember("EDITOR");
      mockAuth.mockResolvedValue({ user: { id: editor.id } });
      expect((await updateDpia({ workspaceId, dpiaId: added.data.id, residualRisk: "MEDIUM" })).ok).toBe(true);
      const refused = await approveDpia({ workspaceId, dpiaId: added.data.id });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("FORBIDDEN");

      const { user: viewer } = await fixture.addMember("VIEWER");
      mockAuth.mockResolvedValue({ user: { id: viewer.id } });
      for (const result of [
        await addProcessingActivity({
          workspaceId,
          name: "x",
          purpose: "x",
          lawfulBasis: "CONSENT",
          dataSubjectCategories: [],
          personalDataCategories: [],
          recipients: [],
          retentionPeriod: "x",
        }),
        await updateProcessingActivity({ workspaceId, activityId, name: "y" }),
        await deleteProcessingActivity({ workspaceId, activityId }),
        await addDpia({ workspaceId, activityId, risksIdentified: "x", mitigations: "y", residualRisk: "LOW" }),
        await updateDpia({ workspaceId, dpiaId: added.data.id, residualRisk: "LOW" }),
        await deleteDpia({ workspaceId, dpiaId: added.data.id }),
        await linkBreachToActivity({ workspaceId, activityId, incidentId: "any" }),
        await unlinkBreachFromActivity({ workspaceId, activityId, incidentId: "any" }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("FORBIDDEN");
      }
    });
  });

  describe("breach links (US3)", () => {
    it("links a breach incident to an activity idempotently, and unlinks it", async () => {
      const activityId = await recordActivity();
      const breach = await logBreach();
      expect((await linkBreachToActivity({ workspaceId, activityId, incidentId: breach.id })).ok).toBe(true);
      expect((await linkBreachToActivity({ workspaceId, activityId, incidentId: breach.id })).ok).toBe(true);
      expect(await prisma.processingBreachLink.count({ where: { activityId } })).toBe(1);

      await unlinkBreachFromActivity({ workspaceId, activityId, incidentId: breach.id });
      expect(await prisma.processingBreachLink.count({ where: { activityId } })).toBe(0);

      await linkBreachToActivity({ workspaceId, activityId, incidentId: breach.id });
      await prisma.governanceIncident.delete({ where: { id: breach.id } });
      expect(await prisma.processingBreachLink.count({ where: { activityId } })).toBe(0);
    });

    it("refuses an incident that isn't a breach, and another workspace's incident", async () => {
      const activityId = await recordActivity();
      const notBreach = await logBreach(false);
      const refused = await linkBreachToActivity({ workspaceId, activityId, incidentId: notBreach.id });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

      const other = await createFixtureWorkspace();
      const theirs = await prisma.governanceIncident.create({
        data: {
          workspaceId: other.workspace.id,
          title: "x",
          description: "x",
          occurredAt: new Date(),
          severity: "LOW",
          category: "OTHER",
          personalDataBreach: true,
        },
      });
      const notFound = await linkBreachToActivity({ workspaceId, activityId, incidentId: theirs.id });
      expect(notFound.ok).toBe(false);
      if (!notFound.ok) expect(notFound.error).toBe("NOT_FOUND");
      await other.cleanup();
    });
  });
});
