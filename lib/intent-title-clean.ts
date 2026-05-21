/** Strip calibration / extra clauses after spaced em dash (U+2014). */
export function cleanIntentTitle(title: string): string {
  const t = title.trim()
  if (!t) return t
  const idx = t.indexOf(' — ')
  if (idx >= 0) return t.slice(0, idx).trim()
  return t
}
