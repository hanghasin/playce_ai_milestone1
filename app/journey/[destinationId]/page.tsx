'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TheJourney } from '@/components/playce/the-journey'
import type { RefineProfile } from '@/components/playce/the-refine'
import { normalizeTripRole } from '@/components/playce/the-refine'
import type { SavedJourneyEntry } from '@/components/playce/the-saved-journeys'
import type { SavedJourneyAdvisorSnapshot } from '@/lib/journey-advisor-session'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { buildDestinationHandoffSlug } from '@/lib/playce-confirm-helpers'
import {
  journeyHandoffLocalStorageKey,
  mergeJourneyHandoffLocations,
} from '@/lib/merge-journey-handoff-location'
import {
  restoreAdvisorSessionFromSnapshot,
  SAVED_JOURNEYS_RETURN_URL_KEY,
} from '@/lib/journey-advisor-session'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'

const SHORTLIST_KEY = 'playce_shortlist'
const JOURNEYS_KEY = 'playce_saved_journeys'

type Handoff = {
  v: number
  destinationId?: string
  location: MatrixLocationData
  refine: RefineProfile
  generationNonce?: number
}

export default function JourneyDestinationPage() {
  const router = useRouter()
  const params = useParams()
  const destinationId =
    typeof params.destinationId === 'string'
      ? params.destinationId
      : Array.isArray(params.destinationId)
        ? params.destinationId[0]
        : ''

  const [payload, setPayload] = useState<{
    location: MatrixLocationData
    refine: RefineProfile
    generationNonce: number
  } | null>(null)
  const [savedJourneyCount, setSavedJourneyCount] = useState(0)
  const [savedDestinationCount, setSavedDestinationCount] = useState(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MatrixLocationData[]
        if (Array.isArray(parsed)) setSavedDestinationCount(parsed.length)
      }
    } catch {
      /* ignore */
    }
    try {
      const rawJ = localStorage.getItem(JOURNEYS_KEY)
      if (rawJ) {
        const list = JSON.parse(rawJ) as SavedJourneyEntry[]
        if (Array.isArray(list)) setSavedJourneyCount(list.length)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!destinationId) {
      router.replace('/')
      return
    }

    const readHandoff = (raw: string | null): Handoff | null => {
      if (!raw) return null
      try {
        const p = JSON.parse(raw) as Handoff
        if (p.v !== 1 || !p.location) return null
        return p
      } catch {
        return null
      }
    }

    const sessionH = readHandoff(
      typeof window !== 'undefined' ? sessionStorage.getItem('playce-journey-handoff') : null
    )
    const lsH = readHandoff(
      typeof window !== 'undefined' ? localStorage.getItem(journeyHandoffLocalStorageKey(destinationId)) : null
    )
    const chosen = sessionH ?? lsH
    if (!chosen) {
      router.replace('/')
      return
    }

    const sessionLocNorm = sessionH ? normalizeMatrixLocation(sessionH.location) : null
    const lsLocNorm = lsH ? normalizeMatrixLocation(lsH.location) : null

    let loc: MatrixLocationData
    if (sessionLocNorm && lsLocNorm) {
      loc = normalizeMatrixLocation(mergeJourneyHandoffLocations(sessionLocNorm, lsLocNorm))
    } else {
      loc = normalizeMatrixLocation(chosen.location)
    }

    const expectedId = chosen.destinationId ?? buildDestinationHandoffSlug(loc)
    if (expectedId !== destinationId) {
      router.replace('/')
      return
    }

    const refineA = sessionH?.refine ?? chosen.refine
    const refineB = lsH?.refine
    let refine: RefineProfile = refineA
    if (sessionH && lsH && refineB) {
      refine = {
        ...refineB,
        ...refineA,
        tripRole: refineA.tripRole ?? normalizeTripRole(refineB.tripRole) ?? refineB.tripRole,
      }
    }

    setPayload({
      location: loc,
      refine,
      generationNonce: sessionH?.generationNonce ?? lsH?.generationNonce ?? chosen.generationNonce ?? Date.now(),
    })
  }, [destinationId, router])

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  const handleOpenSavedJourneys = useCallback(() => {
    try {
      sessionStorage.setItem(SAVED_JOURNEYS_RETURN_URL_KEY, `/journey/${destinationId}`)
    } catch {
      /* ignore */
    }
    router.push('/?view=saved-journeys')
  }, [destinationId, router])

  const handleOpenSavedDestinations = useCallback(() => {
    router.push('/?view=shortlist')
  }, [router])

  const handleSave = useCallback(
    (snapshot: SavedJourneyAdvisorSnapshot) => {
      if (!payload) return
      try {
        const raw = localStorage.getItem(JOURNEYS_KEY)
        const list = raw ? (JSON.parse(raw) as SavedJourneyEntry[]) : []
        let query = ''
        try {
          query = sessionStorage.getItem('playce-abyss-query') ?? ''
        } catch {
          /* ignore */
        }
        const entry: SavedJourneyEntry = {
          savedAt: new Date().toISOString(),
          query,
          location: payload.location,
          refine: payload.refine,
          advisorSnapshot: snapshot,
        }
        const next = [entry, ...list].slice(0, 30)
        localStorage.setItem(JOURNEYS_KEY, JSON.stringify(next))
        setSavedJourneyCount(next.length)
        restoreAdvisorSessionFromSnapshot(destinationId, snapshot)
      } catch {
        alert('Could not save journey on this device.')
      }
    },
    [payload, destinationId]
  )

  if (!payload) {
    return <main className="min-h-screen" style={{ background: 'var(--bg)' }} aria-busy="true" />
  }

  return (
    <main
      className="flex min-h-0 flex-col overflow-hidden"
      style={{ background: 'var(--bg)', height: '100dvh', minHeight: '100dvh' }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <TheJourney
          location={payload.location}
          refine={payload.refine}
          destinationId={destinationId}
          generationNonce={payload.generationNonce}
          onBack={handleBack}
          onSave={handleSave}
          onOpenSavedJourneys={handleOpenSavedJourneys}
          onOpenSavedDestinations={handleOpenSavedDestinations}
          savedJourneyCount={savedJourneyCount}
          savedDestinationCount={savedDestinationCount}
        />
      </div>
    </main>
  )
}
