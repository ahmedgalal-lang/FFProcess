import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The server-side gate on the import action.
 *
 * This is a unit test rather than an end-to-end one for a reason worth
 * recording. The obvious e2e version — replay the Server Action as a Viewer —
 * cannot work: an action is only reachable with its real, build-generated id,
 * and even replaying a captured id against a page that does not render the
 * action's own client bundle never executes it. A test written that way passes
 * with the gate removed entirely, which is exactly what the first attempt at
 * this did. Hitting the action directly is the only form that discriminates.
 *
 * Nothing here touches a database: the point is that a Viewer never gets far
 * enough to try.
 */
const transaction = vi.fn();
const findFirstMember = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    firmMember: { findUnique: vi.fn(async () => null) },
    member: { findFirst: (...args: unknown[]) => findFirstMember(...args) },
    role: { findMany: vi.fn(async () => []) },
    person: { findMany: vi.fn(async () => []) },
    process: { findMany: vi.fn(async () => []) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

const { importProcess } = await import("@/lib/actions/process-import");

function upload(dryRun: boolean): FormData {
  const form = new FormData();
  form.set("workspaceId", "workspace-acme");
  form.set("dryRun", String(dryRun));
  form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "t.xlsx"));
  return form;
}

beforeEach(() => {
  transaction.mockReset();
  findFirstMember.mockReset();
});

describe("importing requires edit access, checked on the server", () => {
  it("refuses a viewer, and never reaches the write", async () => {
    findFirstMember.mockResolvedValue({ accessLevel: "VIEWER", status: "ACTIVE" });

    const result = await importProcess(upload(false));

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "FORBIDDEN", required: "EDITOR" });
    expect(transaction, "a viewer reached the write").not.toHaveBeenCalled();
  });

  it("refuses a viewer asking only to preview", async () => {
    // A dry run writes nothing, but it still reads the workspace's roles and
    // people and reports its process names back, so it is gated the same way.
    findFirstMember.mockResolvedValue({ accessLevel: "VIEWER", status: "ACTIVE" });
    const result = await importProcess(upload(true));
    expect(result).toMatchObject({ error: "FORBIDDEN", required: "EDITOR" });
  });

  it("refuses somebody who is not a member of the workspace at all", async () => {
    findFirstMember.mockResolvedValue(null);
    const result = await importProcess(upload(false));
    expect(result).toMatchObject({ error: "UNAUTHORIZED" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("lets an editor through the gate — a gate that refuses everybody is not a gate", async () => {
    findFirstMember.mockResolvedValue({ accessLevel: "EDITOR", status: "ACTIVE" });

    const result = await importProcess(upload(false));

    // It gets past access and fails on the file instead, which is the next
    // thing that should stop it.
    expect(result).toMatchObject({ error: "VALIDATION_ERROR" });
    expect(result.ok === false && "message" in result && result.message).toMatch(/couldn't be read|spreadsheet/i);
  });
});
