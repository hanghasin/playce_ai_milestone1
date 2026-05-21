import type { RefineProfile } from '@/components/playce/the-refine'
import { tripRoleToTravelIntent, type TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'

const enc = encodeURIComponent

export type ExperienceBudgetTier = 'essential' | 'midrange' | 'luxe'

export type ExperienceCardIcon = 'bed' | 'compass' | 'flag' | 'ticket' | 'map-pin'

export interface CardConfig {
  label: string
  icon: ExperienceCardIcon
  href: string
  subNote?: string
}

export function refineBudgetToExperienceTier(
  budget: RefineProfile['budgetRange'] | undefined
): ExperienceBudgetTier {
  if (budget === 'ESSENTIAL') return 'essential'
  if (budget === 'LUXE') return 'luxe'
  return 'midrange'
}

export function travelPurposeFromTripRole(
  role: RefineProfile['tripRole'] | undefined | null
): TravelIntent {
  return tripRoleToTravelIntent(role) ?? 'practice'
}

function googleSearchHref(query: string): string {
  return `https://www.google.com/search?q=${enc(query)}`
}

function getYourGuideHref(activityType: string, destinationName: string): string {
  return `https://www.getyourguide.com/s/?q=${enc(`${activityType} ${destinationName}`)}`
}

function mapsLocationHref(mapQuery: string): string {
  return `https://www.google.com/maps/search/${enc(mapQuery)}`
}

function bookingStayHref(destinationName: string, budget: ExperienceBudgetTier): string {
  const dest = enc(destinationName)
  if (budget === 'luxe') {
    return `https://www.booking.com/searchresults.html?ss=${dest}&order=class_descending`
  }
  if (budget === 'essential') {
    return `https://www.booking.com/searchresults.html?ss=${dest}&order=price`
  }
  return `https://www.booking.com/searchresults.html?ss=${dest}&nflt=class%3D3`
}

export function getExperienceCards(
  travelPurpose: TravelIntent,
  budget: ExperienceBudgetTier,
  activityType: string,
  destinationName: string,
  _season: string,
  mapQuery: string
): [CardConfig, CardConfig, CardConfig] {
  const act = enc(activityType)
  const dest = enc(destinationName)
  const mapQ = mapQuery.trim() || destinationName

  const stayCard: CardConfig = {
    label: 'Find places to stay',
    icon: 'bed',
    href: bookingStayHref(destinationName, budget),
    subNote:
      budget === 'luxe'
        ? 'Sorted by rating'
        : budget === 'essential'
          ? 'Sorted by price'
          : 'Mid-range stays',
  }

  let card2: CardConfig

  if (travelPurpose === 'practice') {
    if (budget === 'essential') {
      card2 = {
        label: `Find ${activityType} rentals`,
        icon: 'compass',
        href: mapsLocationHref(`${activityType} rental ${destinationName}`),
      }
    } else if (budget === 'midrange') {
      card2 = {
        label: 'Explore experiences',
        icon: 'compass',
        href: getYourGuideHref(activityType, destinationName),
      }
    } else {
      card2 = {
        label: 'Find private coaching',
        icon: 'compass',
        href: googleSearchHref(`private ${activityType} coach ${destinationName}`),
      }
    }
  } else if (travelPurpose === 'competing') {
    card2 = {
      label: 'Find races & events',
      icon: 'flag',
      href: googleSearchHref(`${activityType} ${destinationName} race competition registration`),
      subNote:
        budget === 'essential'
          ? 'Check early bird pricing'
          : budget === 'luxe'
            ? 'Elite entries may be available'
            : undefined,
    }
  } else {
    if (budget === 'essential') {
      card2 = {
        label: 'Explore experiences',
        icon: 'compass',
        href: getYourGuideHref(activityType, destinationName),
      }
    } else if (budget === 'midrange') {
      card2 = {
        label: 'Book experiences',
        icon: 'compass',
        href: getYourGuideHref(activityType, destinationName),
      }
    } else {
      card2 = {
        label: 'Premium experiences',
        icon: 'compass',
        href: getYourGuideHref(activityType, destinationName),
      }
    }
  }

  const card3: CardConfig = {
    label: 'View location',
    icon: 'map-pin',
    href: mapsLocationHref(mapQ),
  }

  return [stayCard, card2, card3]
}
