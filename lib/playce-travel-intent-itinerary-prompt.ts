/**
 * Itinerary structure + copy rules keyed by session `travelIntent` + trip length.
 * Client sends the same value as browser sessionStorage key `travelIntent` in context.travelIntent.
 * Consumed by /api/chat system prompt.
 */

export type TravelIntent = 'practice' | 'competing' | 'watching'

export function normalizeTravelIntent(raw: unknown): TravelIntent | undefined {
  if (raw === 'practice' || raw === 'competing' || raw === 'watching') return raw
  if (raw === 'spectating' || raw === 'supporting') return 'watching'
  return undefined
}

/** Client-only: sessionStorage key `travelIntent`. */
export function readBrowserTravelIntent(): TravelIntent | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return normalizeTravelIntent(sessionStorage.getItem('travelIntent'))
  } catch {
    return undefined
  }
}

/** Fallback when sessionStorage `travelIntent` is missing. */
export function tripRoleToTravelIntent(
  role: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING' | 'SPECTATOR' | 'SUPPORTING' | undefined | null
): TravelIntent | undefined {
  if (role === 'COMPETITOR') return 'competing'
  if (role === 'WATCHING' || role === 'SPECTATOR' || role === 'SUPPORTING') return 'watching'
  if (role === 'ACTIVE_TRAVEL') return 'practice'
  return undefined
}

function durationBand(n: number): 'w2' | 'w35' | 'w710' | 'w14' | 'open' {
  if (n <= 2) return 'w2'
  if (n <= 5) return 'w35'
  if (n <= 10) return 'w710'
  if (n <= 14) return 'w14'
  return 'open'
}

function plainLanguageItineraryBlock(): string {
  return [
    'PLAIN LANGUAGE (itinerary — mandatory for every intent):',
    '- Write activities so a first-time traveler understands every line without searching jargon.',
    '- Avoid unexplained race jargon. NEVER use without a plain explanation in the same bullet: "nipple glide" (say anti-chafe prep or body glide), "corral transit" (say walk to your start group or start zone), "throwaway layers" (say old clothes to discard at the start), "bathroom passes" (say pre-race toilet stops), unexplained "strides", unexplained "taper".',
    '- Preferred plain phrases: anti-chafe prep (body glide); walk to your start zone; wear old clothes to discard; easy ~20 min warm-up run instead of unexplained shakeout jargon; short fast accelerations for strides; reducing training volume before race day for taper.',
    '- If a technical term is required, add plain text in parentheses immediately after it.',
  ].join('\n')
}

function globalRulesBlock(): string {
  return [
    'GLOBAL RULES (ALL INTENTS — mandatory):',
    '- Intent source: context.travelIntent MUST match sessionStorage `travelIntent`: practice | competing | watching (legacy spectating/supporting map to watching).',
    '- You are a sports travel expert with deep local knowledge. Never generate placeholder location names. Every venue, airport, neighbourhood, and activity must be a real place that exists (verify mentally against common knowledge).',
    '- GEOGRAPHY ACCURACY: Always use real, specific names. Never use generic placeholders like "Main airport", "Central district", "local area", "nearby zone".',
    '- Airports: use IATA code + full official name in pairs (e.g. "JFK — John F. Kennedy International", "EWR — Newark Liberty International") when naming gateways; pick the realistic one for the guest origin when relevant.',
    '- Neighbourhoods: use real districts (e.g. "Midtown Manhattan", "Williamsburg, Brooklyn", "Lower East Side") — never invented zones.',
    '- ACTIVITY SPECIFICITY: Never repeat the destination city or country name inside a single activity description (event title alone is OK).',
    '- FORBIDDEN as stand-alone activity labels: "race route preview", "Main airport for [city]", "Central district". Use concrete segments instead (e.g. "Course preview — Central Park loop", "Shakeout — East River Greenway").',
    '- EVENT-BASED STRUCTURE: When the trip targets a race or dated event and context.travelIntent !== "practice", anchor the skeleton on race day: arrival + bib/expo → course recon / shakeout → race day → recovery → departure; compress days when N is small (4-day = arrive+bib, recon+prep, race, recovery+depart).',
    '- Output exactly N = context.refine.durationDays days, numbered 1..N — never more, never fewer.',
    '- Last day must end with concrete departure logistics (named airport/station/terminal + realistic timing).',
    '- Each activity `name` / bullet: max 12 words; short, scannable, actionable.',
    '- No filler phrases: ban "explore the city", "enjoy local culture", "take it easy", "soak up the vibe" — every bullet is a specific named action.',
    '',
    plainLanguageItineraryBlock(),
  ].join('\n')
}

