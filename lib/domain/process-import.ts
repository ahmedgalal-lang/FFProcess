/**
 * Reading a whole process out of a workbook the product itself generated.
 *
 * This is the opposite situation from `value-chain-import.ts`, and the
 * difference decides the whole design. That one scans an arbitrary
 * consultant-built spreadsheet and has to be forgiving about where the columns
 * are. This one reads a file the product wrote, so it is entitled to recognise
 * it exactly: named sheets, fixed columns, a format version. A workbook that
 * is nearly right is refused by name rather than half-understood, which is the
 * only way a template from an older release can be caught at all.
 *
 * The other decision worth naming is how validation reuses the product's own
 * rules. `validateRaciMatrix`, `validateAuthorityTable` and
 * `validateConnections` all key on database ids, but nothing may be written
 * before the consultant has seen and confirmed a summary — so at validation
 * time no id exists. Each parsed row therefore carries a *provisional* id that
 * encodes where it came from ("Steps!7"). The validators run on those
 * unmodified, and every issue they return decodes straight back into a sheet
 * and a row the consultant can go to.
 *
 * Pure: rows of cell text in, a checked plan out. Nothing here reads a file or
 * touches a database, so every rule below is unit-testable.
 */

import { validateRaciMatrix, type RaciCode } from "@/lib/domain/raci-validation";
import {
  validateAuthorityTable,
  deriveRowSummary,
  type AuthorityDirection,
  type AuthorityMeasure,
  type AuthorityConsequence,
  type AuthorityTableRow,
  type AuthorityRuleData,
} from "@/lib/domain/authority-table";
import { validateConnections } from "@/lib/domain/process-graph";

export type StepType = "START" | "TASK" | "DECISION" | "END";

/**
 * Bumped whenever the sheets or their columns change in a way that would make
 * an older workbook import wrongly. The importer refuses anything else rather
 * than reading the columns that still happen to line up.
 */
export const FORMAT_VERSION = "process-import v1";

/** The marker's own row on Read Me, so the generator and the reader agree. */
export const FORMAT_MARKER_LABEL = "Template format";

export const READ_ME_SHEET = "Read Me";

/**
 * More steps than anyone builds by hand, by an order of magnitude. The cap
 * exists so the "very large file" case is refused outright instead of being
 * accepted and then half-written: a byte limit alone does not bound the work,
 * because a small file can describe an enormous process.
 */
export const MAX_STEPS = 300;

/**
 * The one declaration the template generator and the parser both read. Neither
 * can drift from the other because neither owns a second copy of it, and the
 * round-trip test proves the pair still agree.
 */
