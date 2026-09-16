"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreProcess } from "@/lib/actions/process";
import { useCanEdit } from "../../workspace-access";

export function RestoreProcessButton({
  workspaceId,
  processId,
  processLabel,
}: {
  workspaceId: string;
  processId: string;
  processLabel: string;
}) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The page already refuses a Viewer, so this is belt and braces — but the
  // convention in this codebase is that a control a viewer cannot use is not
  // rendered at all, and a control that depends on its page for that is one
  // refactor away from leaking.
  if (!canEdit) return null;

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        aria-label={`Restore ${processLabel}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await restoreProcess({ workspaceId, processId });
            if (!result.ok) {
              setError(result.error === "FORBIDDEN" ? "Not allowed" : "Could not restore");
              return;
            }
            router.refresh();
          })
        }
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
    </span>
  );
}
