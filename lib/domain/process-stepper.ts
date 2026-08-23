/**
 * The build-sequence stepper shown atop every Process Map/RACI/Review page:
 * Process -> Process Map -> RACI Matrix -> (optional) AI Review. Status is
 * derived from real counts already in the database — never a separate
 * "progress" field that could drift out of sync. Pure and framework-free
 * (Constitution Principle III): "what counts as done" here decides what a
 * consultant is told to build next, which is a real governance signal, not
 * pure styling.
 */

export type StepperStatus = "done" | "current" | "upcoming" | "optional";
export type StepperKey = "process" | "map" | "raci" | "review";

export type StepperItem = {
  key: StepperKey;
  label: string;
  sub: string;
  status: StepperStatus;
};

export function computeProcessStepper(data: {
  stepsCount: number;
  activitiesCount: number;
  raciStatus: "DRAFT" | "FINAL";
}): StepperItem[] {
  const mapDone = data.stepsCount > 0;
  const raciDone = data.raciStatus === "FINAL";
  const raciStarted = data.activitiesCount > 0;

  const items: StepperItem[] = [
    { key: "process", label: "Process", sub: "Created", status: "done" },
    {
      key: "map",
      label: "Process Map",
      sub: mapDone ? `${data.stepsCount} step${data.stepsCount === 1 ? "" : "s"} added` : "Add the first step",
      status: mapDone ? "done" : "current",
    },
  ];

  if (mapDone) {
    items.push({
      key: "raci",
      label: "RACI Matrix",
      sub: raciDone
        ? "Finalized"
        : raciStarted
          ? `${data.activitiesCount} activit${data.activitiesCount === 1 ? "y" : "ies"} assigned`
          : "Assign responsibility per step",
      status: raciDone ? "done" : "current",
    });
  } else {
    items.push({ key: "raci", label: "RACI Matrix", sub: "Map the steps first", status: "upcoming" });
  }

  items.push({ key: "review", label: "AI Review", sub: "Optional — run anytime", status: "optional" });
  return items;
}
