import type { TripSummaryData } from '@/components/playce/JourneyMissionBriefingPanel'
import type { PanelUpdate } from '@/lib/playce-strategic-advisor-schema'

export type PersistedAdvisorMessage = {
  role: 'ai' | 'user'
  content: string
  unavailable?: boolean
  clientStaticOpener?: boolean
}

type PersistedItineraryDay = NonNullable<PanelUpdate['itinerary']>[number]

export type JourneyAdvisorSession = {
  v: 1
  destinationId: string
  generationNonce: number
  messages: PersistedAdvisorMessage[]
  itinerary: PersistedItineraryDay[]
  tripSummary: TripSummaryData | null
  advisorDurationOverride: number | null
  savedAt: number
}

/** Frozen advisor state stored inside Saved journeys. */
export type SavedJourneyAdvisorSnapshot = {
  generationNonce: number
  durationDays: number
  messages: PersistedAdvisorMessage[]
  itinerary: PersistedItineraryDay[]
  tripSummary: TripSummaryData | null
  advisorDurationOverride: number | null
}

export const SAVED_JOURNEYS_RETURN_URL_KEY = 'playce-saved-journeys-return'
export const SAVED_JOURNEYS_RETURN_PAGE_KEY = 'playce-saved-journeys-return-page'

export function journeyAdvisorSessionStorageKey(destinationId: string): string {
  return `playce-advisor-session:${destinationId}`
}

export function journeyAdvisorLocalStorageKey(destinationId: string): string {
  return `playce-advisor-session-ls:${destinationId}`
}

function isValidSession(raw: unknown): raw is JourneyAdvisorSession {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as JourneyAdvisorSession
  return (
    s.v === 1 &&
    typeof s.destinationId === 'string' &&
    typeof s.generationNonce === 'number' &&
    Array.isArray(s.messages) &&
    Array.isArray(s.itinerary)
  )
}

function readRawSession(raw: string | null): JourneyAdvisorSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isValidSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isUsableSession(
  session: JourneyAdvisorSession | null,
  destinationId: string,
  generationNonce: number
): session is JourneyAdvisorSession {
  if (!session) return false
  if (session.destinationId !== destinationId) return false
  if (session.generationNonce !== generationNonce) return false
  if (session.itinerary.length === 0) return false
  return true
}

export function loadJourneyAdvisorSession(
  destinationId: string,
  generationNonce: number
): JourneyAdvisorSession | null {
  if (typeof window === 'undefined' || !destinationId) return null
  try {
    const fromSession = readRawSession(sessionStorage.getItem(journeyAdvisorSessionStorageKey(destinationId)))
    if (isUsableSession(fromSession, destinationId, generationNonce)) return fromSession

    const fromLocal = readRawSession(localStorage.getItem(journeyAdvisorLocalStorageKey(destinationId)))
    if (isUsableSession(fromLocal, destinationId, generationNonce)) {
      // Heal sessionStorage from localStorage backup (e.g. after hard refresh quirks).
      try {
        sessionStorage.setItem(
          journeyAdvisorSessionStorageKey(destinationId),
          JSON.stringify(fromLocal)
        )
      } catch {
        /* ignore */
      }
      return fromLocal
    }
  } catch {
    return null
  }
  return null
}

export function saveJourneyAdvisorSession(
  destinationId: string,
  generationNonce: number,
  data: Pick<
    JourneyAdvisorSession,
    'messages' | 'itinerary' | 'tripSummary' | 'advisorDurationOverride'
  >
): void {
  if (typeof window === 'undefined' || !destinationId) return
  if (data.itinerary.length === 0) return
  const payload: JourneyAdvisorSession = {
    v: 1,
    destinationId,
    generationNonce,
    messages: data.messages,
    itinerary: data.itinerary,
    tripSummary: data.tripSummary,
    advisorDurationOverride: data.advisorDurationOverride,
    savedAt: Date.now(),
  }
  const serialized = JSON.stringify(payload)
  try {
    sessionStorage.setItem(journeyAdvisorSessionStorageKey(destinationId), serialized)
  } catch {
    /* ignore quota / private mode */
  }
  try {
    localStorage.setItem(journeyAdvisorLocalStorageKey(destinationId), serialized)
  } catch {
    /* ignore quota */
  }
}

export function clearJourneyAdvisorSession(destinationId: string): void {
  if (typeof window === 'undefined' || !destinationId) return
  try {
    sessionStorage.removeItem(journeyAdvisorSessionStorageKey(destinationId))
    localStorage.removeItem(journeyAdvisorLocalStorageKey(destinationId))
  } catch {
    /* ignore */
  }
}

export function restoreAdvisorSessionFromSnapshot(
  destinationId: string,
  snapshot: SavedJourneyAdvisorSnapshot
): void {
  saveJourneyAdvisorSession(destinationId, snapshot.generationNonce, {
    messages: snapshot.messages,
    itinerary: snapshot.itinerary,
    tripSummary: snapshot.tripSummary,
    advisorDurationOverride: snapshot.advisorDurationOverride,
  })
}

export function resolveTripDisplayDays(
  durationDays: number | undefined,
  itineraryLength: number,
  fallback = 5
): number {
  if (durationDays != null && durationDays > 0) return durationDays
  if (itineraryLength > 0) return itineraryLength
  return fallback
}

export function advisorSessionHasUserEdits(session: JourneyAdvisorSession): boolean {
  return session.messages.some((m) => m.role === 'user')
}
