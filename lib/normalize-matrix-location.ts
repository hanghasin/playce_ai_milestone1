import type { MatrixLocationData } from '@/lib/playce-location-types'
import { coerceActivityZonesToString } from '@/lib/playce-confirm-helpers'
import {
  inferCountryFromPlaceName,
  isGenericPlaceName,
  isUnknownOrMissingCountry,
  parseCountryFromLocationLabel,
} from '@/lib/location-fallbacks'

/**
 * Fix placeholder name/country/label from API or stale sessionStorage
 * (e.g. name "Destination" while primaryTitle is "Naples").
 */
export function normalizeMatrixLocation(loc: MatrixLocationData): MatrixLocationData {
  const title = (loc.primaryTitle || '').trim()
  let name = (loc.name || '').trim()

  if (!name || isGenericPlaceName(name) || /^unknown destination$/i.test(name)) {
    if (title && !isGenericPlaceName(title)) name = title
    else {
      const first = (loc.locationLabel || '').split(',')[0]?.trim() || ''
      if (first && !isGenericPlaceName(first) && !/^unknown destination$/i.test(first)) name = first
    }
  }

  let country = (loc.country || '').trim()
  if (!country || isUnknownOrMissingCountry(country)) {
    country =
      parseCountryFromLocationLabel(loc.locationLabel) ||
      inferCountryFromPlaceName(name) ||
      inferCountryFromPlaceName(title) ||
      country
  }

  let locationLabel = (loc.locationLabel || '').trim()
  const labelLooksBroken =
    !locationLabel ||
    /destination\s*,\s*unknown region/i.test(locationLabel) ||
    (isGenericPlaceName(locationLabel.split(',')[0]?.trim() || '') &&
      isUnknownOrMissingCountry(locationLabel.split(',')[1]?.trim() || ''))

  if (labelLooksBroken && name && !isGenericPlaceName(name) && country && !isUnknownOrMissingCountry(country)) {
    locationLabel = `${name}, ${country}`
  }

  return {
    ...loc,
    name: name || loc.name || 'Destination',
    country: country || loc.country || 'Unknown region',
    locationLabel: locationLabel || loc.locationLabel,
    activity: (loc.activity || '').trim() || 'Outdoor activity',
    season: (loc.season || '').trim() || 'Year-round',
    difficulty: (loc.difficulty || '').trim() || 'Intermediate',
    vibe: (loc.vibe || '').trim() || 'Explorer-friendly',
    image: typeof loc.image === 'string' ? loc.image : '',
    womenFriendly: loc.womenFriendly ?? 72,
    soloIndex: loc.soloIndex ?? 72,
    logistics:
      Array.isArray(loc.logistics) && loc.logistics.length > 0
        ? loc.logistics
        : [`${name || 'BASE'}`.toUpperCase(), 'TRANSPORT', 'LOCAL OPS'],
    facilities:
      Array.isArray(loc.facilities) && loc.facilities.length > 0
        ? loc.facilities
        : [
            { name: 'Gear / Rentals', available: true },
            { name: 'Dining nearby', available: true },
          ],
    conditions: loc.conditions ?? { temp: '18°C' },
    activityZones: (() => {
      const z = coerceActivityZonesToString(loc.activityZones).trim()
      return z || undefined
    })(),
  }
}
