import type { TripRole } from '@/components/playce/the-refine'

/** Appended after the user picks how they’re traveling (`core — …`). Same copy as card subtitles. */
export const ROLE_PROMPT_BY_TRIP: Record<TripRole, string> = {
  ACTIVE_TRAVEL: 'Train, explore, and do it at your own pace.',
  COMPETITOR: 'Race day focus — prep, logistics, performance.',
  WATCHING: "You're there for the event or someone in it.",
}

const LEGACY_PROMPTS_TO_STRIP: readonly string[] = [
  'Practice & experience — surf, ski, hike, yoga, or easy days at my own pace.',
  'Competing & racing — marathon, triathlon, gran fondo, or other structured event prep.',
  'Spectating & cheering — live events, races, or supporting friends, not competing myself.',
  'Spectating — live events, races, or supporting friends, not competing myself.',
  'Supporting a racer — cheers, checkpoints, reunion points.',
  'Watch world-class sport — fan zones and city atmosphere.',
  'Here for someone who is competing — cheers, checkpoints, reunion points.',
  'Just go. No race, no pressure.',
  "You're racing. Plan around it.",
  "You're here to watch and support.",
  'Just doing what you love. Hit local spots and explore at your own pace.',
  'Traveling for a scheduled event. Focus on the timeline, prep, and game day.',
  'Watching the action live. Catch the vibe, support friends, and beat the crowds.',
]

export function stripAnyRolePromptSuffix(s: string): string {
  let t = s.trimEnd()
  const pool = [...Object.values(ROLE_PROMPT_BY_TRIP), ...LEGACY_PROMPTS_TO_STRIP]
  let changed = true
  while (changed) {
    changed = false
    for (const add of pool) {
      const suf = ` — ${add}`
      if (t.endsWith(suf)) {
        t = t.slice(0, -suf.length).trimEnd()
        changed = true
        break
      }
    }
  }
  return t
}

export function mergeRolePrompt(prevQuery: string, role: TripRole): string {
  const core = stripAnyRolePromptSuffix(prevQuery)
  return core ? `${core} — ${ROLE_PROMPT_BY_TRIP[role]}` : ROLE_PROMPT_BY_TRIP[role]
}
