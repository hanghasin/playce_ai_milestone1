import { NextResponse } from 'next/server'
import {
  enrichIntentLocation,
  intentRecommendationsResponseSchema,
  stripJsonFence,
} from '@/lib/intent-recommendations-schema'
import { getDestinationImage } from '@/lib/unsplash'
import {
  inferCountryFromPlaceName,
  isGenericPlaceName,
  isUnknownOrMissingCountry,
  parseCountryFromLocationLabel,
} from '@/lib/location-fallbacks'
import { airportFallbackInstruction, primaryAirportsLine } from '@/lib/playce-airport-hints'
import { stripAnyRolePromptSuffix } from '@/lib/playce-role-prompt'
import { cleanIntentTitle } from '@/lib/intent-title-clean'
import { callClaude, cleanJsonText } from '@/lib/claude'
import { hasGroqApiKeys } from '@/lib/groq-client'
import { getCachedResponse, setCachedResponse, buildCacheKey } from '@/lib/cache'
import {
  buildPortugalSurfCuratedResult,
  groqRateLimitWaitHint,
  matchesPortugalSurfIntent,
} from '@/lib/curated-intent-fallback'
import { PLAYCE_VOICE_AND_TONE_PROMPT } from '@/lib/playce-voice-tone-prompt'
import { PLAYCE_SOFT_ERROR, rateLimitUserMessage } from '@/lib/playce-user-facing-errors'

type IntentTripRole = 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'

/** Long-form guidance for non-participants (fan + support crew unified). */
const WATCHING_MODE_APPENDIX = `

[WATCHING & SUPPORTING MODE — mandatory framing]
The user attends a sport event as a non-participant: either watching professional athletes OR supporting someone they know who is competing. Treat both identically.

Recommend destinations where:
1) Real recurring or credibly scheduled events anchor the trip when the user's prompt implies an event cadence.
2) Fan access, ticketing realism, vantage belts, spectator transit, purposeful downtime pockets between checkpoints, and reunions near start/finish are honest strengths.
3) Lodging neighbourhoods tolerate event-night noise and closure patterns.

Combines spectator atmosphere with support-crew practicality: ticketing and fan zones when relevant; cheer-hop choreography and waiting-period anchors when supporting a racer — never steer the traveller into athlete training circuits, racer bib scripts, participant-only prep gear, or "your taper" narratives for THIS guest.

activityDescriptor skews toward event-grounded ops when apt, for example:
• "World Tour stop · strong fan walkways"
• "Annual race weekend — compact course between cheer belts"
• "Arena district — ticketed tiers + city atmosphere"
`

function buildFallbackIntentTitle(
  originalQuery: string,
  summary: string | undefined,
  firstLocation: { name: string; activity: string } | undefined
): string {
  const fallback = firstLocation ? `${firstLocation.activity} in ${firstLocation.name}` : 'Recommended destinations'
  const raw = cleanIntentTitle((summary ?? '').trim()) || fallback
  const promptLower = originalQuery.toLowerCase()
  const rawLower = raw.toLowerCase()

  const restrictedTerms = ['solo', 'female', 'women', "women's", 'woman', 'girl', 'girls']
  const hasForbiddenInference = restrictedTerms.some(
    (term) => rawLower.includes(term) && !promptLower.includes(term)
  )

  const compact = raw.split(/\s+/).filter(Boolean).slice(0, 8).join(' ')
  if (hasForbiddenInference) return cleanIntentTitle(fallback)
  if (!compact) return cleanIntentTitle(fallback)
  return cleanIntentTitle(compact)
}

