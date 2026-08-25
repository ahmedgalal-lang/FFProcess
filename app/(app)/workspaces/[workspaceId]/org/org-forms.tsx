"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRole,
  updateRole,
  archiveRole,
  createPerson,
  updatePerson,
  archivePerson,
  updatePersonManager,
} from "@/lib/actions/org";

type RoleOption = { id: string; name: string };
type PersonOption = { id: string; name: string };

export function AddRoleForm({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createRole({ workspaceId, name });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid name" : result.error);
            return;
          }
          setName("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        New role
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Controller"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        Add role
      </button>
      {error && <span className="self-center text-xs text-red-600">{error}</span>}
    </form>
  );
}

export function RoleRow({ workspaceId, role }: { workspaceId: string; role: RoleOption }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (editing) {
    return (
      <tr className="border-t border-slate-100 bg-indigo-50/30">
        <td colSpan={2} className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await updateRole({ workspaceId, roleId: role.id, name });
                  if (!result.ok) {
                    setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid name") : result.error);
                    return;
                  }
                  setEditing(false);
                  router.refresh();
                })
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(role.name);
                setError(null);
                setEditing(false);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2 font-medium text-slate-900">{role.name}</td>
      <td className="px-4 py-2 text-right">
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Delete?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await archiveRole({ workspaceId, roleId: role.id });
                  router.refresh();
                })
              }
              className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              No
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs font-medium text-slate-600 hover:text-red-600"
            >
              Delete
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

export function AddPersonForm({
  workspaceId,
  roles,
  people,
}: {
  workspaceId: string;
  roles: RoleOption[];
  people: PersonOption[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createPerson({
            workspaceId,
            name,
            email,
            roleIds: roleId ? [roleId] : [],
            managerId: managerId || undefined,
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setEmail("");
          setRoleId("");
          setManagerId("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Role
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">—</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Reports to
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— no manager —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        Add person
      </button>
      {error && <span className="self-center text-xs text-red-600">{error}</span>}
    </form>
  );
}

export function ManagerPicker({
  workspaceId,
  personId,
  personName,
  managerId,
  people,
}: {
  workspaceId: string;
  personId: string;
  personName: string;
  managerId: string | null;
  people: PersonOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-0.5">
      <select
        aria-label={`${personName}'s manager`}
        defaultValue={managerId ?? ""}
        disabled={pending}
        onChange={(e) => {
          setError(null);
          const value = e.target.value || null;
          startTransition(async () => {
            const result = await updatePersonManager({ workspaceId, personId, managerId: value });
            if (!result.ok) {
              setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Could not update" : result.error);
              e.target.value = managerId ?? ""; // revert the select on failure
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-60"
      >
        <option value="">— no manager —</option>
        {people
          .filter((p) => p.id !== personId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

type PersonRowT = {
  id: string;
  name: string;
  email: string | null;
  managerId: string | null;
  roleIds: string[];
};

export function PersonRow({
  workspaceId,
  person,
  allRoles,
  people,
}: {
  workspaceId: string;
  person: PersonRowT;
  allRoles: RoleOption[];
  people: PersonOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email ?? "");
  const [roleIds, setRoleIds] = useState<string[]>(person.roleIds);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function startEdit() {
    setName(person.name);
    setEmail(person.email ?? "");
    setRoleIds(person.roleIds);
    setError(null);
    setEditing(true);
  }

  function toggleRole(roleId: string) {
    setRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  if (editing) {
    return (
      <tr className="border-t border-slate-100 bg-indigo-50/30">
        <td colSpan={5} className="px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Roles</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {allRoles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                    {r.name}
                  </label>
                ))}
                {allRoles.length === 0 && <span className="text-xs text-slate-400">No roles yet</span>}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await updatePerson({ workspaceId, personId: person.id, name, email, roleIds });
                  if (!result.ok) {
                    setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Invalid input") : result.error);
                    return;
                  }
                  setEditing(false);
                  router.refresh();
                })
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            {error && <span className="self-center text-xs text-red-600">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2 font-medium text-slate-900">{person.name}</td>
      <td className="px-4 py-2 text-slate-500">{person.email ?? "—"}</td>
      <td className="px-4 py-2">
        {allRoles
          .filter((r) => person.roleIds.includes(r.id))
          .map((r) => (
            <span key={r.id} className="mr-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {r.name}
            </span>
          ))}
      </td>
      <td className="px-4 py-2">
        <ManagerPicker
          workspaceId={workspaceId}
          personId={person.id}
          personName={person.name}
          managerId={person.managerId}
          people={people}
        />
      </td>
      <td className="px-4 py-2 text-right">
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Delete?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await archivePerson({ workspaceId, personId: person.id });
                  router.refresh();
                })
              }
              className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              No
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <button type="button" onClick={startEdit} className="text-xs font-medium text-slate-600 hover:text-slate-900">
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs font-medium text-slate-600 hover:text-red-600"
            >
              Delete
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
