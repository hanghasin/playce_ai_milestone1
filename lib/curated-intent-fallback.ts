import { enrichIntentLocation } from '@/lib/intent-recommendations-schema'
import { getDestinationImage } from '@/lib/unsplash'
import { primaryAirportsLine } from '@/lib/playce-airport-hints'

export type CuratedIntentTripRole = 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'

const PORTUGAL_SURF_SEEDS = [
  {
    recommendationKind: 'spot' as const,
    primaryTitle: 'Supertubos beach',
    locationLabel: 'Peniche, Portugal',
    name: 'Peniche',
    country: 'Portugal',
    activity: 'Surfing',
    imageSearchTerm: 'Supertubos beach Peniche Portugal surf waves',
    season: 'Sep – Jun',
    difficulty: 'Advanced',
    vibe: 'Powerful, Exposed, Hollow',
    vibeTags: ['Powerful', 'Exposed', 'Hollow'],
    womenFriendly: 78,
    soloIndex: 72,
  },
  {
    recommendationKind: 'spot' as const,
    primaryTitle: 'Ericeira World Surfing Reserve',
    locationLabel: 'Ericeira, Portugal',
    name: 'Ericeira',
    country: 'Portugal',
    activity: 'Surfing',
    imageSearchTerm: 'Ericeira surf town coastline Portugal',
    season: 'Sep – Jun',
    difficulty: 'Intermediate',
    vibe: 'Reef-lined, Consistent, Walkable',
    vibeTags: ['Reef-lined', 'Consistent', 'Walkable'],
    womenFriendly: 82,
    soloIndex: 80,
  },
  {
    recommendationKind: 'spot' as const,
    primaryTitle: 'Nazaré big-wave amphitheatre',
    locationLabel: 'Nazaré, Portugal',
    name: 'Nazaré',
    country: 'Portugal',
    activity: 'Surfing',
    imageSearchTerm: 'Nazare giant waves coast Portugal',
    season: 'Oct – Mar',
    difficulty: 'Spectator / expert only',
    vibe: 'Massive, Spectator-friendly, Dramatic',
    vibeTags: ['Massive', 'Spectator-friendly', 'Dramatic'],
    womenFriendly: 75,
    soloIndex: 68,
  },
] as const

export function matchesPortugalSurfIntent(prompt: string): boolean {
  const p = prompt.toLowerCase()
  return /\bportugal\b/.test(p) && /\bsurf/.test(p)
}

/** Extract Groq reset hint like "1h43m" when present in the error body. */
export function groqRateLimitWaitHint(errorMessage: string): string | null {
  const m = errorMessage.match(/try again in\s+(\d+h\d+m[\d.]*s?|\d+m[\d.]*s?|\d+h[\d.]*s?)/i)
  if (!m) return null
  const raw = m[1]
  const h = raw.match(/(\d+)h/)
  const min = raw.match(/(\d+)m/)
  if (h && min) return `about ${h[1]}h ${min[1]}m`
  if (h) return `about ${h[1]} hour(s)`
  if (min) return `about ${min[1]} minute(s)`
  return null
}

export async function buildPortugalSurfCuratedResult(
  originalQuery: string,
  tripRole: CuratedIntentTripRole
): Promise<{
  intentSummary: string
  detectedSkillLevel: string | null
  eventFallbackApplied: boolean
  locations: Array<Record<string, unknown>>
} | null> {
  const usedImageUrls = new Set<string>()
  const locations = []

  for (let i = 0; i < PORTUGAL_SURF_SEEDS.length; i += 1) {
    const seed = PORTUGAL_SURF_SEEDS[i]
    const enriched = enrichIntentLocation({
      ...seed,
      nearestAirport: primaryAirportsLine(seed.name, seed.country) || 'LIS — Lisbon Portela Airport',
      logistics: ['Surf schools', 'Rental boards', 'Coastal transfers'],
      upcomingEvents:
        tripRole === 'WATCHING' || tripRole === 'COMPETITOR'
          ? [
              {
                name: 'MEO Rip Curl Pro Portugal',
                date: 'October annually',
                description: 'World Surf League event on the Peniche coast.',
                website: '',
                isRecurring: true,
              },
            ]
          : [],
    })

    const imageData = await getDestinationImage(
      seed.primaryTitle,
      seed.activity,
      seed.imageSearchTerm,
      i,
      usedImageUrls
    )

    locations.push({
      ...enriched,
      hasExplicitActivity: true,
      image: imageData.url.startsWith('https://images.unsplash.com/') ? imageData.url : '',
      photographerName: imageData.photographerName,
      photographerLink: imageData.photographerLink,
    })
  }

  if (locations.length < 3) return null

  return {
    intentSummary: 'Surf trip · Portugal coast',
    detectedSkillLevel: null,
    eventFallbackApplied: false,
    locations,
  }
}
