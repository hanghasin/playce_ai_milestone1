'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowRight } from 'lucide-react'

interface LocationData {
  name: string
  country: string
  activity: string
  season: string
  difficulty: string
  vibe: string
  image: string
  womenFriendly: number
  soloIndex: number
  logistics: string[]
  facilities: { name: string; available: boolean }[]
  conditions: {
    temp: string
    waves?: string
    snow?: string
    visibility?: string
  }
}

export type TripDuration = 'WEEKEND' | 'SHORT' | 'WEEK' | 'TWO_WEEKS' | 'OPEN'
export type TravelCompany = 'SOLO' | 'PARTNER' | 'GROUP'
/** Racing/event trips vs general active travel (default). */
export type TripRole = 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'

/** Normalize persisted trip roles (legacy snapshots used SPECTATOR / SUPPORTING). */
export function normalizeTripRole(role: unknown): TripRole | null {
  if (role === 'ACTIVE_TRAVEL' || role === 'COMPETITOR' || role === 'WATCHING') return role
  if (role === 'SPECTATOR' || role === 'SUPPORTING') return 'WATCHING'
  return null
}

/** Duration options shown on the calibration page (no Open-ended). */
export type DurationChip = Exclude<TripDuration, 'OPEN'>

export interface RefineProfile {
  skillLevel: 'BEGINNER' | 'INTERMEDIATE' | 'PRO' | 'ELITE'
  riskAppetite: 'CHILL' | 'ADVENTURE' | 'EXTREME'
  budgetRange: 'ESSENTIAL' | 'MID-RANGE' | 'LUXE'
  tripFocus: 'TRAINING' | 'EXPLORE'
  duration: TripDuration
  travelCompany: TravelCompany
  /** Null on homepage until the guest picks how they’re traveling. */
  tripRole: TripRole | null
}

interface TheRefineProps {
  location: LocationData
  initialProfile: RefineProfile
  onBack: () => void
  onProceed: (profile: RefineProfile) => void
}

const budgetOptions = ['ESSENTIAL', 'MID-RANGE', 'LUXE'] as const
const durationChips: readonly DurationChip[] = ['WEEKEND', 'SHORT', 'WEEK', 'TWO_WEEKS']

const durationLabels: Record<DurationChip, string> = {
  WEEKEND: 'Weekend',
  SHORT: '3–5 days',
  WEEK: '7–10 days',
  TWO_WEEKS: '2 weeks',
}

