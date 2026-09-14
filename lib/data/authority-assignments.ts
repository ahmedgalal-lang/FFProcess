import type { Prisma } from "@/app/generated/prisma/client";
import type { AuthorityAssignmentData, AuthorityRuleData } from "@/lib/domain/authority-table";

/**
 * The one way to read Authority data out of the database and into the domain.
 *
 * Seven places load authority assignments — the matrix, the Process Map, the
 * report, the deck, the spreadsheet, Governance and the AI review. Each used to
 * hand-roll the same mapping, which is how a Decimal reached a component as a
 * Prisma Decimal in one place and a number in another. One include and one
 * mapper means a rule means the same thing wherever it is read.
 */
export const AUTHORITY_ASSIGNMENT_INCLUDE = {
  rules: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.AuthorityAssignmentInclude;

/** The shape `AUTHORITY_ASSIGNMENT_INCLUDE` produces, as far as this mapper cares. */
type PrismaRule = {
  id: string;
  order: number;
  measure: string;
  amount: unknown;
  days: number | null;
  direction: string;
  consequence: string;
  whoRoleId: string | null;
  whoPersonId: string | null;
};

type PrismaAssignment = {
  activityId: string | null;
  stepId: string | null;
  skipped: boolean;
  rules: PrismaRule[];
};

/**
 * Decimal columns arrive as Prisma's Decimal, which is not a number and
 * silently stringifies to something a currency formatter will not accept.
 * Converting here, once, is why no consumer has to remember to.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function toAuthorityRuleData(rule: PrismaRule): AuthorityRuleData {
  return {
    id: rule.id,
    order: rule.order,
    measure: rule.measure as AuthorityRuleData["measure"],
    amount: toNumber(rule.amount),
    days: rule.days,
    direction: rule.direction as AuthorityRuleData["direction"],
    consequence: rule.consequence as AuthorityRuleData["consequence"],
    whoRoleId: rule.whoRoleId,
    whoPersonId: rule.whoPersonId,
  };
}

export function toAuthorityAssignmentData(assignment: PrismaAssignment): AuthorityAssignmentData {
  return {
    activityId: assignment.activityId,
    stepId: assignment.stepId,
    skipped: assignment.skipped,
    rules: assignment.rules.map(toAuthorityRuleData),
  };
}
