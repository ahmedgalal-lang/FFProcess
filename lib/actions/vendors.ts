"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * The vendor and third-party risk register (spec 023): the outside parties
 * the client depends on, their due diligence and contracts, and links to
 * the risks on the Risk Register they carry. EDITOR writes throughout.
 */

const CRITICALITY = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const DUE_DILIGENCE = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

async function findOwnedVendor(workspaceId: string, vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  return vendor && vendor.workspaceId === workspaceId ? vendor : null;
}

const toDate = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(value) : null);

const vendorFields = {
  name: z.string().trim().min(1).max(200),
  service: z.string().trim().min(1).max(4000),
  criticality: CRITICALITY,
  ownerRoleId: z.string().min(1).nullable(),
  ownerPersonId: z.string().min(1).nullable(),
  dueDiligenceStatus: DUE_DILIGENCE,
  lastDueDiligenceOn: z.iso.date().nullable(),
  reviewCycleMonths: z.number().int().min(1).max(120).nullable(),
  contractStartOn: z.iso.date().nullable(),
  contractEndOn: z.iso.date().nullable(),
};

function checkContractDates(start: Date | null | undefined, end: Date | null | undefined) {
  return start && end && end < start ? validationError("The contract can't end before it starts.") : null;
}

const addVendorSchema = z
  .object(vendorFields)
  .partial({
    ownerRoleId: true,
    ownerPersonId: true,
    dueDiligenceStatus: true,
    lastDueDiligenceOn: true,
    reviewCycleMonths: true,
    contractStartOn: true,
    contractEndOn: true,
  })
  .extend({ workspaceId: z.string().min(1) });

export async function addVendor(input: z.infer<typeof addVendorSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addVendorSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId } = parsed.data;
  const ownerRoleId = parsed.data.ownerRoleId ?? null;
  const ownerPersonId = parsed.data.ownerPersonId ?? null;
  const contractStartOn = toDate(parsed.data.contractStartOn) ?? null;
  const contractEndOn = toDate(parsed.data.contractEndOn) ?? null;
  const problem =
    (await checkAssignableOwner(workspaceId, ownerRoleId, ownerPersonId)) ?? checkContractDates(contractStartOn, contractEndOn);
  if (problem) return problem;

  const vendor = await prisma.vendor.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      service: parsed.data.service,
      criticality: parsed.data.criticality,
      ownerRoleId,
      ownerPersonId,
      dueDiligenceStatus: parsed.data.dueDiligenceStatus ?? "NOT_STARTED",
      lastDueDiligenceOn: toDate(parsed.data.lastDueDiligenceOn) ?? null,
      reviewCycleMonths: parsed.data.reviewCycleMonths ?? null,
      contractStartOn,
      contractEndOn,
    },
  });

  revalidate(workspaceId);
  return ok({ id: vendor.id });
}

const updateVendorSchema = z
  .object(vendorFields)
  .partial()
  .extend({ workspaceId: z.string().min(1), vendorId: z.string().min(1) });

/** Only the fields given change. The owner is replaced as a pair when either side is given. */
export async function updateVendor(input: z.infer<typeof updateVendorSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateVendorSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, vendorId, ownerRoleId, ownerPersonId, lastDueDiligenceOn, contractStartOn, contractEndOn, ...rest } =
    parsed.data;
  const current = await findOwnedVendor(workspaceId, vendorId);
  if (!current) return notFound();

  const ownerChanging = ownerRoleId !== undefined || ownerPersonId !== undefined;
  if (ownerChanging) {
    const problem = await checkAssignableOwner(workspaceId, ownerRoleId ?? null, ownerPersonId ?? null, {
      roleId: current.ownerRoleId,
      personId: current.ownerPersonId,
    });
    if (problem) return problem;
  }
  const start = toDate(contractStartOn);
  const end = toDate(contractEndOn);
  const datesProblem = checkContractDates(
    start === undefined ? current.contractStartOn : start,
    end === undefined ? current.contractEndOn : end
  );
  if (datesProblem) return datesProblem;

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...rest,
      ownerRoleId: ownerChanging ? (ownerRoleId ?? null) : undefined,
      ownerPersonId: ownerChanging ? (ownerPersonId ?? null) : undefined,
      lastDueDiligenceOn: toDate(lastDueDiligenceOn),
      contractStartOn: start,
      contractEndOn: end,
    },
  });

  revalidate(workspaceId);
  return ok({ id: vendorId });
}

const vendorRefSchema = z.object({ workspaceId: z.string().min(1), vendorId: z.string().min(1) });

/** Deletes the vendor and its risk links — never the risks. */
export async function deleteVendor(input: z.infer<typeof vendorRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = vendorRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedVendor(parsed.data.workspaceId, parsed.data.vendorId))) return notFound();

  await prisma.vendor.delete({ where: { id: parsed.data.vendorId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.vendorId });
}

const riskLinkSchema = z.object({
  workspaceId: z.string().min(1),
  vendorId: z.string().min(1),
  riskId: z.string().min(1),
});

/** Links a vendor to a risk it carries on the Risk Register. Idempotent. */
export async function linkVendorRisk(input: z.infer<typeof riskLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = riskLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, vendorId, riskId } = parsed.data;
  if (!(await findOwnedVendor(workspaceId, vendorId))) return notFound();
  const risk = await prisma.governanceRisk.findUnique({ where: { id: riskId } });
  if (!risk || risk.workspaceId !== workspaceId) return notFound();

  await prisma.vendorRisk.upsert({
    where: { vendorId_riskId: { vendorId, riskId } },
    create: { vendorId, riskId },
    update: {},
  });

  revalidate(workspaceId);
  return ok({ id: vendorId });
}

export async function unlinkVendorRisk(input: z.infer<typeof riskLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = riskLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, vendorId, riskId } = parsed.data;
  if (!(await findOwnedVendor(workspaceId, vendorId))) return notFound();

  await prisma.vendorRisk.deleteMany({ where: { vendorId, riskId } });

  revalidate(workspaceId);
  return ok({ id: vendorId });
}
