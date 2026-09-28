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
  addIncident,
  updateIncident,
  deleteIncident,
  setIncidentBreach,
  addIncidentAction,
  setIncidentActionDone,
  deleteIncidentAction,
  linkIncidentRisk,
  unlinkIncidentRisk,
} = await import("@/lib/actions/incidents");
const { prisma } = await import("@/lib/db/client");

describe("Incident log (spec 024)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;
  let processId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    processId = (await prisma.process.create({ data: { workspaceId, code: "P-01", name: "Accounts payable" } })).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function logIncident(overrides: Partial<Parameters<typeof addIncident>[0]> = {}) {
    const result = await addIncident({
      workspaceId,
      title: "Payment sent to the wrong account",
      description: "A supplier's bank details were changed by a phishing email.",
      occurredAt: "2026-09-20",
      severity: "HIGH",
      category: "FINANCIAL",
      processId,
      ...overrides,
    });
    if (!result.ok) throw new Error(`setup failed: ${result.error}`);
    return result.data.id;
  }

  const read = (id: string) =>
    prisma.governanceIncident.findUniqueOrThrow({ where: { id }, include: { actions: true, riskLinks: true } });

  describe("logging and resolving (US1)", () => {
    it("logs an incident as Open with its details and process", async () => {
      const id = await logIncident();
      expect(await read(id)).toMatchObject({
        workspaceId,
        status: "OPEN",
        severity: "HIGH",
        category: "FINANCIAL",
        processId,
        rootCause: null,
        closedAt: null,
        personalDataBreach: false,
      });
    });

    it("refuses Resolved or Closed without a root cause, then follows it through to Closed and back", async () => {
      const id = await logIncident();
      expect((await updateIncident({ workspaceId, incidentId: id, status: "INVESTIGATING" })).ok).toBe(true);

      for (const status of ["RESOLVED", "CLOSED"] as const) {
        const refused = await updateIncident({ workspaceId, incidentId: id, status });
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");
      }
      const blank = await updateIncident({ workspaceId, incidentId: id, status: "RESOLVED", rootCause: "   " });
      expect(blank.ok).toBe(false);

      await updateIncident({ workspaceId, incidentId: id, status: "RESOLVED", rootCause: "No call-back check on bank detail changes." });
      expect(await read(id)).toMatchObject({ status: "RESOLVED", closedAt: null });

      await updateIncident({ workspaceId, incidentId: id, status: "CLOSED" });
      const closed = await read(id);
      expect(closed.status).toBe("CLOSED");
      expect(closed.closedAt).not.toBeNull();

      // Editing a closed incident keeps its original close date.
      await updateIncident({ workspaceId, incidentId: id, title: "Payment misdirected" });
      expect((await read(id)).closedAt).toEqual(closed.closedAt);

      // Clearing the root cause of a closed incident is refused.
      expect((await updateIncident({ workspaceId, incidentId: id, rootCause: null })).ok).toBe(false);

      await updateIncident({ workspaceId, incidentId: id, status: "INVESTIGATING" });
      expect(await read(id)).toMatchObject({ status: "INVESTIGATING", closedAt: null });
    });

    it("closes with open corrective actions (the warning is the page's; the action allows it)", async () => {
      const id = await logIncident();
      await addIncidentAction({ workspaceId, incidentId: id, description: "Add a call-back check" });
      const closed = await updateIncident({ workspaceId, incidentId: id, status: "CLOSED", rootCause: "No call-back check." });
      expect(closed.ok).toBe(true);
    });

    it("deletes an incident with its actions and risk links, but not the risk", async () => {
      const id = await logIncident();
      await addIncidentAction({ workspaceId, incidentId: id, description: "x" });
      const risk = await prisma.governanceRisk.create({
        data: { workspaceId, title: "Payment fraud", description: "x", likelihood: "MEDIUM", impact: "HIGH" },
      });
      await linkIncidentRisk({ workspaceId, incidentId: id, riskId: risk.id });

      expect((await deleteIncident({ workspaceId, incidentId: id })).ok).toBe(true);
      expect(await prisma.governanceIncident.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.governanceIncidentAction.count({ where: { incidentId: id } })).toBe(0);
      expect(await prisma.governanceIncidentRisk.count({ where: { riskId: risk.id } })).toBe(0);
      expect(await prisma.governanceRisk.findUnique({ where: { id: risk.id } })).not.toBeNull();
    });

    it("links only this workspace's live processes, keeps a link to one archived later, and survives a hard delete", async () => {
      const other = await createFixtureWorkspace();
      const theirProcess = await prisma.process.create({ data: { workspaceId: other.workspace.id, code: "X-1", name: "Theirs" } });
      const refused = await addIncident({
        workspaceId,
        title: "x",
        description: "x",
        occurredAt: "2026-09-20",
        severity: "LOW",
        category: "OTHER",
        processId: theirProcess.id,
      });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("NOT_FOUND");
      await other.cleanup();

      const id = await logIncident();
      await prisma.process.update({ where: { id: processId }, data: { archivedAt: new Date() } });
      // Still editable while linked to a process archived after the fact.
      expect((await updateIncident({ workspaceId, incidentId: id, processId, severity: "CRITICAL" })).ok).toBe(true);
      // But an archived process can't be newly linked.
      const fresh = await logIncident({ processId: null });
      const linkArchived = await updateIncident({ workspaceId, incidentId: fresh, processId });
      expect(linkArchived.ok).toBe(false);
      if (!linkArchived.ok) expect(linkArchived.error).toBe("VALIDATION_ERROR");

      await prisma.process.delete({ where: { id: processId } });
      expect((await read(id)).processId).toBeNull();
    });

    it("refuses another workspace's incident, and a VIEWER on every write", async () => {
      const other = await createFixtureWorkspace();
      const theirs = await prisma.governanceIncident.create({
        data: { workspaceId: other.workspace.id, title: "x", description: "x", occurredAt: new Date(), severity: "LOW", category: "OTHER" },
      });
      for (const result of [
        await updateIncident({ workspaceId, incidentId: theirs.id, severity: "HIGH" }),
        await deleteIncident({ workspaceId, incidentId: theirs.id }),
        await setIncidentBreach({ workspaceId, incidentId: theirs.id, personalDataBreach: true }),
        await addIncidentAction({ workspaceId, incidentId: theirs.id, description: "x" }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();

      const id = await logIncident();
      const { user: viewer } = await fixture.addMember("VIEWER");
      mockAuth.mockResolvedValue({ user: { id: viewer.id } });
      const results = [
        await addIncident({ workspaceId, title: "x", description: "x", occurredAt: "2026-09-20", severity: "LOW", category: "OTHER" }),
        await updateIncident({ workspaceId, incidentId: id, severity: "LOW" }),
        await deleteIncident({ workspaceId, incidentId: id }),
        await setIncidentBreach({ workspaceId, incidentId: id, personalDataBreach: true }),
        await addIncidentAction({ workspaceId, incidentId: id, description: "x" }),
        await setIncidentActionDone({ workspaceId, actionId: "any", done: true }),
        await deleteIncidentAction({ workspaceId, actionId: "any" }),
        await linkIncidentRisk({ workspaceId, incidentId: id, riskId: "any" }),
        await unlinkIncidentRisk({ workspaceId, incidentId: id, riskId: "any" }),
      ];
      for (const result of results) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("FORBIDDEN");
      }
    });
  });

  describe("corrective actions (US2)", () => {
    it("adds actions with a role or person owner, marks done and undone, and deletes one", async () => {
      const id = await logIncident();
      const role = await prisma.role.create({ data: { workspaceId, name: "AP Supervisor" } });
      const person = await prisma.person.create({ data: { workspaceId, name: "Dana Kim" } });
      const a = await addIncidentAction({ workspaceId, incidentId: id, description: "Call-back check", ownerRoleId: role.id, dueDate: "2026-10-15" });
      const b = await addIncidentAction({ workspaceId, incidentId: id, description: "Retrain AP team", ownerPersonId: person.id });
      if (!a.ok || !b.ok) throw new Error("setup failed");

      const action = await prisma.governanceIncidentAction.findUniqueOrThrow({ where: { id: a.data.id } });
      expect(action).toMatchObject({ ownerRoleId: role.id, ownerPersonId: null, doneAt: null });
      expect(action.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-15");

      await setIncidentActionDone({ workspaceId, actionId: a.data.id, done: true });
      expect((await prisma.governanceIncidentAction.findUniqueOrThrow({ where: { id: a.data.id } })).doneAt).not.toBeNull();
      await setIncidentActionDone({ workspaceId, actionId: a.data.id, done: false });
      expect((await prisma.governanceIncidentAction.findUniqueOrThrow({ where: { id: a.data.id } })).doneAt).toBeNull();

      await deleteIncidentAction({ workspaceId, actionId: b.data.id });
      expect((await read(id)).actions.map((x) => x.id)).toEqual([a.data.id]);
    });

    it("refuses both owners, an archived owner, and another workspace's owner or action", async () => {
      const id = await logIncident();
      const role = await prisma.role.create({ data: { workspaceId, name: "AP Supervisor" } });
      const person = await prisma.person.create({ data: { workspaceId, name: "Dana Kim", archivedAt: new Date() } });

      const both = await addIncidentAction({ workspaceId, incidentId: id, description: "x", ownerRoleId: role.id, ownerPersonId: person.id });
      expect(both.ok).toBe(false);
      if (!both.ok) expect(both.error).toBe("VALIDATION_ERROR");

      const archived = await addIncidentAction({ workspaceId, incidentId: id, description: "x", ownerPersonId: person.id });
      expect(archived.ok).toBe(false);
      if (!archived.ok) expect(archived.error).toBe("VALIDATION_ERROR");

      const other = await createFixtureWorkspace();
      const theirRole = await prisma.role.create({ data: { workspaceId: other.workspace.id, name: "Theirs" } });
      const theirIncident = await prisma.governanceIncident.create({
        data: { workspaceId: other.workspace.id, title: "x", description: "x", occurredAt: new Date(), severity: "LOW", category: "OTHER" },
      });
      const theirAction = await prisma.governanceIncidentAction.create({ data: { incidentId: theirIncident.id, description: "x" } });
      for (const result of [
        await addIncidentAction({ workspaceId, incidentId: id, description: "x", ownerRoleId: theirRole.id }),
        await setIncidentActionDone({ workspaceId, actionId: theirAction.id, done: true }),
        await deleteIncidentAction({ workspaceId, actionId: theirAction.id }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();
    });
  });

  describe("personal data breaches and risk links (US3)", () => {
    it("flags a breach with an awareness time, records notified or not-required but not both, and unflagging clears it all", async () => {
      const id = await logIncident();
      const awareAt = "2026-09-26T09:30:00.000Z";

      expect((await setIncidentBreach({ workspaceId, incidentId: id, personalDataBreach: true, breachAwareAt: awareAt })).ok).toBe(true);
      expect(await read(id)).toMatchObject({ personalDataBreach: true, breachAwareAt: new Date(awareAt), regulatorNotifiedAt: null });

      const both = await setIncidentBreach({
        workspaceId,
        incidentId: id,
        personalDataBreach: true,
        breachAwareAt: awareAt,
        regulatorNotifiedAt: "2026-09-27T10:00:00.000Z",
        notificationNotRequiredReason: "Low risk",
      });
      expect(both.ok).toBe(false);
      if (!both.ok) expect(both.error).toBe("VALIDATION_ERROR");

      await setIncidentBreach({
        workspaceId,
        incidentId: id,
        personalDataBreach: true,
        breachAwareAt: awareAt,
        regulatorNotifiedAt: "2026-09-27T10:00:00.000Z",
      });
      expect((await read(id)).regulatorNotifiedAt).toEqual(new Date("2026-09-27T10:00:00.000Z"));

      await setIncidentBreach({
        workspaceId,
        incidentId: id,
        personalDataBreach: true,
        breachAwareAt: awareAt,
        notificationNotRequiredReason: "Encrypted laptop; unlikely to harm anyone.",
      });
      expect(await read(id)).toMatchObject({
        regulatorNotifiedAt: null,
        notificationNotRequiredReason: "Encrypted laptop; unlikely to harm anyone.",
      });

      await setIncidentBreach({ workspaceId, incidentId: id, personalDataBreach: false, breachAwareAt: awareAt });
      expect(await read(id)).toMatchObject({
        personalDataBreach: false,
        breachAwareAt: null,
        regulatorNotifiedAt: null,
        notificationNotRequiredReason: null,
      });
    });

    it("links and unlinks this workspace's risks, idempotently; deleting the risk removes only the link", async () => {
      const id = await logIncident();
      const risk = await prisma.governanceRisk.create({
        data: { workspaceId, title: "Payment fraud", description: "x", likelihood: "MEDIUM", impact: "HIGH" },
      });

      expect((await linkIncidentRisk({ workspaceId, incidentId: id, riskId: risk.id })).ok).toBe(true);
      expect((await linkIncidentRisk({ workspaceId, incidentId: id, riskId: risk.id })).ok).toBe(true);
      expect((await read(id)).riskLinks.map((l) => l.riskId)).toEqual([risk.id]);

      await unlinkIncidentRisk({ workspaceId, incidentId: id, riskId: risk.id });
      expect((await read(id)).riskLinks).toHaveLength(0);

      await linkIncidentRisk({ workspaceId, incidentId: id, riskId: risk.id });
      await prisma.governanceRisk.delete({ where: { id: risk.id } });
      expect((await read(id)).riskLinks).toHaveLength(0);

      const other = await createFixtureWorkspace();
      const theirRisk = await prisma.governanceRisk.create({
        data: { workspaceId: other.workspace.id, title: "x", description: "x", likelihood: "LOW", impact: "LOW" },
      });
      const refused = await linkIncidentRisk({ workspaceId, incidentId: id, riskId: theirRisk.id });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("NOT_FOUND");
      await other.cleanup();
    });
  });
});
