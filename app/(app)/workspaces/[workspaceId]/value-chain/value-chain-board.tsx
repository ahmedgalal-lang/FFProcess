"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  boardTotals,
  groupByOwner,
  groupByPhase,
  ownerOptions,
  type ActivityCard,
  type BoardColumn,
  type PhaseRef,
} from "@/lib/domain/value-chain";
import {
  createActivity,
  deletePhase,
  moveActivityInPhase,
  movePhase,
  renamePhase,
  setStepPhase,
  updateActivity,
} from "@/lib/actions/value-chain";
import { deleteProcessStep } from "@/lib/actions/process";

type ProcessRef = { id: string; code: string; name: string };
type RoleRef = { id: string; name: string };

/** How far the pointer must travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 5;

/**
 * The engagement's value chain as a board: phases across, activities down.
 *
 * Every card is a real step on a real process — this is a second way to read
 * and edit the same data the Process Map holds, not a second place to keep it —
 * so moving or editing a card changes that step itself.
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
  const [editing, setEditing] = useState<string | null>(null);
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

  const moveToPhase = useCallback(
    (stepId: string, phaseId: string | null) => {
      setError(null);
      startTransition(async () => {
        const result = await setStepPhase({ workspaceId, stepId, phaseId: phaseId ?? "" });
        if (!result.ok) {
          setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not move") : result.error);
          return;
        }
        router.refresh();
      });
    },
    [workspaceId, router]
  );

  const moveWithinPhase = useCallback(
    (stepId: string, direction: "UP" | "DOWN") => {
      setError(null);
      startTransition(async () => {
        const result = await moveActivityInPhase({ workspaceId, stepId, direction });
        if (!result.ok) {
          setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not move") : result.error);
          return;
        }
        router.refresh();
      });
    },
    [workspaceId, router]
  );

  const drag = useCardDrag({
    enabled: groupBy === "phase",
    onDrop: moveToPhase,
    onClick: (stepId) => setEditing(stepId),
  });

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
        <div
          className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
          role="group"
          aria-label="Group activities by"
        >
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
      <p className="mb-2 text-xs text-slate-600">
        {search || ownerId ? `${shownCards} of ${totals.activities} activities match. ` : ""}
        {groupBy === "phase"
          ? "Click a card to edit it, drag it to another phase, or use ▲▼ to order it within its phase."
          : "Grouped by department — switch to By Phase to move activities."}
      </p>

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">
          Nothing to show yet — import a value chain, or add a phase and an activity.
        </p>
      ) : (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <Column
              key={column.key}
              workspaceId={workspaceId}
              column={column}
              isDropTarget={groupBy === "phase" && drag.overColumnKey === column.key}
              canAdd={groupBy === "phase" && column.phaseId !== null}
              isAdding={addingTo === column.key}
              onToggleAdd={() => setAddingTo(addingTo === column.key ? null : column.key)}
              phaseIndex={phases.findIndex((phase) => phase.id === column.phaseId)}
              phaseCount={phases.length}
              onChanged={() => router.refresh()}
            >
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

              {column.cards.map((card, index) =>
                editing === card.stepId ? (
                  <EditActivityForm
                    key={card.stepId}
                    workspaceId={workspaceId}
                    card={card}
                    roles={roles}
                    onDone={() => {
                      setEditing(null);
                      router.refresh();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <Card
                    key={card.stepId}
                    card={card}
                    workspaceId={workspaceId}
                    phases={phases}
                    pending={pending}
                    isDragging={drag.stepId === card.stepId}
                    draggable={groupBy === "phase"}
                    onPointerDown={(e) => drag.onPointerDown(e, card.stepId)}
                    onEdit={() => setEditing(card.stepId)}
                    onPhaseChange={(phaseId) => moveToPhase(card.stepId, phaseId)}
                    canMove={groupBy === "phase"}
                    isFirst={index === 0}
                    isLast={index === column.cards.length - 1}
                    onMove={(direction) => moveWithinPhase(card.stepId, direction)}
                  />
                )
              )}

              {column.cards.length === 0 && !(addingTo === column.key) && (
                <p className="rounded-lg border border-dashed border-slate-300 px-2 py-4 text-center text-[11px] text-slate-500">
                  {drag.stepId ? "Drop here" : "Nothing here"}
                </p>
              )}
            </Column>
          ))}
        </div>
      )}

      {drag.ghost && (
        <div
          className="pointer-events-none fixed z-50 w-[240px] rounded-lg border border-[var(--accent)] bg-white p-2.5 text-[13px] font-semibold text-slate-900 shadow-lg"
          style={{ left: drag.ghost.x + 12, top: drag.ghost.y + 12 }}
          aria-hidden="true"
        >
          {drag.ghost.label}
        </div>
      )}
    </div>
  );
}

/**
 * Dragging a card, on pointer events rather than HTML5 drag-and-drop: it works
 * the same with a mouse, a trackpad and a finger, and a press that doesn't move
 * stays a click, so the same gesture can open the card for editing.
 */
