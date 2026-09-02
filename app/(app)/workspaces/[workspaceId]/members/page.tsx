import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { CreateMemberForm, InviteForm, MemberRowActions } from "./members-client";

export default async function MembersPage(props: PageProps<"/workspaces/[workspaceId]/members">) {
  const { workspaceId } = await props.params;

  const members = await prisma.member.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "PENDING"] } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Members"
        subtitle="Access is scoped to this workspace only — Viewers view/export, Editors edit content, Admins manage membership."
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Access</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900">{m.user?.name ?? m.invitedEmail}</div>
                  <div className="text-xs text-slate-500">{m.user?.email ?? m.invitedEmail}</div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      m.status === "ACTIVE"
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                        : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                    }
                  >
                    {m.status === "ACTIVE" ? "Active" : "Invite pending"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <MemberRowActions workspaceId={workspaceId} memberId={m.id} accessLevel={m.accessLevel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <InviteForm workspaceId={workspaceId} />
        <CreateMemberForm workspaceId={workspaceId} />
      </div>
    </main>
  );
}
