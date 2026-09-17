"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReportArrangement } from "@/lib/actions/report-arrangement";
import {
  resolveArrangement,
  toStored,
  type ResolvedArrangement,
  type StoredArrangement,
} from "@/lib/domain/report-arrangement";
import { useCanEdit } from "../workspace-access";

type PickerProcess = { id: string; code: string; name: string };

/** Which blocks have nothing recorded in *any* process of this pack. */
export type EmptyBlockIds = readonly string[];

/**
 * The pick-and-arrange step for one exported pack.
 *
 * The order lives nowhere but this form. A native GET form serialises its
 * controls in DOM order, so moving a row *is* editing the report link's
 * sequence of `ids` — which is what the report then comes out in. Nothing is
 * written: arranging a pack for one audience can't disturb the workspace, the
 * next pack, or anyone else's view, because there is no stored order to
 * disturb. It also means an arranged report stays arranged when its link is
 * shared, since the arrangement is part of the link.
 *
 * Move buttons rather than drag-and-drop: they work from the keyboard alone,
 * which drag does not (Constitution Principle IV), and they match the Steps
 * List, which solves this same problem elsewhere in the product.
 */
export function ExportPickerForm({
  workspaceId,
  processes,
  arrangement,
  emptyBlockIds = [],
}: {
  workspaceId: string;
  processes: PickerProcess[];
  arrangement: ResolvedArrangement;
  emptyBlockIds?: EmptyBlockIds;
}) {
  const [ordered, setOrdered] = useState(processes);

  function move(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    next[index] = next[to]!;
    next[to] = ordered[index]!;
    setOrdered(next);
  }

  return (
    <>
      <ArrangePanels
        workspaceId={workspaceId}
        arrangement={arrangement}
        emptyBlockIds={emptyBlockIds}
      />

      <form action={`/reports/${workspaceId}`} method="GET">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-4 py-2">
                <span className="sr-only">Include</span>
              </th>
              <th scope="col" className="px-4 py-2">
                Code
              </th>
              <th scope="col" className="px-4 py-2">
                Process
              </th>
              <th scope="col" className="w-24 px-4 py-2 text-right">
                Order
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p, index) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="ids"
                    value={p.id}
                    defaultChecked
                    aria-label={`Include ${p.code} — ${p.name}`}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{p.code}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${p.code} earlier in the report`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1}
                      aria-label={`Move ${p.code} later in the report`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        The report follows the order above. Arranging it here changes this pack only — the
        Processes page and every other export are left as they are.
      </p>

      <button
        type="submit"
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Preview report →
      </button>
      </form>
    </>
  );
}

/**
 * Choosing what the pack is made of, and in what order.
 *
 * The working copy is held in the stored shape and handed to
 * `resolveArrangement` for display, so the numbers on screen come out of the
 * same function that numbers the document — there is no second numbering
 * implementation to drift from the first.
 *
 * Every change saves immediately. There is no Save button because there is
 * nothing to lose: a tick is a complete thought, and a consultant who ticks
 * three things and closes the tab meant all three.
 */
function ArrangePanels({
  workspaceId,
  arrangement,
  emptyBlockIds,
}: {
  workspaceId: string;
  arrangement: ResolvedArrangement;
  emptyBlockIds: EmptyBlockIds;
}) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<StoredArrangement>(() => toStored(arrangement));

  // Adjusting state when a prop changes: the server is the source of truth, so
  // a fresh arrangement arriving from it replaces the working copy rather than
  // being ignored — useState only ever takes its initial value, which has
  // frozen a table in this codebase before.
  const [seen, setSeen] = useState(arrangement);
  if (seen !== arrangement) {
    setSeen(arrangement);
    setDraft(toStored(arrangement));
  }

  // A viewer is shown none of this rather than controls the server refuses.
  // The export controls below are untouched: reading and exporting is most of
  // why a client is given an account.
  if (!canEdit) return null;

  const resolved = resolveArrangement(draft);

  function commit(next: StoredArrangement) {
    setDraft(next);
    startTransition(async () => {
      await saveReportArrangement({
        workspaceId,
        arrangement: { pack: next.pack, sections: next.sections, blocks: next.blocks },
      });
      router.refresh();
    });
  }

  function togglePack(id: string, on: boolean) {
    commit({ ...draft, pack: draft.pack.map((e) => (e.id === id ? { ...e, on } : e)) });
  }
  function toggleSection(id: string, on: boolean) {
    commit({ ...draft, sections: draft.sections.map((e) => (e.id === id ? { ...e, on } : e)) });
  }
  function toggleBlock(id: string, on: boolean) {
    commit({ ...draft, blocks: draft.blocks.map((e) => (e.id === id ? { ...e, on } : e)) });
  }

  function swap<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const to = i + dir;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    next[i] = list[to]!;
    next[to] = list[i]!;
    return next;
  }

  function movePack(id: string, dir: -1 | 1) {
    const i = draft.pack.findIndex((e) => e.id === id);
    commit({ ...draft, pack: swap(draft.pack, i, dir) });
  }

  /** A section carries its blocks: only the section list moves. */
  function moveSection(id: string, dir: -1 | 1) {
    const i = draft.sections.findIndex((e) => e.id === id);
    commit({ ...draft, sections: swap(draft.sections, i, dir) });
  }

  /**
   * Blocks move through one flat sequence of sections-and-their-blocks, which
   * is how a block steps past a heading into the next section. A pinned pair
   * travels as one unit, so a move never lands something between two halves of
   * a single table.
   */
  function moveBlock(id: string, dir: -1 | 1) {
    const flat: { kind: "section" | "block"; id: string }[] = [];
    for (const section of draft.sections) {
      flat.push({ kind: "section", id: section.id });
      for (const b of draft.blocks) if (b.sec === section.id) flat.push({ kind: "block", id: b.id });
    }
    const group = groupOf(id, draft);
    const at = flat.findIndex((e) => e.kind === "block" && e.id === group[0]);
    // Step past the whole group, not one row: moving a pinned pair down used
    // to find the pair's own second member as its neighbour and swap it with
    // itself, so the pair never moved at all.
    const to = dir === 1 ? at + group.length : at - 1;
    if (at < 0 || to < 0 || to >= flat.length) return;

    const neighbour = flat[to]!;
    const blocks = draft.blocks.filter((b) => !group.includes(b.id));
    const moving = group.map((gid) => draft.blocks.find((b) => b.id === gid)!);

    if (neighbour.kind === "section") {
      // Crossing a heading. Down adopts that section at its start; up lands at
      // the end of the section before it.
      const target =
        dir === 1
          ? neighbour.id
          : draft.sections[draft.sections.findIndex((s) => s.id === neighbour.id) - 1]?.id;
      if (!target) return;
      const seated = moving.map((b) => ({ ...b, sec: target }));
      const peers = blocks.reduce<number[]>((acc, b, i) => (b.sec === target ? [...acc, i] : acc), []);
      const anchor =
        peers.length === 0
          ? blocks.length
          : dir === 1
            ? peers[0]!
            : peers[peers.length - 1]! + 1;
      blocks.splice(anchor, 0, ...seated);
    } else {
      // Step over the neighbouring unit whole.
      const nb = groupOf(neighbour.id, draft);
      const seated = moving.map((b) => ({ ...b, sec: draft.blocks.find((x) => x.id === nb[0])!.sec }));
      const anchor =
        dir === 1
          ? blocks.findIndex((b) => b.id === nb[nb.length - 1]) + 1
          : blocks.findIndex((b) => b.id === nb[0]);
      blocks.splice(anchor, 0, ...seated);
    }
    commit({ ...draft, blocks });
  }

  const flatRows = resolved.sections.flatMap((section, si) => [
    { kind: "section" as const, section, si },
    ...section.blocks.map((block) => ({ kind: "block" as const, section, block, si })),
  ]);

  return (
    <>
      <Panel
        title="Pack sections"
        subtitle="The parts that appear once, around the processes. Untick one to leave it out of this client's pack."
      >
        {resolved.pack.map((section, i) => (
          <ArrangeRow
            key={section.id}
            title={section.title}
            on={section.on}
            locked={section.locked}
            canMoveUp={i > 0}
            canMoveDown={i < resolved.pack.length - 1}
            onToggle={(on) => togglePack(section.id, on)}
            onMove={(d) => movePack(section.id, d)}
          />
        ))}
      </Panel>

      <Panel
        title="Inside each process"
        subtitle="These repeat for every process. A section carries its blocks; a block can move past a section boundary into the next one. Numbers follow the order."
      >
        {flatRows.map((row) =>
          row.kind === "section" ? (
            <ArrangeRow
              key={row.section.id}
              title={row.section.title}
              num={row.section.number}
              on={row.section.on}
              canMoveUp={row.si > 0}
              canMoveDown={row.si < resolved.sections.length - 1}
              onToggle={(on) => toggleSection(row.section.id, on)}
              onMove={(d) => moveSection(row.section.id, d)}
            />
          ) : (
            <ArrangeRow
              key={row.block.id}
              title={row.block.title}
              num={row.block.number}
              on={row.block.on}
              indented
              emptyEverywhere={emptyBlockIds.includes(row.block.id)}
              moveNote={
                row.block.pinnedTo
                  ? `moves with ${
                      resolved.sections
                        .flatMap((s) => s.blocks)
                        .find((b) => b.id === row.block.pinnedTo)?.title ?? "the block above"
                    }`
                  : undefined
              }
              canMoveUp
              canMoveDown
              onToggle={(on) => toggleBlock(row.block.id, on)}
              onMove={(d) => moveBlock(row.block.id, d)}
            />
          )
        )}
      </Panel>
    </>
  );
}

/** A block and anything pinned to it, in print order. */
function groupOf(id: string, draft: StoredArrangement): string[] {
  const pinnedToThis = PINNED_PAIRS.find((pair) => pair.includes(id));
  if (!pinnedToThis) return [id];
  return pinnedToThis.filter((pid) => draft.blocks.some((b) => b.id === pid));
}

/** Mirrors the catalogue's `pinnedTo`, in the order the pair prints. */
const PINNED_PAIRS: readonly (readonly string[])[] = [["raciGrid", "rules"]];
/* ---------------------------------------------------------------- */
/* Arranging the pack                                                */
/* ---------------------------------------------------------------- */

/** One row's worth of controls, shared by all three panels. */
function ArrangeRow({
  title,
  note,
  num,
  on,
  locked,
  indented,
  emptyEverywhere,
  moveNote,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
}: {
  title: string;
  note?: string;
  num?: string | null;
  on: boolean;
  locked?: boolean;
  indented?: boolean;
  emptyEverywhere?: boolean;
  /** Set when this row travels with another and has no arrows of its own. */
  moveNote?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (on: boolean) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const id = `arr-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div
      className={`flex items-center gap-2.5 border-t border-slate-100 px-4 py-2 ${
        indented ? "pl-10" : ""
      } ${on ? "" : "bg-slate-50"}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={on}
        disabled={locked}
        aria-label={`Include ${title}`}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 flex-none rounded border-slate-300 accent-slate-900"
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 items-baseline gap-2">
        {num !== undefined && (
          <span className="w-9 flex-none font-mono text-xs font-semibold text-slate-700 tabular-nums">
            {num ?? "—"}
          </span>
        )}
        <span
          className={`text-sm ${indented ? "font-normal" : "font-semibold"} ${
            on ? "text-slate-900" : "text-slate-600 line-through decoration-slate-300"
          }`}
        >
          {title}
        </span>
        {note && <span className="text-xs text-slate-600">{note}</span>}
      </label>

      {emptyEverywhere && on && (
        <span className="flex-none rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          no data yet
        </span>
      )}

      {moveNote ? (
        <span className="flex-none text-xs italic text-slate-600">{moveNote}</span>
      ) : (
        <span className="flex flex-none gap-1">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onMove(d)}
              disabled={d === -1 ? !canMoveUp : !canMoveDown}
              aria-label={`Move ${title} ${d === -1 ? "earlier" : "later"} in the report`}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {d === -1 ? "↑" : "↓"}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-0.5 mb-2 text-xs text-slate-600">{subtitle}</p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{children}</div>
    </section>
  );
}