function practiceBlock(n: number, band: ReturnType<typeof durationBand>): string {
  const header = [
    '═══════════════════════════════════',
    'INTENT: PRACTICE & EXPERIENCE (context.travelIntent === practice)',
    '═══════════════════════════════════',
    'Focus: movement, local scene, personal pace.',
    'FORBIDDEN: race logistics, bib, competition, corral, race pack, "race day" for the user.',
    'Bullet vocabulary: personal, active, exploratory. GOOD: "Morning surf session at [real beach name]". BAD: "Training block", "Fundamentals clinic".',
  ].join('\n')

  let skeleton: string
  if (band === 'w2') {
    skeleton = [
      `N=${n} (weekend):`,
      'Day 1: Arrive + first session (evening or morning to match arrival) + named meal spot beside the training geography.',
      'Day 2: Main session of the trip + one named neighbourhood (not generic) + depart.',
    ].join('\n')
  } else if (band === 'w35') {
    skeleton = [
      `N=${n} (3–5 days) — merge these themes into exactly N days; drop from the end first if N<5; compress 2 days into 1 only when necessary:`,
      'Day 1: Arrive + settle + light session (named).',
      'Day 2: Full training day + touch local community (named venue/grouping).',
      'Day 3: Rest or cross-training + one specific explore anchor (named).',
      'Day 4 (if N≥4): Second full session (named).',
      'Day 5 (if N≥5): Morning session + depart.',
      'If N=3: omit D4–5; ensure last day still has departure if user leaves that day.',
      'If N=4: D4 = second session + depart OR morning session + depart per flow.',
    ].join('\n')
  } else if (band === 'w710') {
    skeleton = [
      `N=${n} (7–10 days) — scale to exactly N; trim middle "peak" days first if N<10:`,
      'Day 1: Arrive + neighbourhood recon (named streets/areas).',
      'Day 2–3: Foundation sessions (different named venues each day).',
      'Day 4: Rest day — one named cultural/craft/food anchor (not generic).',
      'Day 5–7: Peak training block (named sites per day).',
      'Day 8: Recovery + explore further out (named half-day).',
      'Day 9: Final session (named).',
      'Day 10: Depart (if N=10). If N<10: merge 5–7 block and keep arrive + final session + departure legible.',
    ].join('\n')
  } else if (band === 'w14') {
    skeleton = [
      `N=${n} (2 weeks / 14 days) — if N<14 compress adjacent days from the middle; preserve arrival, peak flavour, departure:`,
      'Day 1–2: Arrive + orientation sessions (named).',
      'Day 3–5: Build block (named venues).',
      'Day 6: Rest (named light anchor).',
      'Day 7–9: Peak block (named).',
      'Day 10: Mid-trip rest + one named city-day anchor.',
      'Day 11–12: Advanced sessions (named).',
      'Day 13: Wind down + final explore (named).',
      'Day 14: Depart.',
    ].join('\n')
  } else {
    skeleton = [
      `N=${n} (>14 days): Use the 14-day practice arc as the spine; extend extra days with additional named sessions or recovery anchors; never exceed N; never generic rest days without a named action.`,
    ].join('\n')
  }

  return [header, '', skeleton].join('\n')
}

