"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "", label: "Dashboard" },
  { href: "/org", label: "Org Directory" },
  { href: "/processes", label: "Processes" },
  { href: "/helicopter", label: "Helicopter View" },
  { href: "/value-chain", label: "Value Chain" },
  { href: "/governance", label: "Governance" },
  { href: "/members", label: "Members" },
  { href: "/export", label: "Export Report" },
];

export function WorkspaceSidebar({
  workspaceId,
  workspaceName,
  logoDataUrl,
  isFirmOwnerAccess,
}: {
  workspaceId: string;
  workspaceName: string;
  logoDataUrl: string | null;
  isFirmOwnerAccess: boolean;
}) {
  const pathname = usePathname();
  // Plain component state — this sidebar doesn't remount when navigating between
  // pages within the same Workspace (they share this layout), so the collapsed
  // choice already survives page-to-page navigation without needing to persist it.
  const [collapsed, setCollapsed] = useState(false);

  function toggle() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="relative flex flex-none">
      <nav
        className={`flex-none overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-150 ${
          collapsed ? "w-0" : "w-56"
        }`}
      >
        <div className="w-56 px-3 py-5">
          <div className="mb-4 px-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspace</div>
            <div className="mt-1 flex items-center gap-2">
              {logoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
                <img src={logoDataUrl} alt="" className="h-6 w-6 flex-none rounded object-contain" />
              )}
              <div className="truncate text-sm font-semibold text-slate-900">{workspaceName}</div>
            </div>
            {isFirmOwnerAccess && (
              <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                ★ Firm Owner access
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const fullHref = `/workspaces/${workspaceId}${item.href}`;
              const isActive = item.href === "" ? pathname === fullHref : pathname?.startsWith(fullHref);
              return (
                <li key={item.href}>
                  <Link
                    href={fullHref}
                    className={`block rounded-lg border-l-2 py-1.5 pl-2 pr-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-[var(--accent)] bg-slate-50 text-[var(--accent)]"
                        : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-slate-200 pt-3">
            <Link
              href="/workspaces"
              className="block rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              ← All workspaces
            </Link>
          </div>
        </div>
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Show workspace sidebar" : "Hide workspace sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Show sidebar" : "Hide sidebar"}
        className={`absolute top-4 z-20 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-900 ${
          collapsed ? "left-0" : "left-56"
        }`}
      >
        <span aria-hidden="true" className="text-[10px]">
          {collapsed ? "›" : "‹"}
        </span>
      </button>
    </div>
  );
}
