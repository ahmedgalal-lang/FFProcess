"use client";

export type OwnerOptionT = { id: string; name: string; archived: boolean };

/** The select's value for an owner: `role:<id>`, `person:<id>`, or "" for none. */
export function ownerValue(roleId: string | null, personId: string | null): string {
  return roleId ? `role:${roleId}` : personId ? `person:${personId}` : "";
}

/** Splits an owner select's value back into the role/person pair the actions take. */
export function parseOwnerValue(value: string): { ownerRoleId: string | null; ownerPersonId: string | null } {
  return {
    ownerRoleId: value.startsWith("role:") ? value.slice(5) : null,
    ownerPersonId: value.startsWith("person:") ? value.slice(7) : null,
  };
}

/**
 * A governance record's owner: a role or a person from the workspace
 * directory. Archived ones aren't offered, except the current owner, who
 * stays selectable (and labelled) so saving doesn't silently unassign them.
 */
export function OwnerSelect({
  name,
  label,
  roles,
  people,
  defaultValue = "",
  className,
}: {
  name: string;
  label: string;
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
  defaultValue?: string;
  className?: string;
}) {
  const keep = (prefix: string) => (o: OwnerOptionT) => !o.archived || defaultValue === `${prefix}:${o.id}`;
  const text = (o: OwnerOptionT) => `${o.name}${o.archived ? " (archived)" : ""}`;
  return (
    <select name={name} aria-label={label} defaultValue={defaultValue} className={className}>
      <option value="">Unassigned</option>
      <optgroup label="Roles">
        {roles.filter(keep("role")).map((r) => (
          <option key={r.id} value={`role:${r.id}`}>
            {text(r)}
          </option>
        ))}
      </optgroup>
      <optgroup label="People">
        {people.filter(keep("person")).map((p) => (
          <option key={p.id} value={`person:${p.id}`}>
            {text(p)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
