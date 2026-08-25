import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { AddPersonForm, AddRoleForm, PersonRow, RoleRow } from "./org-forms";

export default async function OrgDirectoryPage(props: PageProps<"/workspaces/[workspaceId]/org">) {
  const { workspaceId } = await props.params;

  const [roles, people] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.person.findMany({
      where: { workspaceId, archivedAt: null },
      include: { personRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const personOptions = people.map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Org Directory</h1>
        <Link
          href={`/workspaces/${workspaceId}/org/chart`}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Org Chart →
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Roles and people are shared across every process map, RACI matrix, and authority matrix in
        this workspace.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Roles</h2>
        <div className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <RoleRow key={role.id} workspaceId={workspaceId} role={{ id: role.id, name: role.name }} />
              ))}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                    No roles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <AddRoleForm workspaceId={workspaceId} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">People</h2>
        <div className="max-h-96 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2">Reports to</th>
                <th className="px-4 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <PersonRow
                  key={person.id}
                  workspaceId={workspaceId}
                  person={{
                    id: person.id,
                    name: person.name,
                    email: person.email,
                    managerId: person.managerId,
                    roleIds: person.personRoles.map((pr) => pr.roleId),
                  }}
                  allRoles={roles.map((r) => ({ id: r.id, name: r.name }))}
                  people={personOptions}
                />
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                    No people yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <AddPersonForm
            workspaceId={workspaceId}
            roles={roles.map((r) => ({ id: r.id, name: r.name }))}
            people={personOptions}
          />
        </div>
      </section>
    </main>
  );
}
