import type { RefineProfile } from '@/components/playce/the-refine'

/** Activity row in the shared Pack / Rent gear checklist (Matrix confirm + Journey briefing). */
export interface GearChecklistRow {
  item: string
  /** Display tag after the item name — Pack column uses Bring / Buy Local; Rent column uses Rent. */
  action: 'Bring' | 'Rent' | 'Buy Local'
  checked: boolean
}

/** True when the sport typically needs boards/skis/bikes from shops — not shoes/yoga mats only. */
export function activityNeedsHeavyGearRental(activity: string): boolean {
  const a = activity.toLowerCase()
  if (
    /\b(yoga|walking|walk|pilates|meditation|stretch|hiking without gear|running|run|jog|marathon|track)\b/.test(a)
  ) {
    return false
  }
  if (
    /\b(ski|skiing|snowboard|surf|surfing|scuba|dive|diving|kayak|paddle|sup\b|bike|bicycle|cycling|mountain bike|climb|climbing|wakeboard|windsurf|kitesurf|paraglid|snow|canoe|rafting)\b/.test(
      a
    )
  ) {
    return true
  }
  return false
}

/**
 * Seed checklist shown on Confirm (Matrix) and Journey — must stay aligned with
 * `activityNeedsHeavyGearRental` (pack-first vs rent column).
 */
export function buildSeedGearChecklist(
  location: { activity: string },
  refine: Pick<RefineProfile, 'skillLevel'>
): GearChecklistRow[] {
  const { skillLevel } = refine
  const act = location.activity.toLowerCase()
  const isSurfing = act.includes('surf')

  if (isSurfing) {
    return [
      { item: 'Board', action: skillLevel === 'ELITE' || skillLevel === 'PRO' ? 'Bring' : 'Rent', checked: false },
      { item: 'Wetsuit', action: 'Rent', checked: false },
      { item: 'Zinc Sunscreen', action: 'Bring', checked: false },
      { item: 'Reef Booties', action: 'Bring', checked: false },
      { item: 'Leash', action: skillLevel === 'ELITE' || skillLevel === 'PRO' ? 'Bring' : 'Rent', checked: false },
      { item: 'Wax', action: 'Buy Local', checked: false },
    ]
  }

  const lightPack: GearChecklistRow[] = [
    { item: 'Sun Protection', action: 'Bring', checked: false },
    { item: 'First Aid Kit', action: 'Bring', checked: false },
    { item: 'Water Bottle', action: 'Bring', checked: false },
  ]

  if (!activityNeedsHeavyGearRental(location.activity)) {
    return lightPack
  }

  return [{ item: 'Equipment', action: 'Rent', checked: false }, ...lightPack]
}

/** Append API-generated pack lines as extra Bring rows; skips duplicates by item text. */
export function mergeApiPackLinesIntoGear(rows: GearChecklistRow[], apiItems: string[]): GearChecklistRow[] {
  const existing = new Set(rows.map((r) => r.item.trim().toLowerCase()))
  const out = [...rows]
  for (const line of apiItems) {
    const t = line.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (existing.has(key)) continue
    existing.add(key)
    out.push({ item: t, action: 'Bring', checked: false })
  }
  return out
}
