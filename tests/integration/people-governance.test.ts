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
  addConflict,
  updateConflict,
  deleteConflict,
  addTrainingCourse,
  updateTrainingCourse,
  deleteTrainingCourse,
  addTrainingCompletion,
  deleteTrainingCompletion,
} = await import("@/lib/actions/people-governance");
const { prisma } = await import("@/lib/db/client");

describe("Conflicts of interest and training records (spec 021)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;
  let personId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
    personId = (await prisma.person.create({ data: { workspaceId, name: "Jordan Lee" } })).id;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe("conflicts (US1)", () => {
    async function declare() {
      const result = await addConflict({
        workspaceId,
        personId,
        description: "Spouse is a director at a shortlisted vendor.",
        relatedParty: "Northwind Supplies",
        declaredOn: "2026-09-01",
      });
      if (!result.ok) throw new Error(`setup failed: ${result.error}`);
      return result.data.id;
    }
    const read = (id: string) => prisma.conflictOfInterest.findUniqueOrThrow({ where: { id } });

    it("records a conflict as Declared and follows it to Closed with a mitigation note", async () => {
      const id = await declare();
      expect(await read(id)).toMatchObject({ workspaceId, personId, status: "DECLARED", relatedParty: "Northwind Supplies", mitigationNote: null });

      await updateConflict({ workspaceId, conflictId: id, status: "UNDER_REVIEW" });
      await updateConflict({ workspaceId, conflictId: id, status: "MITIGATED", mitigationNote: "Recused from the vendor decision." });
      expect(await read(id)).toMatchObject({ status: "MITIGATED", mitigationNote: "Recused from the vendor decision." });

      await updateConflict({ workspaceId, conflictId: id, status: "CLOSED" });
      expect(await read(id)).toMatchObject({ status: "CLOSED", mitigationNote: "Recused from the vendor decision." });

      await updateConflict({ workspaceId, conflictId: id, mitigationNote: "" });
      expect((await read(id)).mitigationNote).toBeNull();
    });

    it("deletes a conflict", async () => {
      const id = await declare();
      expect((await deleteConflict({ workspaceId, conflictId: id })).ok).toBe(true);
      expect(await prisma.conflictOfInterest.findUnique({ where: { id } })).toBeNull();
    });

    it("keeps an archived person's conflicts editable but won't record a new one for them; a hard delete removes them", async () => {
      const id = await declare();
      await prisma.person.update({ where: { id: personId }, data: { archivedAt: new Date() } });

      expect((await updateConflict({ workspaceId, conflictId: id, personId, status: "CLOSED" })).ok).toBe(true);
      const refused = await addConflict({ workspaceId, personId, description: "x", relatedParty: "x", declaredOn: "2026-09-01" });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

      await prisma.person.delete({ where: { id: personId } });
      expect(await prisma.conflictOfInterest.findUnique({ where: { id } })).toBeNull();
    });

    it("refuses another workspace's person or conflict", async () => {
      const other = await createFixtureWorkspace();
      const theirPerson = await prisma.person.create({ data: { workspaceId: other.workspace.id, name: "Theirs" } });
      const theirConflict = await prisma.conflictOfInterest.create({
        data: { workspaceId: other.workspace.id, personId: theirPerson.id, description: "x", relatedParty: "x", declaredOn: new Date() },
      });
      const ours = await declare();
      for (const result of [
        await addConflict({ workspaceId, personId: theirPerson.id, description: "x", relatedParty: "x", declaredOn: "2026-09-01" }),
        await updateConflict({ workspaceId, conflictId: ours, personId: theirPerson.id }),
        await updateConflict({ workspaceId, conflictId: theirConflict.id, status: "CLOSED" }),
        await deleteConflict({ workspaceId, conflictId: theirConflict.id }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();
    });
  });

  describe("training (US2)", () => {
    it("defines courses, refusing a duplicate name in any case, and renames and re-periods one", async () => {
      const a = await addTrainingCourse({ workspaceId, name: "Anti-bribery", validityMonths: 12 });
      expect(a.ok).toBe(true);
      const dup = await addTrainingCourse({ workspaceId, name: "anti-bribery" });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.error).toBe("VALIDATION_ERROR");

      const b = await addTrainingCourse({ workspaceId, name: "Induction" });
      if (!a.ok || !b.ok) throw new Error("setup failed");
      expect((await prisma.trainingCourse.findUniqueOrThrow({ where: { id: b.data.id } })).validityMonths).toBeNull();

      const clash = await updateTrainingCourse({ workspaceId, courseId: b.data.id, name: "ANTI-BRIBERY" });
      expect(clash.ok).toBe(false);
      await updateTrainingCourse({ workspaceId, courseId: b.data.id, name: "Staff induction", validityMonths: 36 });
      expect(await prisma.trainingCourse.findUniqueOrThrow({ where: { id: b.data.id } })).toMatchObject({
        name: "Staff induction",
        validityMonths: 36,
      });

      // Another workspace can use the same name.
      const other = await createFixtureWorkspace();
      mockAuth.mockResolvedValue({ user: { id: other.adminUser.id } });
      expect((await addTrainingCourse({ workspaceId: other.workspace.id, name: "Anti-bribery" })).ok).toBe(true);
      await other.cleanup();
    });

    it("records and deletes completions; deleting a course deletes its completions", async () => {
      const course = await addTrainingCourse({ workspaceId, name: "Anti-bribery", validityMonths: 12 });
      if (!course.ok) throw new Error("setup failed");
      const c1 = await addTrainingCompletion({ workspaceId, courseId: course.data.id, personId, completedOn: "2026-09-28" });
      const c2 = await addTrainingCompletion({ workspaceId, courseId: course.data.id, personId, completedOn: "2025-08-01" });
      if (!c1.ok || !c2.ok) throw new Error("setup failed");

      expect((await deleteTrainingCompletion({ workspaceId, completionId: c2.data.id })).ok).toBe(true);
      expect(await prisma.trainingCompletion.count({ where: { courseId: course.data.id } })).toBe(1);

      await deleteTrainingCourse({ workspaceId, courseId: course.data.id });
      expect(await prisma.trainingCompletion.findUnique({ where: { id: c1.data.id } })).toBeNull();
    });

    it("won't record a completion for an archived person, or against another workspace's course or person", async () => {
      const course = await addTrainingCourse({ workspaceId, name: "Anti-bribery" });
      if (!course.ok) throw new Error("setup failed");
      const archived = await prisma.person.create({ data: { workspaceId, name: "Former", archivedAt: new Date() } });
      const refused = await addTrainingCompletion({ workspaceId, courseId: course.data.id, personId: archived.id, completedOn: "2026-09-01" });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

      const other = await createFixtureWorkspace();
      const theirPerson = await prisma.person.create({ data: { workspaceId: other.workspace.id, name: "Theirs" } });
      const theirCourse = await prisma.trainingCourse.create({ data: { workspaceId: other.workspace.id, name: "Theirs" } });
      const theirCompletion = await prisma.trainingCompletion.create({
        data: { courseId: theirCourse.id, personId: theirPerson.id, completedOn: new Date() },
      });
      for (const result of [
        await addTrainingCompletion({ workspaceId, courseId: course.data.id, personId: theirPerson.id, completedOn: "2026-09-01" }),
        await addTrainingCompletion({ workspaceId, courseId: theirCourse.id, personId, completedOn: "2026-09-01" }),
        await deleteTrainingCompletion({ workspaceId, completionId: theirCompletion.id }),
        await updateTrainingCourse({ workspaceId, courseId: theirCourse.id, name: "Mine" }),
        await deleteTrainingCourse({ workspaceId, courseId: theirCourse.id }),
      ]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_FOUND");
      }
      await other.cleanup();
    });
  });

  it("refuses a VIEWER on every write", async () => {
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });
    for (const result of [
      await addConflict({ workspaceId, personId, description: "x", relatedParty: "x", declaredOn: "2026-09-01" }),
      await updateConflict({ workspaceId, conflictId: "any", status: "CLOSED" }),
      await deleteConflict({ workspaceId, conflictId: "any" }),
      await addTrainingCourse({ workspaceId, name: "x" }),
      await updateTrainingCourse({ workspaceId, courseId: "any", name: "y" }),
      await deleteTrainingCourse({ workspaceId, courseId: "any" }),
      await addTrainingCompletion({ workspaceId, courseId: "any", personId, completedOn: "2026-09-01" }),
      await deleteTrainingCompletion({ workspaceId, completionId: "any" }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    }
  });
});
