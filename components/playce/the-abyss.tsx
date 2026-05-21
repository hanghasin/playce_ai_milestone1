'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'

import type { TripRole } from '@/components/playce/the-refine'

import { mergeRolePrompt, ROLE_PROMPT_BY_TRIP } from '@/lib/playce-role-prompt'

interface TheAbyssProps {
  onSubmit: (query: string) => void
  isAnalyzing?: boolean
  intentError?: string | null
  tripRole: TripRole | null
  onTripRoleChange: (role: TripRole | null) => void
}

const placeholders = [
  "I want to relax in Bali with some light surfing...",
  "Looking for Alpine climbing somewhere remote...",
  "A peaceful yoga retreat by the ocean...",
  "Mountain biking through ancient forests...",
  "Diving with manta rays in clear waters...",
]

/** First rotating line in the search field — shown longer than trip examples. */
const LEAD_IN_PLACEHOLDER = "Tell me what kind of trip you're looking for?"

const LEAD_IN_DWELL_MS = 7200
const ROTATION_DWELL_MS = 4200

/** Border radius (px) — matches Abyss token (5). */
const ABYSS_RADIUS = 5

/** Max height for intent cards expand animation (content ~3 rows + label; avoid clipping). */
const ABYSS_ROLE_SECTION_MAX_PX = 520

/** Align “I’m going for” with role card title copy (card border + horizontal padding). */
const ABYSS_ROLE_TITLE_INSET = 1 + 12

/** Short starter chips — click fills the textarea only; “I’m going for” appears after there is text. */
const starterJourneys = [
  '1 week surf trip in Portugal',
  '5 days Alpine climbing in Chamonix',
  '7 nights yoga retreat by the sea',
] as const

/** Cores for rotating overlay — merged with current tripRole after user engages “I’m going for”. */
const PLACEHOLDER_TRIP_CORES = [
  ...starterJourneys,
  'I want to relax in Bali with some light surfing...',
  'Mountain biking through ancient forests...',
] as const

