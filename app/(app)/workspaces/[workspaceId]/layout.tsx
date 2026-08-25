import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { HeaderLogoPortal } from "./header-logo-portal";

const DEFAULT_ACCENT = "#334155"; // slate-700 — a workspace with no logo/accent set yet

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
    <div
      className="flex flex-1"
      style={{ "--accent": workspace.accentColor ?? DEFAULT_ACCENT } as React.CSSProperties}
    >
      <HeaderLogoPortal logoDataUrl={workspace.logoDataUrl} workspaceName={workspace.name} />
      <WorkspaceSidebar
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        logoDataUrl={workspace.logoDataUrl}
        isFirmOwnerAccess={access.data.accessVia === "OWNER_CARVEOUT"}
      />
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
