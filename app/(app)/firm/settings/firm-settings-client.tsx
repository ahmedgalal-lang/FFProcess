"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFirmOwner, changeFirmMemberRole, removeFirmMember, updateFirmLogo } from "@/lib/actions/organization";

type UserRef = { id: string; name: string | null; email: string };

export function LogoUploadForm({ logoDataUrl }: { logoDataUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(logoDataUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(dataUrl: string | null, revertTo: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateFirmLogo({ logoDataUrl: dataUrl });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save logo") : result.error);
        setPreview(revertTo);
        return;
      }
      router.refresh();
    });
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      save(dataUrl, preview);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
          <img src={preview} alt="Company logo preview" className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[10px] text-slate-600">No logo</span>
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-800">Company logo</div>
        <p className="mt-0.5 text-xs text-slate-500">
          Shown in the header on every page, next to the FFProcess mark. PNG, JPEG, WebP, or SVG, under 300KB.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {preview ? "Replace logo" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {preview && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setPreview(null);
                save(null, preview);
              }}
              className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-60"
            >
              Remove
            </button>
          )}
          {pending && <span className="text-xs text-slate-400">Saving…</span>}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export function PromoteToOwnerForm({ users }: { users: UserRef[] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500">
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeFirmMember({ firmMemberId });
      setConfirmingRemove(false);
      if (!result.ok) {
        setError(result.error === "LAST_OWNER" ? "Can't remove the last Firm Owner" : result.error);
        return;
      }
      router.refresh();
    });
  }

  if (confirmingRemove) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500">Remove from the Firm permanently?</span>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setConfirmingRemove(false)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
        >
          No
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
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
      <button
        type="button"
        disabled={pending || (role === "OWNER" && !canDemote)}
        onClick={() => setConfirmingRemove(true)}
        title={role === "OWNER" && !canDemote ? "The Firm must always have at least one Owner" : undefined}
        className="text-xs font-medium text-slate-600 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Remove
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
