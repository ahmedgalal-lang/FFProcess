import type { BackReference, FlowOutline, FlowRow } from "@/lib/domain/print-map-layout";
import type { PrintedMapStep, PrintedMapStepDetail } from "./printed-process-map";

type LinksByStepId = Map<string, PrintedMapStep["links"]>;
type DetailByStepId = Map<string, PrintedMapStepDetail>;

/**
 * The process running straight down the page, one step to a row.
 *
 * The page's long side goes to the label rather than to fitting more steps
 * across, which is why nothing here needs truncating: a card gets most of the
 * printable width, and a label that outgrows one line simply takes two. Because
 * consecutive steps are vertically adjacent, every ordinary connection is a
 * short piece of rail, and a page break between two rows needs no annotation at
 * all — the reader turns the page and carries on down.
 */
export function FlowLayout({
  outline,
  linksByStepId,
  detailByStepId,
}: {
  outline: FlowOutline;
  linksByStepId: LinksByStepId;
  detailByStepId: DetailByStepId;
}) {
  const backByStep = new Map<number, BackReference[]>();
  for (const back of outline.backReferences) {
    const list = backByStep.get(back.fromOrder) ?? [];
    list.push(back);
    backByStep.set(back.fromOrder, list);
  }

  return (
    <ol className="pmap-flow">
      {outline.rows.map((row) => (
        <li
          key={row.step.id}
          className="pmap-flow__row print-keep"
          data-rail={row.rail}
          data-indent={row.indent}
          data-kind={row.step.kind}
        >
          <span className="pmap-flow__rail" aria-hidden="true">
            {row.branchLabel && row.rail === "branch" && (
              <span className="pmap-flow__branch-label">{row.branchLabel}</span>
            )}
          </span>
          <FlowCard
            row={row}
            links={linksByStepId.get(row.step.id) ?? []}
            detail={detailByStepId.get(row.step.id)}
            backReferences={backByStep.get(row.step.order) ?? []}
          />
        </li>
      ))}
    </ol>
  );
}

function FlowCard({
  row,
  links,
  detail,
  backReferences,
}: {
  row: FlowRow;
  links: PrintedMapStep["links"];
  detail: PrintedMapStepDetail | undefined;
  backReferences: BackReference[];
}) {
  return (
    <div className="pmap-card">
      <span className="pmap-card__num">{row.step.order}</span>
      <div className="pmap-card__body">
        <p className="pmap-card__label">{row.step.label}</p>
        <p className="pmap-card__meta">
          {row.branchLabel && row.rail !== "branch" && (
            <span className="pmap-card__branch">{row.branchLabel}</span>
          )}
          <span className="pmap-card__role">
            {row.step.roleName ?? <span className="pmap-card__unowned">No role set</span>}
          </span>
          {detail?.sla && <span className="pmap-card__sla">{detail.sla}</span>}
          {detail?.gate && <span className="pmap-card__gate">{detail.gate}</span>}
          {row.mergesFrom.length > 0 && (
            <span className="pmap-card__merge">
              joins {row.mergesFrom.map((n) => `step ${n}`).join(" and ")}
            </span>
          )}
          {row.endsHere && row.step.kind !== "end" && (
            <span className="pmap-card__ends">ends here</span>
          )}
        </p>
        {links.length > 0 && (
          <p className="pmap-card__links">
            {links.map((link) => (
              <span key={link.id} className="pmap-card__link">
                → {link.targetProcess.code} {link.targetProcess.name}
              </span>
            ))}
          </p>
        )}
        {/* A connection no rail can draw — a loop back, or a jump the layout
            cannot span. It names its destination and carries its own label, so
            a reader is never left matching one marker to another by eye. */}
        {backReferences.map((back) => (
          <p key={back.connectionId} className="pmap-card__backref">
            <span className="pmap-card__backref-arrow" aria-hidden="true">
              {back.direction === "back" ? "↩" : "↪"}
            </span>
            {back.label ? <strong>{back.label}</strong> : null} {back.direction === "back" ? "back to" : "on to"}{" "}
            step {back.toOrder}, {back.toLabel}
          </p>
        ))}
      </div>
      {row.step.kind !== "task" && <span className="pmap-card__kind">{KIND_LABEL[row.step.kind]}</span>}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  start: "Start",
  decision: "Decision",
  end: "End",
  task: "",
};
