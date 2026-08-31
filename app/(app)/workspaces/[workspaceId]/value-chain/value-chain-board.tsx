"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  boardTotals,
  groupByOwner,
  groupByPhase,
  ownerOptions,
  type ActivityCard,
  type PhaseRef,
} from "@/lib/domain/value-chain";
import { createActivity, setStepPhase } from "@/lib/actions/value-chain";

type ProcessRef = { id: string; code: string; name: string };
type RoleRef = { id: string; name: string };

/**
 * The engagement's value chain as a board: phases across, activities down.
 *
 * Every card is a real step on a real process — this is a second way to read
 * the same data the Process Map holds, not a second place to keep it — so
 * moving a card changes that step's phase and nothing else.
 */
export function ValueChainBoard({
  workspaceId,
  cards,
  phases,
  processes,
  roles,
}: {
  workspaceId: string;
  cards: ActivityCard[];
  phases: PhaseRef[];
  processes: ProcessRef[];
  roles: RoleRef[];
}) {
  const [groupBy, setGroupBy] = useState<"phase" | "owner">("phase");
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const filter = useMemo(() => ({ search, ownerId: ownerId || null }), [search, ownerId]);
  const columns = useMemo(
    () => (groupBy === "phase" ? groupByPhase(cards, phases, filter) : groupByOwner(cards, filter)),
    [groupBy, cards, phases, filter]
  );
  const totals = useMemo(() => boardTotals(cards, phases), [cards, phases]);
  const owners = useMemo(() => ownerOptions(cards), [cards]);

  function moveToPhase(stepId: string, phaseId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await setStepPhase({ workspaceId, stepId, phaseId: phaseId ?? "" });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not move") : result.error);
        return;
      }
      router.refresh();
    });
  }

  const shownCards = columns.reduce((n, column) => n + column.cards.length, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Stat label="Activities" value={totals.activities} />
        <Stat label="Phases" value={totals.phases} />
        <Stat label="Departments" value={totals.departments} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activity, owner, support…"
          aria-label="Search activities"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          Owner
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">All departments</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="group" aria-label="Group activities by">
          {(["phase", "owner"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={groupBy === mode}
              onClick={() => setGroupBy(mode)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                groupBy === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {mode === "phase" ? "By Phase" : "By Owner"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {(search || ownerId) && (
        <p className="mb-2 text-xs text-slate-600">
          {shownCards} of {totals.activities} activities match.
        </p>
      )}

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">
          Nothing to show yet — import a value chain, or add a phase and an activity.
        </p>
      ) : (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <section
              key={column.key}
              onDragOver={(e) => {
                if (groupBy === "phase" && dragging) e.preventDefault();
              }}
              onDrop={() => {
                if (groupBy !== "phase" || !dragging) return;
                moveToPhase(dragging, column.phaseId);
                setDragging(null);
              }}
              className="flex w-[264px] flex-none flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-2"
            >
              <h2 className="mb-2 flex items-center gap-2 px-1 py-1">
                {column.color && (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                )}
                <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-700">
                  {column.title}
                </span>
                <span className="flex-none rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-slate-600">
                  {column.cards.length}
                </span>
                {groupBy === "phase" && column.phaseId && (
                  <button
                    type="button"
                    onClick={() => setAddingTo(addingTo === column.key ? null : column.key)}
                    aria-label={`Add an activity to ${column.title}`}
                    className="ml-auto flex-none rounded-md px-1.5 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    +
                  </button>
                )}
              </h2>

              {addingTo === column.key && column.phaseId && (
                <NewActivityForm
                  workspaceId={workspaceId}
                  phaseId={column.phaseId}
                  phaseName={column.title}
                  processes={processes}
                  roles={roles}
                  onDone={() => {
                    setAddingTo(null);
                    router.refresh();
                  }}
                />
              )}

              <div className="flex flex-col gap-2">
                {column.cards.map((card) => (
                  <Card
                    key={card.stepId}
                    card={card}
                    workspaceId={workspaceId}
                    phases={phases}
                    draggable={groupBy === "phase"}
                    pending={pending}
                    onDragStart={() => setDragging(card.stepId)}
                    onDragEnd={() => setDragging(null)}
                    onPhaseChange={(phaseId) => moveToPhase(card.stepId, phaseId)}
                  />
                ))}
                {column.cards.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 px-2 py-4 text-center text-[11px] text-slate-500">
                    Nothing here
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Card({
  card,
  workspaceId,
  phases,
  draggable,
  pending,
  onDragStart,
  onDragEnd,
  onPhaseChange,
}: {
  card: ActivityCard;
  workspaceId: string;
  phases: PhaseRef[];
  draggable: boolean;
  pending: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPhaseChange: (phaseId: string | null) => void;
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/workspaces/${workspaceId}/processes/${card.processId}/map`}
          className="font-mono text-[10px] font-bold text-[var(--accent)] hover:underline"
        >
          {card.processCode}
        </Link>
        {card.isMilestone && <span className="flex-none text-[10px] text-amber-500">★</span>}
      </div>
      <h3 className="mt-0.5 text-[13px] font-semibold leading-tight text-slate-900">{card.label}</h3>
      {card.description && <p className="mt-1 text-[11px] leading-snug text-slate-600">{card.description}</p>}

      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-700">
        <div>{card.ownerName ? card.ownerName : <span className="text-slate-500">No owner yet</span>}</div>
        {card.supportNames.length > 0 && (
          <div className="text-slate-600">Support: {card.supportNames.join(", ")}</div>
        )}
      </div>

      {card.linksTo.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.linksTo.map((code) => (
            <span key={code} className="rounded-full bg-indigo-50 px-1.5 text-[9px] font-bold text-indigo-700">
              🔗 {code}
            </span>
          ))}
        </div>
      )}

      {/* The same move as dragging, reachable from the keyboard. Pointless when
          there's nowhere else to put the card, so it only appears once the
          workspace has a phase to move it to. */}
      {phases.length > 0 && (
      <label className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <select
          value={card.phaseId ?? ""}
          disabled={pending}
          onChange={(e) => onPhaseChange(e.target.value || null)}
          aria-label={`Phase for ${card.label}`}
          className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-600"
        >
          <option value="">— unphased —</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
      </label>
      )}
    </article>
  );
}

function NewActivityForm({
  workspaceId,
  phaseId,
  phaseName,
  processes,
  roles,
  onDone,
}: {
  workspaceId: string;
  phaseId: string;
  phaseName: string;
  processes: ProcessRef[];
  roles: RoleRef[];
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [processId, setProcessId] = useState(processes[0]?.id ?? "");
  const [ownerRoleId, setOwnerRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (processes.length === 0) {
    return (
      <p className="mb-2 rounded-lg border border-dashed border-slate-300 px-2 py-3 text-[11px] text-slate-600">
        Create a process first — an activity is a step on one.
      </p>
    );
  }

  return (
    <form
      className="mb-2 flex flex-col gap-1.5 rounded-lg border border-slate-300 bg-white p-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createActivity({
            workspaceId,
            processId,
            phaseId,
            label,
            ownerRoleId: ownerRoleId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not add") : result.error);
            return;
          }
          setLabel("");
          onDone();
        });
      }}
    >
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
        Activity in {phaseName}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          autoFocus
          placeholder="e.g. Offer Submission"
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
        On process
        <select
          value={processId}
          onChange={(e) => setProcessId(e.target.value)}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        >
          {processes.map((process) => (
            <option key={process.id} value={process.id}>
              {process.code} — {process.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
        Owner
        <select
          value={ownerRoleId}
          onChange={(e) => setOwnerRoleId(e.target.value)}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        >
          <option value="">— none yet —</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add activity"}
      </button>
    </form>
  );
}
