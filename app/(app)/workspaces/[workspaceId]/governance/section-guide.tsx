"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { SECTION_GUIDES, type SectionGuideId } from "@/lib/domain/section-guides";

const TABS = [
  { key: "why", label: "Why it matters" },
  { key: "how", label: "How to fill it in" },
  { key: "eval", label: "How to evaluate it" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Opening one guide closes any other on the page. */
const OPEN_EVENT = "section-guide-open";

/**
 * The ⓘ beside a Governance section heading, and the guide it opens
 * (spec 030): why the section matters, how to fill it in, and how to judge
 * the result. A non-modal dialog: Esc, × or a click elsewhere closes it, and
 * Esc and × put focus back on the button. It sits beside the heading, never
 * inside it, so the heading's own name is unchanged.
 */
export function SectionGuide({ id }: { id: SectionGuideId }) {
  const guide = SECTION_GUIDES[id];
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("why");
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function toggle() {
    if (open) return close(true);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: uid }));
    setTab("why");
    setOpen(true);
  }

  // Another guide opening closes this one.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== uid) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [uid]);

  // While open: Esc closes, and a click outside closes without moving focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // On open: keep the popover on screen, then move focus into it.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.style.left = "0px";
    const overflow = dialog.getBoundingClientRect().right - (window.innerWidth - 12);
    if (overflow > 0) dialog.style.left = `${-overflow}px`;
    headingRef.current?.focus();
  }, [open]);

  function onTabKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]!.key);
    tabRefs.current[next]?.focus();
  }

  const dialogId = `${uid}-guide`;
  const panelId = `${uid}-panel`;

  return (
    <span ref={wrapperRef} className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`About ${guide.title}`}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        className={`inline-grid h-5 w-5 place-items-center rounded-full border font-mono text-[11px] font-bold leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
          open
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-slate-300 bg-white text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        }`}
      >
        i
      </button>
      {open && (
        <div
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          aria-labelledby={`${uid}-title`}
          className="absolute top-full z-40 mt-2 flex max-h-[min(70vh,34rem)] w-[min(28rem,calc(100vw-2rem))] flex-col rounded-xl border border-slate-200 bg-white text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-xl"
        >
          <div className="flex items-start gap-2 px-4 pt-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Section guide</div>
              <h3 ref={headingRef} id={`${uid}-title`} tabIndex={-1} className="text-sm font-bold text-slate-900 outline-none">
                {guide.title}
              </h3>
              <p className="mt-0.5 text-[12.5px] text-slate-700">{guide.what}</p>
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Close guide"
              className="h-7 w-7 flex-none rounded-md text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              ×
            </button>
          </div>
          <div role="tablist" aria-label={`${guide.title} guide`} className="mt-2 flex flex-wrap gap-0.5 border-b border-slate-200 px-4">
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={panelId}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                  tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${tab}`}
            tabIndex={0}
            className="overflow-y-auto px-4 pt-3 pb-4 text-[13px] leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            {tab === "why" && (
              <div className="flex flex-col gap-2">
                {guide.why.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {guide.ref && <p className="text-[11.5px] text-slate-600">{guide.ref}</p>}
              </div>
            )}
            {tab === "how" && (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-semibold marker:text-slate-500">
                {guide.how.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
            {tab === "eval" && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <section className="rounded-lg bg-emerald-50 px-2.5 py-2">
                  <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Good signs</h4>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-slate-800">
                    {guide.good.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg bg-amber-50 px-2.5 py-2">
                  <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">Warning signs</h4>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-slate-800">
                    {guide.bad.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
