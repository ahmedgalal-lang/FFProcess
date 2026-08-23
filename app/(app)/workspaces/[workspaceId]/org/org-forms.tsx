"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRole, archiveRole, createPerson, archivePerson, updatePersonManager } from "@/lib/actions/org";

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

export function ArchiveRoleButton({ workspaceId, roleId }: { workspaceId: string; roleId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await archiveRole({ workspaceId, roleId });
          router.refresh();
        })
      }
      className="text-xs font-medium text-slate-600 hover:text-red-600 disabled:opacity-50"
    >
      Archive
    </button>
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

export function ArchivePersonButton({ workspaceId, personId }: { workspaceId: string; personId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await archivePerson({ workspaceId, personId });
          router.refresh();
        })
      }
      className="text-xs font-medium text-slate-600 hover:text-red-600 disabled:opacity-50"
    >
      Archive
    </button>
  );
}
