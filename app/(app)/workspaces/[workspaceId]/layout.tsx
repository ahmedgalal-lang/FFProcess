import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { HeaderLogoPortal } from "./header-logo-portal";

const DEFAULT_ACCENT = "#334155"; // slate-700 — a workspace with no logo/accent set yet
const DEFAULT_ACCENT_SECONDARY = "#4338ca"; // indigo-700 — matches this app's existing accent look
const DEFAULT_ACCENT_TERTIARY = "#4338ca";

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
      style={
        {
          "--accent": workspace.accentColor ?? DEFAULT_ACCENT,
          "--accent-secondary": workspace.accentColorSecondary ?? DEFAULT_ACCENT_SECONDARY,
          "--accent-tertiary": workspace.accentColorTertiary ?? DEFAULT_ACCENT_TERTIARY,
        } as React.CSSProperties
      }
    >
      <HeaderLogoPortal logoDataUrl={workspace.logoDataUrl} workspaceName={workspace.name} />
      <WorkspaceSidebar
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        logoDataUrl={workspace.logoDataUrl}
        isFirmOwnerAccess={access.data.accessVia === "OWNER_CARVEOUT"}
      />
      <div className="relative min-w-0 flex-1">
        {workspace.logoDataUrl && (
          // Sits in the margin next to every page's centered content — every
          // workspace page shares the same "mx-auto max-w-4xl" wrapper, so
          // this gutter exists everywhere. Only wide enough to fit it without
          // touching that content on narrower viewports, so it's hidden below
          // the 2xl breakpoint rather than risk an overlap.
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
          <img
            src={workspace.logoDataUrl}
            alt=""
            className="pointer-events-none absolute left-8 top-8 hidden h-28 w-28 object-contain 2xl:block"
          />
        )}
        {props.children}
      </div>
    </div>
  );
}
