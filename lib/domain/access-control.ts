/**
 * Pure, framework-free access-control rules — no Prisma/session imports here so
 * these stay unit-testable without a database (Constitution Principle III).
 */

export type AccessLevel = "VIEWER" | "EDITOR" | "ADMIN";

const LEVEL_RANK: Record<AccessLevel, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

export function hasSufficientAccess(actual: AccessLevel, required: AccessLevel): boolean {
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

/** FR-016: a Workspace must always retain at least one active Admin. */
export function canChangeLastAdmin(activeAdminCount: number): boolean {
  return activeAdminCount > 1;
}

/** FR-026: the Firm must always retain at least one Firm Owner. */
export function canChangeLastFirmOwner(activeOwnerCount: number): boolean {
  return activeOwnerCount > 1;
}
