import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { AuthorityPdfDocument } from "@/lib/export/pdf/authority-pdf";
import { buildAuthorityWorkbook } from "@/lib/export/xlsx";
import {
  buildAuthorityTableRows,
  describeAuthorityRule,
  formatMoney,
  validateAuthorityTable,
  DIRECTION_LABELS,
} from "@/lib/domain/authority-table";
import { auth } from "@/lib/auth/config";
import { AUTHORITY_ASSIGNMENT_INCLUDE, toAuthorityAssignmentData } from "@/lib/data/authority-assignments";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const access = await requireWorkspaceAccess(process.workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const [workspace, roles, people, activities, steps, assignments, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: process.workspaceId } }),
    prisma.role.findMany({ where: { workspaceId: process.workspaceId } }),
    prisma.person.findMany({ where: { workspaceId: process.workspaceId } }),
    prisma.activity.findMany({ where: { processId }, orderBy: { order: "asc" } }),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.authorityAssignment.findMany({ where: { processId }, include: AUTHORITY_ASSIGNMENT_INCLUDE }),
    auth(),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const rows = buildAuthorityTableRows(
    steps,
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    assignments.map(toAuthorityAssignmentData)
  ).filter((r) => !r.skipped);

  const issueCount = validateAuthorityTable(rows).length;
  const generatedFor = session?.user?.email ?? "Unknown";

  function whoNameFor(rule: { whoRoleId: string | null; whoPersonId: string | null }): string | null {
    if (rule.whoRoleId) return roleNameById.get(rule.whoRoleId) ?? null;
    if (rule.whoPersonId) return personNameById.get(rule.whoPersonId) ?? null;
    return null;
  }

  // One line per rule, in the task's own order — the same thing the matrix
  // shows. A task with no rules still gets a line, so nothing silently drops
  // out of the download.
  const rowsForExport = rows.flatMap((r) =>
    r.rules.length === 0
      ? [
          {
            id: r.id,
            label: r.label,
            turnsOn: "—",
            value: "—",
            directionLabel: "—",
            thenLabel: "—",
            whoLabel: "—",
            sentence: "No authority rules.",
          },
        ]
      : r.rules.map((rule, i) => ({
          id: `${r.id}-${rule.id}`,
          // The task is named once and left blank on its later rules, so the
          // list reads as one task with several rules rather than repeats.
          label: i === 0 ? r.label : "",
          turnsOn: rule.measure === "MONEY" ? "Money" : rule.measure === "TIME" ? "Time" : "None",
          value:
            rule.measure === "MONEY"
              ? rule.amount === null
                ? "—"
                : formatMoney(rule.amount)
              : rule.measure === "TIME"
                ? rule.days === null
                  ? "—"
                  : `${rule.days} day${rule.days === 1 ? "" : "s"}`
                : "—",
          directionLabel:
            rule.direction === "EQUAL_NO_APPROVAL" ? "No rule at all" : DIRECTION_LABELS[rule.direction].label,
          thenLabel:
            rule.measure === "NONE" ? "—" : rule.consequence === "APPROVAL" ? "Needs approval" : "Escalates",
          whoLabel: whoNameFor(rule) ?? "—",
          sentence: describeAuthorityRule(rule, whoNameFor(rule)),
        }))
  );

  const filenameBase = `${process.code}-authority-matrix`;

  if (format === "xlsx") {
    const buffer = await buildAuthorityWorkbook({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      rows: rowsForExport,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  const buffer = await renderToBuffer(
    AuthorityPdfDocument({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      rows: rowsForExport,
      issueCount,
      generatedFor,
    })
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
    },
  });
}
