export type KnownEvent = {
  name: string
  location: string
  typicalMonth: string
  activityTypes: string[]
  website: string
  isRecurring: boolean
  level: string
}

export const KNOWN_EVENTS: Record<string, KnownEvent[]> = {
  ericeira: [
    {
      name: 'Ericeira Surf Festival',
      location: 'Ericeira, Portugal',
      typicalMonth: 'July',
      activityTypes: ['surf', 'surfing'],
      website: '',
      isRecurring: true,
      level: 'Open',
    },
    {
      name: 'MEO Rip Curl Pro Portugal (WSL)',
      location: 'Peniche, Portugal',
      typicalMonth: 'October',
      activityTypes: ['surf', 'surfing'],
      website: 'https://www.worldsurfleague.com',
      isRecurring: true,
      level: 'Pro (spectator)',
    },
  ],
  portugal: [],
}

function normalizeDestKey(destination: string): string {
  return destination.toLowerCase().trim().replace(/\s+/g, ' ')
}

function matchesActivity(event: KnownEvent, actKey: string): boolean {
  if (!actKey) return true
  return event.activityTypes.some((a) => actKey.includes(a) || a.includes(actKey))
}

/** Lookup curated recurring events by destination + activity. */
export function findKnownEvents(destination: string, activity: string): KnownEvent[] {
  const destKey = normalizeDestKey(destination)
  const actKey = activity.toLowerCase().trim()

  const exact = KNOWN_EVENTS[destKey]
  if (exact?.length) {
    return exact.filter((e) => matchesActivity(e, actKey))
  }

  for (const [key, events] of Object.entries(KNOWN_EVENTS)) {
    if (key !== 'portugal' && (destKey.includes(key) || key.includes(destKey))) {
      const found = events.filter((e) => matchesActivity(e, actKey))
      if (found.length) return found
    }
  }

  if (
    destKey.includes('portugal') ||
    destKey.includes('peniche') ||
    destKey.includes('ericeira') ||
    destKey.includes('nazare') ||
    destKey.includes('sagres')
  ) {
    const ptEvents = KNOWN_EVENTS['portugal'] || []
    const surfEvents = KNOWN_EVENTS['ericeira'] || []
    return [...ptEvents, ...surfEvents].filter((e) => matchesActivity(e, actKey))
  }

  return []
}
