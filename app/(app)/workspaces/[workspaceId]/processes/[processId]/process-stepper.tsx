import Link from "next/link";
import { computeProcessStepper, type StepperKey, type StepperStatus } from "@/lib/domain/process-stepper";

function hrefFor(key: StepperKey, workspaceId: string, processId: string): string {
  switch (key) {
    case "process":
      return `/workspaces/${workspaceId}/processes`;
    case "map":
      return `/workspaces/${workspaceId}/processes/${processId}/map`;
    case "raci":
      return `/workspaces/${workspaceId}/processes/${processId}/raci`;
    case "review":
      return `/workspaces/${workspaceId}/processes/${processId}/review`;
  }
}

const PILL_STYLES: Record<StepperStatus, string> = {
  done: "bg-emerald-50 hover:bg-emerald-100",
  current: "bg-amber-700 hover:bg-amber-800 shadow-sm",
  upcoming: "hover:bg-white",
  optional: "ml-1.5 hover:bg-white",
};

const NUM_STYLES: Record<StepperStatus, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-white text-amber-700",
  upcoming: "border border-slate-200 bg-white text-slate-400",
  optional: "border border-slate-200 bg-white text-slate-400",
};

const LABEL_STYLES: Record<StepperStatus, string> = {
  done: "text-emerald-700",
  current: "text-white",
  upcoming: "text-slate-600",
  optional: "text-slate-600",
};

export function ProcessStepper({
  workspaceId,
  processId,
  stepsCount,
  activitiesCount,
  raciStatus,
}: {
  workspaceId: string;
  processId: string;
  stepsCount: number;
  activitiesCount: number;
  raciStatus: "DRAFT" | "FINAL";
}) {
  const items = computeProcessStepper({ stepsCount, activitiesCount, raciStatus });

  return (
    <div className="mb-5 inline-flex max-w-full items-center gap-[3px] overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-[3px]">
      {items.map((item, i) => (
        <Link
          key={item.key}
          href={hrefFor(item.key, workspaceId, processId)}
          title={item.sub}
          aria-label={`${item.label} — ${item.sub}`}
          className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 transition active:scale-[0.98] ${PILL_STYLES[item.status]}`}
        >
          <span
            className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] font-bold ${NUM_STYLES[item.status]}`}
          >
            {item.status === "done" ? "✓" : i + 1}
          </span>
          <span className={`text-[12.5px] font-semibold ${LABEL_STYLES[item.status]}`}>
            {item.label}
            {item.status === "current" && (
              <span className="ml-1.5 rounded-full bg-white px-1.5 py-px text-[9px] font-bold tracking-wide text-amber-700">
                NEXT
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}
