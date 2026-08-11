"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRole, archiveRole, createPerson, archivePerson } from "@/lib/actions/org";

type RoleOption = { id: string; name: string };

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
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">New role</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Controller"
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
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
      className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
    >
      Archive
    </button>
  );
}

export function AddPersonForm({ workspaceId, roles }: { workspaceId: string; roles: RoleOption[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
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
          });
          if (!result.ok) {
            setError(result.error === "VALIDATION_ERROR" ? result.message ?? "Invalid input" : result.error);
            return;
          }
          setName("");
          setEmail("");
          setRoleId("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Role</label>
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
      </div>
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
      className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
    >
      Archive
    </button>
  );
}