function sentenceCase(str: string): string {
  if (!str) return str
  const lower = str.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function readStep1SearchQuery(): string {
  if (typeof window === 'undefined') return ''
  try {
    const direct = sessionStorage.getItem('playce-abyss-query')
    if (direct?.trim()) return direct.trim()
    const raw = sessionStorage.getItem('playce-intent')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { query?: string }
    return typeof parsed.query === 'string' ? parsed.query.trim() : ''
  } catch {
    return ''
  }
}

function inferDurationFromSearchQuery(raw: string): DurationChip | null {
  const q = raw.toLowerCase()
  if (!q) return null

  if (/\b(14\s*days?|two\s*weeks?|2\s*weeks?|fortnight)\b/i.test(q)) return 'TWO_WEEKS'
  if (
    /\b(1\s*week|one\s*week|a\s*week|7\s*days?|8\s*days?|9\s*days?|10\s*days?)\b/i.test(q)
  ) {
    return 'WEEK'
  }
  if (/\b(3\s*days?|4\s*days?|5\s*days?|few\s*days?|short\s*trip)\b/i.test(q)) return 'SHORT'
  if (/\b(weekend|2\s*days?|48\s*hours?)\b/i.test(q)) return 'WEEKEND'
  return null
}

export function TheRefine({ location: _location, initialProfile, onBack, onProceed }: TheRefineProps) {
  const [profile, setProfile] = useState<RefineProfile>(initialProfile)
  const [selectedBudget, setSelectedBudget] = useState<RefineProfile['budgetRange'] | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<DurationChip | null>(null)
  const [autoDurationFromSearch, setAutoDurationFromSearch] = useState<DurationChip | null>(null)

  useEffect(() => {
    setSelectedBudget(null)

    const inferred = inferDurationFromSearchQuery(readStep1SearchQuery())
    setAutoDurationFromSearch(inferred)

    if (inferred) {
      setSelectedDuration(inferred)
      setProfile({ ...initialProfile, duration: inferred })
    } else {
      setSelectedDuration(null)
      setProfile(initialProfile)
    }
  }, [initialProfile])

  const handleBudgetSelect = useCallback((value: RefineProfile['budgetRange']) => {
    setSelectedBudget(value)
    setProfile((prev) => ({ ...prev, budgetRange: value }))
  }, [])

  const handleDurationSelect = useCallback((value: DurationChip) => {
    setSelectedDuration(value)
    setProfile((prev) => ({ ...prev, duration: value }))
  }, [])

  const handleProceed = () => {
    onProceed(profile)
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'var(--bg)', minHeight: '100vh' }}
    >
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-10 md:py-6 pr-20 md:pr-24 flex items-center justify-start">
        <button type="button" onClick={onBack} className="playce-btn px-5 py-3">
          Back
        </button>
      </header>

      <div className="relative z-20 min-h-screen flex items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-4xl mx-auto text-center">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em', fontSize: 36, color: 'var(--text-primary)', marginBottom: 8 }}>
            How do you want to travel?
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
            We&apos;ll shape the rest around this.
          </p>

          <div className="mb-8 flex w-full flex-col items-center gap-4 md:flex-row md:justify-center md:items-stretch">
            {budgetOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleBudgetSelect(option)}
                className="w-full max-w-[260px] text-left md:w-[220px] md:max-w-none md:shrink-0"
                style={{
                  padding: '22px 24px',
                  border: selectedBudget === option ? '1px solid var(--brand)' : '1px solid var(--border)',
                  borderRadius: 5,
                  background: selectedBudget === option ? 'rgba(168,94,30,0.1)' : 'var(--bg-secondary)',
                }}
              >
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-primary)', fontWeight: 500 }}>{sentenceCase(option)}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {option === 'ESSENTIAL' ? 'Hostel & local food' : option === 'MID-RANGE' ? 'Comfort focused' : 'Premium all the way'}
                </p>
              </button>
            ))}
          </div>

          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
            How long?
          </p>
          <div className="mx-auto mb-10 grid w-full max-w-md grid-cols-2 gap-3 md:max-w-4xl md:grid-cols-4 md:gap-3">
            {durationChips.map((option) => {
              const selected = selectedDuration === option
              const showFromSearchHint =
                selected && autoDurationFromSearch !== null && option === autoDurationFromSearch
              return (
                <div key={option} className="flex flex-col items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => handleDurationSelect(option)}
                    className="w-full text-center"
                    style={{
                      border: selected ? '1px solid var(--brand)' : '1px solid var(--border)',
                      color: selected ? 'var(--brand-text)' : 'var(--text-secondary)',
                      padding: '10px 12px',
                      borderRadius: 5,
                      background: selected ? 'rgba(168,94,30,0.1)' : 'var(--bg-secondary)',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {durationLabels[option]}
                  </button>
                  {showFromSearchHint ? (
                    <span
                      className="block text-center"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.3)',
                        lineHeight: 1.2,
                      }}
                    >
                      from your search
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleProceed}
            disabled={!selectedBudget || !selectedDuration}
            className="inline-flex items-center gap-2"
            style={{
              background: '#C17D3C',
              color: '#1a0e00',
              borderRadius: 5,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.02em',
              opacity: !selectedBudget || !selectedDuration ? 0.3 : 1,
              pointerEvents: !selectedBudget || !selectedDuration ? 'none' : 'auto',
            }}
          >
            Proceed <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
