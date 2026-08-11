"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApprovalRule, createDecisionType, queryApprovers } from "@/lib/actions/authority";
import type { ApproverResolution } from "@/lib/domain/authority-resolution";

type RoleT = { id: string; name: string };
type DecisionTypeT = { id: string; name: string };

export function CreateDecisionTypeForm({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await createDecisionType({ workspaceId, name });
          setName("");
          router.refresh();
        });
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New decision type, e.g. Contract Signature"
        required
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
        + Add decision type
      </button>
    </form>
  );
}

export function CreateRuleForm({
  workspaceId,
  decisionTypeId,
  roles,
}: {
  workspaceId: string;
  decisionTypeId: string;
  roles: RoleT[];
}) {
  const [approverRoleId, setApproverRoleId] = useState(roles[0]?.id ?? "");
  const [maxThreshold, setMaxThreshold] = useState("");
  const [coApprovalAboveThreshold, setCoApprovalAboveThreshold] = useState("");
  const [coApprovalRoleId, setCoApprovalRoleId] = useState("");
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
          const result = await createApprovalRule({
            workspaceId,
            decisionTypeId,
            approverRoleId,
            maxThreshold: Number(maxThreshold),
            coApprovalAboveThreshold: coApprovalAboveThreshold ? Number(coApprovalAboveThreshold) : undefined,
            coApprovalRoleId: coApprovalRoleId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid rule" : result.error);
            return;
          }
          setMaxThreshold("");
          setCoApprovalAboveThreshold("");
          router.refresh();
        });
      }}
    >
      <Field label="Approver role">
        <select value={approverRoleId} onChange={(e) => setApproverRoleId(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Up to ($)">
        <input type="number" min="0" step="0.01" value={maxThreshold} onChange={(e) => setMaxThreshold(e.target.value)} required className="w-32 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </Field>
      <Field label="Co-approval above ($)">
        <input type="number" min="0" step="0.01" value={coApprovalAboveThreshold} onChange={(e) => setCoApprovalAboveThreshold(e.target.value)} className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </Field>
      <Field label="Co-approver role">
        <select value={coApprovalRoleId} onChange={(e) => setCoApprovalRoleId(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
          <option value="">—</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
        + Add rule
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

export function QueryTool({ workspaceId, decisionTypeId }: { workspaceId: string; decisionTypeId: string }) {
  const [value, setValue] = useState("60000");
  const [result, setResult] = useState<ApproverResolution | null>(null);
  const [pending, startTransition] = useTransition();

  function runQuery(v: string) {
    setValue(v);
    startTransition(async () => {
      const res = await queryApprovers({ workspaceId, decisionTypeId, value: Number(v) || 0 });
      if (res.ok) setResult(res.data);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Who can approve this?</h3>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">$</span>
        <input
          value={value}
          onChange={(e) => runQuery(e.target.value)}
          className="w-32 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm"
        />
      </div>
      <div className="mt-2 flex gap-1.5">
        {[5000, 60000, 250000].map((v) => (
          <button key={v} type="button" onClick={() => runQuery(String(v))} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 hover:bg-slate-200">
            ${v.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
        {pending && <span className="text-slate-400">…</span>}
        {!pending && result?.gap && (
          <span className="font-semibold text-red-600">⚠ No authorized approver for this value.</span>
        )}
        {!pending && result && !result.gap && (
          <div className="flex flex-col gap-1">
            <span>✓ <b>{result.approverLabel}</b> can approve</span>
            {result.coApproverLabel ? (
              <span>✓ Co-approval required from <b>{result.coApproverLabel}</b></span>
            ) : (
              <span className="text-slate-400">No co-approval required</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export type { DecisionTypeT };
