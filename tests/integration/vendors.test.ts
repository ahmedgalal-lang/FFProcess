import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: mockAuth,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

const { addVendor, updateVendor, deleteVendor, linkVendorRisk, unlinkVendorRisk } = await import("@/lib/actions/vendors");
const { prisma } = await import("@/lib/db/client");

describe("Vendor register (spec 023)", () => {
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

  async function addOne(overrides: Partial<Parameters<typeof addVendor>[0]> = {}) {
    const result = await addVendor({ workspaceId, name: "Northwind Logistics", service: "Freight forwarding", criticality: "HIGH", ...overrides });
    if (!result.ok) throw new Error(`setup failed: ${result.error}`);
    return result.data.id;
  }
  const read = (id: string) => prisma.vendor.findUniqueOrThrow({ where: { id }, include: { riskLinks: true } });

  it("adds a vendor with defaults, then updates due diligence, contract and owner", async () => {
    const id = await addOne();
    expect(await read(id)).toMatchObject({
      workspaceId,
      criticality: "HIGH",
      dueDiligenceStatus: "NOT_STARTED",
      lastDueDiligenceOn: null,
      reviewCycleMonths: null,
      contractEndOn: null,
      ownerRoleId: null,
    });

    const role = await prisma.role.create({ data: { workspaceId, name: "Procurement Lead" } });
    const person = await prisma.person.create({ data: { workspaceId, name: "Sam Ortiz" } });
    await updateVendor({
      workspaceId,
      vendorId: id,
      dueDiligenceStatus: "COMPLETED",
      lastDueDiligenceOn: "2025-08-15",
      reviewCycleMonths: 12,
      contractStartOn: "2024-01-01",
      contractEndOn: "2026-12-31",
      ownerRoleId: role.id,
    });
    const updated = await read(id);
    expect(updated).toMatchObject({ dueDiligenceStatus: "COMPLETED", reviewCycleMonths: 12, ownerRoleId: role.id, name: "Northwind Logistics" });
    expect(updated.contractEndOn?.toISOString().slice(0, 10)).toBe("2026-12-31");

    await updateVendor({ workspaceId, vendorId: id, ownerPersonId: person.id });
    expect(await read(id)).toMatchObject({ ownerRoleId: null, ownerPersonId: person.id });

    await updateVendor({ workspaceId, vendorId: id, contractEndOn: null, reviewCycleMonths: null });
    expect(await read(id)).toMatchObject({ contractEndOn: null, reviewCycleMonths: null });
  });

  it("refuses a contract that ends before it starts, including against a stored date", async () => {
    const refused = await addVendor({ workspaceId, name: "x", service: "x", criticality: "LOW", contractStartOn: "2026-06-01", contractEndOn: "2026-05-01" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("VALIDATION_ERROR");

    const id = await addOne({ contractStartOn: "2026-06-01" });
    const alsoRefused = await updateVendor({ workspaceId, vendorId: id, contractEndOn: "2026-01-01" });
    expect(alsoRefused.ok).toBe(false);
  });

  it("refuses both owners, an archived owner, and another workspace's vendor or owner", async () => {
    const role = await prisma.role.create({ data: { workspaceId, name: "Procurement Lead" } });
    const archived = await prisma.person.create({ data: { workspaceId, name: "Former", archivedAt: new Date() } });
    for (const overrides of [{ ownerRoleId: role.id, ownerPersonId: archived.id }, { ownerPersonId: archived.id }]) {
      const result = await addVendor({ workspaceId, name: "x", service: "x", criticality: "LOW", ...overrides });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("VALIDATION_ERROR");
    }

    const other = await createFixtureWorkspace();
    const theirRole = await prisma.role.create({ data: { workspaceId: other.workspace.id, name: "Theirs" } });
    const theirs = await prisma.vendor.create({ data: { workspaceId: other.workspace.id, name: "x", service: "x", criticality: "LOW" } });
    const ours = await addOne();
    for (const result of [
      await addVendor({ workspaceId, name: "x", service: "x", criticality: "LOW", ownerRoleId: theirRole.id }),
      await updateVendor({ workspaceId, vendorId: ours, ownerRoleId: theirRole.id }),
      await updateVendor({ workspaceId, vendorId: theirs.id, name: "Mine" }),
      await deleteVendor({ workspaceId, vendorId: theirs.id }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("NOT_FOUND");
    }
    await other.cleanup();
  });

  it("links and unlinks risks idempotently; deleting either side removes only the link", async () => {
    const id = await addOne();
    const risk = await prisma.governanceRisk.create({
      data: { workspaceId, title: "Single freight carrier", description: "x", likelihood: "MEDIUM", impact: "HIGH" },
    });
    expect((await linkVendorRisk({ workspaceId, vendorId: id, riskId: risk.id })).ok).toBe(true);
    expect((await linkVendorRisk({ workspaceId, vendorId: id, riskId: risk.id })).ok).toBe(true);
    expect((await read(id)).riskLinks.map((l) => l.riskId)).toEqual([risk.id]);

    await unlinkVendorRisk({ workspaceId, vendorId: id, riskId: risk.id });
    expect((await read(id)).riskLinks).toHaveLength(0);

    await linkVendorRisk({ workspaceId, vendorId: id, riskId: risk.id });
    await prisma.governanceRisk.delete({ where: { id: risk.id } });
    expect((await read(id)).riskLinks).toHaveLength(0);

    const risk2 = await prisma.governanceRisk.create({ data: { workspaceId, title: "y", description: "y", likelihood: "LOW", impact: "LOW" } });
    await linkVendorRisk({ workspaceId, vendorId: id, riskId: risk2.id });
    await deleteVendor({ workspaceId, vendorId: id });
    expect(await prisma.governanceRisk.findUnique({ where: { id: risk2.id } })).not.toBeNull();
    expect(await prisma.vendorRisk.count({ where: { riskId: risk2.id } })).toBe(0);

    const other = await createFixtureWorkspace();
    const theirRisk = await prisma.governanceRisk.create({
      data: { workspaceId: other.workspace.id, title: "x", description: "x", likelihood: "LOW", impact: "LOW" },
    });
    const ours = await addOne();
    const refused = await linkVendorRisk({ workspaceId, vendorId: ours, riskId: theirRisk.id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("NOT_FOUND");
    await other.cleanup();
  });

  it("refuses a VIEWER on every write", async () => {
    const id = await addOne();
    const { user: viewer } = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.id } });
    for (const result of [
      await addVendor({ workspaceId, name: "x", service: "x", criticality: "LOW" }),
      await updateVendor({ workspaceId, vendorId: id, name: "y" }),
      await deleteVendor({ workspaceId, vendorId: id }),
      await linkVendorRisk({ workspaceId, vendorId: id, riskId: "any" }),
      await unlinkVendorRisk({ workspaceId, vendorId: id, riskId: "any" }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    }
  });
});
