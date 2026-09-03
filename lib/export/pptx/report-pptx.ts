import PptxGenJS from "pptxgenjs";
import { assignSwimlanes, LANE_HEIGHT, LANE_TOP_OFFSET, NODE_HALF_SIZE, type LaneStep } from "@/lib/domain/process-layout";
import { layoutOrgChart, CHART_NODE_SPACING, CHART_LEVEL_HEIGHT, type ChartPerson } from "@/lib/domain/org-chart";
import { readableInkOn } from "@/lib/domain/color-contrast";
import { DIRECTION_LABELS, formatMoney } from "@/lib/domain/authority-table";
import type { RaciCode } from "@/lib/domain/raci-table";
import type { RailProcess } from "@/lib/domain/milestone-rails";
import type { ReportData } from "@/lib/reports/load-report-data";
import type { ExportProcessData, ValueChainColumn } from "@/app/reports/[workspaceId]/export-preview";

// A 16:9 widescreen canvas, the closest built-in match to the A4-landscape
// pages the PDF prints — every slide below is laid out in inches on this grid.
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.5;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_H = SLIDE_H - MARGIN * 2;

const DEFAULT_ACCENT = "334155";
const FONT = "Arial";
const INK_DARK = "0f172a";
const INK_MUTED = "64748b";
const BORDER = "e2e8f0";
const CARD_BG = "f8fafc";

const CODE_LETTER: Record<RaciCode, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};

function hexOf(color: string | null | undefined, fallback: string): string {
  const v = (color ?? fallback).trim();
  return v.startsWith("#") ? v.slice(1) : v;
}

/** Builds the whole Export Report as a slide deck — one PPTX mirroring the same pack the PDF prints. */
export async function buildReportPptx(data: ReportData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "REPORT_WIDE", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "REPORT_WIDE";

  const accent = hexOf(data.accentColor, DEFAULT_ACCENT);
  const ink = hexOf(readableInkOn(`#${accent}`), "ffffff");

  addCoverSlide(pptx, data, accent, ink);

  if (data.people.length > 0) addOrgChartSlide(pptx, data.people, data.companyName);
  if (data.railProcesses.length > 0) addHelicopterSlide(pptx, data.railProcesses, data.companyName);
  if (data.valueChain.length > 0) addValueChainSlides(pptx, data.valueChain, data.companyName, accent, ink);
  if (data.processes.length > 0) addProcessIndexSlide(pptx, data.processes, accent);

  for (const process of data.processes) addProcessSlides(pptx, process, accent, ink);

  addClosingSlide(pptx, accent, ink);

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

function addBanner(
  slide: PptxGenJS.Slide,
  { title, subtitle, eyebrow, accent, ink }: { title: string; subtitle?: string; eyebrow?: string; accent: string; ink: string }
) {
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 1.5, fill: { color: accent } });
  if (eyebrow) {
    slide.addText(eyebrow, { x: MARGIN, y: 0.18, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 11, color: ink, bold: true });
  }
  slide.addText(title, {
    x: MARGIN,
    y: eyebrow ? 0.48 : 0.35,
    w: CONTENT_W,
    h: 0.75,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: ink,
  });
  if (subtitle) {
    slide.addText(subtitle, { x: MARGIN, y: 1.15, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 12, color: ink });
  }
}

function addCoverSlide(pptx: PptxGenJS, data: ReportData, accent: string, ink: string) {
  const slide = pptx.addSlide();
  slide.background = { color: accent };
  slide.addText(data.companyName, {
    x: MARGIN,
    y: 2.3,
    w: CONTENT_W,
    h: 1,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: ink,
  });
  if (data.industry) {
    slide.addText(data.industry, { x: MARGIN, y: 3.25, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 16, color: ink });
  }
  slide.addText("BUSINESS PROCESS DOCUMENTATION & PROCEDURE STANDARD", {
    x: MARGIN,
    y: 3.8,
    w: CONTENT_W,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: ink,
    charSpacing: 1,
  });
  if (data.description) {
    slide.addText(data.description, {
      x: MARGIN,
      y: 4.25,
      w: CONTENT_W * 0.7,
      h: 1.2,
      fontFace: FONT,
      fontSize: 12,
      color: ink,
      valign: "top",
    });
  }
  slide.addText(
    `Generated on ${new Date().toLocaleDateString()} · Covers ${data.processes.length} process${data.processes.length === 1 ? "" : "es"}`,
    { x: MARGIN, y: SLIDE_H - 0.7, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 10, color: ink }
  );
}

