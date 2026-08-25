import Link from "next/link";
import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";

const NAV_ITEMS = [
  { href: "", label: "Dashboard" },
  { href: "/org", label: "Org Directory" },
  { href: "/processes", label: "Processes" },
  { href: "/members", label: "Members" },
  { href: "/export", label: "Export Report" },
];

export default async function WorkspaceLayout(
  props: LayoutProps<"/workspaces/[workspaceId]">
) {
  const { workspaceId } = await props.params;

  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  if (!access.ok) {
    if (access.error === "UNAUTHORIZED") redirect("/login");
    nextNotFound();
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) nextNotFound();

  return (
    <div className="flex flex-1">
      <nav className="w-56 flex-none border-r border-slate-200 bg-white px-3 py-5">
        <div className="mb-4 px-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Workspace
          </div>
          <div className="truncate text-sm font-semibold text-slate-900">{workspace.name}</div>
          {access.data.accessVia === "OWNER_CARVEOUT" && (
            <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              ★ Firm Owner access
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={`/workspaces/${workspaceId}${item.href}`}
                className="block rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-slate-200 pt-3">
          <Link href="/workspaces" className="block rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
            ← All workspaces
          </Link>
        </div>
      </nav>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
