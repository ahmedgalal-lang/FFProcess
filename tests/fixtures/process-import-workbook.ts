import { SHEETS, READ_ME_SHEET, FORMAT_VERSION, FORMAT_MARKER_LABEL } from "@/lib/domain/process-import";

/**
 * A workbook in the shape `readWorkbookSheets` hands over: sheet name → rows of
 * cell text, headers included.
 *
 * Lives here rather than in a spec because importing a spec file to borrow a
 * helper re-runs that spec's own tests inside the borrower, which quietly
 * doubles the count and makes a failure appear in the wrong file.
 */
export function workbook(parts: {
  process?: string[][];
  steps?: string[][];
  connections?: string[][];
  raci?: string[][];
  authority?: string[][];
  kpis?: string[][];
  externalEntities?: string[][];
  readMe?: string[][];
}): Record<string, string[][]> {
  const header = (s: { columns: readonly { label: string }[] }) => s.columns.map((c) => c.label);
  return {
    [READ_ME_SHEET]: parts.readMe ?? [[FORMAT_MARKER_LABEL, FORMAT_VERSION]],
    [SHEETS.process.name]: parts.process ?? [["Process Name", "Tendering"]],
    [SHEETS.steps.name]: [header(SHEETS.steps), ...(parts.steps ?? [])],
    [SHEETS.connections.name]: [header(SHEETS.connections), ...(parts.connections ?? [])],
    [SHEETS.raci.name]: [header(SHEETS.raci), ...(parts.raci ?? [])],
    [SHEETS.authority.name]: [header(SHEETS.authority), ...(parts.authority ?? [])],
    [SHEETS.kpis.name]: [header(SHEETS.kpis), ...(parts.kpis ?? [])],
    [SHEETS.externalEntities.name]: [header(SHEETS.externalEntities), ...(parts.externalEntities ?? [])],
  };
}
