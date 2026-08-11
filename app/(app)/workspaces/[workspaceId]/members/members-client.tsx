"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeMemberAccessLevel, inviteMember, removeMember } from "@/lib/actions/membership";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"VIEWER" | "EDITOR" | "ADMIN">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{ acceptUrl: string; emailSent: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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

export function MemberRowActions({
  workspaceId,
  memberId,
  accessLevel,
}: {
  workspaceId: string;
  memberId: string;
  accessLevel: "VIEWER" | "EDITOR" | "ADMIN";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
        className="text-xs font-medium text-slate-500 hover:text-red-600"
      >
        Remove
      </button>
      {error && <span className="text-xs text-red-600">{error === "LAST_ADMIN" ? "Can't remove the last Admin" : error}</span>}
    </div>
  );
}
