/**
 * Where the exported report's pages break.
 *
 * The browser paginates the report — nothing here lays a page out. This module
 * exists because the browser decides where to break at paint time and tells the
 * DOM nothing about it, so the preview cannot ask where the pages will fall; it
 * can only predict. That prediction is what lets the preview's "Page break"
 * marker keep telling the truth once sections flow instead of each claiming a
 * page of their own.
 *
 * The rule below is the one a browser already applies to a run of
 * `break-inside: avoid` blocks: place each block in turn, and start a new page
 * when one does not fit the room left. It is written down once, here, because
 * the reason this problem kept returning is that it lived in a dozen scattered
 * declarations and every new section had to rediscover it.
 *
 * Pure: measured heights in, break positions out. No DOM, no framework.
 */

/**
 * The printable height of one page, in CSS pixels.
 *
 * An A4 landscape sheet is 210mm tall and `@page` takes 14mm off each end,
 * leaving 182mm — 688px at 96dpi. Confirmed against the running report: the
 * cover section, the one part already written to fill a page, measures exactly
 * this.
 *
 * Everything in the feature is measured against this number: the height a block
 * must fit inside to be keepable whole, the height the diagram is capped to,
 * and the height this module fills.
 */
export const PRINT_PAGE_HEIGHT_PX = 688;

/**
 * Room left above a full-page block for the heading that introduces it.
 *
 * A block of exactly `PRINT_PAGE_HEIGHT_PX` can never share a page, so whatever
 * precedes it is stranded — measured: the report's diagram at a full page left
 * its own section heading alone on a sheet at 12% used. A heading may not be
 * orphaned from its content (FR-009), so anything allowed to fill a page has to
 * leave room for the heading that belongs to it.
 */
export const HEADING_ALLOWANCE_PX = 140;

/** The tallest a block may be and still sit under its own heading on one page. */
export const MAX_BLOCK_WITH_HEADING_PX = PRINT_PAGE_HEIGHT_PX - HEADING_ALLOWANCE_PX;

/** One thing that must not be split by a page break. */
export type AtomicBlock = {
  id: string;
  /** Measured height in px. */
  height: number;
};

export type PageBreak = {
  /** Distance from the top of the document's content. */
  offset: number;
  /** The block pushed onto the new page; null when the break falls inside an over-tall one. */
  beforeBlockId: string | null;
};

export type Pagination = {
  breaks: PageBreak[];
  pageCount: number;
  /** Fraction of each page carrying content, in page order. */
  usage: number[];
  /**
   * Blocks taller than a page, which no break rule can keep whole.
   *
   * Reported rather than silently tolerated: anything here *will* fragment, and
   * the fix belongs upstream — it is how the report's diagram was allowed to be
   * 2.2 times a page for so long without anything saying so.
   */
  oversized: string[];
};

/**
 * A height that can safely be added and divided.
 *
 * Clamped at the point of use rather than trusted, because everything below
 * divides by or accumulates these, and a single bad measurement would otherwise
 * produce an infinite page count instead of a wrong one — a hung request rather
 * than an ugly page.
 */
function usableHeight(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 0;
  return height;
}

/**
 * Where the pages fall for a document made of these blocks, in this order.
 *
 * Mirrors what the browser does with a run of `break-inside: avoid` blocks:
 * place each in turn, and start a new page when one does not fit the room left.
 * Nothing here lays anything out — it says what is about to happen so the
 * preview can show it.
 */
export function paginate(
  blocks: AtomicBlock[],
  options: { forcedBreakBefore?: string[] } = {}
): Pagination {
  const forced = new Set(options.forcedBreakBefore ?? []);
  const breaks: PageBreak[] = [];
  const oversized: string[] = [];
  /** How much of the current page each block put on it, page by page. */
  const filled: number[] = [0];

  let offset = 0;
  let room = PRINT_PAGE_HEIGHT_PX;

  for (const block of blocks) {
    const height = usableHeight(block.height);
    if (height > PRINT_PAGE_HEIGHT_PX) oversized.push(block.id);

    const pageIsEmpty = room === PRINT_PAGE_HEIGHT_PX;
    // A forced break is ignored on an empty page — the block is already at the
    // top of one, and breaking again would leave a blank sheet behind it.
    const wantsPage = forced.has(block.id) && !pageIsEmpty;
    const doesNotFit = height > room && !pageIsEmpty;

    if (wantsPage || doesNotFit) {
      breaks.push({ offset, beforeBlockId: block.id });
      filled.push(0);
      room = PRINT_PAGE_HEIGHT_PX;
    }

    if (height > PRINT_PAGE_HEIGHT_PX) {
      // Nothing can keep it whole; it runs over onto as many pages as it needs.
      // Those pages are full by definition, and the remainder lands on the last.
      filled[filled.length - 1] = PRINT_PAGE_HEIGHT_PX;
      let spilled = height - PRINT_PAGE_HEIGHT_PX;
      while (spilled > 0) {
        const onThisPage = Math.min(spilled, PRINT_PAGE_HEIGHT_PX);
        breaks.push({ offset: offset + (height - spilled), beforeBlockId: null });
        filled.push(onThisPage);
        spilled -= onThisPage;
      }
      room = PRINT_PAGE_HEIGHT_PX - (filled[filled.length - 1] ?? 0);
    } else {
      filled[filled.length - 1] = (filled[filled.length - 1] ?? 0) + height;
      room -= height;
    }

    offset += height;
  }

  return {
    breaks,
    pageCount: filled.length,
    usage: filled.map((f) => Math.min(1, Math.max(0, f / PRINT_PAGE_HEIGHT_PX))),
    oversized,
  };
}
