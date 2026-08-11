import { prisma } from "@/lib/db/client";
import { validateApprovalRules } from "@/lib/domain/authority-resolution";
import { CreateDecisionTypeForm, CreateRuleForm, QueryTool } from "./authority-client";

export default async function AuthorityMatrixPage(
  props: PageProps<"/workspaces/[workspaceId]/authority">
) {
  const { workspaceId } = await props.params;

  const [decisionTypes, roles] = await Promise.all([
    prisma.decisionType.findMany({
      where: { workspaceId },
      include: { rules: { include: { approverRole: true, approverPerson: true, coApproverRole: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Authority Matrix</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500">
        Who can approve what, up to what value, with required escalation.
      </p>

      {decisionTypes.map((dt) => {
        const rules = dt.rules.map((r) => ({
          id: r.id,
          approverLabel: r.approverRole?.name ?? r.approverPerson?.name ?? "Unknown",
          maxThreshold: Number(r.maxThreshold),
          coApprovalAboveThreshold: r.coApprovalAboveThreshold ? Number(r.coApprovalAboveThreshold) : null,
          coApproverLabel: r.coApproverRole?.name ?? null,
        }));
        const conflicts = validateApprovalRules(rules);
        const sortedRules = [...rules].sort((a, b) => a.maxThreshold - b.maxThreshold);
        const highestThreshold = sortedRules.at(-1)?.maxThreshold ?? 0;

        return (
          <section key={dt.id} className="mb-8">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-800">{dt.name}</h2>
              <div className="flex gap-2">
                <a
                  href={`/api/export/authority/${dt.id}?format=pdf`}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export PDF
                </a>
                <a
                  href={`/api/export/authority/${dt.id}?format=xlsx`}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export Excel
                </a>
              </div>
            </div>
            {conflicts.length > 0 && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {conflicts.length} conflicting rule pair(s) detected — thresholds are ambiguous.
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.3fr_1fr]">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {sortedRules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{r.approverLabel}</div>
                      {r.coApproverLabel && (
                        <div className="text-xs text-slate-500">
                          Co-approval from {r.coApproverLabel} above ${r.coApprovalAboveThreshold?.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-sm font-semibold text-slate-700">
                      up to ${r.maxThreshold.toLocaleString()}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-red-50 px-4 py-3">
                  <span className="text-sm font-semibold text-red-700">No rule defined</span>
                  <span className="font-mono text-xs text-red-700">&gt; ${highestThreshold.toLocaleString()}</span>
                </div>
              </div>
              <QueryTool workspaceId={workspaceId} decisionTypeId={dt.id} />
            </div>
            <div className="mt-3">
              <CreateRuleForm workspaceId={workspaceId} decisionTypeId={dt.id} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
            </div>
          </section>
        );
      })}

      {decisionTypes.length === 0 && (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No decision types yet.
        </p>
      )}

      <CreateDecisionTypeForm workspaceId={workspaceId} />
    </main>
  );
}
