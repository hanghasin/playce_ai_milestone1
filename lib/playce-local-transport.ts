import type { MatrixLocationData, LocalTransportDetail, LocalTransportMode } from '@/lib/playce-location-types'

/** Legacy PUBLIC | APP enums from older API payloads. */
type LegacyMobilityType = 'PUBLIC' | 'APP' | 'RENTAL' | 'WALKING'

export function normalizeLocalTransportType(raw: unknown): LocalTransportMode {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim()
  const map: Record<string, LocalTransportMode> = {
    rideshare: 'rideshare',
    public: 'public',
    rental: 'rental',
    walking: 'walking',
    ferry: 'ferry',
    app: 'rideshare',
    'public transit': 'public',
    'public_transport': 'public',
    subway: 'public',
    metro: 'public',
    train: 'public',
    bus: 'public',
    tram: 'public',
    bikeshare: 'rental',
  }
  if (map[s]) return map[s]
  if (/\b(public|metro|train|bus|tram|subway)\b/i.test(s)) return 'public'
  if (/\b(rental|bike|scooter|hire)\b/i.test(s)) return 'rental'
  if (/\bwalk|pedestrian|foot\b/i.test(s)) return 'walking'
  if (/\bferry|boat|water\b/i.test(s)) return 'ferry'
  if (/\b(grab|uber|bolt|lyft|gojek|didi|ola|careem|taxi)\b/i.test(s)) return 'rideshare'
  return 'public'
}

function inferModeFromName(name: string): LocalTransportMode {
  return normalizeLocalTransportType(name)
}

export function fallbackTransportGuess(city: string, country: string): LocalTransportDetail[] {
  const ctx = `${city} ${country}`.toLowerCase()
  const c = ctx.replace(/\s+/g, ' ')

  if (/\bbangkok\b|thailand\b/.test(c)) {
    return [
      {
        name: 'Grab',
        type: 'rideshare',
        description: 'Most reliable for point-to-point — set price before you ride; no negotiation.',
        appStore: 'Grab',
        cost: '฿60–200 per trip',
      },
      {
        name: 'BTS Skytrain',
        type: 'public',
        description: 'Fastest for central Bangkok — buy a Rabbit Card for tap-in convenience.',
        appStore: 'BTS Skytrain (Rabbit)',
        cost: '฿16–59 per trip',
      },
      {
        name: 'MRT',
        type: 'public',
        description: 'Covers areas BTS misses — Silom and Sukhumvit interchange at Asok.',
        appStore: '',
        cost: '฿16–42 per trip',
      },
      {
        name: 'Bolt',
        type: 'rideshare',
        description: 'Often cheaper than Grab for short hops; confirm pickup zone at busy malls.',
        appStore: 'Bolt',
        cost: '฿40–150 per trip',
      },
    ]
  }

  if (/\bseoul\b|south korea|korea\b/.test(c)) {
    return [
      {
        name: 'T-money Card',
        type: 'public',
        description: 'Load credit at any convenience store — works on subway, bus, and some taxis.',
        appStore: '',
        cost: '₩1,400–2,150 per ride',
      },
      {
        name: 'Kakao T',
        type: 'rideshare',
        description: 'Local taxi and ride-hailing — more predictable than curb hailing; English UI.',
        appStore: 'Kakao T',
        cost: 'Meter + booking fee',
      },
      {
        name: 'Seoul Metro',
        type: 'public',
        description: 'Wide network across the metro area — pair with Naver Map for Korean routing.',
        appStore: 'Naver Map',
        cost: '₩1,400 base fare',
      },
    ]
  }

  if (/\btokyo\b|japan\b/.test(c)) {
    return [
      {
        name: 'Suica / PASMO',
        type: 'public',
        description: 'IC card for JR and subway lines — mobile wallet Suica skips ticket machines.',
        appStore: 'Suica (Apple Wallet / Google Wallet)',
        cost: '¥140–300 per trip',
      },
      {
        name: 'Google Maps',
        type: 'public',
        description: 'Strong multimodal routing in Tokyo — shows platforms and exit guidance.',
        appStore: 'Google Maps',
        cost: 'Free',
      },
      {
        name: 'GO',
        type: 'rideshare',
        description: 'Metered taxis via app — useful when trains stop or bags are heavy.',
        appStore: 'GO',
        cost: 'Meter rate',
      },
    ]
  }

  if (/\bbali\b|indonesia\b/.test(c)) {
    return [
      {
        name: 'Gojek',
        type: 'rideshare',
        description: 'Ojek (motorbike) for solo hops; GoCar when you need AC or luggage room.',
        appStore: 'Gojek',
        cost: 'Rp 10,000–50,000',
      },
      {
        name: 'Grab',
        type: 'rideshare',
        description: 'More consistent cars in resort pockets; compare with Gojek on price.',
        appStore: 'Grab',
        cost: 'Rp 15,000–80,000',
      },
      {
        name: 'Scooter rental',
        type: 'rental',
        description: 'Dominant round Canggu/Seminyak — carry license and insist on helmets.',
        appStore: '',
        cost: 'Rp 60,000–100,000 per day',
      },
    ]
  }

  if (/\blisbon\b|\bporto\b|\bportugal\b/.test(c)) {
    return [
      {
        name: 'Bolt',
        type: 'rideshare',
        description: 'Common for city hops — fares shown upfront in-app.',
        appStore: 'Bolt',
        cost: '€4–15 per trip',
      },
      {
        name: 'Uber',
        type: 'rideshare',
        description: 'Reliable backups in tourist pockets and late nights.',
        appStore: 'Uber',
        cost: '€5–18 per trip',
      },
      {
        name: 'CP – Comboios de Portugal',
        type: 'public',
        description: 'Intercity trains and some commuter legs — tickets via app or station kiosks.',
        appStore: 'CP Comboios',
        cost: '€3–12 per segment',
      },
    ]
  }

  const countryGuess = country.toLowerCase()
  if (/^united states|u\.s\.|^usa\b/.test(countryGuess)) {
    return [
      {
        name: 'Lyft / Uber',
        type: 'rideshare',
        description: `Compare both in ${city} — surge spikes around events; pin a pickup away from choke points.`,
        appStore: 'Lyft / Uber',
        cost: 'Varies · fare shown in app',
      },
      {
        name: `${city} local transit`,
        type: 'public',
        description: `Load the official city transit fare card app if available — weekend schedules differ from weekdays.`,
        appStore: '',
        cost: 'Varies · check agency site',
      },
    ]
  }

  if (/uk|united kingdom|britain|england|scotland|wales/.test(countryGuess)) {
    return [
      {
        name: 'Citymapper',
        type: 'public',
        description: `Live tube, bus and rail combos for ${city} — works offline once you save the map pack.`,
        appStore: 'Citymapper',
        cost: 'Pay-as-you-go with contactless',
      },
      {
        name: 'Uber',
        type: 'rideshare',
        description: `Licensed PHV backups when the Tube shuts overnight — expect higher fares during closures.`,
        appStore: 'Uber',
        cost: 'Quoted in-app',
      },
    ]
  }

  return [
    {
      name: 'Compare ride apps',
      type: 'rideshare',
      description: `${country}: identify the dominant rideshare brands (not generic “local taxi”) and download before touchdown — prepaid SIM helps SMS verification.`,
      appStore: '',
      cost: 'Varies · app estimate',
    },
    {
      name: 'Metro / commuter rail spine',
      type: 'public',
      description: `${city}: use the city's primary metro or commuter operator by name once confirmed on official maps.`,
      appStore: '',
      cost: 'Varies · ticket kiosk or QR',
    },
  ]
}

