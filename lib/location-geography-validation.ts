import type { MatrixLocationData } from '@/lib/playce-location-types'

function ensureString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v.trim()
  if (v == null) return fallback
  return String(v).trim()
}

/** Inland anchors where coastal/water-sport labels are common AI hallucinations. */
const INLAND_GEO_RULES: Array<{
  test: RegExp
  rename?: { from: RegExp; to: string }
  label?: string
  blockCoastalActivities?: boolean
  activityFallback?: string
  descriptorFallback?: string
  imageSearchTerm?: string
}> = [
  {
    test: /\bchaozhou\b|潮州/u,
    rename: { from: /\bchaozhou\s+bay\b/i, to: 'Chaozhou Old Town' },
    label: 'Chaozhou, Guangdong, China',
    blockCoastalActivities: true,
    activityFallback: 'Walking',
    descriptorFallback: 'Heritage lanes & Han River promenade',
    imageSearchTerm: 'Chaozhou Guangdong China old town Han River architecture',
  },
  {
    test: /\bmeizhou\b|梅州/u,
    label: 'Meizhou, Guangdong, China',
    blockCoastalActivities: true,
    activityFallback: 'Hiking',
    descriptorFallback: 'Hakka hills & village trails',
    imageSearchTerm: 'Meizhou Guangdong China mountain village hiking',
  },
  {
    test: /\bshaoguan\b|韶关/u,
    label: 'Shaoguan, Guangdong, China',
    blockCoastalActivities: true,
    activityFallback: 'Hiking',
    descriptorFallback: 'Danxia landforms & forest trails',
    imageSearchTerm: 'Shaoguan Guangdong China Danxia mountain trail',
  },
]

const COASTAL_ACTIVITY = /\b(surf|surfing|kitesurf|windsurf|paddleboard|sup\b|open water swim|sailing|snorkel|scuba|coasteering|beach volleyball)\b/i
const FAKE_COASTAL_NAME = /\b(bay|beach|cove|surf\s*break|ocean\s*front|seaside|coastal)\b/i

function matchesInlandRule(loc: MatrixLocationData, query: string) {
  const blob = [
    loc.name,
    loc.primaryTitle,
    loc.locationLabel,
    loc.country,
    query,
  ]
    .map((part) => ensureString(part))
    .join(' ')
    .toLowerCase()

  return INLAND_GEO_RULES.find((rule) => rule.test.test(blob))
}

/**
 * Correct obvious geographic hallucinations (e.g. "Chaozhou Bay" surf — Chaozhou is inland).
 */
export function validateLocationGeography(
  loc: MatrixLocationData,
  userQuery = ''
): MatrixLocationData {
  const rule = matchesInlandRule(loc, userQuery)
  if (!rule) return loc

  let next: MatrixLocationData = { ...loc }
  const name = ensureString(next.name)
  const primaryTitle = ensureString(next.primaryTitle)
  const activity = ensureString(next.activity)
  const descriptor = ensureString(next.activityDescriptor)

  if (rule.rename && (rule.rename.from.test(name) || rule.rename.from.test(primaryTitle))) {
    next.name = rule.rename.to
    next.primaryTitle = rule.rename.to
  }

  if (rule.label) {
    next.locationLabel = rule.label
    if (!next.country || /^unknown/i.test(next.country)) next.country = 'China'
  }

  const coastalMismatch =
    rule.blockCoastalActivities &&
    (COASTAL_ACTIVITY.test(activity) ||
      COASTAL_ACTIVITY.test(descriptor) ||
      FAKE_COASTAL_NAME.test(name) ||
      FAKE_COASTAL_NAME.test(primaryTitle))

  if (coastalMismatch) {
    next.activity = rule.activityFallback ?? 'Walking'
    next.activityDescriptor = rule.descriptorFallback ?? 'Urban trails & local districts'
    next.imageSearchTerm = rule.imageSearchTerm ?? `${next.name} ${next.country} old town landscape`
    next.image = ''
    if (FAKE_COASTAL_NAME.test(next.name)) {
      next.name = rule.rename?.to ?? (next.name.replace(FAKE_COASTAL_NAME, '').trim() || 'Old Town')
    }
    if (FAKE_COASTAL_NAME.test(next.primaryTitle ?? '')) {
      next.primaryTitle = next.name
    }
  }

  return next
}

export function validateLocationsGeography(
  locations: MatrixLocationData[],
  userQuery = ''
): MatrixLocationData[] {
  return locations.map((loc) => validateLocationGeography(loc, userQuery))
}
