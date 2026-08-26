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
          // this gutter exists everywhere, but its width grows with the
          // viewport (sidebar width is fixed, content tops out at 896px).
          // Small and close-in at xl (1280px, common laptop width — the
          // gutter there is only ~80px) so it never touches that content,
          // then grows once there's more room to spare at 2xl (1536px+).
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
          <img
            src={workspace.logoDataUrl}
            alt=""
            className="pointer-events-none absolute left-4 top-8 hidden h-12 w-12 object-contain xl:block 2xl:left-8 2xl:h-28 2xl:w-28"
          />
        )}
        {props.children}
      </div>
    </div>
  );
}
