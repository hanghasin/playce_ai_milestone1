'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const W = 480
const H = 100
const GROUND = 78
const PLAYER_X = 52
const GRAVITY = 0.52
const JUMP_V = -8.8
const BASE_SPEED = 5.2

type Obstacle = { x: number; w: number; h: number; scored: boolean }

type RunnerState = {
  running: boolean
  playerY: number
  vy: number
  obstacles: Obstacle[]
  speed: number
  frame: number
  score: number
  alive: boolean
}

function freshState(): RunnerState {
  return {
    running: true,
    playerY: GROUND,
    vy: 0,
    obstacles: [],
    speed: BASE_SPEED,
    frame: 0,
    score: 0,
    alive: true,
  }
}

function isGrounded(s: RunnerState): boolean {
  return s.playerY >= GROUND - 1.5 && s.vy >= -0.25
}

function drawWave(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= W; x += 6) {
    const y = GROUND + Math.sin((x + offset) * 0.04) * 3
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawSurfer(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = '#C17D3C'
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.5

  const boardY = y - 4
  ctx.fillRect(PLAYER_X - 14, boardY, 28, 4)

  ctx.beginPath()
  ctx.arc(PLAYER_X, y - 14, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(PLAYER_X, y - 9)
  ctx.lineTo(PLAYER_X, y - 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(PLAYER_X, y - 6)
  ctx.lineTo(PLAYER_X - 8, y - 12)
  ctx.moveTo(PLAYER_X, y - 6)
  ctx.lineTo(PLAYER_X + 9, y - 11)
  ctx.stroke()
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(o.x, GROUND - o.h, o.w, o.h)
  ctx.fillStyle = 'rgba(193,125,60,0.35)'
  ctx.fillRect(o.x + 2, GROUND - o.h + 2, o.w - 4, 4)
}

interface PlayceWaitRunnerProps {
  className?: string
}

export function PlayceWaitRunner({ className }: PlayceWaitRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<RunnerState>(freshState())
  const rafRef = useRef<number | null>(null)
  const [score, setScore] = useState(0)
  const [alive, setAlive] = useState(true)

  const focusCanvas = useCallback(() => {
    canvasRef.current?.focus({ preventScroll: true })
  }, [])

  const restart = useCallback(() => {
    stateRef.current = freshState()
    setScore(0)
    setAlive(true)
    focusCanvas()
  }, [focusCanvas])

  const jump = useCallback(() => {
    const s = stateRef.current
    if (!s.alive) {
      restart()
      return
    }
    s.running = true
    if (isGrounded(s)) {
      s.vy = JUMP_V
    }
  }, [restart])

  useEffect(() => {
    focusCanvas()
  }, [focusCanvas])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      const s = stateRef.current
      ctx.clearRect(0, 0, W, H)

      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, 0, W, H)

      drawWave(ctx, s.frame * s.speed)

      if (s.running && s.alive) {
        s.frame += 1
        if (s.frame % 900 === 0) s.speed += 0.35

        s.vy += GRAVITY
        s.playerY += s.vy
        if (s.playerY > GROUND) {
          s.playerY = GROUND
          s.vy = 0
        }

        if (s.frame > 60 && s.frame % Math.max(48, Math.floor(90 - s.speed * 3)) === 0) {
          const tall = Math.random() > 0.65
          s.obstacles.push({
            x: W + 8,
            w: tall ? 14 : 22,
            h: tall ? 28 : 18,
            scored: false,
          })
        }

        for (const o of s.obstacles) o.x -= s.speed

        s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10)

        const px = PLAYER_X
        const pw = 18
        const ph = 22
        for (const o of s.obstacles) {
          if (
            px + pw > o.x &&
            px < o.x + o.w &&
            s.playerY - ph < GROUND - o.h + 6
          ) {
            s.alive = false
            setAlive(false)
          }
          if (!o.scored && o.x + o.w < px) {
            o.scored = true
            s.score += 1
            setScore(s.score)
          }
        }
      }

      for (const o of s.obstacles) drawObstacle(ctx, o)
      drawSurfer(ctx, s.playerY)

      if (!s.alive) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = '600 13px var(--font-display), system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Wiped out — Space / tap to retry', W / 2, H / 2 + 4)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return
      e.preventDefault()
      e.stopPropagation()
      jump()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [jump])

  return (
    <div className={className}>
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          maxWidth: W,
          borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(15,15,15,0.6)',
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          className="block w-full h-auto cursor-pointer touch-none outline-none focus:ring-1 focus:ring-[rgba(193,125,60,0.45)]"
          role="application"
          aria-label="Surf runner mini game. Space or tap to jump."
          onPointerDown={(e) => {
            e.preventDefault()
            focusCanvas()
            jump()
          }}
        />
        <div
          className="absolute top-2 right-2 tabular-nums pointer-events-none"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.04em',
          }}
        >
          {score}
        </div>
      </div>
      <p
        className="mt-2 text-center"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.38)',
          letterSpacing: '0.03em',
        }}
      >
        Space / tap to jump
      </p>
    </div>
  )
}

interface PlayceWaitRunnerPanelProps {
  className?: string
  defaultOpen?: boolean
}

export function PlayceWaitRunnerPanel({ className, defaultOpen = false }: PlayceWaitRunnerPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!open) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.03em',
          color: 'rgba(193,125,60,0.95)',
          background: 'rgba(193,125,60,0.08)',
          border: '1px solid rgba(193,125,60,0.35)',
          borderRadius: 5,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        Play while you wait
      </button>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          Ride the wait
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.38)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Hide
        </button>
      </div>
      <PlayceWaitRunner />
    </div>
  )
}