function competingBlock(n: number, band: ReturnType<typeof durationBand>): string {
  const header = [
    '═══════════════════════════════════',
    'INTENT: COMPETING & RACING (context.travelIntent === competing)',
    '═══════════════════════════════════',
    'Focus: race performance, logistics, recovery. Every day serves the race.',
    'Bullet vocabulary: precise, operational, athlete-focused.',
    'GOOD: "Bib collection at [real venue]", "Course preview — [real segment name]", "Shakeout run — 20 min easy from [corner]", "Race day — start [time], start line at [real place]".',
    'BAD: "Training block", "Session prep" as mushy labels — be operational.',
    'FORBIDDEN labels: never use "race route preview" or "[event] race route preview" as an activity name — describe the actual segment, bridge, park loop, or official expo step instead.',
    'FORBIDDEN competing-day themes: never use beginner-camp language — ban day titles/phrases like "Foundation Training", "fundamentals clinic", "Progressive drills" as the main arc. Competing weeks must read as athlete operations: bib/packet pickup, carb loading, sleep discipline, course recon, getting to the start area, race morning, recovery — use plain language from PLAIN LANGUAGE rules, not unexplained jargon.',
  ].join('\n')

  let skeleton: string
  if (band === 'w2') {
    skeleton = [
      `N=${n} (weekend):`,
      'Day 1: Arrive + bib & race pack collection + course preview walk/run (named segments) + carb-load dinner near real start geography.',
      'Day 2: Race day — warm-up, race, finish-line recovery + depart (evening travel only after recovery).',
    ].join('\n')
  } else if (band === 'w35') {
    skeleton = [
      `N=${n} (3–5 days) — exactly N days:`,
      'Day 1: Arrive + race registration + course recon on key segments (named).',
      'Day 2: Shakeout run or rest + gear check + race briefing (named).',
      'Day 3: Race day (full arc).',
      'Day 4 (if N≥4): Recovery — easy movement + celebrate or decompress (named).',
      'Day 5 (if N≥5): Depart.',
      'If N=3: compress to Arrive + racer ops / Race day / Depart with minimal recovery named.',
      'If N=4: merge recovery into D4 before depart or omit standalone depart day per tight window.',
    ].join('\n')
  } else if (band === 'w710') {
    skeleton = [
      `N=${n} (7–10 days):`,
      'Day 1–2: Arrive + acclimatise + register + recon (named).',
      'Day 3–4: Structured training on course (named).',
      'Day 5: Rest — stay off feet (named light logistics only).',
      'Day 6: Shakeout + final gear check (named).',
      'Day 7: Race day.',
      'Day 8–9: Recovery + limited named city logistics.',
      'Day 10: Depart (if N=10). Adjust middle if N<10.',
    ].join('\n')
  } else if (band === 'w14') {
    skeleton = [
      `N=${n} (2 weeks):`,
      'Day 1–3: Arrive + acclimatise + local training runs (named).',
      'Day 4–5: Course recon + race-prep sessions (named).',
      'Day 6: Rest.',
      'Day 7: Race day.',
      'Day 8–10: Full recovery + city exploration (named venues).',
      'Day 11–12: Optional secondary event or easy training resumes (named).',
      'Day 13: Final day + pack (named logistics).',
      'Day 14: Depart.',
      'If N<14: merge adjacent blocks from the middle; keep one unmistakable race day.',
    ].join('\n')
  } else {
    skeleton = [
      `N=${n} (>14): Anchor on the 14-day competing arc; extra days = additional recovery or easy doubles — all named; one primary race day.`,
    ].join('\n')
  }

  return [header, '', skeleton].join('\n')
}

