"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProcess } from "@/lib/actions/process";

type ProcessOption = { id: string; code: string; name: string };

export function CreateProcessForm({
  workspaceId,
  processes,
}: {
  workspaceId: string;
  processes: ProcessOption[];
}) {
  const [name, setName] = useState("");
  const [parentProcessId, setParentProcessId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setLastCreatedCode(null);
        startTransition(async () => {
          const result = await createProcess({
            workspaceId,
            name,
            parentProcessId: parentProcessId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setParentProcessId("");
          setLastCreatedCode(result.data.code);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Order Fulfillment"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Parent process
        <select
          value={parentProcessId}
          onChange={(e) => setParentProcessId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— top-level —</option>
          {processes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        + New Process
      </button>
      <span className="self-center text-xs text-slate-500">Codes are assigned automatically.</span>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
      {lastCreatedCode && (
        <span className="w-full text-xs text-emerald-700">
          Created as <span className="font-mono font-semibold">{lastCreatedCode}</span>.
        </span>
      )}
    </form>
  );
}
