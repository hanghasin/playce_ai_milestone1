import type { MatrixLocationData } from '@/lib/playce-location-types'
import { coerceActivityZonesToString } from '@/lib/playce-confirm-helpers'
import { isUnsplashImageUrl } from '@/lib/location-image'
import {
  inferCountryFromPlaceName,
  isGenericPlaceName,
  isUnknownOrMissingCountry,
  parseCountryFromLocationLabel,
} from '@/lib/location-fallbacks'

function ensureString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v.trim()
  if (v == null) return fallback
  return String(v).trim()
}

function ensureNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function sanitizeWhyThisSpotLines(
  raw?: MatrixLocationData['whyThisSpotLines']
): MatrixLocationData['whyThisSpotLines'] {
  if (!Array.isArray(raw)) return undefined
  const lines = raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const icon = ensureString((row as { icon?: unknown }).icon).slice(0, 8)
      const text = ensureString((row as { text?: unknown }).text).slice(0, 360)
      const boldPhrase = ensureString((row as { boldPhrase?: unknown }).boldPhrase).slice(0, 140)
      if (!icon || !text) return null
      return { icon, text, boldPhrase: boldPhrase || undefined }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  return lines.length >= 3 ? lines : undefined
}

function sanitizeUpcomingEvents(raw?: MatrixLocationData['upcomingEvents']): MatrixLocationData['upcomingEvents'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((ev) => {
      if (!ev || typeof ev !== 'object') return null
      const name = ensureString((ev as { name?: unknown }).name)
      const date = ensureString((ev as { date?: unknown }).date)
      if (!name || !date) return null
      return {
        name,
        date,
        description: ensureString((ev as { description?: unknown }).description),
        website: ensureString((ev as { website?: unknown }).website),
        isRecurring: Boolean((ev as { isRecurring?: unknown }).isRecurring),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
}

/**
 * Fix placeholder name/country/label from API or stale sessionStorage
 * (e.g. name "Destination" while primaryTitle is "Naples").
 */
export function normalizeMatrixLocation(loc: MatrixLocationData): MatrixLocationData {
  const title = ensureString(loc.primaryTitle)
  let name = ensureString(loc.name)

  if (!name || isGenericPlaceName(name) || /^unknown destination$/i.test(name)) {
    if (title && !isGenericPlaceName(title)) name = title
    else {
      const first = ensureString(loc.locationLabel).split(',')[0]?.trim() || ''
      if (first && !isGenericPlaceName(first) && !/^unknown destination$/i.test(first)) name = first
    }
  }

  let country = ensureString(loc.country)
  if (!country || isUnknownOrMissingCountry(country)) {
    country =
      parseCountryFromLocationLabel(ensureString(loc.locationLabel)) ||
      inferCountryFromPlaceName(name) ||
      inferCountryFromPlaceName(title) ||
      country
  }

  let locationLabel = ensureString(loc.locationLabel)
  const labelLooksBroken =
    !locationLabel ||
    /destination\s*,\s*unknown region/i.test(locationLabel) ||
    (isGenericPlaceName(locationLabel.split(',')[0]?.trim() || '') &&
      isUnknownOrMissingCountry(locationLabel.split(',')[1]?.trim() || ''))

  if (labelLooksBroken && name && !isGenericPlaceName(name) && country && !isUnknownOrMissingCountry(country)) {
    locationLabel = `${name}, ${country}`
  }

  const rawImage = ensureString(loc.image)
  const image = isUnsplashImageUrl(rawImage) ? rawImage : ''

  return {
    ...loc,
    name: name || ensureString(loc.name) || 'Destination',
    country: country || ensureString(loc.country) || 'Unknown region',
    locationLabel: locationLabel || ensureString(loc.locationLabel),
    activity: ensureString(loc.activity) || 'Outdoor activity',
    season: ensureString(loc.season) || 'Year-round',
    difficulty: ensureString(loc.difficulty) || 'Intermediate',
    vibe: ensureString(loc.vibe) || 'Explorer-friendly',
    image,
    womenFriendly: ensureNumber(loc.womenFriendly, 72),
    soloIndex: ensureNumber(loc.soloIndex, 72),
    nightSafety: loc.nightSafety == null ? loc.nightSafety : ensureNumber(loc.nightSafety, 60),
    communityDensity: loc.communityDensity == null ? loc.communityDensity : ensureNumber(loc.communityDensity, 55),
    infrastructureScore:
      loc.infrastructureScore == null ? loc.infrastructureScore : ensureNumber(loc.infrastructureScore, 60),
    logistics:
      Array.isArray(loc.logistics) && loc.logistics.length > 0
        ? loc.logistics.map((item) => ensureString(item)).filter(Boolean)
        : [`${name || 'BASE'}`.toUpperCase(), 'TRANSPORT', 'LOCAL OPS'],
    facilities:
      Array.isArray(loc.facilities) && loc.facilities.length > 0
        ? loc.facilities.map((f) => ({
            name: ensureString(f?.name) || 'Facility',
            available: Boolean(f?.available),
          }))
        : [
            { name: 'Gear / Rentals', available: true },
            { name: 'Dining nearby', available: true },
          ],
    conditions: loc.conditions ?? { temp: '18°C' },
    upcomingEvents: sanitizeUpcomingEvents(loc.upcomingEvents),
    whyThisSpotLines: sanitizeWhyThisSpotLines(loc.whyThisSpotLines),
    about: ensureString(loc.about),
    shortDescription: ensureString(loc.shortDescription),
    bestSeason: ensureString(loc.bestSeason) || undefined,
    typicalWeather: ensureString(loc.typicalWeather) || undefined,
    activityZones: (() => {
      const z = coerceActivityZonesToString(loc.activityZones).trim()
      return z || undefined
    })(),
  }
}