function buildSystemPrompt(): string {
  return [
    PLAYCE_VOICE_AND_TONE_PROMPT,
    'Respond with valid JSON only. No markdown formatting, no code fences, no explanation text before or after. Start your response with { and end with }.',
    'You are a sports and active travel recommendation engine.',
    'ONLY recommend activities from these valid sports/active categories (body is the primary instrument): water sports (kayak, surf, paddleboard, sailing, open water swimming, white water rafting, kitesurfing, windsurfing); mountain/outdoor (hiking, trail running, climbing, bouldering, rock climbing, sport climbing, via ferrata, mountain biking, road cycling race, gravel cycling, ski, snowboard, marathon, half marathon, trail race, ultramarathon, obstacle course race, canyoning, coasteering); air (paragliding, hang gliding, skydiving); wellness/movement (yoga retreat, meditation retreat, martial arts training (BJJ, Muay Thai, MMA), cycling tour, CrossFit competition, calisthenics); urban active (parkour, street running, cycling, skateboarding, longboarding); multi-sport events (triathlon, duathlon, Spartan Race); horse sports (horse riding, polo).',
    'NEVER recommend: museums, galleries, monuments, cathedrals; shopping, dining, nightlife; passive sightseeing; anything where the main experience is looking not doing physically.',
    'If a destination has few sports options, pick the closest available active experiences.',
    'Amiens example: canal kayaking, Somme cycling routes, trail running along the river, hortillonnages paddling tours.',
    'Return EXACTLY 3 results as one JSON object. No markdown.',
    'Template:',
    '{"intentSummary":"","detectedSkillLevel":null,"locations":[{"recommendationKind":"","primaryTitle":"","locationLabel":"","name":"","country":"","activity":"","imageSearchTerm":"","season":"","difficulty":"","vibe":"","vibeTags":["","",""],"soloSafe":false,"activityDescriptor":"","womenFriendly":0,"soloIndex":0,"nightSafety":0,"harassmentRisk":0,"communityDensity":0,"infrastructureScore":0,"soloQuotes":[],"nearestAirport":"","visaRequirements":"","budgetEssential":"","budgetMidrange":"","budgetLuxe":"","budgetNeighborhood":"","midrangeNeighborhood":"","luxeNeighborhood":"","optimalDurationDays":0,"stayRecommendation":{"name":"","type":"","nightlyPrice":""},"localTransport":[{"name":"","type":"rideshare","description":"","appStore":"","cost":""}],"transportOptions":[],"diningDistricts":[{"area":"","description":""}],"activityZones":"","tripRhythm":{"morning":"","afternoon":"","evening":"","night":""},"whyThisSpot":[{"icon":"🌊","text":"Specific factual sentence starting with the key data point for this destination.","boldPhrase":"exact substring of key fact"},{"icon":"📅","text":"Timing or season fact with specific months and what changes.","boldPhrase":"exact substring of timing fact"},{"icon":"🏄","text":"Skill level or terrain/conditions fact naming specific breaks, trails, or sectors.","boldPhrase":"exact substring of skill fact"},{"icon":"✈️","text":"Access fact — distance and travel time from nearest major airport.","boldPhrase":"exact substring of access fact"}],"bestSeason":"","typicalWeather":"Oct–Apr: 14–18°C, mild with Atlantic rain","mustTryExperiences":[{"name":"","status":"","risk":""}],"logistics":[],"facilities":[{"name":"","available":true}],"conditions":{"temp":""},"upcomingEvents":[{"name":"","date":"","description":"","website":"","isRecurring":false}]}}]}',
    '',
    'INTENT DETECTION (analyze the user phrase):',
    '- Input ONLY a destination (no activity): return 3 different PHYSICAL SPORTS ACTIVITIES there. Put each activity in the `activity` field. `primaryTitle` MUST still be a real geographic place name — a neighbourhood, trailhead, beach sector, or venue zone inside that destination where that activity fits (never the activity word as the title). `locationLabel` = destination (City, Region, Country format). Activities must vary by type — e.g. one water sport, one trail/outdoor athletic, one urban athletic discipline. NEVER museums, monuments, galleries, shopping, passive sightseeing, dining crawl.',
    '- Input ONLY an activity/sport (no destination): return 3 different DESTINATIONS where that sport shines. recommendationKind="destination". `name` = destination anchor. `primaryTitle` MUST be that real place name (city or famous spot). Meaningfully distant — not same peninsula three times.',
    '- Input BOTH destination + activity: return 3 SPOTS within that geography for THAT activity. recommendationKind="spot". `name` / primaryTitle = specific beach/town/track/sector name. NEVER repeat identical primary titles.',
    '- NEVER duplicate the card title across rows. NEVER recommend tourist landmarks, galleries, malls, gastronomy crawl, nightlife-only, or sightseeing without physical movement.',
    '',
    'RESULTS CARD DATA (critical):',
    '- primaryTitle MUST be a real geographic place name. The activity belongs in `activity` + activityDescriptor, not in the title.',
    '  CORRECT primaryTitle examples: "Peniche", "Nazaré", "Ericeira", "Supertubos", "Baleal Bay", "Canggu".',
    '  WRONG primaryTitle examples: "surfing", "big wave surfing", "surfing — riverside", "marathon route", "yoga beach".',
    '  If you catch yourself writing an activity word as the title, stop — use the specific beach, town, or area name instead.',
    '- locationLabel: always "City/spot, Country" or clear region + country (never "Destination, Unknown").',
    '- season: one line as users read it. Use "Year-round" for always-on (never split). Month ranges use an en dash: "Sep–Jun".',
    '- difficulty: exactly one of "Beginner" | "Intermediate" | "Pro" (use Pro for advanced/expert/elite).',
    '- vibeTags: EXACTLY 2–3 short tags per card that describe the specific character of THAT spot — terrain, exposure, crowd energy, water shape, hazard profile — NOT generic traveller qualities.',
    '  Forbidden template vibes on every card: do NOT reuse the same tags across all three rows (e.g. identical "Solo-safe", "Explorer-friendly", or copy-pasted pairs).',
    '  vibeTags must ALL differ card-to-card: no tag string may match another card\'s set.',
    '  Portugal surf triad example (style, not mandatory text): Supertubos/Peniche belt → ["Powerful","Exposed","Hollow"]; Nazaré → ["Massive","Spectator-friendly","Dramatic"]; Ericeira reserve → ["Reef-lined","Consistent","Intermediate-friendly"].',
    '- soloSafe: boolean, true if soloIndex >= 75 (otherwise false).',
    '- activityDescriptor: 3–6 words, THE most important line. The single most distinctive PHYSICAL characteristic of this place for this activity. Factual. Never: beautiful, amazing, stunning, perfect unless world-famous and objective.',
    '  By activity family, pick style like:',
    '  Surf/kite/wind: e.g. "World-class barreling beach break", "Gentle reform, perfect for beginners", "Flat water lagoon, ideal for kite".',
    '  Marathon/run/trail: e.g. "Fast flat course, spring conditions", "170km, 10,000m elevation gain", "Urban night race, tropical heat".',
    '  Ski/snowboard: e.g. "Off-piste capital, serious terrain", "Largest ski area in the Alps", "Powder-focused, backcountry access".',
    '  Climb/boulder/via ferrata: e.g. "Limestone sport climbing, 200+ routes", "Granite boulders, Font-style problems".',
    '  Cycling/MTB: e.g. "Alpine cols, Tour de France routes", "Enduro trails, steep and technical".',
    '  Yoga/wellness: e.g. "Beachfront shala, sunrise practice", "Mountain ashram, silent retreat option".',
    '  Kayak/SUP/canoe: e.g. "Sea kayaking, island hopping routes", "White water grade III–IV rapids".',
    '  Martial arts: e.g. "Training camp hub, full immersion", "Beginner-friendly camps, daily classes".',
    '  Other sports: same idea — one sharp physical fact in 3–6 words.',
    '- imageSearchTerm: always include the activity AND a natural/landscape word. Format like "{activity} {specific spot or area} {country} {waves|ocean|mountain|snow|forest|beach|trail}".',
    '  Examples: "surf Supertubos Portugal waves", "marathon Tokyo running street", "skiing Chamonix Alps mountain", "yoga Bali beach sunrise".',
    '  Never only a city name. Never add "building", "architecture", "street" for outdoor sports.',
    '- upcomingEvents: include only genuinely known recurring events; empty [] if uncertain. NEVER invent events.',
    '',
    'INTENT MODES (how to populate `name`, `activity`, recommendationKind — must align with INTENT DETECTION):',
    '  Example Chamonix: three different sports in `activity`, three different geographic titles — NOT repeated "alpine climbing" variants.',
    '  Each of the 3 `activity` strings must name a different type of sport when mode requires variety.',
    '- Destination named only: recommendationKind may be "activity" but primaryTitle stays geographic (sector/venue/area inside that place), never the activity label alone.',
    '- Activity only: return 3 different destinations where that activity excels.',
    '  If the user names only a month/season/year (e.g. "marathon in November") and no city, pick 3 different cities/regions worldwide that fit the calendar — do NOT default all cards to one mountain town.',
    '  recommendationKind="destination". primaryTitle must be the real destination place name.',
    '- Place + activity: return 3 different spots/zones in that place for that activity.',
    '  If the user names a SPECIFIC city AND a specific activity/event together (e.g. "Seoul marathon November"), return EXACTLY 1 card for that destination and event — never substitute other cities.',
    '  recommendationKind="spot". primaryTitle must be a geographic sector/venue/beach/town name — never the generic activity label (e.g. not three cards titled "surfing").',
    'Never duplicate primaryTitle. Never reuse the same activity keyword as primaryTitle across cards.',
    'Never append · 1 / · 2 / · 3 or fake " — riverside" suffixes — use genuinely different geographic names instead.',
    '',
    'RESULTS HEADLINE (intentSummary):',
    '- The client sends a short block: [PAGE TITLE — original user trip line ONLY]. Use ONLY that line to produce intentSummary.',
    '- Generate a clean 4–8 word readable title from that line alone. Do not add trip-role calibration, UI subtitles, race-prep clauses, or any text not implied by that original line.',
    '- Do not concatenate or quote long calibration phrases.',
    '- Never add: solo, female, gender markers, or personality cues not echoed from that original line.',
    '- intentSummary must contain NO " — " appendages; no second clause after an em dash.',
    '- Max 8 words.',
    '- Examples: "surf Portugal" → "Surf spots in Portugal". "marathon Asia November" → "Marathon races in Asia in November". "Amiens" → "Things to do in Amiens".',
    '- Treat "from X" as departure context for logistics only — omit from intentSummary unless the original line names it.',
    '',
    'TRIP ROLE (when client sends [Client UI: tripRole=...]):',
    '- ACTIVE_TRAVEL (default): general sports-active tourism — trail/surf/ski/bike trip framing; do NOT assume a ticketed race unless the user prompt clearly mentions one.',
    '- COMPETITOR: frame logistics for actually racing/participating (bases near expo/start, carb windows, quiet sleep). Never describe the trip as a "foundation training camp", "beginner clinic", or generic skills course — use accreditation, taper, recon, race-morning, recovery.',
    '- WATCHING: non-participant at a sport event — watching pro competition OR supporting someone racing. Unified rules: arena/fan/atmosphere PLUS checkpoint hops, purposeful waits, reunion logistics — never athlete training rentals or racer prep copy for this traveller.',
    '- If COMPETITOR or WATCHING cannot attach real recurring events to the user’s geography/dates, leave upcomingEvents empty (unless ACTIVE_TRAVEL) and allow client fallback flows.',
    '',
    'SKILL RULES:',
    '- detectedSkillLevel is one of "Beginner-friendly" | "Intermediate" | "Advanced" | null (internal skill signal).',
    '- Every card must still output `difficulty` as exactly "Beginner" | "Intermediate" | "Pro" (map Advanced → Pro).',
    '- If detectedSkillLevel is null: assign the three cards difficulties Beginner, Intermediate, Pro (one each).',
    '- If detectedSkillLevel is set: all three cards share the mapped Beginner | Intermediate | Pro difficulty.',
    '',
    'ROAD MARATHON / RACE COURSE DEMAND (when results are destination marathons):',
    '- Align each pick with its Beginner | Intermediate | Pro buckets: Beginner → mostly flat fast courses (Valencia, Amsterdam, Chicago); Intermediate → rolling/hill classics (Athens); Pro → mega fields, bridges, tropical heat night starts, or big hills (Tokyo, NYC, Boston, SF, Bangkok).',
    '- Never label a mostly flat PB course as Advanced only because the city is famous; use course profile + conditions.',
    '',
    'QUALITY RULES:',
    '- Use real places and factual transport/airport data.',
    '- Every location MUST set accurate `country`. `locationLabel` must read "Spot or City, Country" (never Destination/Unknown). `name` mirrors the geographic anchor; `primaryTitle` must always be a real place name (see primaryTitle rules above), not an activity label.',
    '- VISA (`visaRequirements`): do NOT generate visa information; always output an empty string \"\". The UI uses a verification link keyed on `country`; never explanatory visa prose.',
    'DAILY BUDGET TIERS — set ALL THREE price bands on EVERY location:',
    '- budgetEssential: typical daily cash for Essential hostel/transit traveller (formatted like `$40–80 / day`, local currency realistic).',
    '- budgetMidrange: Mid-range traveller (formatted like `$120–200 / day`).',
    '- budgetLuxe: Luxe tier (formatted like `$300–600 / day`).',
    '- Also set district hints: budgetNeighborhood (Essential), midrangeNeighborhood (Mid-range), luxeNeighborhood (Luxe); real districts only.',
    '- No placeholders in these strings — always concrete numbers/ranges plausible for destination.',
    '- No placeholders like NONE, N/A, TBD, OPEN, CONFIRMED, Example, Placeholder, empty string.',
    '- logistics must contain exactly 3 concrete short uppercase bullets.',
    '- vibe must be 2-3 comma-separated SHORT tags that describe THIS destination’s character (terrain, climate, course feel, city mood) — not generic sport labels.',
    '- The 3 results must use 3 DIFFERENT vibe triplets; never copy the same words across cards (forbid repeating identical sets like "Endurance, Road, Scenic").',
    '- activityZones must be written for the traveler, not the race organizer. Write 1-2 sentences about WHERE to train and what the training environment feels like.',
    '- activityZones must NEVER contain the words: accreditation, corral, operational, filter, logistics (as standalone race-ops jargon), fuel depot, race director. These are race organization terms, not traveler terms. Write for someone planning their trip, not for a race director.',
    '- For marathon/race destinations, activityZones MUST name the SPECIFIC park, path, or route that runners use for training — never vague "ask locals" or generic "park loop" with no place name.',
    '- REQUIRED shape: \'[Specific place name] ([distance loop or length if known]) is the main training ground — [one practical tip: time of day, heat, crowds, surface, hydration].\' You may name TWO real places separated by "and" when both are iconic (e.g. park + riverside path).',
    '- NEVER start activityZones with "Ask locals" or "Ask local runners". Always name the actual place.',
    '- Examples — Bangkok: "Lumpini Park (2.5 km loop) and the Chao Phraya riverside path are the go-to training grounds — run before 7am before the heat builds." Seoul: "Han River Park has dozens of km of dedicated riverside paths — go early or late for cooler, less crowded repeats."',
    '- Write activityZones like a coach giving advice to a friend.',
    '- Never use generic templates like "main waterfront and central activity districts" unless literally true for that destination.',
    '- Example quality: Chamonix skiing -> Les Grands Montets / Brevent-Flegere lifts are the core ski arenas; mellow groomers alternate with steep couloirs and long vertical.',
    '- Example quality: Bali surfing -> Waist-high peelers cluster at Canggu sandbars at mid tide; reef breaks at Uluwatu reward early sessions before wind.',
    '',
    'WHY THIS SPOT (`whyThisSpot` on EVERY location — REQUIRED array of EXACTLY 4 objects):',
    'Return whyThisSpot as [{"icon":"<emoji>","text":"<string>","boldPhrase":"<string>"}, ...].',
    'Return EXACTLY 4 items — never 3, never 5.',
    '',
    'Each item must state ONE specific fact a traveler could not easily guess.',
    'Prioritize in this order:',
    '1. Official designations or rankings (WSL Reserve, UNESCO, World Championship venue, Ironman host city).',
    '2. Specific conditions data (wave height, water temp, snow depth, altitude, course gradient, heat index).',
    '3. Timing facts that affect the decision (shoulder season advantages, crowds, closures, race calendar).',
    '4. Practical access facts (distance from airport, transport time, road conditions).',
    '',
    'Rules:',
    '- text: one sentence, start with the specific fact, not "Ericeira is known for" or similar.',
    '- boldPhrase: must be an EXACT substring of text — the most decision-relevant clause (e.g. "only 11 WSL World Surfing Reserves globally", "45 minutes from Lisbon airport").',
    '- Do NOT end text with " — {boldPhrase}" as a repeated summary. The bold must sit inside the sentence.',
    '- Icons: match the point (🌊 waves/water, 📅 timing/season, 🏄 skill/breaks, ✈️ access, 🏃 running, 🏔️ altitude/terrain, 🌡️ weather, 💰 cost, 🏥 medical, 🏆 designation/ranking).',
    '',
    'Ericeira surf example (style only — never copy verbatim):',
    '  {"icon":"🌊","text":"One of only 11 WSL World Surfing Reserves globally — protected coastline with multiple world-class breaks.","boldPhrase":"only 11 WSL World Surfing Reserves globally"}',
    '  {"icon":"📅","text":"Apr–Oct delivers consistent Atlantic swell; Sep and Oct offer the best conditions with significantly fewer crowds.","boldPhrase":"Sep and Oct offer the best conditions with significantly fewer crowds"}',
    '  {"icon":"🏄","text":"Seven main breaks within 5km range from beginner-friendly Ribeira d\'Ilhas to the expert-only Pedra Branca reef.","boldPhrase":"Seven main breaks within 5km"}',
    '  {"icon":"✈️","text":"Lisbon airport is 45 minutes by car or shuttle — viable as a weekend trip or a week-long base.","boldPhrase":"45 minutes by car or shuttle"}',
    '',
    'Never include: generic advice that applies to every destination ("Early morning is quieter", "Avoid peak sun", "Get enough sleep", "Book in advance").',
    '',
    'TRIP RHYTHM (`tripRhythm` on EVERY location — morning / afternoon / evening / night):',
    'tripRhythm must reference the SPECIFIC destination by name and describe what actually happens there.',
    'Each field must be unique to this location.',
    '',
    'Rules:',
    '- Mention real place names, real conditions, real local context',
    "- Never use: 'taxi roulette', 'session corridors', 'junk miles', 'cell crush', 'federated'",
    '- Write in plain conversational language',
    '- Max 2 sentences per time slot',
    '- At least once per slot, tie the advice to this card’s `name` or an obvious sub-place inside it (beach, park, lift sector, district) — not generic sport jargon',
    '',
    'Examples of GOOD tripRhythm (style only — never copy verbatim):',
    '',
    'Bangkok marathon, competing:',
    "  morning: 'Lumpini Park opens at 4:30am — run your shakeout before the city wakes up and the heat hits.'",
    "  afternoon: 'Rest at your hotel during peak heat (32°C+). Use this time for race kit prep and studying the course map.'",
    "  evening: 'Light carb meal in Silom or Sukhumvit — avoid street food the night before racing.'",
    "  night: 'In bed by 9pm. Bangkok nightlife is loud — choose accommodation away from Khao San Road.'",
    '',
    'Nazaré surf, practice:',
    "  morning: 'Praia do Norte is best 7–10am before onshore winds build. Check MagicSeaweed the night before.'",
    "  afternoon: 'Waves typically drop after 2pm — good time to explore the old town or rest.'",
    "  evening: 'Watch the sunset from the funicular viewpoint above the beach.'",
    "  night: 'Nazaré is quiet off-season — dinner by 8pm, early sleep for dawn sessions.'",
    '',
    'Bali yoga, practice:',
    "  morning: 'Most studios run 7am and 9am classes in Ubud — book the day before, they fill fast.'",
    "  afternoon: 'Rice terrace walks or a visit to Tirta Empul temple while energy is high.'",
    "  evening: 'Seminyak or Canggu for dinner — wider range than Ubud after dark.'",
    "  night: 'Ubud gets quiet by 10pm which is ideal for early morning practice schedules.'",
    '',
    'Never copy these examples verbatim.',
    'Always write fresh content specific to the actual destination and activity in the request.',
    '',
    '- bestSeason must be a date range, not a single month. Format \'Mon–Mon\' using 3-letter abbreviations (e.g. Nov–Feb, Jun–Sep, Mar–May). If truly year-round: Year-round.',
    '- Never return a single month name.',
    '- typicalWeather (string on each location): AIR temperature and general conditions only — never water temperature, wave height, or ocean data.',
    '  Format: "{months}: {air temp range}°C, {condition}" — e.g. "Oct–Apr: 14–18°C, mild with Atlantic rain".',
    '  Never mention water temperature in typicalWeather.',
    '- Estimate vibe index scores for every location: womenFriendly, soloIndex, nightSafety, harassmentRisk, communityDensity, infrastructureScore.',
    '- Do not output 0 unless truly zero. Typical tourist-destination range is 50-95.',
    '',
    'LOCAL TRANSPORT (`localTransport` array — REQUIRED, 3–6 objects per destination):',
    '- Each element MUST be shaped exactly:',
    '  {"name":"<real option name>","type":"<rideshare|public|rental|walking|ferry>","description":"<one practical sentence>","appStore":"<iOS/Android app brand if applicable OR empty string \"\" >","cost":"<rough cost e.g. ฿35–150 per trip OR free>"}',
    '- Use REAL brand and system names (Grab, BTS Skytrain, MTR, Kakao T, Seoul Metro, T-money, Suica, Gojek, Bolt, Uber, CP Rail, ferry operator names — never placeholders like Local taxi/Public bus without naming the operator).',
    '- Every row needs a usable tip — apps, ticketing, closures, scams to avoid, or language caveats.',
    '- Always include AT LEAST: (1) one rideshare/taxi/booking APP with real appStore name where it exists (2) one public/transit spine if any exists in that city.',
    '- `type` must be lowercase: rideshare | public | rental | walking | ferry.',
    '- Set `transportOptions` to empty array [] (legacy field — do NOT populate).',
    '',
    'LOCAL TRANSPORT — reference patterns (adapt with real fares for CURRENT destination):',
    '- Bangkok eg: Grab (rideshare, app Grab), BTS Skytrain (public), MRT (public), Bolt.',
    '- Seoul eg: T-money Card, Kakao T, Seoul Metro + Naver Map.',
    '- Tokyo eg: Suica/PASMO, Google Maps transit, GO taxi app.',
    '- Bali eg: Gojek, Grab, scooter rental shops.',
    '- Portugal Lisbon/Porto area eg: Bolt, Uber, CP – Comboios de Portugal trains.',
    '',
    'UPCOMING EVENTS RULES:',
    'Include upcomingEvents ONLY for REAL recurring fixtures you trust. Prefer empty arrays over guesses.',
    'Examples: Chamonix -> Ultra-Trail du Mont-Blanc (UTMB) late August; Whistler -> Crankworx August; Tokyo -> Tokyo Marathon March; Bali -> Bali International Triathlon October; Zermatt -> Zermatt Marathon July; Portugal coast -> Rip Curl Pro Peniche October.',
    'Format each event as { name, date, description, website, isRecurring }.',
    'For date, prefer month/period precision (e.g., "November annually", "Late August annually"). Use exact day only if highly certain from official schedule.',
    'If website is unknown use "". Use isRecurring=true for annual events.',
    'If you are not confident for this destination, return empty array []. Never invent events.',
    '',
    'IMAGE RULES:',
    '- Follow RESULTS CARD DATA rules for imageSearchTerm (must include sport + geography + landscape word). Unique per row.',
  ].join('\n')
}

