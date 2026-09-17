/**
 * Builds a process long enough that its map has to wrap, for looking at and
 * for the end-to-end tests.
 *
 * Every seeded process is short — nine steps at most — so nothing in the
 * fixtures exercises the wrap at all. This makes one that exercises all of it
 * at once: more steps than fit a row, three roles plus a roleless step so the
 * per-row lanes have something to do, and a decision that branches and rejoins
 * across what will become a row boundary.
 *
 *   pnpm exec tsx ./scripts/make-long-process.ts
 *   pnpm exec tsx ./scripts/make-long-process.ts --clean
 */
import { prisma } from "@/lib/db/client";
import { FIRST_STEP_X, STEP_X_SPACING } from "@/lib/domain/process-layout";

const WORKSPACE_ID = "workspace-acme";
const PROCESS_ID = "long-process-fixture";
const CODE = "TES100";

const STEPS: { label: string; role: "ap" | "fin" | "pro" | null; decision?: true }[] = [
  { label: "RFQ received", role: "ap" },
  { label: "Evaluate the opportunity", role: "pro", decision: true },
  { label: "Route to sector owner", role: "pro" },
  { label: "Site visit & technical clarification", role: "pro" },
  { label: "Cross-functional alignment", role: "fin" },
  { label: "Costing proposal", role: "fin" },
  { label: "CEO scenario review", role: "fin", decision: true },
  { label: "Board meeting", role: null },
  { label: "Internal final review", role: "fin" },
  { label: "Client negotiation", role: "pro" },
  { label: "Contract drafting", role: "ap" },
  { label: "Legal review", role: null },
  { label: "Signature", role: "ap" },
  { label: "Handover to delivery", role: "pro" },
  { label: "Mobilisation", role: "pro" },
  { label: "Kick-off", role: "pro" },
  { label: "Execution", role: "fin" },
  { label: "Progress reporting", role: "fin" },
  { label: "Change control", role: "fin", decision: true },
  { label: "Acceptance", role: "ap" },
  { label: "Final invoice", role: "ap" },
  { label: "Close-out", role: "ap" },
];

async function clean() {
  await prisma.stepConnection.deleteMany({ where: { processId: PROCESS_ID } });
  await prisma.processStep.deleteMany({ where: { processId: PROCESS_ID } });
  await prisma.process.deleteMany({ where: { id: PROCESS_ID } });
}

async function main() {
  await clean();
  if (process.argv.includes("--clean")) {
    console.log("long-process fixture removed");
    return;
  }

  const roles = await prisma.role.findMany({ where: { workspaceId: WORKSPACE_ID } });
  const byName = (needle: string) => roles.find((r) => r.name.toLowerCase().includes(needle))?.id ?? null;
  const roleIds = { ap: byName("ap clerk"), fin: byName("finance"), pro: byName("procurement") };

  await prisma.process.create({
    data: {
      id: PROCESS_ID,
      workspaceId: WORKSPACE_ID,
      code: CODE,
      name: "End to end high-level",
      description: "A process long enough that its map has to wrap onto several rows.",
      processPurpose: "Exercises the wrapped process map: more steps than fit a row, several lanes, and a branch that crosses a row boundary.",
    },
  });

  await prisma.processStep.createMany({
    data: STEPS.map((s, i) => ({
      id: `${PROCESS_ID}-step-${i + 1}`,
      processId: PROCESS_ID,
      type: i === 0 ? "START" : i === STEPS.length - 1 ? "END" : s.decision ? "DECISION" : "TASK",
      label: s.label,
      order: i + 1,
      // Laid out as the interactive map would lay them out, because the wrap
      // reads this order rather than re-deriving one.
      positionX: FIRST_STEP_X + i * STEP_X_SPACING,
      positionY: 0,
      assignedRoleId: s.role ? roleIds[s.role] : null,
      milestone: i % 2 === 0,
    })),
  });

  // A straight chain, plus one branch that skips ahead and rejoins — so at
  // least one connection lands on a different row from its source.
  await prisma.stepConnection.createMany({
    data: [
      ...STEPS.slice(0, -1).map((_, i) => ({
        id: `${PROCESS_ID}-conn-${i + 1}`,
        processId: PROCESS_ID,
        fromStepId: `${PROCESS_ID}-step-${i + 1}`,
        toStepId: `${PROCESS_ID}-step-${i + 2}`,
        label: null as string | null,
      })),
      {
        id: `${PROCESS_ID}-conn-branch`,
        processId: PROCESS_ID,
        fromStepId: `${PROCESS_ID}-step-7`,
        toStepId: `${PROCESS_ID}-step-14`,
        label: "Escalate",
      },
    ],
  });

  console.log(`${CODE} created: ${STEPS.length} steps, ${STEPS.length} connections`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
