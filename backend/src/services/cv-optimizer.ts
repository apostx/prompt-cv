import {
  getPageCount,
  getDocumentMargins,
  updateDocumentMargins,
  removePageBreaks,
  type GoogleClients,
} from './google-docs.js';

// --- Constants ---

const PT_PER_INCH = 72;
const MARGIN_STEP_PT = 0.01 * PT_PER_INCH;       // 0.01" = 0.72 PT

const DEFAULT_TARGET_PAGES = 2;
const DEFAULT_MIN_MARGIN = 0.8;   // inches
const DEFAULT_MAX_MARGIN = 1.0;   // inches

// --- Types ---

export interface OptimizeOptions {
  targetPages?: number;
  minMargin?: number;     // inches
  maxMargin?: number;     // inches
}

export interface OptimizeResult {
  documentId: string;
  originalPages: number;
  optimizedPages: number;
  marginApplied: number;    // in inches
  pageBreaksRemoved: number;
  skipped: boolean;
  manualRequired: boolean;
  reason?: string;
}

// --- Helpers ---

/** Round a PT margin value to the nearest 0.01" step */
function roundToStep(pt: number): number {
  const steps = Math.round(pt / MARGIN_STEP_PT);
  return Math.round(steps * MARGIN_STEP_PT * 100) / 100;
}

function allSides(pt: number) {
  return { top: pt, bottom: pt, left: pt, right: pt };
}

// --- Main Optimizer ---

export async function optimizeCv(documentId: string, clients?: GoogleClients, options?: OptimizeOptions): Promise<OptimizeResult> {
  const targetPages = options?.targetPages ?? DEFAULT_TARGET_PAGES;
  const minMarginIn = options?.minMargin ?? DEFAULT_MIN_MARGIN;
  const maxMarginIn = options?.maxMargin ?? DEFAULT_MAX_MARGIN;
  const minMarginPt = minMarginIn * PT_PER_INCH;
  const maxMarginPt = maxMarginIn * PT_PER_INCH;

  const originalPages = await getPageCount(documentId, clients);

  if (originalPages <= targetPages) {
    return {
      documentId,
      originalPages,
      optimizedPages: originalPages,
      marginApplied: maxMarginIn,
      pageBreaksRemoved: 0,
      skipped: true,
      manualRequired: false,
      reason: `Already ${originalPages} page(s), no optimization needed`,
    };
  }

  // Save original margins for potential rollback
  const originalMargins = await getDocumentMargins(documentId, clients);

  // Clean slate: remove any existing forced page breaks
  const pageBreaksRemoved = await removePageBreaks(documentId, clients);

  // Check if removing page breaks alone was enough
  const currentPages = await getPageCount(documentId, clients);
  if (currentPages <= targetPages) {
    return {
      documentId,
      originalPages,
      optimizedPages: currentPages,
      marginApplied: originalMargins.top / PT_PER_INCH,
      pageBreaksRemoved,
      skipped: false,
      manualRequired: false,
    };
  }

  // Binary search for the largest margin that fits within targetPages
  let lo = minMarginPt;
  let hi = maxMarginPt;

  // First check: does minimum margin even work?
  await updateDocumentMargins(documentId, allSides(lo), clients);
  const minMarginPages = await getPageCount(documentId, clients);

  let bestMargin: number;

  if (minMarginPages > targetPages) {
    // Even minimum margin can't fit — restore original margins, report manual required
    await updateDocumentMargins(documentId, originalMargins, clients);
    return {
      documentId,
      originalPages,
      optimizedPages: minMarginPages,
      marginApplied: originalMargins.top / PT_PER_INCH,
      pageBreaksRemoved,
      skipped: false,
      manualRequired: true,
      reason: `Could not fit within ${targetPages} pages even at minimum margins (${minMarginIn}"). Manual optimization required.`,
    };
  } else if (currentPages <= targetPages) {
    // Current margins already work (after page break removal) — keep original
    bestMargin = hi;
    await updateDocumentMargins(documentId, allSides(hi), clients);
  } else {
    // Binary search: find largest margin that fits
    while (hi - lo > MARGIN_STEP_PT + 0.01) {
      const mid = roundToStep(lo + (hi - lo) / 2);
      await updateDocumentMargins(documentId, allSides(mid), clients);
      const midPages = await getPageCount(documentId, clients);

      if (midPages <= targetPages) {
        lo = mid; // mid works, try larger
      } else {
        hi = mid; // mid too big, try smaller
      }
    }
    bestMargin = lo;
    // Apply the winning margin
    await updateDocumentMargins(documentId, allSides(bestMargin), clients);
  }

  // Final verification
  const optimizedPages = await getPageCount(documentId, clients);

  // Rollback if we made it worse
  if (optimizedPages > originalPages) {
    await updateDocumentMargins(documentId, originalMargins, clients);
    const rolledBackPages = await getPageCount(documentId, clients);
    return {
      documentId,
      originalPages,
      optimizedPages: rolledBackPages,
      marginApplied: originalMargins.top / PT_PER_INCH,
      pageBreaksRemoved,
      skipped: false,
      manualRequired: false,
      reason: 'Optimization would increase pages, reverted to original margins',
    };
  }

  return {
    documentId,
    originalPages,
    optimizedPages,
    marginApplied: Math.round((bestMargin / PT_PER_INCH) * 100) / 100,
    pageBreaksRemoved,
    skipped: false,
    manualRequired: optimizedPages > targetPages,
    reason: optimizedPages > targetPages
      ? `Could not fit within ${targetPages} pages even at minimum margins (${minMarginIn}"). Manual optimization required.`
      : undefined,
  };
}