type IntentMode = 'place_only' | 'activity_only' | 'place_plus_activity'

/** Remove AI or pipeline artifacts like "Cathedral · 1" from card titles. */
function stripTitleNumberSuffix(title: string): string {
  return title
    .replace(/\s*[·•]\s*\d+\s*$/u, '')
    .replace(/\s+\d+\s*$/u, '')
    .trim()
}

/** Months/seasons/years after "in/at/…" are time context, not a destination — avoids "marathon in November" → place+activity. */
const TEMPORAL_AFTER_PREP = new Set([
  'jan',
  'january',
  'feb',
  'february',
  'mar',
  'march',
  'apr',
  'april',
  'may',
  'jun',
  'june',
  'jul',
  'july',
  'aug',
  'august',
  'sep',
  'sept',
  'september',
  'oct',
  'october',
  'nov',
  'november',
  'dec',
  'december',
  'spring',
  'summer',
  'autumn',
  'fall',
  'winter',
  'weekend',
  'weekends',
  'week',
  'weekday',
  'weekdays',
  'month',
  'year',
  'today',
  'tomorrow',
])

function prepositionReferencesGeographicPlace(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  const re =
    /\b(?:in|at|around|near)\s+(?:(?:early|mid|late)\s+)?(?:the\s+)?([a-zà-ÿ]+|\d{4})\b/gi
  const tokens: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(lower)) !== null) {
    tokens.push(m[1])
  }
  if (tokens.length === 0) return false
  return tokens.some((tok) => {
    if (/^\d{4}$/.test(tok)) return false
    return !TEMPORAL_AFTER_PREP.has(tok)
  })
}

