import {
  buildPrintMapLayout,
  type PrintConnectionInput,
  type PrintStepInput,
} from "@/lib/domain/print-map-layout";
import { FlowLayout } from "./flow-layout";
import { RolesLayout } from "./roles-layout";

export type PrintedMapStep = {
  id: string;
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  assignedRole: { id: string; name: string } | null;
  links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
};

export type PrintedMapConnection = {
  id: string;
  fromStepId: string;
  toStepId: string;
  label: string | null;
};

function kindOf(type: PrintedMapStep["type"]): PrintStepInput["kind"] {
  if (type === "DECISION") return "decision";
  if (type === "START") return "start";
  if (type === "END") return "end";
  return "task";
}

/**
 * The process map as it prints in the Export Report.
 *
 * Plain HTML, rendered on the server, with no canvas and no client JavaScript.
 * That is the whole rebuild: the previous version drew the map with ReactFlow —
 * absolutely-positioned fixed-size nodes under a scale transform, inside a
 * fixed-height box — which is why every one of its eighteen cards had its label
 * overflowing, why one was clipped by that box, and why the type came out
 * around five points. Text that wraps and boxes that grow to fit their contents
 * give all of that back without a single measurement.
 *
 * It is also what lets a page break fall between two steps rather than through
 * a card, and what finally brings the map under the report's own Spacing
 * control, since everything here is set in rem like the rest of the document.
 */
export function PrintedProcessMap({
  steps,
  connections,
  layout,
}: {
  steps: PrintedMapStep[];
  connections: PrintedMapConnection[];
  layout: "FLOW" | "ROLES";
}) {
  if (steps.length === 0) {
    return (
      <p className="print-keep rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
        No steps on this process yet.
      </p>
    );
  }

  // The Steps List order, which is what the report prints by — never the stored
  // canvas position, which disagrees the moment anyone drags a card.
  const layoutSteps: PrintStepInput[] = steps.map((step, index) => ({
    id: step.id,
    order: index + 1,
    label: step.label,
    roleName: step.assignedRole?.name ?? null,
    kind: kindOf(step.type),
  }));

  const layoutConnections: PrintConnectionInput[] = connections.map(
    (c): PrintConnectionInput => ({
      id: c.id,
      fromStepId: c.fromStepId,
      toStepId: c.toStepId,
      label: c.label,
    })
  );

  const outcome = buildPrintMapLayout({
    steps: layoutSteps,
    connections: layoutConnections,
    requested: layout,
  });

  const linksByStepId = new Map(steps.map((s) => [s.id, s.links]));

  return (
    <div className="printed-map">
      {outcome.layout === "FLOW" && outcome.fellBackFrom && (
        <p className="printed-map__fallback print-keep">
          <strong>Printed in the Flow layout.</strong> {outcome.reason}
        </p>
      )}
      {outcome.layout === "FLOW" ? (
        <FlowLayout outline={outcome.flow} linksByStepId={linksByStepId} />
      ) : (
        <RolesLayout grid={outcome.roles} linksByStepId={linksByStepId} />
      )}
    </div>
  );
}
