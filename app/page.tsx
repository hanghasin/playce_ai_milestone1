'use client'

import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconMapPin, IconRoute } from '@tabler/icons-react'
import { TheAbyss } from '@/components/playce/the-abyss'
import { TheMatch } from '@/components/playce/the-match'
import { TheShortlist } from '@/components/playce/the-shortlist'
import {
  TheSavedJourneys,
  type SavedJourneyEntry,
} from '@/components/playce/the-saved-journeys'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'
import type { RefineProfile } from '@/components/playce/the-refine'
import { normalizeTripRole } from '@/components/playce/the-refine'
import { PLAYCE_DEFAULT_REFINE } from '@/lib/playce-default-refine'
import { buildDestinationHandoffSlug } from '@/lib/playce-confirm-helpers'
import { locationNeedsImage } from '@/lib/location-image'
import { enrichLocationsWithImages } from '@/lib/enrich-locations-client'
import { journeyHandoffLocalStorageKey } from '@/lib/merge-journey-handoff-location'
import {
  restoreAdvisorSessionFromSnapshot,
  SAVED_JOURNEYS_RETURN_PAGE_KEY,
  SAVED_JOURNEYS_RETURN_URL_KEY,
} from '@/lib/journey-advisor-session'
import { PLAYCE_CONFIRM_HANDOFF_KEY, type PlayceConfirmHandoff } from '@/lib/playce-confirm-handoff'
import { refineWithLocationSkill } from '@/lib/playce-refine-from-difficulty'
import { stripAnyRolePromptSuffix } from '@/lib/playce-role-prompt'
import { cleanIntentTitle } from '@/lib/intent-title-clean'
import {
  isLikelyProviderRateLimit,
  PLAYCE_RATE_LIMIT_ERROR,
  PLAYCE_SOFT_ERROR,
  rateLimitUserMessage,
  sanitizeUserFacingErrorMessage,
} from '@/lib/playce-user-facing-errors'

type Page = 'abyss' | 'match' | 'shortlist' | 'savedJourneys'

function pageFromViewParam(view: string | null): Page | null {
  if (view === 'saved-journeys') return 'savedJourneys'
  if (view === 'shortlist') return 'shortlist'
  return null
}

function readLegacyNavPage(): Page | null {
  if (typeof window === 'undefined') return null
  try {
    if (sessionStorage.getItem('playce-open-saved') === '1') {
      sessionStorage.removeItem('playce-open-saved')
      return 'savedJourneys'
    }
    if (sessionStorage.getItem('playce-open-shortlist-nav') === '1') {
      sessionStorage.removeItem('playce-open-shortlist-nav')
      return 'shortlist'
    }
  } catch {
    /* ignore */
  }
  return null
}

const DEFAULT_REFINE: RefineProfile = PLAYCE_DEFAULT_REFINE
const SHORTLIST_KEY = 'playce_shortlist'
const INTENT_CACHE_VERSION = 4

function intentFailureMessage(
  res: Response,
  data: { error?: string; message?: string }
): string {
  const serverMsg = typeof data.message === 'string' ? data.message.trim() : ''
  if (data.error === 'missing_api_key' || res.status === 401) {
    return PLAYCE_SOFT_ERROR
  }
  if (data.error === 'rate_limit' || res.status === 429) {
    return sanitizeUserFacingErrorMessage(serverMsg) || PLAYCE_RATE_LIMIT_ERROR
  }
  if (data.error === 'recommendation_unavailable' || res.status === 503) {
    return PLAYCE_SOFT_ERROR
  }
  const upstream = res.status === 502 || res.status === 500
  if (upstream && serverMsg && isLikelyProviderRateLimit(serverMsg)) {
    return rateLimitUserMessage(null)
  }
  if (serverMsg) return sanitizeUserFacingErrorMessage(serverMsg)
  return PLAYCE_SOFT_ERROR
}
function tripRoleToTravelIntentKey(role: RefineProfile['tripRole']): 'practice' | 'competing' | 'watching' {
  if (role === 'COMPETITOR') return 'competing'
  if (role === 'WATCHING') return 'watching'
  return 'practice'
}

export default function Home() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: 'var(--bg)' }} aria-busy="true" />}>
      <HomePage />
    </Suspense>
  )
}

function HomePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view')
  const initialNavPage = pageFromViewParam(viewParam) ?? readLegacyNavPage()
  const skipIntentPageRestore = useRef(initialNavPage != null)
  const [currentPage, setCurrentPage] = useState<Page>(initialNavPage ?? 'abyss')
  const [searchQuery, setSearchQuery] = useState('')
  const [intentSummary, setIntentSummary] = useState<string | undefined>(undefined)
  const [detectedSkillLevel, setDetectedSkillLevel] = useState<string | null>(null)
  const [intentRecommendations, setIntentRecommendations] = useState<MatrixLocationData[] | null>(null)
  const [intentAnalyzing, setIntentAnalyzing] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [shortlist, setShortlist] = useState<MatrixLocationData[]>([])
  const [savedJourneys, setSavedJourneys] = useState<SavedJourneyEntry[]>([])
  const [refineProfile, setRefineProfile] = useState<RefineProfile>(DEFAULT_REFINE)
  const shortlistHydrated = useRef(false)
  const imageEnrichKeyRef = useRef<string | null>(null)

  const sanitizeLocation = useCallback(
    (loc: MatrixLocationData): MatrixLocationData => normalizeMatrixLocation(loc),
    []
  )

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('playce-intent')
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        v?: number
        query?: string
        intentSummary?: string
        detectedSkillLevel?: string | null
        locations?: MatrixLocationData[]
        eventFallbackApplied?: boolean
        travelIntent?: 'practice' | 'competing' | 'watching' | 'spectating' | 'supporting'
        refineSnapshot?: RefineProfile | null
      }
      if (!parsed.locations || parsed.locations.length < 3) return
      if (parsed.v !== INTENT_CACHE_VERSION) {
        sessionStorage.removeItem('playce-intent')
        return
      }
      try {
        const ti = parsed.travelIntent
        const normalized =
          ti === 'spectating' || ti === 'supporting' ? 'watching' : ti === 'watching' || ti === 'practice' || ti === 'competing' ? ti : null
        if (normalized) {
          sessionStorage.setItem('travelIntent', normalized)
        }
      } catch {
        /* ignore */
      }
      const snap =
        parsed.refineSnapshot && typeof parsed.refineSnapshot === 'object' ? parsed.refineSnapshot : null
      if (snap) {
        setRefineProfile({
          skillLevel: snap.skillLevel ?? DEFAULT_REFINE.skillLevel,
          riskAppetite: snap.riskAppetite ?? DEFAULT_REFINE.riskAppetite,
          budgetRange: snap.budgetRange ?? DEFAULT_REFINE.budgetRange,
          tripFocus: snap.tripFocus ?? DEFAULT_REFINE.tripFocus,
          duration: snap.duration ?? DEFAULT_REFINE.duration,
          travelCompany: snap.travelCompany ?? DEFAULT_REFINE.travelCompany,
          tripRole: normalizeTripRole(snap.tripRole) ?? DEFAULT_REFINE.tripRole,
        })
      }
      setIntentRecommendations(parsed.locations.map(sanitizeLocation))
      setSearchQuery(stripAnyRolePromptSuffix(parsed.query ?? ''))
      setIntentSummary(
        typeof parsed.intentSummary === 'string' ? cleanIntentTitle(parsed.intentSummary) : undefined
      )
      setDetectedSkillLevel(parsed.detectedSkillLevel ?? null)
      if (parsed.eventFallbackApplied) {
        setRefineProfile((p) => ({ ...p, tripRole: 'ACTIVE_TRAVEL' }))
      }
      if (!skipIntentPageRestore.current) {
        setCurrentPage('match')
      }
    } catch {
      /* ignore */
    }
  }, [sanitizeLocation])

  useEffect(() => {
    const target = pageFromViewParam(viewParam)
    if (!target) return
    setCurrentPage(target)
    skipIntentPageRestore.current = true
    router.replace('/', { scroll: false })
  }, [viewParam, router])

  useEffect(() => {
    const locs = intentRecommendations
    if (!locs?.length || !locs.some((loc) => locationNeedsImage(loc.image))) return

    const enrichKey = locs.map((l) => `${l.name}|${l.country}|${l.primaryTitle ?? ''}|${l.image ?? ''}`).join(';')
    if (imageEnrichKeyRef.current === enrichKey) return

    let cancelled = false
    ;(async () => {
      try {
        const merged = (await enrichLocationsWithImages(locs)).map(sanitizeLocation)
        if (cancelled) return
        if (!merged.some((loc, i) => loc.image !== locs[i].image)) return

        setIntentRecommendations(merged)

        if (!merged.some((loc) => locationNeedsImage(loc.image))) {
          imageEnrichKeyRef.current = enrichKey
        }

        try {
          const raw = sessionStorage.getItem('playce-intent')
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, unknown>
            sessionStorage.setItem(
              'playce-intent',
              JSON.stringify({ ...parsed, v: INTENT_CACHE_VERSION, locations: merged })
            )
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* allow retry on next render */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [intentRecommendations, sanitizeLocation])

  useEffect(() => {
    try {
      const key = 'playce_saved_journeys'
      const raw = localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedJourneyEntry[]
      if (Array.isArray(parsed)) setSavedJourneys(parsed)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MatrixLocationData[]
        if (Array.isArray(parsed) && parsed.length > 0) setShortlist(parsed.map(sanitizeLocation))
      }
    } catch {
      /* ignore */
    } finally {
      shortlistHydrated.current = true
    }
  }, [sanitizeLocation])

  useEffect(() => {
    if (!shortlistHydrated.current) return
    try {
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist))
    } catch {
      /* ignore */
    }
  }, [shortlist])

  const beginPageTransition = useCallback((go: () => void, delayMs = 560) => {
    setIsTransitioning(true)
    window.setTimeout(() => {
      go()
      setIsTransitioning(false)
    }, delayMs)
  }, [])

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed || intentAnalyzing) return
      const chosenRole = refineProfile.tripRole
      if (chosenRole == null) return

      setIntentError(null)
      setIntentAnalyzing(true)

      try {
        const originalQuery = stripAnyRolePromptSuffix(trimmed) || trimmed
        try {
          sessionStorage.setItem('playce-abyss-query', originalQuery)
        } catch {
          /* ignore */
        }

        const res = await fetch('/api/intent-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmed, originalQuery, tripRole: chosenRole }),
        })

        const data = (await res.json()) as {
          intentSummary?: string | null
          detectedSkillLevel?: string | null
          locations?: MatrixLocationData[]
          eventFallbackApplied?: boolean
          message?: string
          error?: string
        }

        if (!res.ok) {
          setIntentError(intentFailureMessage(res, data))
          setIntentAnalyzing(false)
          return
        }

        const locations = Array.isArray(data.locations) ? data.locations : []
        if (locations.length < 3) {
          setIntentError(HOMEPAGE_SOFT_ERROR)
          setIntentAnalyzing(false)
          return
        }

        if (data.eventFallbackApplied) {
          setRefineProfile((p) => ({ ...p, tripRole: 'ACTIVE_TRAVEL' }))
        }

        const effectiveRole = data.eventFallbackApplied ? ('ACTIVE_TRAVEL' as const) : chosenRole

        const sanitized = locations.map(sanitizeLocation)
        const withImages = (await enrichLocationsWithImages(sanitized)).map(sanitizeLocation)
        imageEnrichKeyRef.current = null

        setIntentRecommendations(withImages)
        setIntentSummary(
          typeof data.intentSummary === 'string' ? cleanIntentTitle(data.intentSummary) : undefined
        )
        setDetectedSkillLevel(data.detectedSkillLevel ?? null)
        setSearchQuery(originalQuery)

        try {
          const travelIntent = tripRoleToTravelIntentKey(effectiveRole)
          sessionStorage.setItem('travelIntent', travelIntent)
          sessionStorage.setItem(
            'playce-intent',
            JSON.stringify({
              v: INTENT_CACHE_VERSION,
              query: originalQuery,
              intentSummary:
                typeof data.intentSummary === 'string'
                  ? cleanIntentTitle(data.intentSummary)
                  : undefined,
              detectedSkillLevel: data.detectedSkillLevel ?? null,
              eventFallbackApplied: data.eventFallbackApplied ?? false,
              travelIntent,
              refineSnapshot: { ...refineProfile, tripRole: effectiveRole },
              locations: withImages,
            })
          )
        } catch {
          /* ignore quota / privacy mode */
        }

        beginPageTransition(() => {
          setCurrentPage('match')
          setIntentAnalyzing(false)
        })
      } catch {
        setIntentError(HOMEPAGE_SOFT_ERROR)
        setIntentAnalyzing(false)
      }
    },
    [intentAnalyzing, beginPageTransition, sanitizeLocation, refineProfile]
  )

  const handleAbyssTripRoleChange = useCallback((role: RefineProfile['tripRole']) => {
    setRefineProfile((p) => (p.tripRole === role ? p : { ...p, tripRole: role }))
  }, [])

  const handleBackToAbyss = useCallback(() => {
    beginPageTransition(() => {
      try {
        sessionStorage.removeItem('playce-intent')
        sessionStorage.removeItem('playce-abyss-query')
        sessionStorage.removeItem('travelIntent')
      } catch {
        /* ignore */
      }
      setCurrentPage('abyss')
      setIntentRecommendations(null)
      setIntentSummary(undefined)
      setDetectedSkillLevel(null)
      setRefineProfile(DEFAULT_REFINE)
      setIntentError(null)
    })
  }, [beginPageTransition])

  const toggleShortlist = useCallback((location: MatrixLocationData) => {
    setShortlist((prev) => {
      const exists = prev.some((item) => item.name === location.name && item.country === location.country)
      if (exists) return prev.filter((item) => !(item.name === location.name && item.country === location.country))
      return [...prev, location]
    })
  }, [])

  const handleOpenSavedJourneys = useCallback(() => {
    skipIntentPageRestore.current = true
    try {
      sessionStorage.setItem(SAVED_JOURNEYS_RETURN_PAGE_KEY, currentPage)
    } catch {
      /* ignore */
    }
    beginPageTransition(() => setCurrentPage('savedJourneys'))
  }, [beginPageTransition, currentPage])

  const handleOpenShortlist = useCallback(() => {
    skipIntentPageRestore.current = true
    beginPageTransition(() => setCurrentPage('shortlist'))
  }, [beginPageTransition])

  const handleSavedJourneysBack = useCallback(() => {
    try {
      const returnUrl = sessionStorage.getItem(SAVED_JOURNEYS_RETURN_URL_KEY)
      sessionStorage.removeItem(SAVED_JOURNEYS_RETURN_URL_KEY)
      if (returnUrl?.startsWith('/')) {
        router.push(returnUrl)
        return
      }
      const returnPage = sessionStorage.getItem(SAVED_JOURNEYS_RETURN_PAGE_KEY) as Page | null
      sessionStorage.removeItem(SAVED_JOURNEYS_RETURN_PAGE_KEY)
      if (returnPage && returnPage !== 'savedJourneys') {
        beginPageTransition(() => setCurrentPage(returnPage))
        return
      }
    } catch {
      /* ignore */
    }
    beginPageTransition(() => setCurrentPage('abyss'))
  }, [beginPageTransition, router])

  const handleShortlistBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
      return
    }
    beginPageTransition(() => setCurrentPage('abyss'))
  }, [beginPageTransition])

  const handleRestoreSavedJourney = useCallback(
    (item: SavedJourneyEntry) => {
      const loc = sanitizeLocation(item.location)
      const slug = buildDestinationHandoffSlug(loc)
      const restored: RefineProfile = {
        ...item.refine,
        tripRole: normalizeTripRole(item.refine.tripRole) ?? 'COMPETITOR',
      }
      const generationNonce = item.advisorSnapshot?.generationNonce ?? Date.now()
      try {
        const handoff = {
          v: 1 as const,
          destinationId: slug,
          location: loc,
          refine: restored,
          generationNonce,
        }
        sessionStorage.setItem('playce-journey-handoff', JSON.stringify(handoff))
        localStorage.setItem(journeyHandoffLocalStorageKey(slug), JSON.stringify(handoff))
        sessionStorage.setItem('travelIntent', tripRoleToTravelIntentKey(restored.tripRole))
        if (item.query?.trim()) {
          sessionStorage.setItem('playce-abyss-query', item.query.trim())
        }
        if (item.advisorSnapshot) {
          restoreAdvisorSessionFromSnapshot(slug, item.advisorSnapshot)
        } else {
          sessionStorage.removeItem(`playce-advisor-session:${slug}`)
        }
        sessionStorage.removeItem(SAVED_JOURNEYS_RETURN_URL_KEY)
        sessionStorage.removeItem(SAVED_JOURNEYS_RETURN_PAGE_KEY)
      } catch {
        /* ignore */
      }
      router.push(`/journey/${slug}`)
    },
    [router, sanitizeLocation]
  )

  const handleSelectFromShortlist = useCallback(
    (location: MatrixLocationData) => {
      const loc = sanitizeLocation(location)
      const slug = buildDestinationHandoffSlug(loc)
      const handoff: PlayceConfirmHandoff = {
        v: 1,
        destinationId: slug,
        location: { ...loc, budgetTier: refineProfile.budgetRange },
        refine: refineWithLocationSkill(refineProfile, loc.difficulty),
        timeframeQuery: searchQuery.trim() || '',
      }
      try {
        sessionStorage.setItem(PLAYCE_CONFIRM_HANDOFF_KEY, JSON.stringify(handoff))
        sessionStorage.setItem('travelIntent', tripRoleToTravelIntentKey(handoff.refine.tripRole))
      } catch {
        /* ignore */
      }
      router.push(`/confirm/${slug}`)
    },
    [router, sanitizeLocation, refineProfile, searchQuery]
  )

  const handleDeleteSavedJourney = useCallback((index: number) => {
    const key = 'playce_saved_journeys'
    setSavedJourneys((prev) => {
      const next = prev.filter((_, i) => i !== index)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        alert('Could not update saved journeys on this device.')
        return prev
      }
      return next
    })
  }, [])

  /** Top-right saved nav — must show on match/results too (not only the home hero). */
  const showSavedItemsNav =
    currentPage === 'abyss' ||
    currentPage === 'match' ||
    currentPage === 'shortlist' ||
    currentPage === 'savedJourneys'

  return (
    <main
      className={`
        min-h-screen
        page-transition
        ${isTransitioning ? 'page-blur-out' : ''}
      `}
      style={{ background: 'var(--bg)', minHeight: '100vh' }}
    >
      {showSavedItemsNav ? (
      <div
        className="fixed z-[70] flex h-10 items-center gap-3 pointer-events-auto top-[max(1rem,env(safe-area-inset-top,0px))] md:top-[max(1.5rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] md:right-[max(1.25rem,env(safe-area-inset-right,0px))]"
      >
        <button
          type="button"
          onClick={handleOpenSavedJourneys}
          className="group relative border-0 bg-transparent p-0 cursor-pointer"
          aria-label="Saved Journeys"
          title="Saved Journeys"
        >
          <span className="relative inline-flex size-[18px] items-center justify-center shrink-0" aria-hidden>
            <IconRoute
              size={18}
              stroke={1.5}
              className="text-white/40 transition-colors group-hover:text-white/55"
            />
            {savedJourneys.length > 0 ? (
              <span
                className="absolute"
                style={{
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#C17D3C',
                }}
              />
            ) : null}
          </span>
        </button>

        <button
          type="button"
          onClick={handleOpenShortlist}
          className="group relative border-0 bg-transparent p-0 cursor-pointer"
          aria-label="Saved Destinations"
          title="Saved Destinations"
        >
          <span className="relative inline-flex size-[18px] items-center justify-center shrink-0" aria-hidden>
            <IconMapPin
              size={18}
              stroke={1.5}
              className="text-white/40 transition-colors group-hover:text-white/55"
            />
            {shortlist.length > 0 ? (
              <span
                className="absolute"
                style={{
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#C17D3C',
                }}
              />
            ) : null}
          </span>
        </button>
      </div>
      ) : null}

      {intentAnalyzing ? (
        <div
          className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-6 bg-black/58 backdrop-blur-[3px] pointer-events-auto px-4"
          aria-busy="true"
          aria-live="polite"
        >
          <p
            className="playce-section-label"
            style={{ color: 'rgba(161, 161, 170, 0.85)' }}
          >
            Analysing...
          </p>
        </div>
      ) : null}

      {currentPage === 'abyss' && (
        <TheAbyss
          onSubmit={handleSearch}
          isAnalyzing={intentAnalyzing}
          intentError={intentError}
          tripRole={refineProfile.tripRole}
          onTripRoleChange={handleAbyssTripRoleChange}
        />
      )}

      {currentPage === 'match' && (
        <TheMatch
          searchQuery={searchQuery}
          intentSummary={intentSummary}
          detectedSkillLevel={detectedSkillLevel}
          recommendations={intentRecommendations ?? []}
          tripDuration={refineProfile.duration}
          timeframeQuery={searchQuery}
          onBack={handleBackToAbyss}
        />
      )}

      {currentPage === 'shortlist' && (
        <TheShortlist
          items={shortlist}
          onBack={handleShortlistBack}
          onBackToExplore={handleBackToAbyss}
          onSelectLocation={handleSelectFromShortlist}
          onRemove={toggleShortlist}
        />
      )}

      {currentPage === 'savedJourneys' && (
        <TheSavedJourneys
          items={savedJourneys}
          onBack={handleSavedJourneysBack}
          onRestore={handleRestoreSavedJourney}
          onDelete={handleDeleteSavedJourney}
        />
      )}
    </main>
  )
}
