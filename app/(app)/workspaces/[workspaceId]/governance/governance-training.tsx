"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import {
  addTrainingCompletion,
  addTrainingCourse,
  deleteTrainingCompletion,
  deleteTrainingCourse,
  updateTrainingCourse,
} from "@/lib/actions/people-governance";
import type { TrainingState } from "@/lib/domain/training";
import type { OwnerOptionT } from "./owner-select";

export type TrainingCourseT = {
  id: string;
  name: string;
  validityMonths: number | null;
  completions: {
    id: string;
    personLabel: string;
    completedOn: string; // YYYY-MM-DD
    expiresOn: string | null; // YYYY-MM-DD
    state: TrainingState;
  }[];
};

const STATE_LABEL: Record<TrainingState, string> = {
  CURRENT: "Current",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  NO_EXPIRY: "No expiry",
};
const STATE_STYLE: Record<TrainingState, string> = {
  CURRENT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  EXPIRING_SOON: "border-amber-300 bg-amber-50 text-amber-900",
  EXPIRED: "border-red-200 bg-red-50 text-red-700",
  NO_EXPIRY: "border-slate-200 bg-slate-50 text-slate-700",
};

const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";
const secondaryButton = "rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50";

const validityLabel = (months: number | null) =>
  months === null ? "Never expires" : `Valid for ${months} month${months === 1 ? "" : "s"}`;
const monthsFrom = (value: FormDataEntryValue | null) => (String(value ?? "").trim() ? Number(value) : null);

/**
 * Training records (spec 021): the courses a workspace requires, and who
 * completed each and when. Expiry is derived from the course's validity
 * period, so each completion reads Current, Expiring soon, Expired, or No
 * expiry.
 */
export function GovernanceTraining({
  workspaceId,
  courses,
  people,
}: {
  workspaceId: string;
  courses: TrainingCourseT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : "Could not save.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const livePeople = people.filter((p) => !p.archived);

  return (
    <section id="training" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Training</h2>
          <p className="text-slate-500">Required courses, who has completed them, and when each completion expires.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Add course
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(
              () =>
                addTrainingCourse({
                  workspaceId,
                  name: String(data.get("name") ?? ""),
                  validityMonths: monthsFrom(data.get("validityMonths")),
                }),
              () => setAdding(false)
            );
          }}
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <label className="flex items-center gap-1.5 font-medium text-slate-600">
            Course name
            <input name="name" required className={field} />
          </label>
          <label className="flex items-center gap-1.5 font-medium text-slate-600">
            Valid for (months, blank if it never expires)
            <input type="number" name="validityMonths" min={1} max={240} className={`${field} w-20`} />
          </label>
          <button type="submit" disabled={pending} className={primaryButton}>
            Add course
          </button>
        </form>
      )}

      {error && <p className="mb-2 font-medium text-red-600">{error}</p>}

      {courses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No courses defined.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((course) => {
            const editing = editingId === course.id;
            const count = course.completions.length;
            return (
              <li key={course.id} data-course={course.name} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900">{course.name}</h3>
                  <span className="text-slate-600">{validityLabel(course.validityMonths)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-expanded={editing}
                      onClick={() => setEditingId(editing ? null : course.id)}
                      className="ml-auto text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      {editing ? "Close" : "Edit course"}
                      <span className="sr-only">: {course.name}</span>
                    </button>
                  )}
                </div>

                {editing && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      run(
                        () =>
                          updateTrainingCourse({
                            workspaceId,
                            courseId: course.id,
                            name: String(data.get("name") ?? ""),
                            validityMonths: monthsFrom(data.get("validityMonths")),
                          }),
                        () => setEditingId(null)
                      );
                    }}
                    className="mb-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2"
                  >
                    <label className="flex items-center gap-1.5 font-medium text-slate-600">
                      Course name
                      <input name="name" required defaultValue={course.name} className={field} />
                    </label>
                    <label className="flex items-center gap-1.5 font-medium text-slate-600">
                      Valid for (months)
                      <input
                        type="number"
                        name="validityMonths"
                        min={1}
                        max={240}
                        defaultValue={course.validityMonths ?? ""}
                        className={`${field} w-20`}
                      />
                    </label>
                    <button type="submit" disabled={pending} className={primaryButton}>
                      Save course
                    </button>
                    {confirmingDeleteId === course.id ? (
                      <>
                        <span role="alert" className="text-slate-700">
                          Delete {course.name}
                          {count > 0 && (
                            <>
                              {" "}
                              and its {count} completion{count === 1 ? "" : "s"}
                            </>
                          )}
                          ?
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteTrainingCourse({ workspaceId, courseId: course.id }), () => setEditingId(null))}
                          className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700"
                        >
                          Delete course
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(course.id)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                      >
                        Delete course…
                      </button>
                    )}
                  </form>
                )}

                {count === 0 ? (
                  <p className="mb-2 text-slate-500">No completions recorded.</p>
                ) : (
                  <div className="mb-2 overflow-x-auto">
                    <table className="w-full text-left">
                      <caption className="sr-only">{course.name} completions</caption>
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          <th scope="col" className="pb-1 pr-2">
                            Person
                          </th>
                          <th scope="col" className="pb-1 pr-2">
                            Completed
                          </th>
                          <th scope="col" className="pb-1 pr-2">
                            Expires
                          </th>
                          <th scope="col" className="pb-1 pr-2">
                            State
                          </th>
                          {canEdit && (
                            <th scope="col" className="pb-1">
                              <span className="sr-only">Remove</span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {course.completions.map((c) => (
                          <tr key={c.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-1 pr-2 font-semibold text-slate-800">{c.personLabel}</td>
                            <td className="py-1 pr-2 text-slate-700">{c.completedOn}</td>
                            <td className="py-1 pr-2 text-slate-700">{c.expiresOn ?? "—"}</td>
                            <td className="py-1 pr-2">
                              <span className={`rounded-full border px-1.5 text-[10px] font-bold ${STATE_STYLE[c.state]}`}>
                                {STATE_LABEL[c.state]}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="py-1 text-right">
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => run(() => deleteTrainingCompletion({ workspaceId, completionId: c.id }))}
                                  aria-label={`Delete completion: ${c.personLabel}, ${c.completedOn}`}
                                  className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {canEdit && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const data = new FormData(form);
                      run(
                        () =>
                          addTrainingCompletion({
                            workspaceId,
                            courseId: course.id,
                            personId: String(data.get("personId") ?? ""),
                            completedOn: String(data.get("completedOn") ?? ""),
                          }),
                        () => form.reset()
                      );
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <select name="personId" required defaultValue="" aria-label={`Person who completed ${course.name}`} className={field}>
                      <option value="" disabled>
                        Choose a person…
                      </option>
                      {livePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      name="completedOn"
                      required
                      aria-label={`Date ${course.name} was completed`}
                      className={field}
                    />
                    <button type="submit" disabled={pending} className={secondaryButton}>
                      Record completion
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