export const SHEETS = {
  process: {
    name: "Process",
    /** Key/value rather than a table — a workbook describes one process. */
    fields: [
      { key: "name", label: "Process Name", accepts: "Required. Free text." },
      { key: "description", label: "Description", accepts: "Free text." },
      { key: "purpose", label: "Purpose", accepts: "Free text." },
      { key: "inScope", label: "In Scope", accepts: "One item per line." },
      { key: "outOfScope", label: "Out of Scope", accepts: "One item per line." },
    ],
  },
  steps: {
    name: "Steps",
    columns: [
      { key: "order", label: "Order", accepts: "Whole number. Ties fall back to row order." },
      { key: "type", label: "Type", accepts: "START, TASK, DECISION or END." },
      { key: "label", label: "Step Name", accepts: "Required. Must be unique in this file." },
      { key: "assignedRole", label: "Assigned Role", accepts: "Role name. Reused if it exists, created if not." },
      { key: "swimlaneRole", label: "Swimlane Role", accepts: "Role name. Blank means the same as Assigned Role." },
      { key: "detailedAction", label: "Detailed Actions", accepts: "One action per line." },
      { key: "exceptionHandling", label: "Risk if Mishandled", accepts: "Free text." },
      { key: "milestone", label: "Milestone", accepts: "Yes or No. Blank means No." },
    ],
  },
  connections: {
    name: "Connections",
    columns: [
      { key: "from", label: "From Step", accepts: "A Step Name from the Steps sheet." },
      { key: "to", label: "To Step", accepts: "A Step Name from the Steps sheet." },
      { key: "label", label: "Label", accepts: "Free text — a decision's branch, typically Yes or No." },
    ],
  },
  raci: {
    name: "RACI",
    columns: [
      { key: "step", label: "Step Name", accepts: "A Step Name from the Steps sheet." },
      { key: "role", label: "Role", accepts: "Role name." },
      { key: "code", label: "Code", accepts: "R, A, C or I." },
    ],
  },
  authority: {
    name: "Authority",
    columns: [
      { key: "step", label: "Step Name", accepts: "A Step Name from the Steps sheet." },
      { key: "measure", label: "Measure", accepts: "Money, Time or None." },
      { key: "amount", label: "Amount", accepts: "A number. Only with Money." },
      { key: "days", label: "Days", accepts: "A whole number of days. Only with Time." },
      {
        key: "direction",
        label: "Direction",
        accepts:
          "Greater than, Greater than or equal, Less than, Less than or equal, or No approval required.",
      },
      { key: "consequence", label: "Consequence", accepts: "Approval or Escalation." },
      { key: "whoRole", label: "Who (Role)", accepts: "Role name. Use this or Who (Person), not both." },
      { key: "whoPerson", label: "Who (Person)", accepts: "Person name. Created if the workspace lacks them." },
    ],
  },
  kpis: {
    name: "KPIs",
    columns: [
      { key: "metric", label: "Metric", accepts: "Required. Free text." },
      { key: "target", label: "Target", accepts: "Free text." },
      { key: "frequency", label: "Frequency", accepts: "Free text." },
    ],
  },
  externalEntities: {
    name: "External Entities",
    columns: [
      { key: "name", label: "Name", accepts: "Required. Free text." },
      { key: "description", label: "Description", accepts: "Free text." },
    ],
  },
} as const;

/** Every sheet a workbook must carry to be this template at all. */
export const REQUIRED_SHEETS: string[] = [
  READ_ME_SHEET,
  ...Object.values(SHEETS).map((s) => s.name),
];

// ---------------------------------------------------------------------------
// Where something came from
// ---------------------------------------------------------------------------

export type SourceRef = {
  sheet: string;
  /** 1-based, exactly as the spreadsheet shows it. */
  row: number;
};

/**
 * A provisional id standing in for the database id a parsed row does not have
 * yet. The sheet name comes last so a sheet name containing "!" (which
 * "External Entities" does not, but a future one might) still decodes: the
 * split is on the *last* separator, and the row is the part after it.
 */
export function toProvisionalId(source: SourceRef): string {
  return `${source.sheet}!${source.row}`;
}

export function fromProvisionalId(id: string): SourceRef {
  const at = id.lastIndexOf("!");
  if (at === -1) return { sheet: id, row: 0 };
  const row = Number(id.slice(at + 1));
  return { sheet: id.slice(0, at), row: Number.isFinite(row) ? row : 0 };
}

/** How a location is written for a consultant: "Steps, row 7". */
export function describeSource(source: SourceRef): string {
  return `${source.sheet}, row ${source.row}`;
}

// ---------------------------------------------------------------------------
// What a parse produces
// ---------------------------------------------------------------------------

export type ParsedProcess = {
  name: string;
  description: string | null;
  processPurpose: string | null;
  inScope: string[];
  outOfScope: string[];
};

export type ParsedStep = {
  order: number;
  type: StepType;
  label: string;
  assignedRole: string | null;
  swimlaneRole: string | null;
  detailedAction: string[];
  exceptionHandling: string | null;
  milestone: boolean;
  source: SourceRef;
};

export type ParsedConnection = {
  fromLabel: string;
  toLabel: string;
  label: string | null;
  source: SourceRef;
};

export type ParsedRaciCell = {
  stepLabel: string;
  roleName: string;
  code: RaciCode;
  source: SourceRef;
};

export type ParsedAuthorityRule = {
  stepLabel: string;
  order: number;
  measure: AuthorityMeasure;
  amount: number | null;
  days: number | null;
  direction: AuthorityDirection;
  consequence: AuthorityConsequence;
  whoRole: string | null;
  whoPerson: string | null;
  source: SourceRef;
};