function useCardDrag({
  enabled,
  onDrop,
  onClick,
}: {
  enabled: boolean;
  onDrop: (stepId: string, phaseId: string | null) => void;
  onClick: (stepId: string) => void;
}) {
  const [stepId, setStepId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null);
  const press = useRef<{ stepId: string; label: string; x: number; y: number; moved: boolean } | null>(null);

  const columnAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest<HTMLElement>("[data-column-key]") ?? null;
  };

  // Attached for the life of the board rather than only while a press is in
  // flight: the press is held in a ref, and a ref changing doesn't re-run an
  // effect, so a guard here would mean the very first press had no listener to
  // finish it. Both handlers do nothing when there is no press.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      const current = press.current;
      if (!current) return;

      if (!current.moved) {
        const far =
          Math.abs(event.clientX - current.x) > DRAG_THRESHOLD_PX ||
          Math.abs(event.clientY - current.y) > DRAG_THRESHOLD_PX;
        if (!far) return;
        current.moved = true;
        setStepId(current.stepId);
      }

      setGhost({ x: event.clientX, y: event.clientY, label: current.label });
      const column = columnAt(event.clientX, event.clientY);
      setOverColumnKey(column?.dataset["columnKey"] ?? null);
    }

    function onUp(event: PointerEvent) {
      const current = press.current;
      press.current = null;
      setStepId(null);
      setGhost(null);
      setOverColumnKey(null);
      if (!current) return;

      // A press that never moved is a click — open the card instead of moving it.
      if (!current.moved) {
        onClick(current.stepId);
        return;
      }

      const column = columnAt(event.clientX, event.clientY);
      const key = column?.dataset["columnKey"];
      if (!key) return;
      const phaseId = column?.dataset["phaseId"] || null;
      onDrop(current.stepId, phaseId);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onDrop, onClick]);

  return {
    stepId,
    ghost,
    overColumnKey,
    onPointerDown(event: React.PointerEvent, cardStepId: string) {
      if (!enabled || event.button !== 0) return;
      // Let the card's own controls — its links and its phase select — behave
      // normally rather than starting a drag.
      if ((event.target as HTMLElement).closest("a,select,button,input,textarea")) return;
      const label = (event.currentTarget as HTMLElement).querySelector("h3")?.textContent ?? "";
      press.current = { stepId: cardStepId, label, x: event.clientX, y: event.clientY, moved: false };
      setStepId(null);
    },
  };
}

