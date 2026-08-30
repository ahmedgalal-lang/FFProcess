"use client";

import { useState } from "react";
import { ProcessLandscapeCanvas, type LandscapeProcessInput } from "./landscape-canvas";
import { MilestoneRailsView } from "./milestone-rails-view";
import type { RailProcess } from "@/lib/domain/milestone-rails";

/**
 * Two ways to read the same engagement. Rails lead, because they say what each
 * process actually does and where one picks up from another; Cards stay for
 * the plain question of which processes exist and how they connect.
 */
export function HelicopterView({
  workspaceId,
  workspaceName,
  cardProcesses,
  railProcesses,
}: {
  workspaceId: string;
  workspaceName: string;
  cardProcesses: LandscapeProcessInput[];
  railProcesses: RailProcess[];
}) {
  const [mode, setMode] = useState<"rails" | "cards">("rails");

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="group" aria-label="Helicopter View mode">
        {(["rails", "cards"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            {m === "rails" ? "▤ Milestones" : "▭ Cards"}
          </button>
        ))}
      </div>

      {mode === "rails" ? (
        <MilestoneRailsView
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          processes={railProcesses}
        />
      ) : (
        <ProcessLandscapeCanvas
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          processes={cardProcesses}
        />
      )}
    </div>
  );
}
