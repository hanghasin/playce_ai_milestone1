import type { GearChecklistRow } from '@/lib/playce-gear-checklist'

/** Editable pack checklist row in Journey (separate from Matrix `GearChecklistRow` ids). */
export interface JourneyPackLine {
  id: string
  text: string
  checked: boolean
  action: 'Bring' | 'Rent' | 'Buy Local'
}

/** Max checklist rows pulled from seed/API into Pack (keeps list readable). */
export const JOURNEY_PACK_SEED_MAX_BRING = 5

/** Max total Pack rows (suggested + user-added). */
export const JOURNEY_PACK_MAX_BRING = 28
export const JOURNEY_PACK_MAX_RENT = 3

/** Badge text belongs in JourneyPackLine.action only — strip accidental suffixes duplicated from upstream data. */
export function sanitizeGearPackItemText(raw: string): string {
  let t = raw.trim()
  for (let i = 0; i < 8; i++) {
    const next = t.replace(/\s*[·]\s*(Bring|Rent|Buy\s*Local)\s*$/i, '').trim()
    if (next === t) break
    t = next
  }
  return t.trim()
}

export function newPackLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Turn Matrix/Journey seed+API gear rows into capped, id-stable lines for UI. */
export function gearRowsToJourneyPackLines(rows: GearChecklistRow[]): {
  pack: JourneyPackLine[]
  rent: JourneyPackLine[]
} {
  const rentSrc = rows.filter((r) => r.action === 'Rent').slice(0, JOURNEY_PACK_MAX_RENT)
  const packSrc = rows.filter((r) => r.action !== 'Rent').slice(0, JOURNEY_PACK_SEED_MAX_BRING)

  return {
    rent: rentSrc.map((r) => ({
      id: newPackLineId(),
      text: sanitizeGearPackItemText(r.item),
      checked: false,
      action: 'Rent' as const,
    })),
    pack: packSrc.map((r) => ({
      id: newPackLineId(),
      text: sanitizeGearPackItemText(r.item),
      checked: false,
      action: r.action === 'Buy Local' ? ('Buy Local' as const) : ('Bring' as const),
    })),
  }
}

export function journeyPackToPdfGearRow(line: JourneyPackLine): { item: string; action: string; checked: boolean } {
  return { item: sanitizeGearPackItemText(line.text), action: line.action, checked: line.checked }
}

/** Pack column: Bring + Buy Local; Rent column: Rent only. */
export function isRentGearLine(line: JourneyPackLine): boolean {
  return line.action === 'Rent'
}

/** Read persisted gear — supports legacy `{ pack, rent }` and new flat array. */
export function parseGearItemsFromStorage(raw: string | null): JourneyPackLine[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (row): row is JourneyPackLine =>
          row &&
          typeof row === 'object' &&
          typeof (row as JourneyPackLine).id === 'string' &&
          typeof (row as JourneyPackLine).text === 'string'
      )
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { pack?: unknown }).pack) &&
      Array.isArray((parsed as { rent?: unknown }).rent)
    ) {
      const legacy = parsed as { pack: JourneyPackLine[]; rent: JourneyPackLine[] }
      return [...legacy.pack, ...legacy.rent]
    }
  } catch {
    /* ignore */
  }
  return null
}

export function gearItemsToStorageJson(items: JourneyPackLine[]): string {
  return JSON.stringify(items)
}
