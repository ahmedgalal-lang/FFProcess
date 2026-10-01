import type { Locale } from "@/lib/i18n/locale";
import { messagesFor } from "@/lib/i18n/messages";
import type { ReportData } from "./load-report-data";

/** What a field holds, where that changes how it is translated. */
export type TextKind = "entry" | "aspect";

type Fn = (text: string, kind: TextKind) => string;

const opt = (value: string | null, fn: Fn): string | null => (value === null ? null : fn(value, "entry"));
const each = (values: string[], fn: Fn): string[] => values.map((v) => fn(v, "entry"));

/**
 * Every entry the report prints, as one list (spec 032): each field a
 * consultant or the AI wrote, plus the sentences generated from them.
 * Collecting the texts to translate and putting the translations back both
 * go through here, so the two can never disagree about which fields count.
 *
 * Deliberately not visited: ids, codes, colours, numbers, the company and
 * firm names, and people's names.
 */
export function mapReportText(data: ReportData, fn: Fn): ReportData {
  const e = (text: string) => fn(text, "entry");
  return {
    ...data,
    industry: opt(data.industry, fn),
    description: opt(data.description, fn),
    people: data.people.map((p) => ({ ...p, roleNames: each(p.roleNames, fn) })),
    processes: data.processes.map((p) => ({
      ...p,
      name: e(p.name),
      description: opt(p.description, fn),
      parentName: opt(p.parentName, fn),
      processPurpose: opt(p.processPurpose, fn),
      inScope: each(p.inScope, fn),
      outOfScope: each(p.outOfScope, fn),
      externalEntities: p.externalEntities.map((x) => ({ name: e(x.name), description: e(x.description) })),
      kpis: p.kpis.map((k) => ({ metric: e(k.metric), target: e(k.target), frequency: e(k.frequency) })),
      steps: p.steps.map((s) => ({
        ...s,
        label: e(s.label),
        detailedAction: each(s.detailedAction, fn),
        exceptionHandling: opt(s.exceptionHandling, fn),
        assignedRole: s.assignedRole && { ...s.assignedRole, name: e(s.assignedRole.name) },
        swimlaneRole: s.swimlaneRole && { ...s.swimlaneRole, name: e(s.swimlaneRole.name) },
        links: s.links.map((l) => ({ ...l, targetProcess: { ...l.targetProcess, name: e(l.targetProcess.name) } })),
      })),
      connections: p.connections.map((c) => ({ ...c, label: opt(c.label, fn) })),
      matrixRoles: p.matrixRoles.map((r) => ({ ...r, name: e(r.name) })),
      combinedRows: p.combinedRows.map((r) => ({
        ...r,
        label: e(r.label),
        approverLabel: opt(r.approverLabel, fn),
        extraApprovals: r.extraApprovals.map((a) => ({ ...a, label: opt(a.label, fn) })),
        ruleSentences: each(r.ruleSentences, fn),
        escalationLabel: opt(r.escalationLabel, fn),
      })),
      involvedRoles: p.involvedRoles.map((r) => ({
        ...r,
        name: e(r.name),
        duties: r.duties.map((d) => ({ ...d, tasks: each(d.tasks, fn) })),
      })),
      controlPoints: p.controlPoints.map((c) => ({ ...c, statement: e(c.statement) })),
      processOwnerName: opt(p.processOwnerName, fn),
      triggerLabel: opt(p.triggerLabel, fn),
      outputLabel: opt(p.outputLabel, fn),
      gaps: each(p.gaps, fn),
    })),
    valueChain: data.valueChain.map((column) => ({
      ...column,
      title: e(column.title),
      activities: column.activities.map((a) => ({
        ...a,
        label: e(a.label),
        ownerName: opt(a.ownerName, fn),
        supportNames: each(a.supportNames, fn),
      })),
    })),
    railProcesses: data.railProcesses.map((p) => ({
      ...p,
      name: e(p.name),
      steps: p.steps.map((s) => ({ ...s, label: e(s.label) })),
    })),
    governance: {
      summaries: data.governance.summaries.map((s) => ({ aspectName: fn(s.aspectName, "aspect"), summary: e(s.summary) })),
      risks: data.governance.risks.map((r) => ({
        ...r,
        title: e(r.title),
        description: e(r.description),
        owner: opt(r.owner, fn),
      })),
      policies: data.governance.policies.map((p) => ({ ...p, title: e(p.title) })),
      governing: data.governance.governing.map((g) => ({
        aspectName: fn(g.aspectName, "aspect"),
        policy: g.policy && { ...g.policy, title: e(g.policy.title) },
      })),
    },
  };
}

/** Every text the report would send for translation, built-in wording excluded. */
export function collectReportTexts(data: ReportData, locale: Locale): string[] {
  const builtIn = messagesFor(locale).governance.aspectNames;
  const texts: string[] = [];
  mapReportText(data, (text, kind) => {
    if (!(kind === "aspect" && builtIn[text])) texts.push(text);
    return text;
  });
  return texts;
}

/**
 * The report with every entry in `locale`: built-in wording (the default
 * aspect names, duty and direction labels) from the dictionary, everything
 * else from `lookup`, the saved translations.
 */
export function applyReportTranslations(data: ReportData, locale: Locale, lookup: (text: string) => string): ReportData {
  if (locale === "en") return data;
  const m = messagesFor(locale);
  const mapped = mapReportText(data, (text, kind) => (kind === "aspect" ? (m.governance.aspectNames[text] ?? lookup(text)) : lookup(text)));
  return {
    ...mapped,
    processes: mapped.processes.map((p) => ({
      ...p,
      combinedRows: p.combinedRows.map((r) => ({ ...r, directionLabel: m.report.directions[r.directionLabel] ?? r.directionLabel })),
      involvedRoles: p.involvedRoles.map((r) => ({
        ...r,
        duties: r.duties.map((d) => ({ ...d, label: m.report.duties[d.key] ?? d.label })),
      })),
    })),
  };
}
