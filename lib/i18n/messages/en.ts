import { governanceEn } from "./governance.en";
/**
 * English interface strings (spec 031): the source of truth. ar.ts is typed
 * against this object, so a key missing from Arabic fails the type check.
 * Strings that carry a count or a name are functions.
 */
export const en = {
  language: {
    label: "Language",
    english: "English",
    arabic: "العربية",
  },
  login: {
    title: "Sign in",
    intro: "Process mapping, RACI, and authority matrices for client engagements.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
  },
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    keep: "Keep",
    edit: "Edit",
    add: "Add",
    remove: "Remove",
    none: "— none —",
    unassigned: "Unassigned",
    archived: "archived",
    couldNotSave: "Could not save.",
    working: "Working…",
    loading: "Loading…",
  },
  shell: {
    firmSettings: "Firm Settings",
    signOut: "Sign out",
  },
  nav: {
    workspace: "Workspace",
    firmOwnerAccess: "★ Firm Owner access",
    viewOnly: "View only",
    allWorkspaces: "← All workspaces",
    showSidebar: "Show workspace sidebar",
    hideSidebar: "Hide workspace sidebar",
    showSidebarShort: "Show sidebar",
    hideSidebarShort: "Hide sidebar",
    items: {
      dashboard: "Dashboard",
      org: "Org Directory",
      processes: "Processes",
      helicopter: "Helicopter View",
      valueChain: "Value Chain",
      governance: "Governance",
      members: "Members",
      export: "Export Report",
    },
  },
  governance: governanceEn,
};

export type Messages = typeof en;