function watchingBlock(n: number, band: ReturnType<typeof durationBand>): string {
  const header = [
    '═══════════════════════════════════',
    'INTENT: WATCHING & SUPPORTING (context.travelIntent === watching)',
    '═══════════════════════════════════',
    'The user is attending a sports event as a non-participant — either watching professional athletes or supporting someone they know who is competing.',
    'Treat both cases identically:',
    '- Recommend destinations where events are happening',
    '- Structure itinerary around event timeline',
    '- Include cheer/viewing point logistics',
    '- Include waiting-period activities',
    '- Accommodation near start/finish area',
    '- How to move between event checkpoints',
    '',
    'FORBIDDEN: race entry, bib pickup, pacing, or carbohydrate/taper scripting for THIS traveller.',
    'GOOD (merge fan + crew ops): vantage belts, ticketing/entry queues, transit between checkpoints, purposeful waits (cafés, river walks), reunion at finish precinct, hydration/snack handoffs for someone racing when relevant.',
    'BAD: vague "watch the race" only; phantom corral drills for the non-racing traveller.',
  ].join('\n')

  let skeleton: string
  if (band === 'w2') {
    skeleton = [
      `N=${n} (weekend):`,
      'Day 1: Arrive + stay near start/finish spine + scout viewing/cheer nodes and transit hops between checkpoints (all named).',
      'Day 2: Event day — start-belt vantage → mid-course position (named) → reunion finish apron + purposeful wait blocks if pacing someone → depart after crowd eases.',
    ].join('\n')
  } else if (band === 'w35') {
    skeleton = [
      `N=${n} (3–5 days):`,
      'Day 1: Arrive + orientation + lodging sportReason tying start/finish access + ticket/expo scouting (named).',
      'Day 2: Course/circuit walk — map 3 viewing or cheer hops + downtime pockets (cafés/transit) — all named.',
      'Day 3: Main event timeline — checkpoints, waiting activities, reunion (named).',
      'Day 4 (if N≥4): Post-event fan zones or mellow culture day (named).',
      'Day 5 (if N≥5): Depart.',
      'Truncate if N<5; preserve one clear anchored event day.',
    ].join('\n')
  } else if (band === 'w710') {
    skeleton = [
      `N=${n} (7–10 days):`,
      'Day 1–2: Arrive + explore city corridors (named) + lodging near course spine.',
      'Day 3: Public expo/fan-facing ops + course recon (named).',
      'Day 4: Rest / waiting-day activities near the route (named).',
      'Day 5: Final checkpoint + viewing strategy + transit timings (named).',
      'Day 6: Event execution — multi-position supporter or spectator arc (named).',
      'Day 7–8: Post-event decompression + meetups (named).',
      'Day 9–10: Optional regional day + depart.',
      'Slim middle if N<10.',
    ].join('\n')
  } else if (band === 'w14') {
    skeleton = [
      `N=${n} (2 weeks):`,
      'Day 1–3: Arrive + neighbourhood depth beyond the stadium line (named).',
      'Day 4: Fan/expo-facing walk-through (named).',
      'Day 5: Course checkpoints + downtime map (named).',
      'Day 6: Light local trip + early night before main event.',
      'Day 7: Main event timeline — checkpoints, cheering, reunion (named).',
      'Day 8–12: Recovery-paced city days + optional satellite events (named).',
      'Day 13: Pack-down.',
      'Day 14: Depart.',
      'Merge blocks when N<14.',
    ].join('\n')
  } else {
    skeleton = [
      `N=${n} (>14): Use the 14-day watching/support spine; extra days = more named fan corridors or purposeful wait anchors — never assign this guest a race entry.`,
    ].join('\n')
  }

  return [header, '', skeleton].join('\n')
}

function budgetTierItineraryInstructions(budgetRangeRaw?: string): string {
  const raw = (budgetRangeRaw ?? 'MID-RANGE').toUpperCase().replace(/\s+/g, '-')
  const tier = raw === 'ESSENTIAL' ? 'Essential' : raw === 'LUXE' ? 'Luxe' : 'Mid-range'
  return [
    '',
    `USER BUDGET TIER (context.refine.budgetRange): ${tier}`,
    tier === 'Essential'
      ? 'Essential traveller: prioritize free/low-cost activities, street food corridors, buses/metro/shared transit, hostel-friendly timing, self-guided exploration — minimise paid concierge add-ons.'
      : tier === 'Luxe'
        ? 'Luxe traveller: emphasize premium/private experiences (private transfers, concierge-friendly timing, Michelin-adjacent or chef-led dinners, quieter premium stays), convenience upgrades, skip conspicuous budget/hostel hacks entirely.'
        : 'Mid-range traveller: balance paid anchors with neighbourhood walks, one standout guided/local experience mid-trip, dine at credible local restaurants outside pure tourist corridors, taxis only when justified.',
    'Activities must visibly align with THIS tier vocabulary and spend pattern while keeping real geography rules.',
  ].join('\n')
}

/**
 * Appended to the strategic advisor system prompt when `travelIntent` + `durationDays` are set.
 */
export function buildTravelIntentItineraryAppendix(
  intent: TravelIntent,
  durationDays: number,
  budgetTier?: string
): string {
  const n = Math.max(1, Math.min(21, Math.round(durationDays)))
  const band = durationBand(n)
  const core =
    intent === 'practice'
      ? practiceBlock(n, band)
      : intent === 'competing'
        ? competingBlock(n, band)
        : watchingBlock(n, band)
  return [
    'PRIMARY SIGNAL: Use context.travelIntent (sessionStorage key `travelIntent`: practice | competing | watching). Pick ONE block below.',
    '',
    core,
    budgetTierItineraryInstructions(budgetTier),
    '',
    globalRulesBlock(),
  ].join('\n')
}
