import type { MatrixLocationData } from '@/lib/playce-location-types'

/** Mirrors `playce_journey_${destinationId}` from product spec. */
export function journeyHandoffLocalStorageKey(destinationId: string): string {
  return `playce_journey_${destinationId}`
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Prefer `session` fields when present; fill gaps from `stored` (e.g. localStorage backup
 * when sessionStorage was cleared between Confirm and Journey).
 */
export function mergeJourneyHandoffLocations(
  session: MatrixLocationData,
  stored: MatrixLocationData | null | undefined
): MatrixLocationData {
  if (!stored) return { ...session }

  const merged: MatrixLocationData = { ...stored, ...session }

  const pickArr = <T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined => {
    if (Array.isArray(a) && a.length > 0) return a
    if (Array.isArray(b) && b.length > 0) return b
    return a ?? b
  }

  merged.upcomingEvents = pickArr(session.upcomingEvents, stored.upcomingEvents) ?? merged.upcomingEvents
  merged.localTransport = pickArr(session.localTransport, stored.localTransport) ?? merged.localTransport
  merged.transportOptions = pickArr(session.transportOptions, stored.transportOptions) ?? merged.transportOptions
  merged.diningDistricts = pickArr(session.diningDistricts, stored.diningDistricts) ?? merged.diningDistricts
  merged.mustTryExperiences = pickArr(session.mustTryExperiences, stored.mustTryExperiences) ?? merged.mustTryExperiences
  merged.logistics = pickArr(session.logistics, stored.logistics) ?? merged.logistics
  merged.facilities = pickArr(session.facilities, stored.facilities) ?? merged.facilities
  merged.soloQuotes = pickArr(session.soloQuotes, stored.soloQuotes) ?? merged.soloQuotes
  merged.vibeTags = pickArr(session.vibeTags, stored.vibeTags) ?? merged.vibeTags

  if (!session.tripRhythm && stored.tripRhythm) merged.tripRhythm = stored.tripRhythm

  if (
    (!session.whyThisSpotLines || session.whyThisSpotLines.length < 3) &&
    stored.whyThisSpotLines &&
    stored.whyThisSpotLines.length >= 3
  ) {
    merged.whyThisSpotLines = stored.whyThisSpotLines
  }

  const azS =
    session.activityZones != null ? String(session.activityZones).trim() : ''
  const azB =
    stored.activityZones != null ? String(stored.activityZones).trim() : ''
  merged.activityZones = azS || azB || merged.activityZones

  if (!isNonEmptyString(session.image) && isNonEmptyString(stored.image)) merged.image = stored.image
  if (!isNonEmptyString(session.shortDescription) && isNonEmptyString(stored.shortDescription)) {
    merged.shortDescription = stored.shortDescription
  }
  if (!isNonEmptyString(session.typicalWeather) && isNonEmptyString(stored.typicalWeather)) {
    merged.typicalWeather = stored.typicalWeather
  }
  if (!isNonEmptyString(session.nearestAirport) && isNonEmptyString(stored.nearestAirport)) {
    merged.nearestAirport = stored.nearestAirport
  }
  if (!isNonEmptyString(session.about) && isNonEmptyString(stored.about)) merged.about = stored.about

  return merged
}
