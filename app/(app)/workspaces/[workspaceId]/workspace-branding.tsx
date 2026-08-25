"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspaceBranding } from "@/lib/actions/organization";
import { extractDominantColors } from "@/lib/client/extract-dominant-color";

const DEFAULT_PRIMARY = "#334155"; // slate-700 — used when a logo has no clear dominant color
const DEFAULT_SECONDARY = "#4338ca"; // indigo-700 — matches this app's existing accent look
const DEFAULT_TERTIARY = "#4338ca";

type Accents = { primary: string; secondary: string; tertiary: string };
type PersistedAccents = { primary: string | null; secondary: string | null; tertiary: string | null };

export function WorkspaceBranding({
  workspaceId,
  logoDataUrl,
  accentColor,
  accentColorSecondary,
  accentColorTertiary,
}: {
  workspaceId: string;
  logoDataUrl: string | null;
  accentColor: string | null;
  accentColorSecondary: string | null;
  accentColorTertiary: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(logoDataUrl);
  const [accents, setAccents] = useState<Accents>({
    primary: accentColor ?? DEFAULT_PRIMARY,
    secondary: accentColorSecondary ?? DEFAULT_SECONDARY,
    tertiary: accentColorTertiary ?? DEFAULT_TERTIARY,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(
    nextLogo: string | null,
    persisted: PersistedAccents,
    revertLogo: string | null,
    revertAccents: Accents
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateWorkspaceBranding({
        workspaceId,
        logoDataUrl: nextLogo,
        accentColor: persisted.primary,
        accentColorSecondary: persisted.secondary,
        accentColorTertiary: persisted.tertiary,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save") : result.error);
        setPreview(revertLogo);
        setAccents(revertAccents);
        return;
      }
      router.refresh();
    });
  }

  async function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      const [primary, secondary, tertiary] = await extractDominantColors(dataUrl, 3);
      const nextAccents: Accents = {
        primary: primary ?? DEFAULT_PRIMARY,
        secondary: secondary ?? DEFAULT_SECONDARY,
        tertiary: tertiary ?? DEFAULT_TERTIARY,
      };
      setAccents(nextAccents);
      save(dataUrl, nextAccents, preview, accents);
    };
    reader.readAsDataURL(file);
  }

  function handleAccentChange(role: keyof Accents, next: string) {
    const nextAccents = { ...accents, [role]: next };
    setAccents(nextAccents);
    save(preview, nextAccents, preview, accents);
  }

  function handleRemove() {
    const displayDefaults: Accents = { primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY, tertiary: DEFAULT_TERTIARY };
    setPreview(null);
    setAccents(displayDefaults);
    save(null, { primary: null, secondary: null, tertiary: null }, preview, accents);
  }

  return (
    <div className="mb-6 flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not an optimizable static asset
          <img src={preview} alt="Client logo preview" className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[10px] text-slate-600">No logo</span>
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-800">Client logo &amp; accent colors</div>
        <p className="mt-0.5 text-xs text-slate-500">
          Shown in the header and this Workspace&rsquo;s sidebar, and used for a few accent touches — only while
          you&rsquo;re working in this client&rsquo;s Workspace. PNG, JPEG, WebP, or SVG, under 300KB.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {preview ? "Replace logo" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {(["primary", "secondary", "tertiary"] as const).map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              {role === "primary" ? "Primary" : role === "secondary" ? "Secondary" : "Tertiary"}
              <input
                type="color"
                value={accents[role]}
                disabled={pending}
                onChange={(e) => handleAccentChange(role, e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-slate-300 p-0"
                aria-label={`Workspace ${role} accent color`}
              />
            </label>
          ))}
          {preview && (
            <button
              type="button"
              disabled={pending}
              onClick={handleRemove}
              className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-60"
            >
              Remove
            </button>
          )}
          {pending && <span className="text-xs text-slate-400">Saving…</span>}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
