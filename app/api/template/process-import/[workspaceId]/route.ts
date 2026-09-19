import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { buildProcessImportTemplate } from "@/lib/export/process-import-template";

/**
 * The blank workbook a consultant fills in offline.
 *
 * Gated at EDITOR, unlike the report exports under /api/export which gate at
 * VIEWER: the download is half of an editor-only capability, and Principle V
 * puts that check on the server rather than on the page that hides the link.
 *
 * The file does not depend on the workspace's contents — every editor gets the
 * same bytes — but the workspace still scopes the permission check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const access = await requireWorkspaceAccess(workspaceId, "EDITOR");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const buffer = await buildProcessImportTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="process-import-template.xlsx"`,
    },
  });
}