function detectIntentMode(prompt: string): IntentMode {
  const p = prompt.toLowerCase().trim()
  const activityRegex =
    /\b(surf|surfing|kayak|kayaking|sup\b|paddleboard|climb|climbing|bouldering|rock\s*climbing|yoga|ski|skiing|snowboard|snowboarding|dive|diving|snorkel|hike|hiking|trek|trekking|cycle|cycling|bike|biking|run|running|marathon|half[\s-]*marathon|ultramarathon|triathlon|duathlon|ironman|ocr\b|spartan|trail\s+run|trail\s+running|swim|swimming|open\s+water|kitesurf|kitesurfing|windsurf|windsurfing|paraglid|paragliding|skydive|skydiving|crossfit|boxing|muay|bjj|rowing|kayak\s+polo|\brace\b|races|racing)\b/
  const hasActivity = activityRegex.test(p)
  const hasPrep = /\b(in|at|around|near)\b/.test(p)
  const prepIsPlace = hasPrep && prepositionReferencesGeographicPlace(prompt)
  const placeOnlySingleToken = /^[a-zA-ZÀ-ÿ' -]{2,}$/.test(prompt.trim()) && !hasActivity

  if (hasActivity && (prepIsPlace || promptReferencesKnownRaceCity(prompt))) return 'place_plus_activity'
  if (hasActivity) return 'activity_only'
  if (placeOnlySingleToken) return 'place_only'
  return 'place_only'
}

function allLocationsLackUpcomingEvents(locations: unknown): boolean {
  if (!Array.isArray(locations) || locations.length === 0) return true
  return locations.every((loc) => {
    const ev = (loc as { upcomingEvents?: unknown }).upcomingEvents
    return !Array.isArray(ev) || ev.length === 0
  })
}

function buildIntentUserContent(
  prompt: string,
  originalQuery: string,
  intentMode: IntentMode,
  tripRole: IntentTripRole,
  eventFallback: boolean,
  namedRaceCity: RaceWhitelistEntry | null = null
): string {
  const titleSource = originalQuery.trim() || prompt.trim()
  const pageTitleBlock = `\n\n[PAGE TITLE — original user trip line ONLY]\n"""${titleSource}"""\nFor JSON field intentSummary ONLY: generate a clean 4–8 word title from this line alone. Do not add trip-role calibration, UI subtitles, or text from elsewhere. Output title only — no em-dash second clauses.\n`

  const intentModeHint =
    intentMode === 'place_only'
      ? '\n\n[Classifier: PLACE_ONLY. User named a place without locking one activity. Return 3 different sports/disciplines in that place. Each `activity` must differ. Each `primaryTitle` must still be a real geographic place name inside that destination — never the activity name as the title.]'
      : intentMode === 'activity_only'
        ? '\n\n[Classifier: ACTIVITY_ONLY. User named an activity; suggest 3 different destinations.]'
        : '\n\n[Classifier: PLACE_PLUS_ACTIVITY. User named place + activity; return 3 different spots/zones — unless they named one specific city with one event, then return exactly 1 card for that place.]'

  const specificDestinationHint = namedRaceCity
    ? `\n\n[Classifier: SPECIFIC_DESTINATION — User named "${namedRaceCity.city}" with a concrete activity/event. Return EXACTLY 1 location for that place only. Do not suggest other cities.]`
    : ''

  if (eventFallback) {
    const original =
      tripRole === 'WATCHING'
        ? 'WATCHING (watching / support crew)'
        : 'COMPETITOR (racing / event week)'
    return `${pageTitleBlock}\nUser intent:\n"""${prompt}"""${intentModeHint}\n\n[Client UI: FALLBACK_ACTIVE_TRAVEL — Original tripRole was ${original}, but the user's stated place and timeframe have no credible recurring events to ground the trip. Return 3 recommendations as general ACTIVE_TRAVEL in the SAME geography they asked for, tightly aligned with their stated sport/activity: training loops, rental/coach hubs, reliable local scenes, and (for former watching personas) fan-friendly bases or spectator culture cues — without inventing marquee races or fake dates. Use upcomingEvents: [] unless a recurring event is absolutely certain.]`
  }

  const roleHint =
    tripRole === 'WATCHING'
      ? '\n\n[Client UI: tripRole=WATCHING — non-participant at an event (watch pro sport OR support a racer): same playbook for vantage belts, ticketing, checkpoint hops, waiting anchors, reunion logistics — NOT racing or training THIS traveller.]'
      : tripRole === 'COMPETITOR'
          ? '\n\n[Client UI: tripRole=COMPETITOR — racing or actively participating in an event week.]'
          : '\n\n[Client UI: tripRole=ACTIVE_TRAVEL — general sport-focused travel, not necessarily a race.]'

  const modeAppendix = !eventFallback && tripRole === 'WATCHING' ? WATCHING_MODE_APPENDIX : ''

  return `${pageTitleBlock}\nUser intent:\n"""${prompt}"""${intentModeHint}${specificDestinationHint}${roleHint}${modeAppendix}`
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTH_ALIASES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

function monthIndexFromText(text: string): number {
  const lower = text.toLowerCase()
  for (const [token, idx] of Object.entries(MONTH_ALIASES)) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(lower)) return idx
  }
  return -1
}

function isRaceIntent(prompt: string): boolean {
  return /\b(marathon|race|races|running|run|triathlon|duathlon|ultra|trail run)\b/i.test(prompt)
}

type BroadRegion = 'asia' | 'europe' | 'north_america' | 'south_america' | 'africa' | 'oceania' | 'middle_east'

function parseBroadRegion(prompt: string): BroadRegion | null {
  const p = prompt.toLowerCase()
  if (/\basia\b/.test(p)) return 'asia'
  if (/\beurope\b/.test(p)) return 'europe'
  if (/\bnorth america\b|\busa\b|\bunited states\b|\bcanada\b/.test(p)) return 'north_america'
  if (/\bsouth america\b|\blatin america\b/.test(p)) return 'south_america'
  if (/\bafrica\b/.test(p)) return 'africa'
  if (/\boceania\b|\baustralia\b|\bnew zealand\b/.test(p)) return 'oceania'
  if (/\bmiddle east\b|\bgulf\b/.test(p)) return 'middle_east'
  return null
}

type RaceCourseTier = 'novice' | 'intermediate' | 'pro'

type RaceWhitelistEntry = {
  sport: 'marathon'
  city: string
  country: string
  name: string
  month: number
  region: BroadRegion
  dateLabel: string
  /** Course demand: flat friendly PB vs rolling vs big-city logistics / hills / heat stress. */
  raceTier: RaceCourseTier
  /** 2–3 comma-separated card tags: course/city character, not generic sport labels. */
  vibe: string
}

