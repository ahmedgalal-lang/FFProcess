import { prisma } from "@/lib/db/client";
import type { AccessLevel } from "@/lib/domain/access-control";

/**
 * Integration tests run Server Actions against the real dev Postgres database (same
 * pragmatic choice as the Playwright e2e suite — see core-workflows.spec.ts's note) but
 * each test file gets its own throwaway Firm, so nothing here touches the seeded demo
 * data or collides with e2e runs. `auth()` itself is mocked per test file (see
 * server-only-shim.ts / the vi.mock in each test) since Auth.js can't resolve a session
 * outside a real Next.js request.
 */

let counter = 0;
function unique(label: string) {
  counter += 1;
  return `${label}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createFixtureWorkspace() {
  const firm = await prisma.firm.create({ data: { name: unique("firm") } });
  const workspace = await prisma.workspace.create({
    data: { firmId: firm.id, name: unique("workspace") },
  });
  const adminUser = await prisma.user.create({
    data: { email: `${unique("admin")}@test.local`, name: "Fixture Admin" },
  });
  const adminMember = await prisma.member.create({
    data: { workspaceId: workspace.id, userId: adminUser.id, accessLevel: "ADMIN", status: "ACTIVE" },
  });

  const createdUserIds = [adminUser.id];

  async function addMember(accessLevel: AccessLevel, status: "ACTIVE" | "PENDING" = "ACTIVE") {
    const user = await prisma.user.create({ data: { email: `${unique("member")}@test.local` } });
    createdUserIds.push(user.id);
    const member = await prisma.member.create({
      data: { workspaceId: workspace.id, userId: user.id, accessLevel, status },
    });
    return { user, member };
  }

  async function cleanup() {
    await prisma.firm.delete({ where: { id: firm.id } }); // cascades workspace + everything under it
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }

  return { firm, workspace, adminUser, adminMember, addMember, cleanup, unique };
}
