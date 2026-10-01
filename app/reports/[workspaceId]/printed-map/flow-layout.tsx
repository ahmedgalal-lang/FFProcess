import type { BackReference, FlowOutline, FlowRow } from "@/lib/domain/print-map-layout";
import type { PrintedMapStep, PrintedMapStepDetail } from "./printed-process-map";
import { useMessages } from "@/lib/i18n/client";
import type { ReportMessages } from "@/lib/i18n/messages/report.en";

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
  const t = useMessages().report;
  return (
    <div className="pmap-card">
      <span className="pmap-card__num">{row.step.numberLabel}</span>
      <div className="pmap-card__body">
        <p className="pmap-card__label">{row.step.label}</p>
        <p className="pmap-card__meta">
          {row.branchLabel && row.rail !== "branch" && (
            <span className="pmap-card__branch">{row.branchLabel}</span>
          )}
          <span className="pmap-card__role">
            {row.step.roleName ?? <span className="pmap-card__unowned">{t.map.noRole}</span>}
          </span>
          {detail?.sla && <span className="pmap-card__sla">{detail.sla}</span>}
          {detail?.gate && <span className="pmap-card__gate">{detail.gate}</span>}
          {row.mergesFrom.length > 0 && (
            <span className="pmap-card__merge">{mergeWording(t, row.step.joinRequiresAll, row.mergesFrom)}</span>
          )}
          {row.endsHere && row.step.kind !== "end" && (
            <span className="pmap-card__ends">{t.map.ends}</span>
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
            {back.label ? <strong>{back.label}</strong> : null} {back.direction === "back" ? t.map.backTo : t.map.onTo}{" "}
            {t.map.step(back.toNumberLabel, back.toLabel)}
          </p>
        ))}
      </div>
      {row.step.kind !== "task" && <span className="pmap-card__kind">{kindLabel(t, row.step.kind)}</span>}
    </div>
  );
}


/**
 * The unmarked case reads exactly as it always has — by order number, "joins
 * step X and step Y" — unchanged appearance for every process that hasn't
 * used the join requirement (spec 015 FR-007). "Requires all" instead names
 * every predecessor (FR-008), since a reader with no other explanation needs
 * to tell the two kinds of convergence apart by what they actually require.
 */
function mergeWording(
  t: ReportMessages,
  joinRequiresAll: boolean,
  mergesFrom: { numberLabel: string; label: string }[]
): string {
  if (!joinRequiresAll) return t.map.joins(mergesFrom.map((m) => m.numberLabel));
  return t.map.needsAll(mergesFrom.map((m) => m.label));
}

/** A step's kind as printed on its card; a task needs no label. */
function kindLabel(t: ReportMessages, kind: string): string {
  return kind === "start" ? t.map.start : kind === "decision" ? t.map.decision : kind === "end" ? t.map.end : "";
}
