/**
 * Normalize user intent strings for UI: strip trailing AI/system instructions that
 * were pasted into the same field, then callers may truncate further.
 */

import { stripAnyRolePromptSuffix } from '@/lib/playce-role-prompt'

/** Text after delimiter that likely contains model instructions rather than trip intent */
function looksInstructionLike(rest: string): boolean {
  const t = rest.trim()
  if (t.length < 14) return false
  const lower = t.toLowerCase()
  if (
    /\b(?:respond|respond with|you must|return only|instructions?:|requirements?:|output format|following format|\{\s*"|```|markdown|yaml|\.json\b|RULE:?|IMPORTANT|SYSTEM PROMPT|PROMPT:|assistant:|user:|system:)\b/.test(lower)
  ) {
    return true
  }
  if ((t.match(/\n/g) ?? []).length >= 2) return true
  if (t.length > 220 && /[.!?]/.test(t) && /\b(?:please|ensure|provide|generate|create|write|summarize)\b/i.test(t)) {
    return true
  }
  return false
}

function isLikelySchemeColon(q: string, colonIdx: number): boolean {
  if (colonIdx <= 0) return false
  if ((q[colonIdx + 1] ?? '') !== '/' || (q[colonIdx + 2] ?? '') !== '/') return false
  const before = q.slice(0, colonIdx).trimEnd()
  return /[a-z][a-z0-9+.+-]*$/i.test(before.slice(Math.max(0, before.length - 32)))
}

function isLikelyClockTimeColon(q: string, colonIdx: number): boolean {
  const prev = colonIdx > 0 ? q[colonIdx - 1] : ''
  const next = q[colonIdx + 1] ?? ''
  const next2 = q[colonIdx + 2] ?? ''
  if (/\d/.test(prev) && /\d/.test(next)) return true // 12:30
  if (/\d/.test(prev) && next === ' ' && /\d/.test(next2)) return true // 12: 05
  return false
}

/** Strip appendix after `:…` only when remainder looks instructional; preserve times and http(s)://… */
export function stripColonInstructionSuffix(raw: string): string {
  const q = raw
  for (let i = 0; i < q.length; i++) {
    if (q[i] !== ':') continue
    if (isLikelySchemeColon(q, i) || isLikelyClockTimeColon(q, i)) continue
    const after = q.slice(i + 1)
    if (!looksInstructionLike(after)) continue
    return q.slice(0, i).trimEnd()
  }
  return raw.trimEnd()
}

/** Split only on spaced em-dash (Unicode U+2014), not hyphen-minus combos in place names */
const SPACED_EM_DASH = /\s+\u2014\s+/

export function sanitizeUserIntentQueryForDisplay(raw: string | undefined | null): string {
  let q = stripAnyRolePromptSuffix((raw ?? '').trim())
  if (!q) return ''

  const emParts = q.split(SPACED_EM_DASH)
  if (emParts.length >= 2) {
    const tail = emParts.slice(1).join(' — ')
    if (looksInstructionLike(tail)) {
      q = emParts[0].trim()
    }
  }

  q = stripColonInstructionSuffix(q)
  return q.trim()
}

export function truncateUserIntent(display: string, maxLen: number): string {
  const t = display.trim()
  if (maxLen <= 0 || t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}
