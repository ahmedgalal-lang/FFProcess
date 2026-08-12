"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFirmOwner, changeFirmMemberRole } from "@/lib/actions/organization";

type UserRef = { id: string; name: string | null; email: string };

export function PromoteToOwnerForm({ users }: { users: UserRef[] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-400">
        Everyone with an account is already a Firm Member or Owner.
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addFirmOwner({ userId });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not promote" : result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Promote to Firm Owner
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="min-w-56 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email} ({u.email})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        + Make Firm Owner
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

export function FirmMemberRowActions({
  firmMemberId,
  role,
  canDemote,
}: {
  firmMemberId: string;
  role: "OWNER" | "MEMBER";
  canDemote: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changeRole(nextRole: "OWNER" | "MEMBER") {
    setError(null);
    startTransition(async () => {
      const result = await changeFirmMemberRole({ firmMemberId, role: nextRole });
      if (!result.ok) {
        setError(result.error === "LAST_OWNER" ? "Can't remove the last Firm Owner" : result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {role === "OWNER" ? (
        <button
          type="button"
          disabled={pending || !canDemote}
          onClick={() => changeRole("MEMBER")}
          title={canDemote ? undefined : "The Firm must always have at least one Owner"}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Demote to Member
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => changeRole("OWNER")}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          Promote to Owner
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