function addClosingSlide(pptx: PptxGenJS, accent: string, ink: string) {
  const slide = pptx.addSlide();
  slide.background = { color: accent };
  slide.addText("Thank you", {
    x: MARGIN,
    y: SLIDE_H / 2 - 0.8,
    w: CONTENT_W,
    h: 0.8,
    align: "center",
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: ink,
  });
  slide.addText("Please refer back to the process team for any inputs or comments needed.", {
    x: MARGIN + CONTENT_W * 0.15,
    y: SLIDE_H / 2 + 0.1,
    w: CONTENT_W * 0.7,
    h: 0.5,
    align: "center",
    fontFace: FONT,
    fontSize: 13,
    color: ink,
  });
}

/**
 * Positions a set of points to fill a target box while preserving their
 * relative geometry — the same job ReactFlow's fitView does for the on-screen
 * diagrams, done by hand here since a slide has no canvas to fit itself.
 * Returns a mapper rather than mutating in place so box half-sizes (drawn
 * around each point) can be scaled by the same factor and never overlap.
 */
function fitMapper(xs: number[], ys: number[], boxX: number, boxY: number, boxW: number, boxH: number) {
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min(boxW / spanX, boxH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offsetX = boxX + (boxW - usedW) / 2;
  const offsetY = boxY + (boxH - usedH) / 2;
  return {
    scale,
    x: (v: number) => offsetX + (v - minX) * scale,
    y: (v: number) => offsetY + (v - minY) * scale,
  };
}

function addOrgChartSlide(pptx: PptxGenJS, people: ReportData["people"], companyName: string) {
  const slide = pptx.addSlide();
  slide.addText("Org Structure", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 20, bold: true, color: INK_DARK });
  slide.addText(`Reporting lines across ${companyName}.`, {
    x: MARGIN,
    y: 0.72,
    w: CONTENT_W,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: INK_MUTED,
  });

  const chartPeople: ChartPerson[] = people.map((p) => ({ id: p.id, name: p.name, managerId: p.managerId }));
  const positions = layoutOrgChart(chartPeople);
  const positionById = new Map(positions.map((p) => [p.id, p]));
  const personById = new Map(people.map((p) => [p.id, p]));

  const boxY = 1.2;
  const boxH = SLIDE_H - boxY - MARGIN;
  const map = fitMapper(
    positions.map((p) => p.x),
    positions.map((p) => p.y),
    MARGIN,
    boxY,
    CONTENT_W,
    boxH
  );

  const nodeHalfW = (CHART_NODE_SPACING / 2) * 0.72 * map.scale;
  const nodeH = CHART_LEVEL_HEIGHT * 0.32 * map.scale;

  // Connector lines first, so every box is drawn on top of the lines meeting it.
  for (const pos of positions) {
    const person = personById.get(pos.id);
    if (!person?.managerId) continue;
    const managerPos = positionById.get(person.managerId);
    if (!managerPos) continue;
    const x1 = map.x(managerPos.x);
    const y1 = map.y(managerPos.y) + nodeH / 2;
    const x2 = map.x(pos.x);
    const y2 = map.y(pos.y) - nodeH / 2;
    slide.addShape("line", {
      x: Math.min(x1, x2),
      y: y1,
      w: Math.abs(x2 - x1) || 0.001,
      h: Math.abs(y2 - y1) || 0.001,
      flipH: x2 < x1,
      line: { color: "94a3b8", width: 1 },
    });
  }

  for (const pos of positions) {
    const person = personById.get(pos.id);
    if (!person) continue;
    const cx = map.x(pos.x);
    const cy = map.y(pos.y);
    slide.addShape("roundRect", {
      x: cx - nodeHalfW,
      y: cy - nodeH / 2,
      w: nodeHalfW * 2,
      h: nodeH,
      fill: { color: "ffffff" },
      line: { color: BORDER, width: 1 },
      rectRadius: 0.05,
    });
    const label = person.roleNames.length > 0 ? `${person.name}\n${person.roleNames.join(", ")}` : person.name;
    slide.addText(label, {
      x: cx - nodeHalfW + 0.05,
      y: cy - nodeH / 2,
      w: nodeHalfW * 2 - 0.1,
      h: nodeH,
      fontFace: FONT,
      fontSize: 8,
      color: INK_DARK,
      align: "center",
      valign: "middle",
      shrinkText: true,
    });
  }
}

