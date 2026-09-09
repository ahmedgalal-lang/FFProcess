"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanManageMembers } from "../workspace-access";
import {
  changeMemberAccessLevel,
  createMemberWithPassword,
  inviteMember,
  removeMember,
} from "@/lib/actions/membership";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const canManageMembers = useCanManageMembers();
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"VIEWER" | "EDITOR" | "ADMIN">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{ acceptUrl: string; emailSent: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Nothing here but a way to change who has access, so anyone who cannot is
  // shown none of it. Declared after the hooks above, never before them.
  if (!canManageMembers) return null;

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setLastInvite(null);
          startTransition(async () => {
            const result = await inviteMember({ workspaceId, email, accessLevel });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid" : result.error);
              return;
            }
            setEmail("");
            setLastInvite({ acceptUrl: result.data.acceptUrl, emailSent: result.data.emailSent });
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Access level
          <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
            <option value="VIEWER">Viewer</option>
            <option value="EDITOR">Editor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          Send invitation
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
      {lastInvite && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {lastInvite.emailSent ? (
            "Invitation email sent."
          ) : (
            <>
              No email provider configured — share this link directly:{" "}
              <a href={lastInvite.acceptUrl} className="font-mono text-slate-900 underline break-all">
                {lastInvite.acceptUrl}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The alternative to inviting someone: an admin sets up the account outright
 * — name, email, a password, and an access level — for when the person can't
 * receive the invitation email or needs to be signing in right away. Refuses
 * silently for nobody: an email that already has an account is rejected with
 * a message pointing at the invite form instead, since setting a password on
 * an existing account would let the admin take it over.
 */
export function CreateMemberForm({ workspaceId }: { workspaceId: string }) {
  const canManageMembers = useCanManageMembers();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessLevel, setAccessLevel] = useState<"VIEWER" | "EDITOR" | "ADMIN">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Ahead of the collapsed state below, not after it — the collapsed state is
  // itself a button offering to create an account.
  if (!canManageMembers) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        + Create an account directly, with a password
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createMemberWithPassword({ workspaceId, name, email, password, accessLevel });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid") : result.error);
            return;
          }
          setName("");
          setEmail("");
          setPassword("");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Access level
        <select
          value={accessLevel}
          onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
          <option value="ADMIN">Admin</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </form>
  );
}

const ACCESS_LEVEL_LABEL: Record<"VIEWER" | "EDITOR" | "ADMIN", string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  ADMIN: "Admin",
};

export function MemberRowActions({
  workspaceId,
  memberId,
  accessLevel,
}: {
  workspaceId: string;
  memberId: string;
  accessLevel: "VIEWER" | "EDITOR" | "ADMIN";
}) {
  const canManageMembers = useCanManageMembers();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Who holds what access is worth reading whoever you are — it is the answer
  // to "can this person change our process pack". Only the means of changing
  // it goes away, so the column keeps its value as plain text.
  if (!canManageMembers) {
    return (
      <div className="flex items-center justify-end">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {ACCESS_LEVEL_LABEL[accessLevel]}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        aria-label="Access level"
        defaultValue={accessLevel}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            setError(null);
            const result = await changeMemberAccessLevel({
              workspaceId,
              memberId,
              accessLevel: e.target.value as typeof accessLevel,
            });
            if (!result.ok) setError(result.error);
            router.refresh();
          })
        }
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="VIEWER">Viewer</option>
        <option value="EDITOR">Editor</option>
        <option value="ADMIN">Admin</option>
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await removeMember({ workspaceId, memberId });
            if (!result.ok) setError(result.error);
            router.refresh();
          })
        }
        className="text-xs font-medium text-slate-600 hover:text-red-600"
      >
        Remove
      </button>
      {error && <span className="text-xs text-red-600">{error === "LAST_ADMIN" ? "Can't remove the last Admin" : error}</span>}
    </div>
  );
}
