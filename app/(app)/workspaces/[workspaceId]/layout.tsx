import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db/client";
import { hasSufficientAccess } from "@/lib/domain/access-control";
import { mixHex, readableInkOn } from "@/lib/domain/color-contrast";
import { WorkspaceAccessProvider } from "./workspace-access";
import { WorkspaceSidebar } from "./workspace-sidebar";

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

  // Resolved once here, for every control on every page below. The server
  // actions enforce this independently — this is what stops the interface
  // offering a Viewer edits it will then refuse.
  const canEdit = hasSufficientAccess(access.data.accessLevel, "EDITOR");
  // Membership is Admin-gated, not Editor-gated (see lib/actions/membership.ts),
  // so it gets its own answer rather than riding on canEdit.
  const canManageMembers = hasSufficientAccess(access.data.accessLevel, "ADMIN");

  const primary = workspace.accentColor ?? DEFAULT_ACCENT;
  const tertiary = workspace.accentColorTertiary ?? DEFAULT_ACCENT_TERTIARY;

  return (
    <div
      className="flex flex-1"
      style={
        {
          "--accent": primary,
          "--accent-secondary": workspace.accentColorSecondary ?? DEFAULT_ACCENT_SECONDARY,
          "--accent-tertiary": tertiary,
          // The page header paints itself in the client's Primary, so its text
          // colour is derived from that rather than assumed white — a pale
          // logo would otherwise give white-on-yellow. Computed here so every
          // page can just use the variable.
          "--accent-ink": readableInkOn(primary),
          "--accent-banner-to": mixHex(primary, tertiary, 0.3),
        } as React.CSSProperties
      }
    >
      <WorkspaceSidebar
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        logoDataUrl={workspace.logoDataUrl}
        isFirmOwnerAccess={access.data.accessVia === "OWNER_CARVEOUT"}
        canEdit={canEdit}
      />
      <div className="relative min-w-0 flex-1">
        {workspace.logoDataUrl && (
          // Sits in the margin beside every page's centered content — every
          // workspace page shares the same "mx-auto max-w-4xl" wrapper (896px),
          // so this gutter exists everywhere. Its width is whatever is left
          // over, so the logo is sized to the gutter rather than to a fixed
          // number: it grows to 240px on a wide screen and shrinks to fit on a
          // narrow one, and can never reach the content it sits next to.
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
          <img
            src={workspace.logoDataUrl}
            alt=""
            className="pointer-events-none absolute left-5 top-8 hidden h-auto w-[min(240px,calc((100%-896px)/2-28px))] object-contain xl:block"
          />
        )}
        <WorkspaceAccessProvider value={{ accessLevel: access.data.accessLevel, canEdit, canManageMembers }}>
          {props.children}
        </WorkspaceAccessProvider>
      </div>
    </div>
  );
}
