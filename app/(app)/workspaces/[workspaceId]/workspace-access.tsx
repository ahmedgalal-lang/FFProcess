"use client";

import { createContext, useContext } from "react";
import type { AccessLevel } from "@/lib/domain/access-control";

/**
 * The current viewer's rights over this workspace, shared with every client
 * component under the workspace layout.
 *
 * Every mutating server action already refuses a Viewer (Constitution
 * Principle V), so this is not what keeps data safe — it is what stops the app
 * lying about it. Before this, only the Members page consulted the access
 * level, so a Viewer was shown Edit, Delete and New on every other page and
 * only found out they weren't allowed after filling a form in and losing the
 * work. The server check stays the gate; this makes the interface tell the
 * same story.
 *
 * Resolved once in the layout, which already calls requireWorkspaceAccess, and
 * read through context rather than threaded as props: every control that needs
 * it is a client component, and there are eighteen of them across eight pages.
 */
export type WorkspaceAccess = {
  accessLevel: AccessLevel;
  /** True when this viewer may change workspace content — Editor or above. */
  canEdit: boolean;
};

const WorkspaceAccessContext = createContext<WorkspaceAccess | null>(null);

export function WorkspaceAccessProvider({
  value,
  children,
}: {
  value: WorkspaceAccess;
  children: React.ReactNode;
}) {
  return <WorkspaceAccessContext.Provider value={value}>{children}</WorkspaceAccessContext.Provider>;
}

/**
 * Whether the current viewer may change anything here.
 *
 * Defaults to `false` when used outside the workspace layout: a component that
 * has somehow lost its provider should fall back to showing less, not to
 * offering edits it can't complete.
 */
export function useCanEdit(): boolean {
  return useContext(WorkspaceAccessContext)?.canEdit ?? false;
}

/** The viewer's full access level, for the rarer cases that need to distinguish Admin. */
export function useWorkspaceAccess(): WorkspaceAccess {
  return useContext(WorkspaceAccessContext) ?? { accessLevel: "VIEWER", canEdit: false };
}