export type ParsedKpi = { metric: string; target: string; frequency: string; source: SourceRef };
export type ParsedExternalEntity = { name: string; description: string; source: SourceRef };

export type ImportProblem = {
  source: SourceRef;
  /** Plain words a consultant can act on — never an error code. */
  message: string;
};

export type ImportPlan = {
  process: ParsedProcess;
  steps: ParsedStep[];
  connections: ParsedConnection[];
  raci: ParsedRaciCell[];
  authority: ParsedAuthorityRule[];
  kpis: ParsedKpi[];
  externalEntities: ParsedExternalEntity[];
  /** Every distinct role named anywhere, first spelling kept. */
  roleNames: string[];
  /** Every distinct person named in Authority. */
  personNames: string[];
  /** Empty means the file can be imported. */
  problems: ImportProblem[];
};

// ---------------------------------------------------------------------------
// Reading the sheets
// ---------------------------------------------------------------------------

function text(row: string[] | undefined, index: number): string {
  if (!row || index < 0) return "";
  return (row[index] ?? "").trim();
}

function lines(cell: string): string[] {
  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isBlank(row: string[] | undefined): boolean {
  return !row || row.every((cell) => (cell ?? "").trim().length === 0);
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Column positions by header name rather than by position. The product wrote
 * the file, so the headers are known — but a consultant who inserts a column
 * while filling it in should get a clear refusal from the sheet check rather
 * than silently shifted data.
 */
function columnIndex(headerRow: string[] | undefined, labels: readonly string[]): number[] {
  const cells = (headerRow ?? []).map(key);
  return labels.map((label) => cells.indexOf(key(label)));
}

/**
 * Collects names case-insensitively, keeping the first spelling seen. Shared by
 * roles and people because the reason is the same for both: a spreadsheet
 * spells one team two ways and importing both would create two of them.
 */
class NameSet {
  private readonly seen = new Set<string>();
  readonly names: string[] = [];
  add(raw: string | null): void {
    if (!raw) return;
    const name = raw.trim();
    if (!name) return;
    const k = key(name);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.names.push(name);
  }
}

const RACI_LETTERS: Record<string, RaciCode> = {
  r: "RESPONSIBLE",
  a: "ACCOUNTABLE",
  c: "CONSULTED",
  i: "INFORMED",
  responsible: "RESPONSIBLE",
  accountable: "ACCOUNTABLE",
  consulted: "CONSULTED",
  informed: "INFORMED",
};

const MEASURES: Record<string, AuthorityMeasure> = { money: "MONEY", time: "TIME", none: "NONE" };

const DIRECTIONS: Record<string, AuthorityDirection> = {
  "greater than": "GREATER_THAN",
  "greater than or equal": "GREATER_OR_EQUAL",
  "less than": "LESS_THAN",
  "less than or equal": "LESS_OR_EQUAL",
  "no approval required": "EQUAL_NO_APPROVAL",
};

const CONSEQUENCES: Record<string, AuthorityConsequence> = {
  approval: "APPROVAL",
  escalation: "ESCALATION",
};

const STEP_TYPES: StepType[] = ["START", "TASK", "DECISION", "END"];

const EMPTY_PROCESS: ParsedProcess = {
  name: "",
  description: null,
  processPurpose: null,
  inScope: [],
  outOfScope: [],
};

function emptyPlan(problems: ImportProblem[]): ImportPlan {
  return {
    process: EMPTY_PROCESS,
    steps: [],
    connections: [],
    raci: [],
    authority: [],
    kpis: [],
    externalEntities: [],
    roleNames: [],
    personNames: [],
    problems,
  };
}

/**
 * Whether this workbook is the template at all. Checked before anything is
 * read, because a file that is nearly right must be refused by name rather
 * than have the columns that still line up imported from it.
 */
export function checkTemplateIdentity(sheets: Record<string, string[][]>): ImportProblem[] {
  const missing = REQUIRED_SHEETS.filter((name) => !(name in sheets));
  if (missing.length > 0) {
    return [
      {
        source: { sheet: READ_ME_SHEET, row: 1 },
        message:
          `This is not the process import template — it has no ${missing.map((m) => `"${m}"`).join(", ")} sheet. ` +
          `Download a fresh template from the Processes page and fill that in.`,
      },
    ];
  }

  const readMe = sheets[READ_ME_SHEET] ?? [];
  const markerRow = readMe.findIndex((row) => key(text(row, 0)) === key(FORMAT_MARKER_LABEL));
  const version = markerRow === -1 ? "" : text(readMe[markerRow], 1);
  if (version !== FORMAT_VERSION) {
    return [
      {
        source: { sheet: READ_ME_SHEET, row: markerRow === -1 ? 1 : markerRow + 1 },
        message: version
          ? `This template is version "${version}"; this release expects "${FORMAT_VERSION}". Download a fresh template and copy your entries across.`
          : `This workbook does not say which template version it is. Expected "${FORMAT_VERSION}" on the "${READ_ME_SHEET}" sheet.`,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// The sheet parsers
// ---------------------------------------------------------------------------

function parseProcessSheet(rows: string[][], problems: ImportProblem[]): ParsedProcess {
  const sheet = SHEETS.process.name;
  const value = (label: string): string => {
    const row = rows.find((r) => key(text(r, 0)) === key(label));
    return row ? text(row, 1) : "";
  };

  const name = value("Process Name");
  if (!name) {
    problems.push({
      source: { sheet, row: 1 },
      message: `The process has no name. Put one in the "Process Name" row of the "${sheet}" sheet.`,
    });
  }

  return {
    name,
    description: value("Description") || null,
    processPurpose: value("Purpose") || null,
    inScope: lines(value("In Scope")),
    outOfScope: lines(value("Out of Scope")),
  };
}

function parseStepsSheet(rows: string[][], problems: ImportProblem[]): ParsedStep[] {
  const sheet = SHEETS.steps.name;
  const [cOrder, cType, cLabel, cAssigned, cSwimlane, cActions, cRisk, cMilestone] = columnIndex(
    rows[0],
    SHEETS.steps.columns.map((c) => c.label)
  ) as [number, number, number, number, number, number, number, number];

  const steps: ParsedStep[] = [];
  const seenLabel = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const source: SourceRef = { sheet, row: i + 1 };
    if (isBlank(row)) continue;

    const label = text(row, cLabel);
    if (!label) {
      problems.push({ source, message: `This row has no step name.` });
      continue;
    }

    const already = seenLabel.get(key(label));
    if (already !== undefined) {
      // Not a warning: connections name steps by label, so two steps sharing
      // one is an ambiguity the importer must not resolve by guessing.
      problems.push({
        source,
        message: `Two steps are both called "${label}" (also on row ${already}). Connections name steps by their name, so each one has to be unique.`,
      });
      continue;
    }
    seenLabel.set(key(label), i + 1);

    const rawType = text(row, cType).toUpperCase();
    const type = STEP_TYPES.find((t) => t === rawType);
    if (!type) {
      problems.push({
        source,
        message: rawType
          ? `"${text(row, cType)}" is not a step type. Use START, TASK, DECISION or END.`
          : `"${label}" has no type. Use START, TASK, DECISION or END.`,
      });
      continue;
    }

    const orderText = text(row, cOrder);
    const parsedOrder = Number(orderText);
    const assignedRole = text(row, cAssigned) || null;
    const swimlaneRole = text(row, cSwimlane) || assignedRole;

    steps.push({
      order: orderText && Number.isFinite(parsedOrder) ? parsedOrder : i,
      type,
      label,
      assignedRole,
      swimlaneRole,
      detailedAction: lines(text(row, cActions)),
      exceptionHandling: text(row, cRisk) || null,
      milestone: /^(yes|y|true)$/i.test(text(row, cMilestone)),
      source,
    });
  }

  if (steps.length > MAX_STEPS) {
    problems.push({
      source: { sheet, row: 1 },
      message: `This file describes ${steps.length} steps; the most that can be imported at once is ${MAX_STEPS}. Split it into sub-processes.`,
    });
  }

  // The sheet's own order settles ties, which quietly fixes the common case of
  // steps appended at the bottom long after the point they belong at.
  return steps.sort((a, b) => a.order - b.order || a.source.row - b.source.row);
}

function parseConnectionsSheet(rows: string[][], problems: ImportProblem[]): ParsedConnection[] {
  const sheet = SHEETS.connections.name;
  const [cFrom, cTo, cLabel] = columnIndex(
    rows[0],
    SHEETS.connections.columns.map((c) => c.label)
  ) as [number, number, number];

  const out: ParsedConnection[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const source: SourceRef = { sheet, row: i + 1 };
    if (isBlank(row)) continue;

    const fromLabel = text(row, cFrom);
    const toLabel = text(row, cTo);
    if (!fromLabel || !toLabel) {
      problems.push({
        source,
        message: `A connection needs both a "From Step" and a "To Step".`,
      });
      continue;
    }
    out.push({ fromLabel, toLabel, label: text(row, cLabel) || null, source });
  }
  return out;
}

function parseRaciSheet(rows: string[][], problems: ImportProblem[]): ParsedRaciCell[] {
  const sheet = SHEETS.raci.name;
  const [cStep, cRole, cCode] = columnIndex(
    rows[0],
    SHEETS.raci.columns.map((c) => c.label)
  ) as [number, number, number];

  const out: ParsedRaciCell[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const source: SourceRef = { sheet, row: i + 1 };
    if (isBlank(row)) continue;

    const stepLabel = text(row, cStep);
    const roleName = text(row, cRole);
    const rawCode = text(row, cCode);
    if (!stepLabel || !roleName) {
      problems.push({ source, message: `A RACI row needs both a step name and a role.` });
      continue;
    }
    const code = RACI_LETTERS[key(rawCode)];
    if (!code) {
      problems.push({
        source,
        message: rawCode
          ? `"${rawCode}" is not a RACI letter. Use R, A, C or I.`
          : `"${stepLabel}" / "${roleName}" has no RACI letter. Use R, A, C or I.`,
      });
      continue;
    }
    out.push({ stepLabel, roleName, code, source });
  }
  return out;
}

function parseAuthoritySheet(rows: string[][], problems: ImportProblem[]): ParsedAuthorityRule[] {
  const sheet = SHEETS.authority.name;
  const [cStep, cMeasure, cAmount, cDays, cDirection, cConsequence, cRole, cPerson] = columnIndex(
    rows[0],
    SHEETS.authority.columns.map((c) => c.label)
  ) as [number, number, number, number, number, number, number, number];

  const out: ParsedAuthorityRule[] = [];
  const orderByStep = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const source: SourceRef = { sheet, row: i + 1 };
    if (isBlank(row)) continue;

    const stepLabel = text(row, cStep);
    if (!stepLabel) {
      problems.push({ source, message: `An authority rule needs a step name.` });
      continue;
    }

    const measure = MEASURES[key(text(row, cMeasure))];
    if (!measure) {
      problems.push({
        source,
        message: `"${text(row, cMeasure)}" is not a measure. Use Money, Time or None.`,
      });
      continue;
    }

    const direction = DIRECTIONS[key(text(row, cDirection))];
    if (!direction) {
      problems.push({
        source,
        message: `"${text(row, cDirection)}" is not a direction. Use ${Object.keys(DIRECTIONS)
          .map((d) => d.replace(/^./, (c) => c.toUpperCase()))
          .join(", ")}.`,
      });
      continue;
    }

    const consequence = CONSEQUENCES[key(text(row, cConsequence))] ?? "APPROVAL";
    if (direction !== "EQUAL_NO_APPROVAL" && !CONSEQUENCES[key(text(row, cConsequence))]) {
      problems.push({
        source,
        message: `"${text(row, cConsequence)}" is not a consequence. Use Approval or Escalation.`,
      });
      continue;
    }

    const whoRole = text(row, cRole) || null;
    const whoPerson = text(row, cPerson) || null;
    if (whoRole && whoPerson) {
      problems.push({
        source,
        message: `This rule names both a role ("${whoRole}") and a person ("${whoPerson}"). A rule lands on one or the other.`,
      });
      continue;
    }

    const amountText = text(row, cAmount);
    const daysText = text(row, cDays);
    const amount = measure === "MONEY" && amountText ? Number(amountText.replace(/[, ]/g, "")) : null;
    const days = measure === "TIME" && daysText ? Number(daysText.replace(/[, ]/g, "")) : null;
    if (amount !== null && !Number.isFinite(amount)) {
      problems.push({ source, message: `"${amountText}" is not an amount.` });
      continue;
    }
    if (days !== null && !Number.isFinite(days)) {
      problems.push({ source, message: `"${daysText}" is not a whole number of days.` });
      continue;
    }

    const order = orderByStep.get(key(stepLabel)) ?? 0;
    orderByStep.set(key(stepLabel), order + 1);

    out.push({
      stepLabel, order, measure, amount, days, direction, consequence, whoRole, whoPerson, source,
    });
  }
  return out;
}

function parseKpisSheet(rows: string[][], problems: ImportProblem[]): ParsedKpi[] {
  const sheet = SHEETS.kpis.name;
  const [cMetric, cTarget, cFrequency] = columnIndex(
    rows[0],
    SHEETS.kpis.columns.map((c) => c.label)
  ) as [number, number, number];

  const out: ParsedKpi[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    const metric = text(row, cMetric);
    if (!metric) {
      problems.push({ source: { sheet, row: i + 1 }, message: `A KPI needs a metric.` });
      continue;
    }
    out.push({ metric, target: text(row, cTarget), frequency: text(row, cFrequency), source: { sheet, row: i + 1 } });
  }
  return out;
}

function parseEntitiesSheet(rows: string[][], problems: ImportProblem[]): ParsedExternalEntity[] {
  const sheet = SHEETS.externalEntities.name;
  const [cName, cDescription] = columnIndex(
    rows[0],
    SHEETS.externalEntities.columns.map((c) => c.label)
  ) as [number, number];

  const out: ParsedExternalEntity[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    const name = text(row, cName);
    if (!name) {
      problems.push({ source: { sheet, row: i + 1 }, message: `An external entity needs a name.` });
      continue;
    }
    out.push({ name, description: text(row, cDescription), source: { sheet, row: i + 1 } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The product's own rules, reached through provisional ids
// ---------------------------------------------------------------------------

/**
 * Cross-sheet references. A connection, a RACI letter or an authority rule
 * naming a step that is not in the file is reported against its own row, not
 * accepted as a dangling reference.
 */
function checkStepReferences(plan: {
  steps: ParsedStep[];
  connections: ParsedConnection[];
  raci: ParsedRaciCell[];
  authority: ParsedAuthorityRule[];
}): ImportProblem[] {
  const known = new Map(plan.steps.map((s) => [key(s.label), s]));
  const problems: ImportProblem[] = [];

  const check = (label: string, source: SourceRef, what: string) => {
    if (known.has(key(label))) return true;
    problems.push({
      source,
      message: `There is no step called "${label}" on the "${SHEETS.steps.name}" sheet, so this ${what} has nothing to join to.`,
    });
    return false;
  };

  for (const c of plan.connections) {
    check(c.fromLabel, c.source, "connection");
    check(c.toLabel, c.source, "connection");
  }
  for (const r of plan.raci) check(r.stepLabel, r.source, "RACI assignment");
  for (const a of plan.authority) check(a.stepLabel, a.source, "authority rule");

  return problems;
}

/**
 * The RACI rule — exactly one Accountable per task, and a Responsible — asked
 * of `validateRaciMatrix` rather than restated here, so an imported process
 * cannot reach a state the app would refuse to let anyone build by hand.
 *
 * The activity id handed to it is the step's provisional id, and the role id is
 * the role's normalised name; both decode on the way back out.
 */
function checkRaciRules(steps: ParsedStep[], cells: ParsedRaciCell[]): ImportProblem[] {
  const known = new Map(steps.map((s) => [key(s.label), s]));
  const byStep = new Map<string, ParsedRaciCell[]>();
  for (const cell of cells) {
    if (!known.has(key(cell.stepLabel))) continue;
    const k = key(cell.stepLabel);
    byStep.set(k, [...(byStep.get(k) ?? []), cell]);
  }
  // A step nobody gave a letter to is not an incomplete matrix — it is a step
  // left out of RACI, which the app allows (raciSkipped) and the report shows.
  if (byStep.size === 0) return [];

  const issues = validateRaciMatrix(
    [...byStep.entries()].map(([k, list]) => ({
      activityId: toProvisionalId(known.get(k)!.source),
      name: known.get(k)!.label,
      assignments: list.map((c) => ({ roleId: key(c.roleName), code: c.code })),
    }))
  );

  const said: Record<string, string> = {
    MISSING_ACCOUNTABLE: "needs exactly one Accountable (A), and has none",
    MULTIPLE_ACCOUNTABLE: "has more than one Accountable (A); exactly one role is accountable for a task",
    MISSING_RESPONSIBLE: "needs at least one Responsible (R)",
  };

  return issues.map((issue) => {
    const source = fromProvisionalId(issue.activityId);
    const step = steps.find((s) => toProvisionalId(s.source) === issue.activityId);
    return {
      // Reported against the step's own row: that is the row a consultant has
      // to change, even though the letters live on the RACI sheet.
      source,
      message: `"${step?.label ?? "This step"}" ${said[issue.type]}. Fix it on the "${SHEETS.raci.name}" sheet.`,
    };
  });
}

/**
 * The authority rules — a money rule carries a figure, every rule has somebody
 * to carry it — asked of `validateAuthorityTable` unmodified.
 */
function checkAuthorityRules(steps: ParsedStep[], rules: ParsedAuthorityRule[]): ImportProblem[] {
  const known = new Map(steps.map((s) => [key(s.label), s]));
  const byStep = new Map<string, ParsedAuthorityRule[]>();
  for (const rule of rules) {
    if (!known.has(key(rule.stepLabel))) continue;
    const k = key(rule.stepLabel);
    byStep.set(k, [...(byStep.get(k) ?? []), rule]);
  }
  if (byStep.size === 0) return [];

  const rows: AuthorityTableRow[] = [...byStep.entries()].map(([k, list]) => {
    const step = known.get(k)!;
    const ruleData: AuthorityRuleData[] = list.map((r) => ({
      id: toProvisionalId(r.source),
      order: r.order,
      measure: r.measure,
      amount: r.amount,
      days: r.days,
      direction: r.direction,
      consequence: r.consequence,
      whoRoleId: r.whoRole ? key(r.whoRole) : null,
      whoPersonId: r.whoPerson ? key(r.whoPerson) : null,
    }));
    // The summary fields come from deriveRowSummary rather than being
    // assembled here, so an imported row is the same shape the Authority
    // Matrix builds for a hand-entered one and the validator cannot tell the
    // two apart.
    return {
      ...deriveRowSummary(ruleData),
      id: toProvisionalId(step.source),
      kind: "step",
      stepId: toProvisionalId(step.source),
      stepType: step.type,
      label: step.label,
      skipped: false,
      rules: ruleData,
    };
  });

  const said: Record<string, string> = {
    MISSING_APPROVER: "has no rule saying who approves it",
    INCOMPLETE_RULE_WHO: "has a rule with nobody to carry it — name a role or a person",
    INCOMPLETE_RULE_FIGURE: "has a rule with no figure — a Money rule needs an Amount, a Time rule needs Days",
  };

  return validateAuthorityTable(rows).map((issue) => {
    // A rule-level issue points at the rule's own row; a task-level one at the
    // step's. Both are rows the consultant can go straight to.
    const id = issue.ruleId ?? issue.rowId;
    const source = fromProvisionalId(id);
    const step = steps.find((s) => toProvisionalId(s.source) === issue.rowId);
    return { source, message: `"${step?.label ?? "This step"}" ${said[issue.type]}.` };
  });
}

/**
 * The connection rule — a connection joins two steps of one process — asked of
 * `validateConnections`. Every parsed step is mapped to one synthetic process
 * id, which is exactly the invariant an import has to hold: a workbook
 * describes one process, so a connection can never legitimately leave it.
 */
function checkConnectionRules(steps: ParsedStep[], connections: ParsedConnection[]): ImportProblem[] {
  const byLabel = new Map(steps.map((s) => [key(s.label), toProvisionalId(s.source)]));
  const stepProcessId = new Map<string, string>();
  for (const id of byLabel.values()) stepProcessId.set(id, "imported-process");

  const usable = connections.filter(
    (c) => byLabel.has(key(c.fromLabel)) && byLabel.has(key(c.toLabel))
  );
  if (usable.length === 0) return [];

  const issues = validateConnections(
    usable.map((c) => ({
      fromStepId: byLabel.get(key(c.fromLabel))!,
      toStepId: byLabel.get(key(c.toLabel))!,
    })),
    stepProcessId
  );

  return issues.map((issue) => {
    const connection = usable.find(
      (c) =>
        byLabel.get(key(c.fromLabel)) === issue.fromStepId &&
        byLabel.get(key(c.toLabel)) === issue.toStepId
    );
    return {
      source: connection?.source ?? { sheet: SHEETS.connections.name, row: 1 },
      message: `This connection does not join two steps of this process.`,
    };
  });
}

// ---------------------------------------------------------------------------
// The whole read
// ---------------------------------------------------------------------------

/**
 * Turns a workbook's sheets into a checked plan. Every problem carries the
 * sheet and row it came from; an empty `problems` means the file can be
 * imported exactly as it stands.
 */
export function parseWorkbook(sheets: Record<string, string[][]>): ImportPlan {
  const identity = checkTemplateIdentity(sheets);
  if (identity.length > 0) return emptyPlan(identity);

  const problems: ImportProblem[] = [];
  const process = parseProcessSheet(sheets[SHEETS.process.name] ?? [], problems);
  const steps = parseStepsSheet(sheets[SHEETS.steps.name] ?? [], problems);
  const connections = parseConnectionsSheet(sheets[SHEETS.connections.name] ?? [], problems);
  const raci = parseRaciSheet(sheets[SHEETS.raci.name] ?? [], problems);
  const authority = parseAuthoritySheet(sheets[SHEETS.authority.name] ?? [], problems);
  const kpis = parseKpisSheet(sheets[SHEETS.kpis.name] ?? [], problems);
  const externalEntities = parseEntitiesSheet(sheets[SHEETS.externalEntities.name] ?? [], problems);

  if (steps.length === 0 && !process.name) {
    return emptyPlan([
      {
        source: { sheet: SHEETS.steps.name, row: 2 },
        message: `This template is empty — it has no process name and no steps. Fill it in before uploading it.`,
      },
    ]);
  }
  if (steps.length === 0) {
    problems.push({
      source: { sheet: SHEETS.steps.name, row: 2 },
      message: `"${process.name}" has no steps. A process needs at least one.`,
    });
  }

  problems.push(...checkStepReferences({ steps, connections, raci, authority }));
  problems.push(...checkRaciRules(steps, raci));
  problems.push(...checkAuthorityRules(steps, authority));
  problems.push(...checkConnectionRules(steps, connections));

  const roles = new NameSet();
  const people = new NameSet();
  for (const step of steps) {
    roles.add(step.assignedRole);
    roles.add(step.swimlaneRole);
  }
  for (const cell of raci) roles.add(cell.roleName);
  for (const rule of authority) {
    roles.add(rule.whoRole);
    people.add(rule.whoPerson);
  }

  // Reported in the order a consultant would work through the workbook.
  problems.sort(
    (a, b) =>
      REQUIRED_SHEETS.indexOf(a.source.sheet) - REQUIRED_SHEETS.indexOf(b.source.sheet) ||
      a.source.row - b.source.row
  );

  return {
    process,
    steps,
    connections,
    raci,
    authority,
    kpis,
    externalEntities,
    roleNames: roles.names,
    personNames: people.names,
    problems,
  };
}
