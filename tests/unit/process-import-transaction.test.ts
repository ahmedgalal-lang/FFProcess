import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildProcessImportTemplate } from "@/lib/export/process-import-template";

/**
 * An import either completes entirely or leaves nothing behind. A half-built
 * process is worse than a refused file — somebody has to unpick it by hand —
 * so there is no partial success even where one would be possible.
 *
 * Prisma gives that guarantee for free *provided every write goes through the
 * transaction handle*. The way it breaks in practice is not a missing
 * `$transaction` call, which is obvious, but one write quietly left on the
 * top-level client during a later edit — which still works, still passes an
 * end-to-end test, and silently stops being atomic. That is what these assert.
 */
const clientWrites: string[] = [];
const txWrites: string[] = [];
let transactionCalls = 0;
let failOn: string | null = null;

/** Records what was written and through which handle. */
function recorder(into: string[]) {
  const model = (name: string) => ({
    create: vi.fn(async () => {
      into.push(`${name}.create`);
      if (failOn === name) throw new Error("forced mid-write failure");
      return { id: `${name}-1`, code: "TES100" };
    }),
    upsert: vi.fn(async () => {
      into.push(`${name}.upsert`);
      return { id: `${name}-1` };
    }),
    update: vi.fn(async () => {
      into.push(`${name}.update`);
      return { id: `${name}-1` };
    }),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    count: vi.fn(async () => 0),
  });
  return {
    role: model("role"),
    person: model("person"),
    process: model("process"),
    processStep: model("processStep"),
    stepConnection: model("stepConnection"),
    activity: model("activity"),
    raciAssignment: model("raciAssignment"),
    authorityAssignment: model("authorityAssignment"),
    authorityRule: model("authorityRule"),
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "user-1" } })) }));
vi.mock("@/lib/db/client", () => {
  const client = recorder(clientWrites);
  return {
    prisma: {
      ...client,
      firmMember: { findUnique: vi.fn(async () => null) },
      member: { findFirst: vi.fn(async () => ({ accessLevel: "EDITOR", status: "ACTIVE" })) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        transactionCalls += 1;
        return fn(recorder(txWrites));
      }),
    },
  };
});

const { importProcess } = await import("@/lib/actions/process-import");

async function uploadTheTemplate(): Promise<FormData> {
  const buffer = await buildProcessImportTemplate();
  const form = new FormData();
  form.set("workspaceId", "workspace-acme");
  form.set("dryRun", "false");
  form.set("file", new File([new Uint8Array(buffer)], "template.xlsx"));
  return form;
}

beforeEach(() => {
  clientWrites.length = 0;
  txWrites.length = 0;
  transactionCalls = 0;
  failOn = null;
});

describe("the write is one transaction", () => {
  it("runs the whole import inside a single transaction", async () => {
    const result = await importProcess(await uploadTheTemplate());
    expect(result.ok).toBe(true);
    expect(transactionCalls).toBe(1);
  });

  it("makes every write through the transaction, none on the bare client", async () => {
    await importProcess(await uploadTheTemplate());

    // The whole process really is built — this is not passing by writing nothing.
    expect(txWrites).toContain("process.create");
    expect(txWrites).toContain("processStep.create");
    expect(txWrites).toContain("stepConnection.create");
    expect(txWrites).toContain("activity.create");
    expect(txWrites).toContain("raciAssignment.upsert");
    expect(txWrites).toContain("authorityAssignment.create");
    expect(txWrites).toContain("authorityRule.create");
    expect(txWrites).toContain("role.create");

    // ...and not one write escaped it.
    expect(clientWrites, "a write escaped the transaction").toEqual([]);
  });

  it("carries a failure part way through back out, so the transaction rolls back", async () => {
    // Steps are written, then connections. Failing on a connection means the
    // steps are already written when it goes wrong — the exact shape of a
    // half-built process, which only the rollback prevents.
    failOn = "stepConnection";
    await expect(importProcess(await uploadTheTemplate())).rejects.toThrow(/forced mid-write failure/);

    // The error is not swallowed into a "partly imported" result, which is
    // what would leave the rollback un-triggered.
    expect(txWrites).toContain("processStep.create");
    expect(clientWrites).toEqual([]);
  });

  it("creates the RACI activity the same way a hand-built process grows one", async () => {
    await importProcess(await uploadTheTemplate());
    // One Activity per step carrying a letter, not one per step — the lazy
    // creation setStepRaciCell does, which is what makes an imported process
    // indistinguishable from a hand-built one.
    const activities = txWrites.filter((w) => w === "activity.create").length;
    const steps = txWrites.filter((w) => w === "processStep.create").length;
    expect(activities).toBeGreaterThan(0);
    expect(activities).toBeLessThanOrEqual(steps);
  });
});