/**
 * A simplified read of the Helicopter View: one horizontal rail per process
 * with its milestone/junction steps marked as beads along it. The real view's
 * proportional bead spacing and cross-rail drop lines aren't reproduced here
 * — a slide reader wants "what connects to what", not pixel-exact geometry.
 */
function addHelicopterSlide(pptx: PptxGenJS, processes: RailProcess[], companyName: string) {
  const slide = pptx.addSlide();
  slide.addText("Helicopter View", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 20, bold: true, color: INK_DARK });
  slide.addText(`How ${companyName}'s processes in this report connect, at a glance.`, {
    x: MARGIN,
    y: 0.72,
    w: CONTENT_W,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: INK_MUTED,
  });

  const railTop = 1.25;
  const railH = Math.min(0.85, (CONTENT_H - 0.75) / Math.max(processes.length, 1));
  const railX = MARGIN + 1.9;
  const railW = CONTENT_W - 1.9;

  processes.forEach((process, i) => {
    const y = railTop + i * railH + railH / 2;
    slide.addText(`${process.code}\n${process.name}`, {
      x: MARGIN,
      y: railTop + i * railH,
      w: 1.8,
      h: railH,
      fontFace: FONT,
      fontSize: 9,
      color: INK_DARK,
      valign: "middle",
      shrinkText: true,
    });
    slide.addShape("line", { x: railX, y, w: railW, h: 0.001, line: { color: "cbd5e1", width: 1.5 } });

    const beadSteps = process.steps.filter((s) => s.milestone || s.branchedBy.length > 0 || s.linksTo.length > 0);
    beadSteps.forEach((step, si) => {
      const fraction = process.stepCount <= 1 ? 0 : (step.number - 1) / (process.stepCount - 1);
      const bx = railX + fraction * railW;
      slide.addShape("ellipse", {
        x: bx - 0.06,
        y: y - 0.06,
        w: 0.12,
        h: 0.12,
        fill: { color: step.milestone ? accentGold : "64748b" },
        line: { color: "ffffff", width: 1 },
      });
      // Alternate label above/below the rail so adjacent beads don't collide.
      slide.addText(step.label, {
        x: bx - 0.9,
        y: si % 2 === 0 ? y - 0.42 : y + 0.08,
        w: 1.8,
        h: 0.3,
        fontFace: FONT,
        fontSize: 7,
        color: INK_MUTED,
        align: "center",
      });
    });
  });
}

const accentGold = "d97706";