export function TheAbyss({
  onSubmit,
  isAnalyzing = false,
  intentError = null,
  tripRole,
  onTripRoleChange,
}: TheAbyssProps) {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const [isMouseInViewport, setIsMouseInViewport] = useState(false)
  const [query, setQuery] = useState('')
  const [rotatingPlaceholderIndex, setRotatingPlaceholderIndex] = useState(0)
  /** After clicking “I’m going for” (or a role card), empty-field hints follow full merged prompts for the current role. */
  const [useMergedRolePlaceholders, setUseMergedRolePlaceholders] = useState(false)
  /** Preserves trip role for rotating hints after the field is cleared (parent resets tripRole to null). */
  const [hintTripRole, setHintTripRole] = useState<TripRole>('ACTIVE_TRAVEL')
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showRoleSection = query.trim().length > 0

  useEffect(() => {
    if (query.trim() && tripRole != null) setHintTripRole(tripRole)
  }, [tripRole, query])

  const roleForMergedPlaceholders =
    !query.trim() && useMergedRolePlaceholders ? hintTripRole : tripRole

  const mergedRolePlaceholders = useMemo(() => {
    const r: TripRole = (roleForMergedPlaceholders ?? hintTripRole) ?? 'ACTIVE_TRAVEL'
    return PLACEHOLDER_TRIP_CORES.map((core) => mergeRolePrompt(core, r))
  }, [roleForMergedPlaceholders, hintTripRole])
  const activePlaceholders = useMergedRolePlaceholders ? mergedRolePlaceholders : placeholders

  const displayPlaceholders = useMemo(
    () => [LEAD_IN_PLACEHOLDER, ...activePlaceholders],
    [activePlaceholders]
  )

  useEffect(() => {
    if (!query.trim() && tripRole != null) {
      onTripRoleChange(null)
    }
  }, [query, tripRole, onTripRoleChange])


  // Handle mouse movement for spotlight
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    
    setMousePos({ x, y })
    if (!isMouseInViewport) {
      setIsMouseInViewport(true)
    }
  }, [isMouseInViewport])

  // Handle touch movement
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.touches[0].clientX - rect.left) / rect.width
    const y = (e.touches[0].clientY - rect.top) / rect.height
    
    setMousePos({ x, y })
    if (!isMouseInViewport) {
      setIsMouseInViewport(true)
    }
  }, [isMouseInViewport])

  // Handle mouse leave - spotlight fades to opacity 0
  const handleMouseLeave = useCallback(() => {
    setIsMouseInViewport(false)
  }, [])

  // Handle mouse enter
  const handleMouseEnter = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setMousePos({ x, y })
    setIsMouseInViewport(true)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('touchmove', handleTouchMove)
    container.addEventListener('touchstart', handleTouchMove)
    container.addEventListener('touchend', handleMouseLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchstart', handleTouchMove)
      container.removeEventListener('touchend', handleMouseLeave)
    }
  }, [handleMouseMove, handleMouseLeave, handleMouseEnter, handleTouchMove])

  useEffect(() => {
    if (query.trim()) return
    const len = displayPlaceholders.length
    const idx = rotatingPlaceholderIndex % len
    const dwell = idx === 0 ? LEAD_IN_DWELL_MS : ROTATION_DWELL_MS
    const t = window.setTimeout(() => {
      setRotatingPlaceholderIndex((i) => (i + 1) % len)
    }, dwell)
    return () => window.clearTimeout(t)
  }, [query, displayPlaceholders, rotatingPlaceholderIndex])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isAnalyzing) return
    if (!query.trim() || tripRole == null) return
    onSubmit(query)
  }

  const fillStarterJourney = (text: string) => {
    if (isAnalyzing) return
    setUseMergedRolePlaceholders(false)
    setHintTripRole('ACTIVE_TRAVEL')
    onTripRoleChange(null)
    setQuery(text)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const len = text.length
      el.setSelectionRange(len, len)
    })
  }

  const handleRolePromptCard = (role: TripRole) => {
    if (isAnalyzing || !query.trim()) return
    setUseMergedRolePlaceholders(true)
    onTripRoleChange(role)
    setQuery((prev) => mergeRolePrompt(prev, role))
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  const spotlightX = mousePos.x * 100
  const spotlightY = mousePos.y * 100

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden cursor-none"
      style={{ background: 'var(--bg)', minHeight: '100vh' }}
    >
      {/* Layer 1: Fullscreen hero video + cinematic grain (::after on .abyss-hero-video) */}
      <div className="abyss-hero-video">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="saturate-[1.15] contrast-[1.08]"
          poster="https://assets.mixkit.co/videos/3338/3338-thumb-720-0.jpg"
        >
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Layer 2: Spotlight — soft follow light (radius tuned for legibility) */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ease-out"
        style={{
          opacity: isMouseInViewport ? 1 : 0,
        }}
      >
        <div 
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle 300px at ${spotlightX}% ${spotlightY}%, transparent 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.9) 80%, black 100%)`,
          }}
        />
      </div>

      {/* Layer 2b: Solid black overlay when mouse is not in viewport */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ease-out"
        style={{
          background: 'var(--bg)',
          opacity: isMouseInViewport ? 0 : 1,
        }}
      />

      {/* Layer 3: Content - z-50, always 100% white and readable */}
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-4 md:px-8 pointer-events-none">
        {/* Logo - PLAYCE */}
        <div className="absolute top-6 left-6 md:top-8 md:left-8 pointer-events-auto">
          <span 
            className="text-sm md:text-base text-zinc-200 uppercase"
            style={{ 
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              letterSpacing: '0.25em',
            }}
          >
            Playce
          </span>
        </div>
        {/* Hero Content */}
        <div className="text-center w-full max-w-5xl mx-auto">
          {/* Main headline — two lines: roman / italic, editorial serif */}
          <h1 
            className="text-zinc-100 mb-10 w-full text-center"
            style={{ 
              fontSize: 'clamp(64px, 13.5vw, 112px)',
              lineHeight: 1.04,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.03em',
            }}
          >
            <span className="block">Find what</span>
            <span className="block not-italic" style={{ marginTop: '-0.02em' }}>
              <span className="italic">moves</span>
              {' you.'}
            </span>
          </h1>

          {/* Premium Search Card — wider + taller for role picker */}
          <div className="w-full max-w-4xl mx-auto pointer-events-auto">
            <div 
              className="p-5 md:p-7 mb-8 overflow-hidden text-left"
              style={{
                backdropFilter: 'blur(25px)',
                WebkitBackdropFilter: 'blur(25px)',
                backgroundColor: 'rgba(15, 15, 15, 0.75)',
                border: '0.5px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                borderRadius: ABYSS_RADIUS,
                transition: 'box-shadow 0.35s ease, border-color 0.35s ease',
              }}
            >
              <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
                <div className="relative w-full mb-2 shrink-0 text-left">
                  {!query.trim() ? (
                    <div
                      key={`${useMergedRolePlaceholders}-${roleForMergedPlaceholders}-${rotatingPlaceholderIndex % displayPlaceholders.length}`}
                      className="abyss-rotating-placeholder pointer-events-none absolute inset-0 z-0 text-left text-zinc-500 whitespace-pre-wrap leading-relaxed"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: 300,
                        fontSize: '0.95rem',
                        letterSpacing: '0.02em',
                        minHeight: '5.25rem',
                      }}
                      aria-hidden
                    >
                      {displayPlaceholders[rotatingPlaceholderIndex % displayPlaceholders.length]}
                    </div>
                  ) : null}
                  <textarea
                  ref={textareaRef}
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  placeholder=""
                  rows={4}
                  disabled={isAnalyzing}
                  className="relative z-10 w-full bg-transparent border-none outline-none text-left text-zinc-200 resize-y leading-relaxed disabled:opacity-45 shrink-0"
                  style={{ 
                    caretColor: '#d4d4d8',
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: '0.95rem',
                    letterSpacing: '0.02em',
                    minHeight: '5.25rem',
                  }}
                  aria-label="Describe your trip"
                  onKeyDown={(e) => {
                    if (isAnalyzing) return
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (query.trim()) {
                        e.currentTarget.form?.requestSubmit()
                      }
                    }
                  }}
                />
                </div>
                {!query.trim() ? (
                  <div className="flex flex-wrap items-center gap-2 mb-6 shrink-0">
                    {starterJourneys.map((text) => (
                      <button
                        key={text}
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => fillStarterJourney(text)}
                        className="disabled:opacity-35 disabled:pointer-events-none cursor-pointer text-left"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 500,
                          fontSize: '13px',
                          letterSpacing: '0.02em',
                          padding: '7px 12px',
                          border: '1px solid rgba(255,255,255,0.14)',
                          color: 'rgba(255,255,255,0.55)',
                          borderRadius: ABYSS_RADIUS,
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div
                  className="w-full self-stretch text-left"
                  style={{
                    maxHeight: showRoleSection ? ABYSS_ROLE_SECTION_MAX_PX : 0,
                    opacity: showRoleSection ? 1 : 0,
                    overflow: 'hidden',
                    marginTop: showRoleSection ? 12 : 0,
                    transition:
                      'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, margin-top 0.3s ease',
                    pointerEvents: showRoleSection ? 'auto' : 'none',
                  }}
                  aria-hidden={!showRoleSection}
                  inert={!showRoleSection ? true : undefined}
                >
                  <button
                    type="button"
                    className="block w-full text-left mb-3 shrink-0 cursor-pointer hover:text-white/80 transition-colors pointer-events-auto"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      letterSpacing: '0.02em',
                      color: 'rgba(255,255,255,0.55)',
                      fontWeight: 500,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      paddingLeft: ABYSS_ROLE_TITLE_INSET,
                    }}
                    disabled={isAnalyzing}
                    title="Show example prompts for your current trip type"
                    onClick={() => {
                      if (isAnalyzing || !query.trim()) return
                      if (tripRole != null) setHintTripRole(tripRole)
                      setUseMergedRolePlaceholders(true)
                      setRotatingPlaceholderIndex(0)
                    }}
                  >
                    I&apos;m going for
                  </button>
                  <div
                    className="mb-5 flex min-w-0 shrink-0 flex-row gap-3 overflow-x-auto"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {(
                      [
                        {
                          id: 'ACTIVE_TRAVEL' as const,
                          label: 'Practice & Experience',
                          hint: ROLE_PROMPT_BY_TRIP.ACTIVE_TRAVEL,
                        },
                        {
                          id: 'COMPETITOR' as const,
                          label: 'Competing & Racing',
                          hint: ROLE_PROMPT_BY_TRIP.COMPETITOR,
                        },
                        {
                          id: 'WATCHING' as const,
                          label: 'Watching & Supporting',
                          hint: ROLE_PROMPT_BY_TRIP.WATCHING,
                        },
                      ] as const
                    ).map(({ id, label, hint }) => {
                      const selected = tripRole === id
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={isAnalyzing}
                          onClick={() => handleRolePromptCard(id)}
                          className="min-h-0 min-w-[140px] shrink-0 cursor-pointer text-left transition-colors duration-150 sm:min-w-0 sm:flex-1 disabled:opacity-35"
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 500,
                            padding: '16px 20px',
                            borderRadius: 2,
                            border: selected ? '1px solid var(--brand)' : '1px solid var(--border)',
                            background: selected ? 'var(--brand-dim)' : 'transparent',
                          }}
                        >
                          <span
                            className="mb-1 block text-[13px]"
                            style={{
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              lineHeight: 1.25,
                              color: 'rgba(255,255,255,0.92)',
                            }}
                          >
                            {label}
                          </span>
                          <span
                            className="block text-[12px] leading-snug"
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontWeight: 400,
                              letterSpacing: '0.02em',
                              lineHeight: 1.45,
                              color: 'rgba(255,255,255,0.55)',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end mt-auto shrink-0">
                  <button
                    type="submit"
                    disabled={isAnalyzing || !query.trim() || tripRole == null}
                    className="playce-btn playce-btn--primary inline-flex items-center gap-1.5 px-6 py-2.5 text-sm disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
                    style={{
                      fontSize: '0.8125rem',
                      borderRadius: ABYSS_RADIUS,
                    }}
                  >
                    <span>Discover</span>
                    <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </button>
                </div>
              </form>
            </div>

            {intentError ? (
              <div className="mt-3 flex flex-col items-center gap-3">
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.72)',
                    textAlign: 'center',
                  }}
                >
                  {intentError}
                </p>
              </div>
            ) : null}

          </div>
        </div>
      </div>

      {/* Analyzing overlay is rendered at app shell level so it persists reliably during intent fetch */}

      {/* Custom cursor */}
      <div 
        className="fixed w-4 h-4 border border-white/40 rounded-full pointer-events-none z-[100] hidden md:block transition-opacity duration-300"
        style={{
          left: `calc(${mousePos.x * 100}% - 8px)`,
          top: `calc(${mousePos.y * 100}% - 8px)`,
          opacity: isMouseInViewport ? 1 : 0,
        }}
      />
    </div>
  )
}
