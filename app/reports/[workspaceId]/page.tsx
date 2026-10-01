import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { loadReportData } from "@/lib/reports/load-report-data";
import { prisma } from "@/lib/db/client";
import { resolveArrangement } from "@/lib/domain/report-arrangement";
import { ExportPreview } from "./export-preview";
import { isLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { localizeReportData } from "@/lib/reports/localize-report-data";

/**
 * The Export Report lives outside the (app) route group on purpose: it renders
 * with no workspace sidebar and no app header, so what's on screen is exactly
 * what prints. That means it can't inherit (app)'s auth, so it runs its own
 * requireWorkspaceAccess check here.
 */
export default async function ReportPage(props: PageProps<"/reports/[workspaceId]">) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const idsRaw = searchParams["ids"];
  const processIds = (Array.isArray(idsRaw) ? idsRaw : idsRaw ? [idsRaw] : []).filter(Boolean);
  // The report's own language (spec 032), chosen on the export picker; the
  // interface language when the link doesn't say.
  const langRaw = searchParams["lang"];
  const locale = isLocale(langRaw) ? langRaw : await getLocale();

  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  if (!access.ok) {
    if (access.error === "UNAUTHORIZED") redirect("/login");
    nextNotFound();
  }

  const data = await loadReportData(workspaceId, processIds);
  if (!data) nextNotFound();

  // Read alongside the report data rather than through it: the deck reads the
  // same two values independently, and neither should become a parameter of
  // the other.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { reportArrangement: true, reportMapLayout: true },
  });

  // The layout control changes a client's settings, so only an editor is
  // offered it — the action enforces the same gate server-side, which is what
  // actually protects it (Constitution Principle V).
  const editorAccess = await requireWorkspaceAccess(workspaceId, "EDITOR");

  // Entries in the report's language. Only an editor's request asks the AI for
  // missing translations, since that writes to the workspace and costs money;
  // anyone else gets the saved ones and a notice for the rest.
  const localized = await localizeReportData(data, locale, { allowAi: editorAccess.ok });

  return (
    <ExportPreview
      {...localized.data}
      locale={locale}
      untranslated={localized.untranslated}
      translationFailure={localized.failureKind}
      arrangement={resolveArrangement(workspace?.reportArrangement)}
      mapLayout={workspace?.reportMapLayout ?? "FLOW"}
      canEdit={editorAccess.ok}
    />
  );
}
