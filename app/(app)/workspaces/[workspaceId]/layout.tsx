import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";
import { WorkspaceSidebar } from "./workspace-sidebar";

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
      <WorkspaceSidebar
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        isFirmOwnerAccess={access.data.accessVia === "OWNER_CARVEOUT"}
      />
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
