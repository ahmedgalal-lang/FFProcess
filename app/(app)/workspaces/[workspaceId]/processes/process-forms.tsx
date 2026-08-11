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
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentProcessId, setParentProcessId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createProcess({
            workspaceId,
            code,
            name,
            parentProcessId: parentProcessId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setCode("");
          setName("");
          setParentProcessId("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SAL101"
          required
          className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Order Fulfillment"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Parent process</label>
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
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        + New Process
      </button>
      {error && <span className="self-center text-xs text-red-600">{error}</span>}
    </form>
  );
}