function Column({
  workspaceId,
  column,
  isDropTarget,
  canAdd,
  isAdding,
  onToggleAdd,
  phaseIndex,
  phaseCount,
  onChanged,
  children,
}: {
  workspaceId: string;
  column: BoardColumn;
  isDropTarget: boolean;
  canAdd: boolean;
  isAdding: boolean;
  onToggleAdd: () => void;
  /** Position among the phases, or -1 for a column that isn't one. */
  phaseIndex: number;
  phaseCount: number;
  onChanged: () => void;
  children: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const phaseId = column.phaseId;
  const managed = canAdd && phaseId !== null;

  function run(work: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save") : result.error!);
        return;
      }
      onChanged();
    });
  }

  return (
    <section
      data-column-key={column.key}
      data-phase-id={column.phaseId ?? ""}
      className={`flex w-[264px] flex-none flex-col rounded-xl border p-2 transition-colors ${
        isDropTarget ? "border-[var(--accent)] bg-slate-100" : "border-slate-200 bg-slate-50/70"
      }`}
    >
      {renaming !== null && phaseId ? (
        <div className="mb-2 flex items-center gap-1 px-1">
          <input
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenaming(null);
              if (e.key !== "Enter") return;
              e.preventDefault();
              const name = renaming;
              setRenaming(null);
              run(() => renamePhase({ workspaceId, phaseId, name }));
            }}
            aria-label={`Rename ${column.title}`}
            autoFocus
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const name = renaming;
              setRenaming(null);
              run(() => renamePhase({ workspaceId, phaseId, name }));
            }}
            className="flex-none rounded bg-slate-900 px-1.5 py-1 text-[10px] font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(null)}
            className="flex-none rounded border border-slate-300 px-1.5 py-1 text-[10px] font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <h2 className="mb-2 flex items-center gap-1.5 px-1 py-1">
          {column.color && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ backgroundColor: column.color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-700">
            {column.title}
          </span>
          <span className="flex-none rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-slate-600">
            {column.cards.length}
          </span>
          {canAdd && (
            <button
              type="button"
              onClick={onToggleAdd}
              aria-expanded={isAdding}
              aria-label={`Add an activity to ${column.title}`}
              className="flex-none rounded-md px-1 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-900"
            >
              +
            </button>
          )}
        </h2>
      )}

      {/* Managing the phase itself, on the column rather than tucked away in a
          panel — this is where someone is looking when they decide a stage is
          misnamed, in the wrong place, or not a stage at all. */}
      {managed && renaming === null && (
        <div className="mb-2 flex items-center gap-0.5 px-1">
          {confirmingDelete ? (
            <>
              <span className="text-[10px] text-slate-600">Delete phase?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmingDelete(false);
                  run(() => deletePhase({ workspaceId, phaseId }));
                }}
                className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-60"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
              >
                No
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending || phaseIndex <= 0}
                onClick={() => run(() => movePhase({ workspaceId, phaseId, direction: "LEFT" }))}
                aria-label={`Move ${column.title} earlier`}
                title="Move earlier"
                className="rounded px-1 text-[11px] text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30"
              >
                ←
              </button>
              <button
                type="button"
                disabled={pending || phaseIndex === -1 || phaseIndex >= phaseCount - 1}
                onClick={() => run(() => movePhase({ workspaceId, phaseId, direction: "RIGHT" }))}
                aria-label={`Move ${column.title} later`}
                title="Move later"
                className="rounded px-1 text-[11px] text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setRenaming(column.title)}
                aria-label={`Rename ${column.title}`}
                className="rounded px-1.5 text-[10px] font-semibold text-slate-500 hover:bg-white hover:text-slate-900"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete ${column.title}`}
                className="ml-auto rounded px-1.5 text-[10px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="mb-1.5 px-1 text-[10px] text-red-600">{error}</p>}
      {/* The column scrolls inside itself rather than stretching the page: one
          phase holding everything unplaced would otherwise leave every other
          column stranded at the top of a very long scroll. */}
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </section>
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
  pending,
  isDragging,
  draggable,
  onPointerDown,
  onEdit,
  onPhaseChange,
  canMove,
  isFirst,
  isLast,
  onMove,
}: {
  card: ActivityCard;
  workspaceId: string;
  phases: PhaseRef[];
  pending: boolean;
  isDragging: boolean;
  draggable: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onEdit: () => void;
  onPhaseChange: (phaseId: string | null) => void;
  canMove: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "UP" | "DOWN") => void;
}) {
  return (
    <article
      onPointerDown={onPointerDown}
      className={`rounded-lg border bg-white p-2.5 shadow-sm ${draggable ? "cursor-grab" : ""} ${
        isDragging ? "border-[var(--accent)] opacity-40" : "border-slate-200"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/workspaces/${workspaceId}/processes/${card.processId}/map`}
          className="font-mono text-[10px] font-bold text-[var(--accent)] hover:underline"
        >
          {card.processCode}
        </Link>
        <div className="flex flex-none items-center gap-0.5">
          {card.isMilestone && <span className="mr-0.5 text-[10px] text-amber-500">★</span>}
          {canMove && (
            <>
              <button
                type="button"
                disabled={pending || isFirst}
                onClick={onMove.bind(null, "UP")}
                aria-label={`Move ${card.label} up in this phase`}
                title="Move up"
                className="rounded px-1 text-[10px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={pending || isLast}
                onClick={onMove.bind(null, "DOWN")}
                aria-label={`Move ${card.label} down in this phase`}
                title="Move down"
                className="rounded px-1 text-[10px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
              >
                ▼
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${card.label}`}
            className="rounded px-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            Edit
          </button>
        </div>
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

      {/* The same move as dragging, reachable from a keyboard. */}
      {phases.length > 0 && (
        <select
          value={card.phaseId ?? ""}
          disabled={pending}
          onChange={(e) => onPhaseChange(e.target.value || null)}
          aria-label={`Phase for ${card.label}`}
          className="mt-2 w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-600"
        >
          <option value="">— unphased —</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

function EditActivityForm({
  workspaceId,
  card,
  roles,
  onDone,
  onCancel,
}: {
  workspaceId: string;
  card: ActivityCard;
  roles: RoleRef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(card.label);
  const [ownerRoleId, setOwnerRoleId] = useState(card.ownerId ?? "");
  const [description, setDescription] = useState(card.description);
  const [supportIds, setSupportIds] = useState<string[]>(card.supportIds);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-lg border border-[var(--accent)] bg-white p-2.5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateActivity({
            workspaceId,
            stepId: card.stepId,
            label,
            ownerRoleId: ownerRoleId || undefined,
            supportingRoleIds: supportIds,
            description: description || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save") : result.error);
            return;
          }
          onDone();
        });
      }}
    >
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
        Activity
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          autoFocus
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="mt-1.5 flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
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

      <label className="mt-1.5 flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
      </label>

      <fieldset className="mt-1.5">
        <legend className="text-[10px] font-medium text-slate-600">Supporting departments</legend>
        <div className="mt-1 max-h-28 overflow-y-auto rounded border border-slate-200 p-1.5">
          {roles.length === 0 && <p className="text-[10px] text-slate-500">No departments yet.</p>}
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-1.5 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={supportIds.includes(role.id)}
                onChange={(e) =>
                  setSupportIds((prev) =>
                    e.target.checked ? [...prev, role.id] : prev.filter((id) => id !== role.id)
                  )
                }
              />
              {role.name}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="mt-1.5 text-[10px] text-red-600">{error}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        {confirmingDelete ? (
          <>
            <span className="text-[10px] text-slate-600">Delete?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await deleteProcessStep({
                    workspaceId,
                    processId: card.processId,
                    stepId: card.stepId,
                  });
                  if (!result.ok) {
                    setError(
                      result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not delete") : result.error
                    );
                    return;
                  }
                  onDone();
                });
              }}
              className="rounded bg-red-600 px-1.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold text-slate-700"
            >
              No
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${card.label}`}
            className="ml-auto rounded px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            Delete
          </button>
        )}
      </div>
    </form>
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
      <p className="rounded-lg border border-dashed border-slate-300 px-2 py-3 text-[11px] text-slate-600">
        Create a process first — an activity is a step on one.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg border border-slate-300 bg-white p-2"
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
