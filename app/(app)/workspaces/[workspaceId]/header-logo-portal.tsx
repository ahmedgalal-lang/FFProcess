"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

// Portals the current workspace's logo into the top app header (a fixed slot
// rendered by app/(app)/layout.tsx, which sits above this route segment and
// has no access to workspace data itself) — placed next to the FF mark so
// consultants see whose engagement they're in without leaving the header.
export function HeaderLogoPortal({
  logoDataUrl,
  workspaceName,
}: {
  logoDataUrl: string | null;
  workspaceName: string;
}) {
  // Hydration-safe "is this running on the client yet" check — document only
  // exists client-side, so the portal target can't be looked up during SSR.
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isClient || !logoDataUrl) return null;
  const slot = document.getElementById("header-workspace-logo");
  if (!slot) return null;

  return createPortal(
    <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset */}
      <img src={logoDataUrl} alt={`${workspaceName} logo`} className="h-6 max-w-[96px] rounded object-contain" />
    </div>,
    slot
  );
}
