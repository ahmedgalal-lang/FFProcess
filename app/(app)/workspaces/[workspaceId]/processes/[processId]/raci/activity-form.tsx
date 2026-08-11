"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createActivity } from "@/lib/actions/process";

export function AddActivityForm({ workspaceId, processId }: { workspaceId: string; processId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="mt-3 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createActivity({ workspaceId, processId, name });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid" : result.error);
            return;
          }
          setName("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">New activity</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reconcile Statement"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        Add activity
      </button>
      {error && <span className="self-center text-xs text-red-600">{error}</span>}
    </form>
  );
}
