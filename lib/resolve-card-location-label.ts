import type { MatrixLocationData } from '@/lib/playce-location-types'

function isGenericCardPlaceName(value: string): boolean {
  const s = value.trim()
  if (!s) return true
  return /^(destination|unknown destination|unknown|n\/a)$/i.test(s)
}

function isUnknownRegionCountry(value: string): boolean {
  const c = value.trim()
  if (!c) return true
  return /^unknown region$/i.test(c) || /^unknown$/i.test(c)
}

/** City/region + country line for result and shortlist cards. */
export function resolveCardLocationLabel(location: MatrixLocationData): string {
  const country = (location.country || '').trim()
  const name = (location.name || '').trim()
  const title = (location.primaryTitle || '').trim()
  const label = (location.locationLabel || '').trim()
  const labelParts = label
    ? label.split(',').map((p) => p.trim()).filter(Boolean)
    : []
  const first =
    labelParts[0] ||
    (name && !isGenericCardPlaceName(name) ? name : '') ||
    (title && !isGenericCardPlaceName(title) ? title : '') ||
    name ||
    'Destination'
  const secondRaw = labelParts[1] || country
  const second =
    secondRaw && !isUnknownRegionCountry(secondRaw)
      ? secondRaw
      : country && !isUnknownRegionCountry(country)
        ? country
        : ''
  if (second && first.toLowerCase() === second.toLowerCase()) return first
  return second ? `${first}, ${second}` : first
}