function addValueChainSlides(pptx: PptxGenJS, columns: ValueChainColumn[], companyName: string, accent: string, ink: string) {
  const PER_SLIDE = 4;
  for (let i = 0; i < columns.length; i += PER_SLIDE) {
    const group = columns.slice(i, i + PER_SLIDE);
    const slide = pptx.addSlide();
    addBanner(slide, {
      title: `${companyName} Value Chain`,
      subtitle: i === 0 ? "The chain, end to end" : `Continued (${i / PER_SLIDE + 1})`,
      accent,
      ink,
    });

    const colW = CONTENT_W / group.length;
    group.forEach((column, ci) => {
      const x = MARGIN + ci * colW;
      slide.addShape("line", { x, y: 1.75, w: colW - 0.2, h: 0.001, line: { color: column.color ?? "cbd5e1", width: 2 } });
      slide.addText(column.title.toUpperCase(), {
        x,
        y: 1.6,
        w: colW - 0.2,
        h: 0.25,
        fontFace: FONT,
        fontSize: 9,
        bold: true,
        color: column.color ?? INK_MUTED,
      });
      const lines = column.activities.flatMap((a) => {
        const bits = [a.ownerName ?? "No owner yet"];
        if (a.supportNames.length > 0) bits.push(`support ${a.supportNames.join(", ")}`);
        if (a.linksTo.length > 0) bits.push(`→ ${a.linksTo.join(", ")}`);
        return [
          { text: `${a.label}\n`, options: { bold: true, fontSize: 9, color: INK_DARK, breakLine: true } },
          { text: `${bits.join(" · ")}\n`, options: { fontSize: 7.5, color: INK_MUTED, breakLine: true } },
        ];
      });
      slide.addText(lines.length > 0 ? lines : [{ text: "No activities yet." }], {
        x,
        y: 1.95,
        w: colW - 0.2,
        h: CONTENT_H - 2.1,
        fontFace: FONT,
        fontSize: 9,
        color: INK_DARK,
        valign: "top",
        shrinkText: true,
      });
    });
  }
}

function addProcessIndexSlide(pptx: PptxGenJS, processes: ExportProcessData[], accent: string) {
  const slide = pptx.addSlide();
  slide.addText("Processes in This Report", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 20, bold: true, color: INK_DARK });
  slide.addText(`${processes.length} process${processes.length === 1 ? "" : "es"}, in the order they follow.`, {
    x: MARGIN,
    y: 0.72,
    w: CONTENT_W,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: INK_MUTED,
  });

  const rows: PptxGenJS.TableRow[] = processes.map((p, i) => [
    { text: String(i + 1), options: { fontSize: 10, color: "ffffff", fill: { color: accent }, align: "center", valign: "middle" } },
    { text: p.code, options: { fontSize: 10, bold: true, fontFace: "Courier New" } },
    { text: p.name, options: { fontSize: 10, bold: true } },
    { text: p.parentName ? `under ${p.parentCode}` : "top-level", options: { fontSize: 9, color: INK_MUTED } },
  ]);

  slide.addTable(rows, {
    x: MARGIN,
    y: 1.25,
    w: CONTENT_W,
    colW: [0.4, 1.3, CONTENT_W - 0.4 - 1.3 - 2.2, 2.2],
    fontFace: FONT,
    border: { type: "solid", color: BORDER, pt: 0.5 },
    autoPage: true,
    autoPageRepeatHeader: false,
  });
}

function addProcessSlides(pptx: PptxGenJS, process: ExportProcessData, accent: string, ink: string) {
  addProcessTitleSlide(pptx, process, accent, ink);

  const hasExecutiveSummary =
    !!process.processPurpose ||
    !!process.triggerLabel ||
    !!process.outputLabel ||
    process.involvedRoles.length > 0 ||
    process.externalEntities.length > 0;
  if (hasExecutiveSummary) addExecutiveSummarySlide(pptx, process);

  const hasScope = process.inScope.length > 0 || process.outOfScope.length > 0;
  if (hasScope || process.steps.length > 0) addProcessMapSlide(pptx, process);

  if (process.combinedRows.length > 0) addRaciAuthoritySlide(pptx, process);

  if (process.controlPoints.length > 0 || process.kpis.length > 0) addGovernanceSlide(pptx, process);
}

function addProcessTitleSlide(pptx: PptxGenJS, process: ExportProcessData, accent: string, ink: string) {
  const slide = pptx.addSlide();
  const eyebrow = process.parentName ? `${process.code}  ·  under ${process.parentCode} · ${process.parentName}` : process.code;
  addBanner(slide, { title: process.name, subtitle: process.description ?? undefined, eyebrow, accent, ink });

  const meta: [string, string][] = [
    ["Document ID", `${process.code}-${new Date().getFullYear()}`],
    ["Version", "1.0"],
    ["Effective Date", new Date().toISOString().slice(0, 10)],
    ["Review Cycle", "Annual"],
    ["Process Owner", process.processOwnerName ?? "—"],
    ["Process Code", process.code],
  ];
  const colW = CONTENT_W / 3;
  meta.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN + col * colW;
    const y = 1.9 + row * 0.6;
    slide.addText(label.toUpperCase(), { x, y, w: colW - 0.2, h: 0.22, fontFace: FONT, fontSize: 8, color: INK_MUTED });
    slide.addText(value, { x, y: y + 0.2, w: colW - 0.2, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: INK_DARK });
  });
}

