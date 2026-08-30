/**
 * Every workspace page's title, painted in the client's brand colour — the
 * one place a consultant sees whose engagement they're in without reading
 * anything. Colours come from CSS variables the workspace layout sets from
 * the logo's extracted accents, including --accent-ink, which is white or
 * near-black depending on how dark the brand colour is (see readableInkOn).
 *
 * The logo itself deliberately isn't repeated in here: it already sits in the
 * page margin alongside this banner.
 */
export function WorkspacePageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Small line above the title — a breadcrumb or parent process, say. */
  eyebrow?: React.ReactNode;
  /** Right-aligned controls that belong with the title. */
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="mb-5 rounded-xl px-5 py-4 text-[var(--accent-ink)]"
      style={{ backgroundImage: "linear-gradient(120deg, var(--accent), var(--accent-banner-to))" }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="mb-0.5 text-xs opacity-75">{eyebrow}</div>}
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm opacity-80">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
