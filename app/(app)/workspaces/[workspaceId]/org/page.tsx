import { prisma } from "@/lib/db/client";
import { AddPersonForm, AddRoleForm, ArchivePersonButton, ArchiveRoleButton } from "./org-forms";

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

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Org Directory</h1>
      <p className="mt-1 text-sm text-slate-500">
        Roles and people are shared across every process map, RACI matrix, and authority matrix in
        this workspace.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Roles</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{role.name}</td>
                  <td className="px-4 py-2 text-right">
                    <ArchiveRoleButton workspaceId={workspaceId} roleId={role.id} />
                  </td>
                </tr>
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{person.name}</td>
                  <td className="px-4 py-2 text-slate-500">{person.email ?? "—"}</td>
                  <td className="px-4 py-2">
                    {person.personRoles.map((pr) => (
                      <span
                        key={pr.roleId}
                        className="mr-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {pr.role.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <ArchivePersonButton workspaceId={workspaceId} personId={person.id} />
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                    No people yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <AddPersonForm workspaceId={workspaceId} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
        </div>
      </section>
    </main>
  );
}
