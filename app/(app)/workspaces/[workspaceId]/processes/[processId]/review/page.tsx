import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getProcessStepperCounts } from "@/lib/data/process-stepper-data";
import { getActiveReviewFindings } from "@/lib/data/review-findings-data";
import { ReviewPanel } from "./review-panel";
import { ProcessStepper } from "../process-stepper";

export default async function ProcessReviewPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/review">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: { workspace: { select: { industry: true } } },
  });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [stepperCounts, initialFindings, steps] = await Promise.all([
    getProcessStepperCounts(processId),
    getActiveReviewFindings(processId),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 text-xs text-slate-500">
        {process.code} · {process.name}
      </div>
      <h1 className="text-xl font-semibold text-slate-900">AI Review</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Reviews this process end to end — Process Map, RACI matrix, and Authority Matrix — against how this
        workflow is typically run in your industry — and highlights gaps and risks you can act on.
      </p>

      <ProcessStepper workspaceId={workspaceId} processId={processId} {...stepperCounts} />

      <ReviewPanel
        workspaceId={workspaceId}
        processId={processId}
        workspaceIndustry={process.workspace.industry}
        initialFindings={initialFindings}
        steps={steps}
      />
    </main>
  );
}
