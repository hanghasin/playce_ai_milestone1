'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TheMatrix } from '@/components/playce/the-matrix'
import type { RefineProfile } from '@/components/playce/the-refine'
import { normalizeTripRole } from '@/components/playce/the-refine'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { PLAYCE_CONFIRM_HANDOFF_KEY, type PlayceConfirmHandoff } from '@/lib/playce-confirm-handoff'
import {
  buildDestinationHandoffSlug,
  destinationSlugsMatch,
} from '@/lib/playce-confirm-helpers'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'
import type { SavedJourneyEntry } from '@/components/playce/the-saved-journeys'
import { PLAYCE_DEFAULT_REFINE, resolveRefineProfile } from '@/lib/playce-default-refine'
import { refineWithLocationSkill } from '@/lib/playce-refine-from-difficulty'
import { SAVED_JOURNEYS_RETURN_URL_KEY } from '@/lib/journey-advisor-session'

const SHORTLIST_KEY = 'playce_shortlist'
const JOURNEYS_KEY = 'playce_saved_journeys'

export default function ConfirmDestinationPage() {
  const router = useRouter()
  const params = useParams()
  const destinationIdRaw =
    typeof params.destinationId === 'string'
      ? params.destinationId
      : Array.isArray(params.destinationId)
        ? params.destinationId[0]
        : ''

  const [payload, setPayload] = useState<PlayceConfirmHandoff | null>(null)
  const [shortlist, setShortlist] = useState<MatrixLocationData[]>([])
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MatrixLocationData[]
        if (Array.isArray(parsed)) setShortlist(parsed.map(normalizeMatrixLocation))
      }
    } catch {
      /* ignore */
    }
    try {
      const rawJ = localStorage.getItem(JOURNEYS_KEY)
      if (rawJ) {
        const list = JSON.parse(rawJ) as SavedJourneyEntry[]
        if (Array.isArray(list)) setSavedCount(list.length)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!destinationIdRaw) {
      router.replace('/')
      return
    }
    try {
      const rawHandoff = sessionStorage.getItem(PLAYCE_CONFIRM_HANDOFF_KEY)
      const handoff = rawHandoff ? (JSON.parse(rawHandoff) as PlayceConfirmHandoff) : null

      if (handoff?.v === 1 && handoff.location) {
        const locNorm = normalizeMatrixLocation(handoff.location)
        const loc: MatrixLocationData = {
          ...locNorm,
          budgetTier:
            handoff.location.budgetTier ?? handoff.refine?.budgetRange ?? locNorm.budgetTier,
        }
        const expected = buildDestinationHandoffSlug(loc)
        if (destinationSlugsMatch(expected, destinationIdRaw)) {
          const NR = resolveRefineProfile(
            handoff.refine
              ? {
                  ...handoff.refine,
                  tripRole:
                    normalizeTripRole(handoff.refine.tripRole) ??
                    PLAYCE_DEFAULT_REFINE.tripRole,
                }
              : handoff.refine
          )
          setPayload({ ...handoff, location: loc, refine: NR })
          return
        }
      }

      const rawIntent = sessionStorage.getItem('playce-intent')
      if (!rawIntent) {
        router.replace('/')
        return
      }
      const intent = JSON.parse(rawIntent) as {
        query?: string
        refineSnapshot?: RefineProfile | null
        locations?: MatrixLocationData[]
      }
      const list = intent.locations ?? []
      const found = list.map((l) => normalizeMatrixLocation(l)).find((loc) =>
        destinationSlugsMatch(buildDestinationHandoffSlug(loc), destinationIdRaw)
      )
      if (!found) {
        router.replace('/')
        return
      }
      const snap = intent.refineSnapshot && typeof intent.refineSnapshot === 'object' ? intent.refineSnapshot : null
      const base: RefineProfile = snap
        ? resolveRefineProfile({
            skillLevel: snap.skillLevel ?? PLAYCE_DEFAULT_REFINE.skillLevel,
            riskAppetite: snap.riskAppetite ?? PLAYCE_DEFAULT_REFINE.riskAppetite,
            budgetRange: snap.budgetRange ?? PLAYCE_DEFAULT_REFINE.budgetRange,
            tripFocus: snap.tripFocus ?? PLAYCE_DEFAULT_REFINE.tripFocus,
            duration: snap.duration ?? PLAYCE_DEFAULT_REFINE.duration,
            travelCompany: snap.travelCompany ?? PLAYCE_DEFAULT_REFINE.travelCompany,
            tripRole: normalizeTripRole(snap.tripRole) ?? PLAYCE_DEFAULT_REFINE.tripRole,
          })
        : { ...PLAYCE_DEFAULT_REFINE }

      const built: PlayceConfirmHandoff = {
        v: 1,
        destinationId: buildDestinationHandoffSlug(found),
        location: { ...found, budgetTier: base.budgetRange },
        refine: refineWithLocationSkill(base, found.difficulty),
        timeframeQuery: typeof intent.query === 'string' ? intent.query : '',
      }
      setPayload(built)
      try {
        sessionStorage.setItem(PLAYCE_CONFIRM_HANDOFF_KEY, JSON.stringify(built))
      } catch {
        /* ignore quota */
      }
    } catch {
      router.replace('/')
    }
  }, [destinationIdRaw, router])

  const persistShortlist = useCallback((next: MatrixLocationData[]) => {
    setShortlist(next)
    try {
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const isShortlisted = useCallback(
    (loc: MatrixLocationData | null) =>
      !!loc && shortlist.some((item) => item.name === loc.name && item.country === loc.country),
    [shortlist]
  )

  const toggleShortlist = useCallback(
    (location: MatrixLocationData) => {
      persistShortlist(
        shortlist.some((item) => item.name === location.name && item.country === location.country)
          ? shortlist.filter((item) => !(item.name === location.name && item.country === location.country))
          : [...shortlist, location]
      )
    },
    [shortlist, persistShortlist]
  )

  const handleOpenShortlist = useCallback(() => {
    router.push('/?view=shortlist')
  }, [router])

  const handleOpenSavedJourneys = useCallback(() => {
    if (payload?.destinationId) {
      try {
        sessionStorage.setItem(
          SAVED_JOURNEYS_RETURN_URL_KEY,
          `/confirm/${payload.destinationId}`
        )
      } catch {
        /* ignore */
      }
    }
    router.push('/?view=saved-journeys')
  }, [payload?.destinationId, router])

  const handleBack = useCallback(() => {
    if (!payload) {
      router.push('/')
      return
    }
    router.push(`/calibration/${payload.destinationId}`)
  }, [payload, router])

  if (!payload) {
    return <main className="min-h-screen" style={{ background: 'var(--bg)', minHeight: '100vh' }} aria-busy="true" />
  }

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <TheMatrix
        location={payload.location}
        refine={payload.refine}
        timeframeQuery={payload.timeframeQuery}
        isShortlisted={isShortlisted(payload.location)}
        onBack={handleBack}
        onToggleShortlist={() => toggleShortlist(payload.location)}
        onOpenSavedJourneys={handleOpenSavedJourneys}
        onOpenShortlist={handleOpenShortlist}
        savedJourneyCount={savedCount}
        shortlistCount={shortlist.length}
      />
    </main>
  )
}
