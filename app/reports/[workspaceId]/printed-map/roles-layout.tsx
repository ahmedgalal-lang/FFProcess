import { NO_ROLE_COLUMN, type RolesGrid } from "@/lib/domain/print-map-layout";
import type { PrintedMapStep, PrintedMapStepDetail } from "./printed-process-map";
import { useMessages } from "@/lib/i18n/client";
import type { ReportMessages } from "@/lib/i18n/messages/report.en";

type LinksByStepId = Map<string, PrintedMapStep["links"]>;
type DetailByStepId = Map<string, PrintedMapStepDetail>;

/**
 * The process flowing down through a column per role, so a hand-off from one
 * role to another reads as a sideways move.
 *
 * The connectors are grid-placed elements rather than a measured overlay:
 * because each step knows its own column and the next step's column, the shape
 * that joins them can be placed in the grid spanning exactly those columns, and
 * CSS already knows where they are. That keeps the whole map free of a layout
 * pass the PDF export would otherwise have to wait for, and lets a page break
 * fall between two rows instead of through one overlay.
 *
 * `print-map-layout.ts` refuses this layout above its role ceiling and returns
 * Flow instead, so this component never has to render columns too narrow to
 * read.
 */
export function RolesLayout({
  grid,
  linksByStepId,
  detailByStepId,
}: {
  grid: RolesGrid;
  linksByStepId: LinksByStepId;
  detailByStepId: DetailByStepId;
}) {
  const t = useMessages().report;
  const columns = grid.columns.length;

  return (
    <div className="pmap-roles" style={{ "--pmap-columns": columns } as React.CSSProperties}>
      <div className="pmap-roles__head print-keep">
        {grid.columns.map((role) => (
          <span key={role} className="pmap-roles__role">
            {role === NO_ROLE_COLUMN ? t.map.noRole : role}
          </span>
        ))}
      </div>

      <ol className="pmap-roles__grid">
        {grid.cells.map((cell) => {
          const connector = grid.connectors.find((c) => c.fromRow === cell.row);
          const backs = grid.backReferences.filter((b) => b.fromOrder === cell.step.order);
          const links = linksByStepId.get(cell.step.id) ?? [];
          const detail = detailByStepId.get(cell.step.id);

          return (
            <li
              key={cell.step.id}
              className="pmap-roles__row print-keep"
              style={{ "--pmap-col": cell.column + 1 } as React.CSSProperties}
            >
              <div className="pmap-roles__cell" data-kind={cell.step.kind}>
                <span className="pmap-card__num">{cell.step.numberLabel}</span>
                <div className="pmap-card__body">
                  <p className="pmap-card__label">{cell.step.label}</p>
                  <p className="pmap-card__meta">
                    {cell.step.roleName === null && (
                      <span className="pmap-card__unowned">{t.map.noRole}</span>
                    )}
                    {detail?.sla && <span className="pmap-card__sla">{detail.sla}</span>}
                    {detail?.gate && <span className="pmap-card__gate">{detail.gate}</span>}
                    {cell.mergesFrom.length > 0 && (
                      <span className="pmap-card__merge">
                        {mergeWording(t, cell.step.joinRequiresAll, cell.mergesFrom)}
                      </span>
                    )}
                  </p>
                  {links.length > 0 && (
                    <p className="pmap-card__links">
                      {links.map((link) => (
                        <span key={link.id} className="pmap-card__link">
                          → {link.targetProcess.code}
                        </span>
                      ))}
                    </p>
                  )}
                  {backs.map((back) => (
                    <p key={back.connectionId} className="pmap-card__backref">
                      <span aria-hidden="true">{back.direction === "back" ? "↩" : "↪"}</span>{" "}
                      {back.label ? <strong>{back.label}</strong> : null}{" "}
                      {back.direction === "back" ? t.map.backTo : t.map.onTo} {t.map.stepNumber(back.toNumberLabel)}
                    </p>
                  ))}
                </div>
                {cell.step.kind !== "task" && (
                  <span className="pmap-card__kind">{kindLabel(t, cell.step.kind)}</span>
                )}
              </div>

              {/* The hop to the next step, drawn in the gap below this row and
                  spanning from this step's column to the next one's. */}
              {connector && (
                <span
                  className="pmap-roles__connector"
                  aria-hidden="true"
                  data-direction={
                    connector.toColumn === connector.fromColumn
                      ? "down"
                      : connector.toColumn > connector.fromColumn
                        ? "right"
                        : "left"
                  }
                  style={
                    {
                      "--pmap-from": Math.min(connector.fromColumn, connector.toColumn) + 1,
                      "--pmap-to": Math.max(connector.fromColumn, connector.toColumn) + 2,
                    } as React.CSSProperties
                  }
                >
                  {connector.label && (
                    <span className="pmap-roles__connector-label">{connector.label}</span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
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
