import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "ahmed.galal@forefront.consulting" },
    update: {},
    create: {
      email: "ahmed.galal@forefront.consulting",
      name: "Ahmed Galal",
      passwordHash,
    },
  });

  const firm = await prisma.firm.upsert({
    where: { id: "firm-forefront" },
    update: {},
    create: { id: "firm-forefront", name: "Forefront Consulting" },
  });

  await prisma.firmMember.upsert({
    where: { userId: owner.id },
    update: { role: "OWNER" },
    create: { firmId: firm.id, userId: owner.id, role: "OWNER" },
  });

  const editorUser = await prisma.user.upsert({
    where: { email: "sam.osei@acme-example.com" },
    update: {},
    create: { email: "sam.osei@acme-example.com", name: "Sam Osei", passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "workspace-acme" },
    update: {},
    create: { id: "workspace-acme", firmId: firm.id, name: "Acme Industrial", currency: "USD" },
  });

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: owner.id, accessLevel: "ADMIN", status: "ACTIVE" },
  });
  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: editorUser.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: editorUser.id, accessLevel: "EDITOR", status: "ACTIVE" },
  });
  await prisma.member.create({
    data: {
      workspaceId: workspace.id,
      invitedEmail: "priya.nair@acme-example.com",
      accessLevel: "VIEWER",
      status: "PENDING",
    },
  });

  const roleNames = ["AP Clerk", "Finance Manager", "Procurement Lead", "Controller"] as const;
  const roles: Record<string, string> = {};
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { id: `role-${workspace.id}-${name.replace(/\s+/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `role-${workspace.id}-${name.replace(/\s+/g, "-").toLowerCase()}`,
        workspaceId: workspace.id,
        name,
      },
    });
    roles[name] = role.id;
  }

  const people: [string, string, string][] = [
    ["Priya Nair", "priya.nair@acme-example.com", "AP Clerk"],
    ["Sam Osei", "sam.osei@acme-example.com", "Finance Manager"],
    ["Marcus Webb", "marcus.webb@acme-example.com", "Procurement Lead"],
    ["Dana Whitfield", "dana.whitfield@acme-example.com", "Controller"],
  ];
  for (const [name, email, roleName] of people) {
    const person = await prisma.person.upsert({
      where: { id: `person-${workspace.id}-${email}` },
      update: {},
      create: { id: `person-${workspace.id}-${email}`, workspaceId: workspace.id, name, email },
    });
    await prisma.personRole.upsert({
      where: { personId_roleId: { personId: person.id, roleId: roles[roleName] } },
      update: {},
      create: { personId: person.id, roleId: roles[roleName] },
    });
  }

  const program = await prisma.process.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PUR100" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      code: "PUR100",
      name: "Procure-to-Pay Program",
      description: "Umbrella program grouping procurement sub-processes.",
    },
  });

  const p2p = await prisma.process.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PUR101" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      code: "PUR101",
      name: "Purchase-to-Pay",
      description: "From purchase requisition through vendor payment.",
      parentProcessId: program.id,
    },
  });

  await prisma.process.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PUR102" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      code: "PUR102",
      name: "Vendor Onboarding",
      parentProcessId: program.id,
    },
  });

  await prisma.process.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "SAL101" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      code: "SAL101",
      name: "Sales Order Fulfillment",
    },
  });

  const stepDefs: {
    key: string;
    type: "START" | "TASK" | "DECISION" | "END";
    label: string;
    role?: keyof typeof roles;
    x: number;
    y: number;
  }[] = [
    { key: "start", type: "START", label: "Start", x: 190, y: 105 },
    { key: "createPO", type: "TASK", label: "Create Purchase Order", role: "AP Clerk", x: 320, y: 105 },
    { key: "decision", type: "DECISION", label: "Approve PO?", role: "Finance Manager", x: 450, y: 235 },
    { key: "revisePO", type: "TASK", label: "Revise Purchase Order", role: "AP Clerk", x: 450, y: 105 },
    { key: "sendVendor", type: "TASK", label: "Send PO to Vendor", role: "AP Clerk", x: 580, y: 105 },
    { key: "receiveGoods", type: "TASK", label: "Receive Goods", role: "Procurement Lead", x: 710, y: 365 },
    {
      key: "matchApprove",
      type: "TASK",
      label: "Match Invoice & Approve Payment",
      role: "Finance Manager",
      x: 845,
      y: 235,
    },
    { key: "payVendor", type: "TASK", label: "Pay Vendor", role: "AP Clerk", x: 975, y: 105 },
    { key: "end", type: "END", label: "End", role: "AP Clerk", x: 1105, y: 105 },
  ];

  const stepIds: Record<string, string> = {};
  for (const s of stepDefs) {
    const id = `step-${p2p.id}-${s.key}`;
    await prisma.processStep.upsert({
      where: { id },
      update: {},
      create: {
        id,
        processId: p2p.id,
        type: s.type,
        label: s.label,
        assignedRoleId: s.role ? roles[s.role] : undefined,
        swimlaneRoleId: s.role ? roles[s.role] : undefined,
        positionX: s.x,
        positionY: s.y,
      },
    });
    stepIds[s.key] = id;
  }

  const connections: [string, string, string | null][] = [
    ["start", "createPO", null],
    ["createPO", "decision", null],
    ["decision", "revisePO", "No"],
    ["revisePO", "createPO", null],
    ["decision", "sendVendor", "Yes"],
    ["sendVendor", "receiveGoods", null],
    ["receiveGoods", "matchApprove", null],
    ["matchApprove", "payVendor", null],
    ["payVendor", "end", null],
  ];
  for (const [from, to, label] of connections) {
    const id = `conn-${p2p.id}-${from}-${to}`;
    await prisma.stepConnection.upsert({
      where: { id },
      update: {},
      create: { id, processId: p2p.id, fromStepId: stepIds[from], toStepId: stepIds[to], label: label ?? undefined },
    });
  }

  const vendorOnboarding = await prisma.process.findUniqueOrThrow({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PUR102" } },
  });
  const salesFulfillment = await prisma.process.findUniqueOrThrow({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "SAL101" } },
  });
  for (const targetProcessId of [vendorOnboarding.id, salesFulfillment.id]) {
    await prisma.processStepLink.upsert({
      where: { stepId_targetProcessId: { stepId: stepIds.sendVendor, targetProcessId } },
      update: {},
      create: { stepId: stepIds.sendVendor, targetProcessId },
    });
  }

  const activityDefs: { key: string; name: string; step: string; codes: Partial<Record<string, "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED">> }[] = [
    {
      key: "createPO",
      name: "Create Purchase Order",
      step: "createPO",
      codes: { "AP Clerk": "RESPONSIBLE", "Finance Manager": "ACCOUNTABLE", "Procurement Lead": "CONSULTED" },
    },
    {
      key: "approvePO",
      name: "Approve Purchase Order",
      step: "decision",
      codes: { "Finance Manager": "ACCOUNTABLE", "AP Clerk": "INFORMED", "Procurement Lead": "CONSULTED" },
    },
    {
      key: "receiveGoods",
      name: "Receive Goods",
      step: "receiveGoods",
      // Intentionally missing an Accountable, to demonstrate FR-006 validation.
      codes: { "Procurement Lead": "RESPONSIBLE", "AP Clerk": "INFORMED" },
    },
    {
      key: "matchInvoice",
      name: "Match Invoice to PO",
      step: "matchApprove",
      codes: { "AP Clerk": "RESPONSIBLE", "Finance Manager": "ACCOUNTABLE", Controller: "CONSULTED" },
    },
    {
      key: "approvePayment",
      name: "Approve Payment",
      step: "matchApprove",
      codes: { Controller: "RESPONSIBLE", "Finance Manager": "ACCOUNTABLE", "AP Clerk": "INFORMED" },
    },
    {
      key: "payVendor",
      name: "Pay Vendor",
      step: "payVendor",
      codes: { "AP Clerk": "RESPONSIBLE", "Finance Manager": "ACCOUNTABLE", Controller: "INFORMED" },
    },
  ];

  let order = 0;
  for (const a of activityDefs) {
    const id = `activity-${p2p.id}-${a.key}`;
    await prisma.activity.upsert({
      where: { id },
      update: {},
      create: { id, processId: p2p.id, name: a.name, relatedStepId: stepIds[a.step], order: order++ },
    });
    for (const [roleName, code] of Object.entries(a.codes)) {
      await prisma.raciAssignment.upsert({
        where: { activityId_roleId: { activityId: id, roleId: roles[roleName] } },
        update: { code: code! },
        create: { activityId: id, roleId: roles[roleName], code: code! },
      });
    }
  }

  await prisma.raciMatrixStatus.upsert({
    where: { processId: p2p.id },
    update: {},
    create: { processId: p2p.id, status: "DRAFT" },
  });

  // Authority Matrix — per-task rows on PUR101, same tasks as the RACI table above.
  // Mixes every state the table can show: skipped, money-based, days-based, an
  // untouched empty row (sendVendor), and a deliberately incomplete co-approval
  // (approvePayment) to demonstrate validateAuthorityTable's MISSING_CO_APPROVER.
  const authorityByStep: Record<
    string,
    { skipped?: boolean }
  > = {
    start: { skipped: true },
    end: { skipped: true },
  };
  for (const [key, data] of Object.entries(authorityByStep)) {
    await prisma.authorityAssignment.upsert({
      where: { stepId: stepIds[key] },
      update: {},
      create: { processId: p2p.id, stepId: stepIds[key], skipped: data.skipped ?? false },
    });
  }
  // revisePO has no linked Activity, so it's a step-scoped row (days-based).
  await prisma.authorityAssignment.upsert({
    where: { stepId: stepIds.revisePO },
    update: {},
    create: {
      processId: p2p.id,
      stepId: stepIds.revisePO,
      unit: "DAYS",
      threshold: 3,
      approverRoleId: roles["AP Clerk"],
    },
  });

  const authorityByActivity: Record<
    string,
    {
      skipped?: boolean;
      threshold?: number;
      approverRoleId?: string;
      coApprovalAboveThreshold?: number;
      coApproverRoleId?: string;
    }
  > = {
    createPO: { threshold: 10000, approverRoleId: roles["AP Clerk"] },
    approvePO: {
      threshold: 100000,
      approverRoleId: roles["Finance Manager"],
      coApprovalAboveThreshold: 50000,
      coApproverRoleId: roles.Controller,
    },
    receiveGoods: { skipped: true },
    matchInvoice: { threshold: 20000, approverRoleId: roles["Finance Manager"] },
    // Deliberately incomplete: a co-approval threshold with no co-approver assigned yet.
    approvePayment: { threshold: 100000, approverRoleId: roles.Controller, coApprovalAboveThreshold: 50000 },
    payVendor: { threshold: 100000, approverRoleId: roles["Finance Manager"] },
  };
  for (const [key, data] of Object.entries(authorityByActivity)) {
    const activityId = `activity-${p2p.id}-${key}`;
    await prisma.authorityAssignment.upsert({
      where: { activityId },
      update: {},
      create: {
        processId: p2p.id,
        activityId,
        skipped: data.skipped ?? false,
        threshold: data.threshold,
        approverRoleId: data.approverRoleId,
        coApprovalAboveThreshold: data.coApprovalAboveThreshold,
        coApproverRoleId: data.coApproverRoleId,
      },
    });
  }

  console.log("Seed complete.");
  console.log("Sign in as ahmed.galal@forefront.consulting / password123 (Firm Owner)");
  console.log("or sam.osei@acme-example.com / password123 (Editor on Acme Industrial)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
