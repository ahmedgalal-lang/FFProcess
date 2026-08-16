import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { ReviewPanel } from "./review-panel";

export default async function ProcessReviewPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/review">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 text-xs text-slate-500">
        {process.code} · {process.name}
      </div>
      <h1 className="text-xl font-semibold text-slate-900">AI Review</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500">
        Reviews this process end to end — Process Map, RACI matrix, and Authority Matrix — and highlights gaps and
        risks.
      </p>

      <ReviewPanel workspaceId={workspaceId} processId={processId} />
    </main>
  );
}
