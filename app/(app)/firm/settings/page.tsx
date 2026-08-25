import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireFirmOwner } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";
import { PromoteToOwnerForm, FirmMemberRowActions, LogoUploadForm } from "./firm-settings-client";

export default async function FirmSettingsPage() {
  const access = await requireFirmOwner();
  if (!access.ok) {
    if (access.error === "UNAUTHORIZED") redirect("/login");
    notFound();
  }

  const [firmMembers, allUsers, callerFirmMember] = await Promise.all([
    prisma.firmMember.findMany({ include: { user: true }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId }, include: { firm: true } }),
  ]);

  const ownerCount = firmMembers.filter((m) => m.role === "OWNER").length;
  const firmMemberUserIds = new Set(firmMembers.map((m) => m.userId));
  const eligibleUsers = allUsers.filter((u) => !firmMemberUserIds.has(u.id));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link href="/workspaces" className="mb-3 inline-block text-xs font-medium text-slate-500 hover:text-slate-900">
        ← All workspaces
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Firm Settings</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500">
        Firm Owners can reach every client Workspace without an explicit Member record
        (Constitution Principle V). At least one Firm Owner must always exist.
      </p>

      <LogoUploadForm logoDataUrl={callerFirmMember.firm.logoDataUrl} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2">Person</th>
              <th scope="col" className="px-4 py-2">Role</th>
              <th scope="col" className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {firmMembers.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900">{m.user.name ?? m.user.email}</div>
                  <div className="text-xs text-slate-500">{m.user.email}</div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      m.role === "OWNER"
                        ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                    }
                  >
                    {m.role === "OWNER" ? "★ Firm Owner" : "Firm Member"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <FirmMemberRowActions
                    firmMemberId={m.id}
                    role={m.role}
                    canDemote={m.role !== "OWNER" || ownerCount > 1}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <PromoteToOwnerForm users={eligibleUsers.map((u) => ({ id: u.id, name: u.name, email: u.email }))} />
      </div>
    </main>
  );
}