function addExecutiveSummarySlide(pptx: PptxGenJS, process: ExportProcessData) {
  const slide = pptx.addSlide();
  slide.addText("1.0  Executive Summary", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: INK_DARK });

  const runs: { text: string; options?: PptxGenJS.TextPropsOptions }[] = [];
  if (process.processPurpose) {
    runs.push({ text: "Process Purpose\n", options: { bold: true, fontSize: 10, color: INK_MUTED, breakLine: true } });
    runs.push({ text: `${process.processPurpose}\n\n`, options: { fontSize: 11, color: INK_DARK, breakLine: true } });
  }
  if (process.triggerLabel) runs.push({ text: `Trigger: ${process.triggerLabel}\n`, options: { fontSize: 11, color: INK_DARK, breakLine: true } });
  if (process.outputLabel) runs.push({ text: `Output: ${process.outputLabel}\n\n`, options: { fontSize: 11, color: INK_DARK, breakLine: true } });

  if (process.involvedRoles.length > 0) {
    runs.push({ text: "Internal Roles\n", options: { bold: true, fontSize: 10, color: INK_MUTED, breakLine: true } });
    for (const role of process.involvedRoles) {
      const dutySummary = role.duties.map((d) => `${d.tasks.length} ${d.label}`).join(" · ");
      runs.push({ text: `${role.name} — ${dutySummary}\n`, options: { fontSize: 10.5, color: INK_DARK, breakLine: true } });
    }
    runs.push({ text: "\n", options: { breakLine: true } });
  }

  if (process.externalEntities.length > 0) {
    runs.push({ text: "External Entities\n", options: { bold: true, fontSize: 10, color: INK_MUTED, breakLine: true } });
    for (const entity of process.externalEntities) {
      runs.push({ text: `${entity.name} — ${entity.description}\n`, options: { fontSize: 10.5, color: INK_DARK, breakLine: true } });
    }
  }

  slide.addText(runs, {
    x: MARGIN,
    y: 0.85,
    w: CONTENT_W,
    h: CONTENT_H - 0.55,
    fontFace: FONT,
    valign: "top",
    shrinkText: true,
  });
}

type StepForDiagram = ExportProcessData["steps"][number];
type ConnectionForDiagram = ExportProcessData["connections"][number];

const NODE_HALF = NODE_HALF_SIZE;

function nodeKindFor(type: StepForDiagram["type"]): keyof typeof NODE_HALF {
  if (type === "DECISION") return "decision";
  if (type === "START" || type === "END") return "terminal";
  return "task";
}

function addProcessMapSlide(pptx: PptxGenJS, process: ExportProcessData) {
  const slide = pptx.addSlide();
  slide.addText("2.0  Process Map & Narrative", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: INK_DARK });

  let y = 0.78;
  const hasScope = process.inScope.length > 0 || process.outOfScope.length > 0;
  if (hasScope) {
    const halfW = CONTENT_W / 2 - 0.1;
    if (process.inScope.length > 0) {
      slide.addText(
        [
          { text: "IN-SCOPE\n", options: { bold: true, fontSize: 8, color: INK_MUTED, breakLine: true } },
          { text: process.inScope.map((s) => `•  ${s}`).join("\n"), options: { fontSize: 9.5, color: INK_DARK } },
        ],
        { x: MARGIN, y, w: halfW, h: 0.9, fill: { color: CARD_BG }, valign: "top", margin: 6, shrinkText: true }
      );
    }
    if (process.outOfScope.length > 0) {
      slide.addText(
        [
          { text: "OUT-OF-SCOPE\n", options: { bold: true, fontSize: 8, color: INK_MUTED, breakLine: true } },
          { text: process.outOfScope.map((s) => `•  ${s}`).join("\n"), options: { fontSize: 9.5, color: INK_DARK } },
        ],
        { x: MARGIN + halfW + 0.2, y, w: halfW, h: 0.9, fill: { color: CARD_BG }, valign: "top", margin: 6, shrinkText: true }
      );
    }
    y += 1.05;
  }

  if (process.steps.length === 0) return;

  const diagramH = SLIDE_H - y - MARGIN;
  drawProcessDiagram(slide, process.steps, process.connections, MARGIN, y, CONTENT_W, diagramH);
}

