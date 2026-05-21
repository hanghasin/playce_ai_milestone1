import { findKnownEvents } from '@/lib/known-events'
import type { TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'

export type DisplayEventRow = {
  name: string
  date: string
  isRecurring: boolean
  website: string
}

export function resolveDisplayEvents(
  location: {
    name: string
    country: string
    activity: string
    season: string
    upcomingEvents?: {
      name: string
      date: string
      website?: string
      isRecurring: boolean
    }[]
  }
): DisplayEventRow[] {
  const upcoming = location.upcomingEvents ?? []
  if (upcoming.length > 0) {
    return upcoming.map((ev) => ({
      name: ev.name,
      date: ev.date,
      isRecurring: ev.isRecurring,
      website: ev.website?.trim() ?? '',
    }))
  }

  return findKnownEvents(location.name, location.activity).map((ev) => ({
    name: ev.name,
    date: ev.typicalMonth,
    isRecurring: ev.isRecurring,
    website: ev.website,
  }))
}

export function eventsSearchHref(
  activityType: string,
  destinationName: string,
  season: string
): string {
  return `https://www.google.com/search?q=${encodeURIComponent(
    `${activityType} ${destinationName} ${season} event`
  )}`
}

/** Always Google — curated event URLs are often stale or parked. */
export function eventDetailsHref(eventName: string, destinationName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${eventName} ${destinationName}`)}`
}

export function shouldShowEventsSearchFallback(
  travelPurpose: TravelIntent,
  eventCount: number
): boolean {
  return eventCount === 0 && travelPurpose !== 'practice'
}