const MARATHON_EVENT_WHITELIST: RaceWhitelistEntry[] = [
  { sport: 'marathon', city: 'Houston', country: 'United States', name: 'Houston Marathon', month: 0, region: 'north_america', dateLabel: 'Mid January annually', raceTier: 'novice', vibe: 'Flat, Urban heat, Bayou city' },
  { sport: 'marathon', city: 'Marrakech', country: 'Morocco', name: 'Marrakech Marathon', month: 0, region: 'africa', dateLabel: 'Late January annually', raceTier: 'intermediate', vibe: 'Desert mild, Palm groves, Atlas backdrop' },
  { sport: 'marathon', city: 'Dubai', country: 'United Arab Emirates', name: 'Dubai Marathon', month: 0, region: 'middle_east', dateLabel: 'January annually', raceTier: 'novice', vibe: 'Fast flat, Dawn start, Coastal desert' },
  { sport: 'marathon', city: 'Seville', country: 'Spain', name: 'Seville Marathon', month: 1, region: 'europe', dateLabel: 'Late February annually', raceTier: 'novice', vibe: 'Mild winter, Riverfront, Historic centre' },
  { sport: 'marathon', city: 'Tokyo', country: 'Japan', name: 'Tokyo Marathon', month: 2, region: 'asia', dateLabel: 'Early March annually', raceTier: 'pro', vibe: 'Mega-city, River crossings, Precision crowds' },
  { sport: 'marathon', city: 'Rome', country: 'Italy', name: 'Rome Marathon', month: 2, region: 'europe', dateLabel: 'March annually', raceTier: 'intermediate', vibe: 'Ancient stones, Rolling hills, River Tiber' },
  { sport: 'marathon', city: 'Los Angeles', country: 'United States', name: 'Los Angeles Marathon', month: 2, region: 'north_america', dateLabel: 'March annually', raceTier: 'intermediate', vibe: 'Coastal-to-downtown, Sprawling, Mild spring' },
  { sport: 'marathon', city: 'Paris', country: 'France', name: 'Paris Marathon', month: 3, region: 'europe', dateLabel: 'April annually', raceTier: 'intermediate', vibe: 'Riverside loops, Iconic avenues, Spring light' },
  { sport: 'marathon', city: 'Boston', country: 'United States', name: 'Boston Marathon', month: 3, region: 'north_america', dateLabel: 'April annually', raceTier: 'pro', vibe: 'Historic, Leg-busting hills, Qualifier prestige' },
  { sport: 'marathon', city: 'Prague', country: 'Czech Republic', name: 'Prague Marathon', month: 4, region: 'europe', dateLabel: 'May annually', raceTier: 'intermediate', vibe: 'Cobble charm, Bridge views, Old town loop' },
  { sport: 'marathon', city: 'Copenhagen', country: 'Denmark', name: 'Copenhagen Marathon', month: 4, region: 'europe', dateLabel: 'May annually', raceTier: 'novice', vibe: 'Flat, Harbor wind, Nordic spring' },
  { sport: 'marathon', city: 'Stockholm', country: 'Sweden', name: 'Stockholm Marathon', month: 5, region: 'europe', dateLabel: 'June annually', raceTier: 'intermediate', vibe: 'Island hops, Long midsummer light, Archipelago air' },
  { sport: 'marathon', city: 'Duluth', country: 'United States', name: 'Grandma’s Marathon', month: 5, region: 'north_america', dateLabel: 'June annually', raceTier: 'intermediate', vibe: 'Lake Superior, Northwoods rolling, Small-city calm' },
  { sport: 'marathon', city: 'Gold Coast', country: 'Australia', name: 'Gold Coast Marathon', month: 6, region: 'oceania', dateLabel: 'July annually', raceTier: 'novice', vibe: 'Beachfront flat, Winter sun, Humid sea air' },
  { sport: 'marathon', city: 'San Francisco', country: 'United States', name: 'San Francisco Marathon', month: 6, region: 'north_america', dateLabel: 'July annually', raceTier: 'pro', vibe: 'Foggy hills, Bay views, Iconic bridges' },
  { sport: 'marathon', city: 'Berlin', country: 'Germany', name: 'Berlin Marathon', month: 8, region: 'europe', dateLabel: 'Late September annually', raceTier: 'novice', vibe: 'PB-friendly flat, Wall-to-gate history, Big-city energy' },
  { sport: 'marathon', city: 'Chicago', country: 'United States', name: 'Chicago Marathon', month: 9, region: 'north_america', dateLabel: 'October annually', raceTier: 'novice', vibe: 'Lakefront miles, Windy openness, Grid skyline' },
  { sport: 'marathon', city: 'Amsterdam', country: 'Netherlands', name: 'Amsterdam Marathon', month: 9, region: 'europe', dateLabel: 'October annually', raceTier: 'novice', vibe: 'Canal bridges, Flat tempo, Autumn drizzle' },
  { sport: 'marathon', city: 'New York City', country: 'United States', name: 'New York City Marathon', month: 10, region: 'north_america', dateLabel: 'November annually', raceTier: 'pro', vibe: 'Five boroughs, Bridge crossings, Crowd roar' },
  { sport: 'marathon', city: 'Athens', country: 'Greece', name: 'Athens Marathon', month: 10, region: 'europe', dateLabel: 'November annually', raceTier: 'intermediate', vibe: 'Ancient course, Uphill pilgrimage, Mediterranean light' },
  { sport: 'marathon', city: 'Bangkok', country: 'Thailand', name: 'Bangkok Marathon', month: 10, region: 'asia', dateLabel: 'November annually', raceTier: 'pro', vibe: 'Night start, Tropical heat, Riverfront neon' },
  { sport: 'marathon', city: 'Seoul', country: 'South Korea', name: 'Joongang Seoul Marathon', month: 10, region: 'asia', dateLabel: 'November annually', raceTier: 'intermediate', vibe: 'River paths, Autumn crisp, Urban organised' },
  { sport: 'marathon', city: 'Kobe', country: 'Japan', name: 'Kobe Marathon', month: 10, region: 'asia', dateLabel: 'November annually', raceTier: 'intermediate', vibe: 'Harbor city, Rokko backdrop, Compact course' },
  { sport: 'marathon', city: 'Valencia', country: 'Spain', name: 'Valencia Marathon', month: 11, region: 'europe', dateLabel: 'December annually', raceTier: 'novice', vibe: 'Fast flat, Citrus coast, Mild winter' },
  { sport: 'marathon', city: 'Honolulu', country: 'United States', name: 'Honolulu Marathon', month: 11, region: 'north_america', dateLabel: 'December annually', raceTier: 'intermediate', vibe: 'Pre-dawn tropical, Volcano silhouette, Coastal breeze' },
  { sport: 'marathon', city: 'Shanghai', country: 'China', name: 'Shanghai Marathon', month: 11, region: 'asia', dateLabel: 'Early December annually', raceTier: 'pro', vibe: 'Bund skyline, Huangpu bends, Megacity scale' },
]

function parseNamedRaceCityFromPrompt(prompt: string): RaceWhitelistEntry | null {
  const lower = prompt.toLowerCase()
  const pool = [...MARATHON_EVENT_WHITELIST].sort((a, b) => b.city.length - a.city.length)
  for (const entry of pool) {
    const cityPattern = entry.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    if (new RegExp(`\\b${cityPattern}\\b`, 'i').test(lower)) return entry
    if (entry.city === 'New York City' && /\b(nyc|new york)\b/i.test(lower)) return entry
    const eventPattern = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    if (new RegExp(`\\b${eventPattern}\\b`, 'i').test(lower)) return entry
  }
  return null
}

function promptReferencesKnownRaceCity(prompt: string): boolean {
  return parseNamedRaceCityFromPrompt(prompt) !== null
}

function circularMonthDistance(a: number, b: number): number {
  const diff = Math.abs(a - b)
  return Math.min(diff, 12 - diff)
}

function difficultyFromRaceTier(tier: RaceCourseTier): string {
  switch (tier) {
    case 'novice':
      return 'Beginner-friendly'
    case 'intermediate':
      return 'Intermediate'
    case 'pro':
      return 'Advanced'
  }
}

/** Map model skill label + user wording (novice/pro) to selection mode for curated race lists. */
function normalizeMarathonSkillMode(detected: string | null | undefined): 'beginner' | 'intermediate' | 'advanced' | 'mixed' {
  const s = (detected ?? '').toLowerCase()
  if (/\bnovice\b|\bbeginner\b/.test(s)) return 'beginner'
  if (/\bintermediate\b/.test(s)) return 'intermediate'
  if (/\badvanced\b|\bpro\b|\belite\b/.test(s)) return 'advanced'
  if (!detected || detected === null) return 'mixed'
  return 'mixed'
}

function tierForSkillMode(mode: 'beginner' | 'intermediate' | 'advanced' | 'mixed'): RaceCourseTier | null {
  if (mode === 'beginner') return 'novice'
  if (mode === 'intermediate') return 'intermediate'
  if (mode === 'advanced') return 'pro'
  return null
}

function sortRacePoolByMonth(pool: RaceWhitelistEntry[], monthIdx: number): RaceWhitelistEntry[] {
  return [...pool].sort(
    (a, b) => circularMonthDistance(a.month, monthIdx) - circularMonthDistance(b.month, monthIdx)
  )
}

function dedupeRaceKey(e: RaceWhitelistEntry): string {
  return `${e.city}|${e.country}|${e.name}`
}

/** Deterministic Vibe Index so curated race cards differ by destination (not identical placeholders). */
function vibeIndexScoresForRaceCard(item: RaceWhitelistEntry): {
  womenFriendly: number
  soloIndex: number
  nightSafety: number
  harassmentRisk: number
  communityDensity: number
  infrastructureScore: number
} {
  const u = Math.abs(
    [...dedupeRaceKey(item)].reduce((acc, ch) => (Math.imul(31, acc) + ch.charCodeAt(0)) | 0, 0)
  )
  const roll = (shift: number, spread: number) => ((u >>> shift) % (spread * 2 + 1)) - spread

  const regionNudge: Record<
    BroadRegion,
    { w: number; s: number; n: number; hr: number; d: number; i: number }
  > = {
    north_america: { w: 2, s: 1, n: 1, hr: 0, d: 2, i: 3 },
    europe: { w: 3, s: 2, n: 2, hr: -1, d: 1, i: 2 },
    asia: { w: 1, s: 2, n: 1, hr: 1, d: 5, i: 2 },
    oceania: { w: 4, s: 3, n: 2, hr: -2, d: 0, i: 1 },
    africa: { w: -1, s: 0, n: -1, hr: 2, d: 1, i: 0 },
    south_america: { w: 1, s: 1, n: 0, hr: 1, d: 3, i: 0 },
    middle_east: { w: 0, s: 1, n: 1, hr: 1, d: 2, i: 2 },
  }
  const tierNudge = item.raceTier === 'pro' ? 2 : item.raceTier === 'novice' ? 0 : 1
  const nu = regionNudge[item.region]
  const base = 69 + tierNudge
  const clamp = (v: number) => Math.max(48, Math.min(94, Math.round(v)))

  return {
    womenFriendly: clamp(base + nu.w + roll(0, 5)),
    soloIndex: clamp(base - 4 + nu.s + roll(3, 6)),
    nightSafety: clamp(base - 2 + nu.n + roll(6, 6)),
    harassmentRisk: clamp(base - 6 + nu.hr + roll(9, 6)),
    communityDensity: clamp(base + 1 + nu.d + roll(12, 6)),
    infrastructureScore: clamp(base + 4 + nu.i + roll(15, 5)),
  }
}

function raceCardSoloQuotes(item: RaceWhitelistEntry): string[] {
  const city = item.city
  const variant = Math.abs([...item.name].reduce((a, c) => a + c.charCodeAt(0), 0)) % 3
  const packs: string[][] = [
    [
      `Race week in ${city}: I stayed near transit and felt fine moving alone between expo and shakeout routes.`,
      `Lots of solo runners in ${city} — hostels and packet pickup were easy icebreakers.`,
    ],
    [
      `I pinned hotel + corral transit in ${city} beforehand; evening runs stuck to busier paths with no drama.`,
      `${city} was loud and busy on race weekend, but organisers made corrals and bag drop feel clear.`,
    ],
    [
      `As a woman traveling solo to ${city} for the marathon, daylight miles felt great; after dark I used rideshare.`,
      `The running scene in ${city} is visible — you’ll bump into other entrants at cafés near the course.`,
    ],
  ]
  return packs[variant] ?? packs[0]
}

