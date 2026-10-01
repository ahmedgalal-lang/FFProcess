import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ProcessMapPdfDocument } from "@/lib/export/pdf/process-map-pdf";
import { auth } from "@/lib/auth/config";
import { exportLanguage } from "@/lib/export/export-language";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const access = await requireWorkspaceAccess(process.workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const [workspace, steps, connections, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: process.workspaceId } }),
    prisma.processStep.findMany({
      where: { processId },
      include: { assignedRole: true, links: { include: { targetProcess: true } } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.stepConnection.findMany({ where: { processId } }),
    auth(),
  ]);

  const predecessorOf = new Map(connections.map((c) => [c.toStepId, c.fromStepId]));
  const stepById = new Map(steps.map((s) => [s.id, s]));

  // The file's language and its entries' saved translations (spec 032).
  const lang = await exportLanguage(request, process.workspaceId);
  const tr = await lang.translator([
    process.name,
    ...steps.flatMap((s) => [s.label, s.assignedRole?.name ?? "", ...s.links.map((l) => l.targetProcess.name)]),
  ]);

  const buffer = await renderToBuffer(
    ProcessMapPdfDocument({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: tr(process.name),
      steps: steps.map((s) => {
        const predecessor = stepById.get(predecessorOf.get(s.id) ?? "")?.label;
        return {
          id: s.id,
          type: s.type,
          label: tr(s.label),
          roleName: s.assignedRole ? tr(s.assignedRole.name) : null,
          predecessorLabel: predecessor ? tr(predecessor) : null,
          links: s.links.map((l) => ({ code: l.targetProcess.code, name: tr(l.targetProcess.name) })),
        };
      }),
      generatedFor: session?.user?.email ?? lang.t.files.unknown,
      locale: lang.locale,
      t: lang.t,
      today: lang.today,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${process.code}-process-map.pdf"`,
    },
  });
}
