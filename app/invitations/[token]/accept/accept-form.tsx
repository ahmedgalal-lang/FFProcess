"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInvitation, acceptInvitationWithNewAccount } from "@/lib/actions/membership";

export function AcceptInvitationForm({
  token,
  invitedEmail,
  hasExistingAccount,
  sessionEmail,
}: {
  token: string;
  invitedEmail: string;
  hasExistingAccount: boolean;
  sessionEmail: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  function goToWorkspace(workspaceId: string) {
    router.push(`/workspaces/${workspaceId}`);
    router.refresh();
  }

  // Case 1: already signed in as the invited user — one-click accept.
  if (sessionEmail === invitedEmail) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await acceptInvitation({ token });
              if (!result.ok) {
                setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not accept invitation" : result.error);
                return;
              }
              goToWorkspace(result.data.workspaceId);
            });
          }}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Joining…" : `Accept invitation as ${invitedEmail}`}
        </button>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  // Case 2: an account exists for this email, but the visitor isn't signed in as it.
  if (hasExistingAccount) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          An account already exists for {invitedEmail}. Sign in with that account to accept.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/invitations/${token}/accept`)}`}
          className="rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800"
        >
          Sign in to accept
        </Link>
      </div>
    );
  }

  // Case 3: brand-new invitee — create an account and accept in one step.
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await acceptInvitationWithNewAccount({ token, name, password });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not create account" : result.error);
            return;
          }
          goToWorkspace(result.data.workspaceId);
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-slate-700">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Set a password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <p className="text-xs text-slate-400">At least 8 characters.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account & join"}
      </button>
    </form>
  );
}