/** One flat / one rolling / one demanding — when user gave no skill level. */
function pickMixedTiersFromPool(sortedPool: RaceWhitelistEntry[]): RaceWhitelistEntry[] {
  const order: RaceCourseTier[] = ['novice', 'intermediate', 'pro']
  const out: RaceWhitelistEntry[] = []
  const seen = new Set<string>()
  for (const tier of order) {
    const hit = sortedPool.find((e) => e.raceTier === tier && !seen.has(dedupeRaceKey(e)))
    if (hit) {
      out.push(hit)
      seen.add(dedupeRaceKey(hit))
    }
  }
  if (out.length < 3) {
    for (const e of sortedPool) {
      const k = dedupeRaceKey(e)
      if (seen.has(k)) continue
      out.push(e)
      seen.add(k)
      if (out.length >= 3) break
    }
  }
  return out
}

/** Prefer `tier`; if fewer than 3, fill from full pool order (month proximity). */
function pickSingleTierFromPool(sortedPool: RaceWhitelistEntry[], tier: RaceCourseTier, n: number): RaceWhitelistEntry[] {
  const out: RaceWhitelistEntry[] = []
  const seen = new Set<string>()
  const primary = sortedPool.filter((e) => e.raceTier === tier)
  const secondary = sortedPool.filter((e) => e.raceTier !== tier)
  for (const e of [...primary, ...secondary]) {
    const k = dedupeRaceKey(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
    if (out.length >= n) break
  }
  return out
}

function raceWhitelistMustTry(
  city: string,
  country: string,
  eventName: string
): { name: string; status: string; risk: string } {
  const c = `${city} ${country}`.toLowerCase()
  if (/new york|nyc|manhattan|brooklyn/.test(c)) {
    return {
      name:
        'Expo & bib — Jacob K. Javits Center; shakeout — Central Park Reservoir or Bridle Path; legs — Queensboro Bridge approach or First Avenue rhythm',
      status: 'Book expo slot; confirm wave/corral',
      risk: 'Low',
    }
  }
  if (/boston/.test(c) && /usa|united states|massachusetts/.test(c)) {
    return {
      name: 'Expo & bib — Hynes Convention Center; shakeout — Charles River paths; recon — Newton hills / Heartbreak Hill segment',
      status: 'Book expo; study Hopkinton→Boston flow',
      risk: 'Low',
    }
  }
  if (/london/.test(c) && /uk|united kingdom|england/.test(c)) {
    return {
      name: 'Expo & bib — ExCeL London; shakeout — Hyde Park / Green Park loop; legs — Canary Wharf or Tower Bridge rhythm',
      status: 'Expo reservation + travel card',
      risk: 'Low',
    }
  }
  if (/chicago/.test(c) && /usa|united states|illinois/.test(c)) {
    return {
      name: 'Expo & bib — McCormick Place; shakeout — Lakefront Trail (authorised segments); wind strategy briefing',
      status: 'Wave/corral + gear check',
      risk: 'Low',
    }
  }
  return {
    name: `Official expo & bib for “${eventName}”; shakeout on permitted course segments only — no generic “route preview” labels`,
    status: 'Confirm dates with organiser',
    risk: 'Low',
  }
}

function buildRaceCardFromWhitelistEntry(
  item: RaceWhitelistEntry,
  month: string
): Record<string, unknown> {
  const raceCardActivityZonesFallback = (city: string): string => {
    const c = city.toLowerCase()
    if (c.includes('bangkok')) {
      return 'Lumpini Park (2.5 km loop) and the Chao Phraya riverside path are the go-to training grounds — run before 7am before the heat builds and carry your own water.'
    }
    if (c.includes('seoul')) {
      return 'Han River Park has dozens of km of dedicated riverside paths along the Hangang — go early or late for cooler, less crowded repeats.'
    }
    return `${city}'s best-known central park loop and the main riverside or waterfront promenade are the usual pre-marathon training corridors — run early for lighter crowds and carry water when it is warm.`
  }

  const vibeIdx = vibeIndexScoresForRaceCard(item)
  return {
    recommendationKind: 'destination',
    primaryTitle: item.city,
    locationLabel: `${item.city}, ${item.country}`,
    name: item.city,
    country: item.country,
    activity: 'Marathon',
    imageSearchTerm: `${item.city} marathon race`,
    season: month,
    difficulty: difficultyFromRaceTier(item.raceTier),
    vibe: item.vibe,
    womenFriendly: vibeIdx.womenFriendly,
    soloIndex: vibeIdx.soloIndex,
    nightSafety: vibeIdx.nightSafety,
    harassmentRisk: vibeIdx.harassmentRisk,
    communityDensity: vibeIdx.communityDensity,
    infrastructureScore: vibeIdx.infrastructureScore,
    soloQuotes: raceCardSoloQuotes(item),
    nearestAirport: primaryAirportsLine(item.city, item.country) || airportFallbackInstruction(item.city, item.country),
    visaRequirements: '',
    budgetEssential: '$70–140 / day',
    budgetMidrange: '$150–280 / day',
    budgetLuxe: '$350–550 / day',
    budgetNeighborhood: `${item.city} transit corridors`,
    midrangeNeighborhood: `${item.city} centre / BTS-MRT mesh`,
    luxeNeighborhood: `${item.city} premium river or park-adjacent zones`,
    optimalDurationDays: 4,
    stayRecommendation: { name: `${item.city} city center`, type: 'area', nightlyPrice: '' },
    localTransport: [],
    transportOptions: [],
    diningDistricts: [],
    activityZones: raceCardActivityZonesFallback(item.city),
    bestSeason: '',
    mustTryExperiences: [raceWhitelistMustTry(item.city, item.country, item.name)],
    logistics: ['RACE REGISTRATION', 'BIB PICKUP', 'RACE-DAY TRANSIT'],
    facilities: [{ name: 'Aid stations', available: true }],
    conditions: { temp: 'Mild' },
    upcomingEvents: [
      {
        name: item.name,
        date: item.dateLabel,
        description: `${item.city} flagship road race.`,
        website: '',
        isRecurring: true,
      },
    ],
  }
}

function buildStableRaceSeedCards(
  prompt: string,
  detectedSkillLevel: string | null | undefined
): Array<Record<string, unknown>> | null {
  const namedCity = parseNamedRaceCityFromPrompt(prompt)
  if (namedCity) {
    const monthIdx = monthIndexFromText(prompt)
    const month = monthIdx >= 0 ? MONTHS[monthIdx] : MONTHS[namedCity.month]
    return [buildRaceCardFromWhitelistEntry(namedCity, month)]
  }

  const monthIdx = monthIndexFromText(prompt)
  if (monthIdx < 0 || !isRaceIntent(prompt)) return null
  const region = parseBroadRegion(prompt)
  const month = MONTHS[monthIdx]
  let candidates = MARATHON_EVENT_WHITELIST.filter((item) => item.month === monthIdx)
  if (region) candidates = candidates.filter((item) => item.region === region)

  // If exact month is sparse, expand to nearby two months while keeping region constraint.
  if (candidates.length < 3) {
    const pool = region
      ? MARATHON_EVENT_WHITELIST.filter((item) => item.region === region)
      : MARATHON_EVENT_WHITELIST
    const expanded = pool
      .filter((item) => circularMonthDistance(item.month, monthIdx) <= 2)
      .sort((a, b) => circularMonthDistance(a.month, monthIdx) - circularMonthDistance(b.month, monthIdx))
    candidates = [...candidates, ...expanded]
  }

  // Final backstop: nearest events in region (or global) sorted by month distance.
  if (candidates.length < 3) {
    const pool = region
      ? MARATHON_EVENT_WHITELIST.filter((item) => item.region === region)
      : MARATHON_EVENT_WHITELIST
    const nearest = [...pool].sort(
      (a, b) => circularMonthDistance(a.month, monthIdx) - circularMonthDistance(b.month, monthIdx)
    )
    candidates = [...candidates, ...nearest]
  }

  const sortedPool = sortRacePoolByMonth(candidates, monthIdx)
  const skillMode = normalizeMarathonSkillMode(detectedSkillLevel)
  const singleTier = tierForSkillMode(skillMode)

  let picks: RaceWhitelistEntry[]
  if (singleTier === null) {
    picks = pickMixedTiersFromPool(sortedPool)
  } else {
    picks = pickSingleTierFromPool(sortedPool, singleTier, 3)
  }

  if (!picks?.length) return null

  return picks.map((item) => buildRaceCardFromWhitelistEntry(item, month))
}

function normalizeLocationCards(
  mode: IntentMode,
  locations: Array<{
    name: string
    country: string
    activity: string
    primaryTitle?: string
    locationLabel?: string
    recommendationKind?: 'destination' | 'activity' | 'spot'
    imageSearchTerm?: string
  }>
) {
  const inferNameFromLabel = (label?: string) => {
    const raw = label?.trim()
    if (!raw) return ''
    const first = raw.split(',')[0]?.trim()
    if (!first) return ''
    return first.replace(/^unknown destination[:\s-]*/i, '').trim()
  }

  const seen = new Set<string>()
  const disambiguationExtras = [
    ' — riverside',
    ' — valley loop',
    ' — woodland stretch',
    ' — open stretch',
    ' — quiet stretch',
    ' — long circuit',
  ] as const
  return locations.map((loc, idx) => {
    const inferredName = inferNameFromLabel(loc.locationLabel)
    const fromPrimary = stripTitleNumberSuffix((loc.primaryTitle || '').trim())
    const rawName = typeof loc.name === 'string' ? loc.name.trim() : ''
    let safeName =
      rawName && !isGenericPlaceName(rawName)
        ? rawName
        : inferredName && !isGenericPlaceName(inferredName)
          ? inferredName
          : ''
    if (!safeName && fromPrimary && !isGenericPlaceName(fromPrimary)) {
      safeName = fromPrimary
    }
    if (!safeName) {
      const countryHint =
        typeof loc.country === 'string' && loc.country.trim() && !isUnknownOrMissingCountry(loc.country)
          ? loc.country.trim()
          : ''
      safeName = countryHint || 'Destination'
    }
    let safeCountry =
      typeof loc.country === 'string' && loc.country.trim() && !isUnknownOrMissingCountry(loc.country)
        ? loc.country.trim()
        : ''
    safeCountry =
      safeCountry ||
      parseCountryFromLocationLabel(loc.locationLabel) ||
      inferCountryFromPlaceName(safeName) ||
      inferCountryFromPlaceName(fromPrimary) ||
      'Unknown region'
    const safeActivity =
      typeof loc.activity === 'string' && loc.activity.trim() ? loc.activity.trim() : 'Travel'
    const destination = `${safeName}, ${safeCountry}`
    const geoFallback =
      inferNameFromLabel(loc.locationLabel) || safeName
    let recommendationKind: 'destination' | 'activity' | 'spot' =
      mode === 'activity_only' ? 'destination' : mode === 'place_plus_activity' ? 'spot' : 'activity'
    if (loc.recommendationKind) recommendationKind = loc.recommendationKind
    let primaryTitle = stripTitleNumberSuffix(
      loc.primaryTitle?.trim() || (recommendationKind === 'destination' ? safeName : geoFallback)
    )
    let candidate = primaryTitle
    let disambigRound = 0
    while (seen.has(candidate.toLowerCase())) {
      disambigRound += 1
      const extra = disambiguationExtras[(disambigRound - 1) % disambiguationExtras.length]
      candidate = extra ? `${primaryTitle}${extra}` : `${primaryTitle} — ${safeName}`
      if (disambigRound > 24) {
        candidate = `${primaryTitle} — ${safeName} — ${['north', 'central', 'south'][idx] ?? 'reach'}`
        break
      }
    }
    primaryTitle = candidate
    seen.add(primaryTitle.toLowerCase())
    const locationLabel = loc.locationLabel?.trim() || destination
    const imageSearchTerm =
      loc.imageSearchTerm?.trim() ||
      (recommendationKind === 'destination'
        ? `${safeName} ${safeActivity} outdoor scenery`
        : `${safeActivity} ${safeName}`)
    return {
      ...loc,
      name: safeName,
      country: safeCountry,
      activity: safeActivity,
      recommendationKind,
      primaryTitle,
      locationLabel,
      imageSearchTerm,
    }
  })
}

/** Strip fake variety suffixes the model may add to duplicate titles. */
function stripDisambiguationSuffix(title: string): string {
  return title.replace(/\s*[—–]\s*.+$/u, '').trim()
}

function placeOnlyCardsLookRedundant(
  locations: Array<{ primaryTitle?: string; activity?: string }>
): boolean {
  if (locations.length < 2) return false
  const keys = locations.map((l) => {
    const a = (l.activity ?? '').trim().toLowerCase()
    const t = stripDisambiguationSuffix((l.primaryTitle ?? l.activity ?? '').trim()).toLowerCase()
    return a || t
  })
  return keys.every((k) => k && k === keys[0])
}

function diverseActivitiesForPlace(locationLabel: string, country: string): string[] {
  const ctx = `${locationLabel} ${country}`.toLowerCase()
  if (/chamonix|mont\s*blanc/.test(ctx)) return ['Ski touring', 'Via ferrata', 'Trail running']
  if (/\bzermatt\b/.test(ctx)) return ['Alpine skiing', 'Ice climbing', 'Hiking']
  if (/\bbali\b/.test(ctx)) return ['Surfing', 'Cycling', 'White water rafting']
  if (/portugal|peniche|ericeira|lisbon|algarve/.test(ctx))
    return ['Surfing', 'Cycling', 'Sea kayaking']
  if (/thailand|phuket|samui|koh/.test(ctx)) return ['Surfing', 'Muay Thai training', 'Sea kayaking']
  if (/mountain|alps|andes|rockies|himalaya|nepal|patagonia/.test(ctx))
    return ['Hiking', 'Mountain biking', 'Rock climbing']
  if (/coast|beach|island|sea|ocean|bay/.test(ctx)) return ['Surfing', 'Coastal hiking', 'Sea kayaking']
  return ['Trail running', 'Cycling', 'Open water swimming']
}

/**
 * Pick a geographic card title that belongs to this row's anchor town — not `regionSpots[i]`,
 * which mis-pairs when the model orders cities differently than the hard-coded regional list
 * (e.g. Peniche / Nazaré / Ericeira vs Supertubos / Ericeira reserve / Baleal).
 */
function signatureSpotForCardAnchor(
  loc: { name?: string; locationLabel?: string; country?: string },
  regionSpots: string[] | null,
  fallbackGeo: string[],
  idx: number
): string {
  const labelFirst =
    (loc.locationLabel || '').split(',')[0]?.trim().toLowerCase() || ''
  const namePart = (loc.name || '').trim().toLowerCase()
  const anchor = namePart || labelFirst.replace(/^unknown destination[:\s-]*/i, '').trim()
  const country = (loc.country || '').toLowerCase()
  const ctx = `${labelFirst} ${namePart} ${country}`

  if (/\bportugal\b/.test(ctx) || /\bportugal\b/.test(country)) {
    if (/\bnazar/.test(anchor)) return 'Nazaré big-wave amphitheatre'
    if (/\bericeira\b/.test(anchor)) return 'Ericeira World Surfing Reserve'
    if (/\bpeniche\b/.test(anchor) || /\bbaleal\b/.test(anchor)) {
      return idx % 2 === 0 ? 'Supertubos beach' : 'Baleal bay'
    }
    if (/\blagos\b/.test(anchor)) return 'Ponta da Piedade coastline'
    if (/\bsagres\b/.test(anchor)) return 'Tonel–Beliche surf breaks'
    if (/\bcascais\b/.test(anchor)) return 'Guincho beach'
    if (/\blisbon\b/.test(anchor)) return 'Carcavelos beach'
  }

  if (regionSpots?.length) {
    if (anchor.length >= 4) {
      const hit = regionSpots.find((s) => {
        const sl = s.toLowerCase()
        if (sl.includes(anchor)) return true
        return anchor.split(/\s+/).some((w) => w.length >= 5 && sl.includes(w))
      })
      if (hit) return hit
    }
    return regionSpots[idx % regionSpots.length]!
  }
  return fallbackGeo[idx % fallbackGeo.length]!
}

/** When the model returns the same activity three times, replace with a diverse local triple. */
function diversifyPlaceOnlyCards<
  T extends {
    primaryTitle?: string
    activity?: string
    name?: string
    locationLabel?: string
    country?: string
    imageSearchTerm?: string
    recommendationKind?: string
  },
>(mode: IntentMode, locations: T[]): T[] {
  if (mode !== 'place_only' || locations.length === 0) return locations
  if (!placeOnlyCardsLookRedundant(locations)) return locations
  const first = locations[0]
  const label = first.locationLabel || `${first.name ?? ''}, ${first.country ?? ''}`
  const alts = diverseActivitiesForPlace(label, first.country || '')
  const regionSpots = diverseSpotsForPlace(label, first.country || '')
  const fallbackGeo = fallbackGeoTripletForPlace(label, first.country || '')
  return locations.map((loc, i) => {
    const act = alts[i] ?? alts[alts.length - 1]
    const geo = signatureSpotForCardAnchor(loc, regionSpots, fallbackGeo, i)
    const name = loc.name ?? ''
    return {
      ...loc,
      activity: act,
      primaryTitle: geo,
      recommendationKind: 'spot',
      imageSearchTerm: `${act} ${geo} ${name}`.trim(),
    }
  })
}

function diverseSpotsForPlace(locationLabel: string, country: string): string[] | null {
  const ctx = `${locationLabel} ${country}`.toLowerCase()
  if (/chamonix|mont\s*blanc/.test(ctx))
    return ['Aiguille du Midi approaches', 'Mer de Glace sector', 'Brévent–Flégère ridges']
  if (/\bbali\b/.test(ctx)) return ['Uluwatu cliffs', 'Canggu reef breaks', 'Nusa Penida drift sites']
  if (/portugal|peniche|ericeira/.test(ctx)) return ['Supertubos beach', 'Ericeira reserve points', 'Baleal bay']
  if (/zermatt/.test(ctx)) return ['Gornergrat trails', 'Schwarzsee sector', 'Trockener Steg routes']
  return null
}

function fallbackGeoTripletForPlace(locationLabel: string, country: string): string[] {
  const anchor =
    locationLabel.split(',')[0]?.trim() || country.trim() || 'Destination'
  return [`${anchor} · old town fringe`, `${anchor} · waterfront belt`, `${anchor} · inland ridgeline`]
}

/** When place+activity mode still returns the activity name as every card title, swap in real sub-spots. */
function diversifyPlacePlusActivityCards<
  T extends {
    primaryTitle?: string
    activity?: string
    name?: string
    locationLabel?: string
    country?: string
    imageSearchTerm?: string
    recommendationKind?: string
  },
>(mode: IntentMode, locations: T[]): T[] {
  if (mode !== 'place_plus_activity' || locations.length === 0) return locations
  if (!placeOnlyCardsLookRedundant(locations)) return locations
  const first = locations[0]
  const label = first.locationLabel || `${first.name ?? ''}, ${first.country ?? ''}`
  const spots = diverseSpotsForPlace(label, first.country || '')
  if (!spots) return locations
  const act = (first.activity ?? 'Outdoor').trim()
  const fallbackGeo = fallbackGeoTripletForPlace(label, first.country || '')
  return locations.map((loc, i) => {
    const spot = signatureSpotForCardAnchor(loc, spots, fallbackGeo, i)
    const placeName = loc.name ?? first.name ?? ''
    return {
      ...loc,
      primaryTitle: spot,
      recommendationKind: 'spot',
      imageSearchTerm: `${act} ${spot} ${placeName}`.trim(),
    }
  })
}

const ACTIVITY_TITLE_WORDS = [
  'surfing',
  'surf',
  'yoga',
  'running',
  'marathon',
  'skiing',
  'snowboarding',
  'climbing',
  'bouldering',
  'kayak',
  'kayaking',
  'hiking',
  'cycling',
  'swimming',
  'diving',
  'snorkel',
  'snorkeling',
  'triathlon',
  'paddleboard',
  'windsurfing',
  'kitesurfing',
]

function primaryTitleLooksLikeActivity(title: string): boolean {
  const t = title.toLowerCase()
  const phrases = ['big wave', 'trail running', 'open water', 'rock climbing', 'road cycling', 'sea kayaking']
  if (phrases.some((p) => t.includes(p))) return true
  return ACTIVITY_TITLE_WORDS.some((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(t)
  })
}

function fixPrimaryTitlesToGeographic<
  T extends { primaryTitle?: string; locationLabel?: string; name?: string },
>(locations: T[]): T[] {
  return locations.map((loc) => {
    const pt = (loc.primaryTitle ?? '').trim()
    if (!pt || !primaryTitleLooksLikeActivity(pt)) return loc
    console.error('[intent-recommendations] Invalid primaryTitle (activity-like):', pt)
    const label = (loc.locationLabel ?? '').trim()
    const fallback = label.split(',')[0]?.trim() || (loc.name ?? '').trim() || pt
    return { ...loc, primaryTitle: fallback }
  })
}

export async function POST(req: Request) {
  if (!hasGroqApiKeys()) {
    console.error('[intent-recommendations] No Groq API keys configured.')
    return NextResponse.json(
      { error: 'missing_api_key', message: PLAYCE_SOFT_ERROR },
      { status: 401 }
    )
  }

  let prompt = ''
  let originalQuery = ''
  let tripRole: IntentTripRole = 'ACTIVE_TRAVEL'
  try {
    const body = (await req.json()) as { prompt?: string; originalQuery?: string; tripRole?: string }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    originalQuery =
      typeof body.originalQuery === 'string' && body.originalQuery.trim()
        ? body.originalQuery.trim()
        : stripAnyRolePromptSuffix(prompt)
    if (!originalQuery) originalQuery = prompt
    if (
      body.tripRole === 'WATCHING' ||
      body.tripRole === 'SPECTATOR' ||
      body.tripRole === 'SUPPORTING'
    )
      tripRole = 'WATCHING'
    else if (body.tripRole === 'COMPETITOR') tripRole = 'COMPETITOR'
  } catch (bodyErr) {
    console.error('[intent-recommendations] Invalid request JSON:', bodyErr)
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!prompt || prompt.length > 4000) {
    return NextResponse.json({ error: 'prompt_required' }, { status: 400 })
  }

  const cacheKey = buildCacheKey(`v2:${prompt.slice(0, 120)}`, tripRole)
  const cached = getCachedResponse(cacheKey)
  if (cached) {
    try {
      return NextResponse.json(JSON.parse(cached))
    } catch { /* fall through to fresh call */ }
  }

  const namedRaceCity = parseNamedRaceCityFromPrompt(prompt)
  const intentMode = detectIntentMode(prompt)
  const systemPrompt = buildSystemPrompt()

  if (process.env.NODE_ENV !== 'production') {
    console.info('[intent-recommendations] system prompt length', {
      chars: systemPrompt.length,
      approxTokens: systemPrompt.split(/\s+/).filter(Boolean).length,
    })
  }

  type ParsedResponse = {
    intentSummary?: string
    detectedSkillLevel?: string | null
    locations?: unknown[]
  }

  let lastGroqError: string | null = null

  async function callForRecommendations(useEventFallback: boolean): Promise<ParsedResponse | null> {
    const userContent = buildIntentUserContent(
      prompt,
      originalQuery,
      intentMode,
      tripRole,
      useEventFallback,
      namedRaceCity
    )
    try {
      const raw = await callClaude(systemPrompt, userContent, 4096)
      const cleaned = cleanJsonText(raw) || stripJsonFence(raw)
      const rawParsed = JSON.parse(cleaned) as ParsedResponse
      try {
        return intentRecommendationsResponseSchema.parse(rawParsed) as ParsedResponse
      } catch (schemaErr) {
        console.error('[intent-recommendations] Schema validation failed:', schemaErr)
        return rawParsed
      }
    } catch (err) {
      console.error('[intent-recommendations] Claude call failed:', err)
      lastGroqError = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  async function tryCuratedRateLimitFallback() {
    if (!/rate_limit|429|tokens per day|too many requests/i.test(lastGroqError ?? '')) return null
    if (!matchesPortugalSurfIntent(originalQuery || prompt)) return null
    return buildPortugalSurfCuratedResult(originalQuery || prompt, tripRole)
  }

  function recommendationErrorResponse() {
    const msg = lastGroqError ?? ''
    if (/rate_limit|429|tokens per day|too many requests/i.test(msg)) {
      return NextResponse.json(
        {
          error: 'rate_limit',
          message: rateLimitUserMessage(groqRateLimitWaitHint(msg)),
        },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: 'recommendation_unavailable' }, { status: 503 })
  }

  let usedEventFallbackRetry = false

  try {
    let parsed = await callForRecommendations(false)

    if (!parsed) {
      const offlineSeedCards = buildStableRaceSeedCards(prompt, null)
      if (offlineSeedCards?.length) {
        parsed = {
          intentSummary: originalQuery,
          detectedSkillLevel: null,
          locations: offlineSeedCards,
        }
      } else {
        const curated = await tryCuratedRateLimitFallback()
        if (curated && curated.locations.length >= 3) {
          setCachedResponse(cacheKey, JSON.stringify(curated))
          return NextResponse.json(curated)
        }
        return recommendationErrorResponse()
      }
    }

    if (!Array.isArray(parsed.locations) || parsed.locations.length === 0) {
      console.error('[intent-recommendations] Parsed JSON has no locations.')
      return NextResponse.json(
        { error: 'recommendation_unavailable' },
        { status: 503 }
      )
    }

    if (
      (tripRole === 'COMPETITOR' || tripRole === 'WATCHING') &&
      allLocationsLackUpcomingEvents(parsed.locations)
    ) {
      console.info('[intent-recommendations] No upcomingEvents for event-anchored tripRole; retrying with fallback.')
      const fallbackParsed = await callForRecommendations(true)
      if (fallbackParsed && Array.isArray(fallbackParsed.locations) && fallbackParsed.locations.length > 0) {
        parsed = fallbackParsed
        usedEventFallbackRetry = true
      }
    }

    const stableRaceSeedCards = buildStableRaceSeedCards(prompt, parsed.detectedSkillLevel ?? null)
    const seedCardMin = namedRaceCity ? 1 : 3
    const useStableRaceSeed =
      !usedEventFallbackRetry &&
      !!stableRaceSeedCards &&
      stableRaceSeedCards.length >= seedCardMin &&
      (namedRaceCity !== null ||
        intentMode === 'activity_only' ||
        (isRaceIntent(prompt) && parseBroadRegion(prompt) !== null))
    const sourceLocations =
      useStableRaceSeed && stableRaceSeedCards
        ? stableRaceSeedCards.slice(0, namedRaceCity ? 1 : 3)
        : (parsed.locations ?? []).slice(0, namedRaceCity ? 1 : 3)

    const enrichedBase = await Promise.all(
      sourceLocations.map(async (loc) => {
        try {
          return enrichIntentLocation(loc as Parameters<typeof enrichIntentLocation>[0])
        } catch (err) {
          const fallbackLoc = (loc ?? {}) as Record<string, unknown>
          console.error(
            '[intent-recommendations] Failed to enrich location:',
            fallbackLoc.primaryTitle ?? fallbackLoc.name ?? 'unknown',
            err
          )
          return fallbackLoc as Parameters<typeof normalizeLocationCards>[1][number]
        }
      })
    )

    const normalized = fixPrimaryTitlesToGeographic(
      diversifyPlacePlusActivityCards(
        intentMode,
        diversifyPlaceOnlyCards(intentMode, normalizeLocationCards(intentMode, enrichedBase))
      )
    )
    const usedImageUrls = new Set<string>()
    const pickIndex = [0, 2, 4]

    const locations = []
    for (let i = 0; i < normalized.length; i += 1) {
      const enriched = normalized[i]
      const perCardQuery =
        enriched.imageSearchTerm?.trim() ||
        `${enriched.activity} ${enriched.primaryTitle || enriched.name} ${enriched.country}`.trim()
      const imageData = await getDestinationImage(
        enriched.name,
        enriched.activity,
        perCardQuery,
        pickIndex[i] ?? 0,
        usedImageUrls
      )
      locations.push({
        ...enriched,
        hasExplicitActivity: intentMode !== 'place_only',
        image: imageData.url,
        photographerName: imageData.photographerName,
        photographerLink: imageData.photographerLink,
      })
    }

    const result = {
      intentSummary: buildFallbackIntentTitle(
        originalQuery,
        parsed.intentSummary,
        locations[0] ? { name: locations[0].name, activity: locations[0].activity } : undefined
      ),
      detectedSkillLevel: parsed.detectedSkillLevel ?? null,
      eventFallbackApplied: usedEventFallbackRetry,
      locations,
    }

    setCachedResponse(cacheKey, JSON.stringify(result))
    return NextResponse.json(result)
  } catch (e) {
    console.error('[intent-recommendations] Unhandled route error:', e)
    return NextResponse.json({ error: 'recommendation_unavailable' }, { status: 503 })
  }
}