function drawProcessDiagram(
  slide: PptxGenJS.Slide,
  steps: StepForDiagram[],
  connections: ConnectionForDiagram[],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  const laneSteps: LaneStep[] = steps.map((s) => ({
    id: s.id,
    assignedRoleId: s.assignedRole?.id ?? null,
    swimlaneRoleId: s.swimlaneRole?.id ?? null,
  }));
  const layout = assignSwimlanes(laneSteps);
  const laneLabel = new Map<string, string>();
  for (const s of steps) {
    const role = s.swimlaneRole ?? s.assignedRole;
    if (role) laneLabel.set(role.id, role.name);
  }

  const xs = steps.map((s) => s.positionX);
  const ys = steps.map((s) => layout.yOf.get(s.id) ?? s.positionY);
  const map = fitMapper(xs, ys, boxX, boxY, boxW, boxH);

  // Lane bands, back to front, so the step boxes drawn afterwards sit on top.
  slide.addShape("rect", { x: boxX, y: boxY, w: boxW, h: boxH, fill: { color: "ffffff" }, line: { color: BORDER, width: 1 } });
  const laneNames = [...layout.laneOrder.map((id) => laneLabel.get(id) ?? ""), ...(layout.hasUnassignedLane ? ["Unassigned"] : [])];
  laneNames.forEach((name, i) => {
    const laneTopUnits = i * LANE_HEIGHT + LANE_TOP_OFFSET;
    const laneY = map.y(laneTopUnits);
    const laneH = LANE_HEIGHT * map.scale;
    if (i % 2 === 1) {
      slide.addShape("rect", { x: boxX, y: Math.max(laneY, boxY), w: boxW, h: Math.min(laneH, boxY + boxH - laneY), fill: { color: "f8fafc" } });
    }
    slide.addText(name, {
      x: boxX + 0.05,
      y: Math.max(laneY, boxY),
      w: 1.3,
      h: Math.min(0.25, laneH),
      fontFace: FONT,
      fontSize: 7,
      bold: true,
      color: INK_MUTED,
    });
  });

  const stepById = new Map(steps.map((s) => [s.id, s]));

  // Connectors first, so arrowheads land under the node boxes' corners rather than visibly poking through them.
  for (const c of connections) {
    const from = stepById.get(c.fromStepId);
    const to = stepById.get(c.toStepId);
    if (!from || !to) continue;
    const isLoop = to.positionX < from.positionX;
    const x1 = map.x(from.positionX);
    const y1 = map.y(layout.yOf.get(from.id) ?? from.positionY);
    const x2 = map.x(to.positionX);
    const y2 = map.y(layout.yOf.get(to.id) ?? to.positionY);
    slide.addShape("line", {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1) || 0.001,
      h: Math.abs(y2 - y1) || 0.001,
      flipH: x2 < x1,
      flipV: y2 < y1,
      line: {
        color: isLoop ? accentGold : "94a3b8",
        width: 1.25,
        dashType: isLoop ? "dash" : "solid",
        endArrowType: "triangle",
      },
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const kind = nodeKindFor(s.type);
    const half = NODE_HALF[kind]!;
    const w = half.x * 2 * map.scale;
    const h = half.y * 2 * map.scale;
    const cx = map.x(s.positionX);
    const cy = map.y(layout.yOf.get(s.id) ?? s.positionY);
    const left = cx - w / 2;
    const top = cy - h / 2;

    if (kind === "terminal") {
      slide.addShape("roundRect", {
        x: left, y: top, w, h,
        fill: { color: "e4f4ee" },
        line: { color: "10b981", width: 1.25 },
        rectRadius: 0.5,
      });
      slide.addText(s.label, {
        x: left, y: top, w, h,
        fontFace: FONT, fontSize: 8, bold: true, color: "047857",
        align: "center", valign: "middle", shrinkText: true,
      });
      continue;
    }

    if (kind === "decision") {
      slide.addShape("roundRect", {
        x: left, y: top, w, h,
        fill: { color: "fef3c7" },
        line: { color: "d97706", width: 1.25 },
        rectRadius: 0.08,
      });
      const gate = s.threshold == null ? null : `${DIRECTION_LABELS[s.direction ?? "GREATER_THAN"].label} ${formatMoney(s.threshold)} · Yes / No`;
      const runs: { text: string; options?: PptxGenJS.TextPropsOptions }[] = [
        { text: `${s.label}\n`, options: { bold: true, fontSize: 7.5, color: "92400e", breakLine: true } },
      ];
      if (s.assignedRole?.name) runs.push({ text: `${s.assignedRole.name}\n`, options: { fontSize: 6, bold: true, color: "b45309", breakLine: true } });
      if (gate) runs.push({ text: gate, options: { fontSize: 6, bold: true, color: "b45309", fontFace: "Courier New" } });
      slide.addText(runs, {
        x: left + 0.04, y: top, w: w - 0.08, h,
        valign: "middle", align: "center", shrinkText: true,
      });
      continue;
    }

    // Task card: white surface, a step-number badge, its role, and the same
    // SLA / hand-off / "no SLA set" meta line the live canvas and static
    // diagram show — same information as the other two surfaces, just drawn
    // as one small text line here instead of separate pill shapes.
    slide.addShape("rect", {
      x: left, y: top, w, h,
      fill: { color: "ffffff" },
      line: { color: "cbd5e1", width: 1 },
      rectRadius: 0.06,
    });
    const badgeSize = Math.min(0.18, h * 0.28);
    slide.addShape("rect", {
      x: left + 0.04, y: top + 0.04, w: badgeSize, h: badgeSize,
      fill: { color: "4338ca" },
      rectRadius: 0.03,
    });
    slide.addText(String(i + 1), {
      x: left + 0.04, y: top + 0.04, w: badgeSize, h: badgeSize,
      fontFace: "Courier New", fontSize: 6, bold: true, color: "ffffff",
      align: "center", valign: "middle",
    });

    const meta = metaLine(s);
    const bodyRuns: { text: string; options?: PptxGenJS.TextPropsOptions }[] = [
      { text: `${s.label}\n`, options: { bold: true, fontSize: 7, color: INK_DARK, breakLine: true } },
    ];
    if (s.assignedRole?.name) bodyRuns.push({ text: `${s.assignedRole.name}\n`, options: { fontSize: 5.5, bold: true, color: INK_MUTED, breakLine: true } });
    bodyRuns.push({ text: meta.text, options: { fontSize: 5.5, bold: true, color: meta.color } });
    slide.addText(bodyRuns, {
      x: left + badgeSize + 0.08, y: top + 0.03, w: w - badgeSize - 0.12, h: h - 0.06,
      valign: "top", shrinkText: true,
    });
  }
}

/** The same SLA / hand-off / "no SLA set" read the live canvas and static diagram give a task card. */
function metaLine(step: StepForDiagram): { text: string; color: string } {
  if (step.slaDays != null) return { text: `SLA ${step.slaDays}d`, color: "047857" };
  if (step.links.length > 0) return { text: step.links.map((l) => `→ ${l.targetProcess.code}`).join("  "), color: "4338ca" };
  return { text: "no SLA set", color: INK_MUTED };
}

function addRaciAuthoritySlide(pptx: PptxGenJS, process: ExportProcessData) {
  const slide = pptx.addSlide();
  slide.addText("3.0  RACI & Authority Matrix", { x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.35, fontFace: FONT, fontSize: 16, bold: true, color: INK_DARK });

  const headerFill = { color: "f1f5f9" };
  const header: PptxGenJS.TableRow = [
    { text: "Process Step", options: { bold: true, fontSize: 8, fill: headerFill } },
    ...process.matrixRoles.map((r) => ({ text: r.name, options: { bold: true, fontSize: 8, fill: headerFill, align: "center" as const } })),
    { text: "SLA", options: { bold: true, fontSize: 8, fill: headerFill, align: "center" as const } },
    { text: "Amount", options: { bold: true, fontSize: 8, fill: headerFill, align: "center" as const } },
    { text: "Direction", options: { bold: true, fontSize: 8, fill: headerFill, align: "center" as const } },
    { text: "Approval", options: { bold: true, fontSize: 8, fill: headerFill, align: "center" as const } },
  ];

  const rows: PptxGenJS.TableRow[] = process.combinedRows.map((row) => [
    { text: row.label, options: { fontSize: 8, bold: true } },
    ...process.matrixRoles.map((r) => {
      const code = row.raci[r.id] as RaciCode | undefined;
      return { text: code ? CODE_LETTER[code] : "", options: { fontSize: 8, align: "center" as const, fontFace: "Courier New" } };
    }),
    { text: row.slaDays === null ? "—" : `${row.slaDays}d`, options: { fontSize: 8, align: "center" as const } },
    { text: row.threshold === null ? "—" : `$${row.threshold.toLocaleString()}`, options: { fontSize: 8, align: "center" as const } },
    { text: row.directionLabel, options: { fontSize: 8, align: "center" as const } },
    { text: row.approverLabel ?? "—", options: { fontSize: 8, align: "center" as const } },
  ]);

  const roleColW = process.matrixRoles.length > 0 ? Math.min(1.2, (CONTENT_W - 5.6) / process.matrixRoles.length) : 0;
  slide.addTable([header, ...rows], {
    x: MARGIN,
    y: 0.75,
    w: CONTENT_W,
    colW: [2.4, ...process.matrixRoles.map(() => roleColW), 0.8, 1, 1.2, 1.2],
    fontFace: FONT,
    border: { type: "solid", color: BORDER, pt: 0.5 },
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageHeaderRows: 1,
  });
}

function addGovernanceSlide(pptx: PptxGenJS, process: ExportProcessData) {
  const slide = pptx.addSlide();
  slide.addText("3.1  Governance, Controls & Metrics", {
    x: MARGIN,
    y: 0.3,
    w: CONTENT_W,
    h: 0.35,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: INK_DARK,
  });

  let y = 0.85;
  if (process.controlPoints.length > 0) {
    slide.addText("Key Control Points", { x: MARGIN, y, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: INK_MUTED });
    y += 0.3;
    const lines = process.controlPoints.map((cp) => ({
      text: `${cp.flagged ? "⚠ " : ""}${cp.statement}\n`,
      options: { fontSize: 10, color: cp.flagged ? "92400e" : INK_DARK, breakLine: true },
    }));
    const h = Math.min(2.5, 0.25 * process.controlPoints.length + 0.2);
    slide.addText(lines, { x: MARGIN, y, w: CONTENT_W, h, fontFace: FONT, valign: "top", shrinkText: true });
    y += h + 0.2;
  }

  if (process.kpis.length > 0) {
    slide.addText("Operational KPIs & SLAs", { x: MARGIN, y, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: INK_MUTED });
    y += 0.35;
    const headerFill = { color: "f1f5f9" };
    const header: PptxGenJS.TableRow = [
      { text: "Metric", options: { bold: true, fontSize: 9, fill: headerFill } },
      { text: "Target", options: { bold: true, fontSize: 9, fill: headerFill } },
      { text: "Frequency", options: { bold: true, fontSize: 9, fill: headerFill } },
    ];
    const rows: PptxGenJS.TableRow[] = process.kpis.map((kpi) => [
      { text: kpi.metric, options: { fontSize: 9 } },
      { text: kpi.target, options: { fontSize: 9 } },
      { text: kpi.frequency, options: { fontSize: 9 } },
    ]);
    slide.addTable([header, ...rows], {
      x: MARGIN,
      y,
      w: CONTENT_W,
      fontFace: FONT,
      border: { type: "solid", color: BORDER, pt: 0.5 },
      autoPage: true,
      autoPageRepeatHeader: true,
      autoPageHeaderRows: 1,
    });
  }
}