/** Persisted/handoff payloads may include legacy string rows — normalize here. */
export type LocalTransportPersistedInput =
  | MatrixLocationData['localTransport']
  | unknown[]
  | null
  | undefined

/** Merge structured localTransport entries with legacy string rows and OLD transportOptions. */
export function mergeLocalTransportForLocation(payload: {
  name: string
  country: string
  transportOptions?: MatrixLocationData['transportOptions']
  localTransport?: LocalTransportPersistedInput
}): LocalTransportDetail[] {
  const rawLt = payload.localTransport
  const rows: unknown[] = Array.isArray(rawLt) ? rawLt : []
  const { transportOptions, name, country } = payload
  const out: LocalTransportDetail[] = []
  const seen = new Set<string>()

  const push = (row: LocalTransportDetail) => {
    const key = row.name.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({
      ...row,
      description: row.description.trim(),
      appStore: (row.appStore ?? '').trim(),
      cost: (row.cost ?? '').trim(),
    })
  }

  for (const entry of rows) {
    if (entry === null || entry === undefined) continue
    if (typeof entry === 'string') {
      const label = entry.trim()
      if (!label) continue
      push({
        name: label,
        type: inferModeFromName(label),
        description: `Practical for getting around ${name} — double-check fares and surge windows in-app before you commit.`,
        appStore: '',
        cost: 'Verify live',
      })
      continue
    }
    if (typeof entry !== 'object') continue
    const obj = entry as unknown as Record<string, unknown>
    const rowName = String(obj.name ?? '').trim()
    if (!rowName) continue
    push({
      name: rowName,
      type: normalizeLocalTransportType(obj.type),
      description: String(obj.description ?? '').trim() || `Useful movement option around ${name} — verify hours and ticketing on arrival.`,
      appStore: typeof obj.appStore === 'string' ? obj.appStore : '',
      cost: typeof obj.cost === 'string' && obj.cost.trim() ? obj.cost.trim() : 'Verify live',
    })
  }

  if (out.length === 0 && transportOptions?.length) {
    for (const opt of transportOptions) {
      const legacy = opt.type as LegacyMobilityType
      const type: LocalTransportMode =
        legacy === 'APP' ? 'rideshare' : legacy === 'RENTAL' ? 'rental' : legacy === 'WALKING' ? 'walking' : 'public'
      push({
        name: opt.name.trim(),
        type,
        description: opt.description.trim(),
        appStore: type === 'rideshare' ? opt.name.trim() : '',
        cost: 'Verify live',
      })
    }
  }

  if (out.length === 0) {
    fallbackTransportGuess(name, country).forEach(push)
  }

  return out.slice(0, 12)
}

/** Bridge for code paths still keyed on PUBLIC | APP enums. */
export function legacyTransportOptionsFromStructured(rows: LocalTransportDetail[]): NonNullable<MatrixLocationData['transportOptions']> {
  return rows.map((r) => ({
    name: r.name,
    description: `${r.description}${r.cost.trim() ? ` Rough cost: ${r.cost.trim()}` : ''}`.trim(),
    type:
      r.type === 'rideshare'
        ? 'APP'
        : r.type === 'rental'
          ? 'RENTAL'
          : r.type === 'walking'
            ? 'WALKING'
            : 'PUBLIC',
  }))
}
