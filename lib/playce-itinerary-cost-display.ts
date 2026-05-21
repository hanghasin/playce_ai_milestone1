/**
 * When to show per-activity price in journey itinerary / PDF.
 * Hide placeholders, free/zero, and routine movement/rest rows unless clearly a paid experience.
 */

const PAID_ACTIVITY_HINTS =
  /\b(fee|ticket|tickets|entry|admission|rental|rent|class|lesson|clinic|workshop|museum|tour|meal|dinner|lunch|brunch|breakfast|ferry|taxi|uber|lyft|ride-?hail|transit pass|spa|massage|registration|guided|coach|session\s+fee)\b/i

const MOVEMENT_OR_REST_HINTS =
  /\b(walk|walking|walk-?through|run|running|jog|jogging|shakeout|shake-?out|stride|strides|stretch|stretching|sleep|rest|nap|warm-?up|warmup|cool-?down|cooldown|mobility|easy\s+(run|jog)|pre-?race\s+toilet|toilet\s+(stop|stops)|discard\s+layers)\b/i

function isZeroOrPlaceholderPrice(raw: string): boolean {
  const t = raw.trim()
  if (!t || /^[—\-–]+$/.test(t)) return true
  if (/^free\b/i.test(t)) return true
  if (/^\$?\s*0(\.00)?\s*$/i.test(t)) return true
  if (/^0\s*$/.test(t)) return true
  if (/~\s*\$?\s*0\b/i.test(t)) return true
  return false
}

/** Non-null display string only when the cost should appear in the UI / PDF. */
export function itineraryCostDisplayText(
  activityName: string,
  rawPrice: string | undefined | null
): string | null {
  const raw = (rawPrice ?? '').trim()
  if (isZeroOrPlaceholderPrice(raw)) return null
  const name = (activityName ?? '').trim().toLowerCase()
  if (MOVEMENT_OR_REST_HINTS.test(name) && !PAID_ACTIVITY_HINTS.test(name)) return null
  return raw
}
