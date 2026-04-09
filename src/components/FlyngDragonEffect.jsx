import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SEGMENT_COUNT = 24
const SEGMENT_STEP = 4
const HEAD_RADIUS = 26
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function makeHistory(x, y) {
  return Array.from({ length: SEGMENT_COUNT * SEGMENT_STEP + 8 }, () => ({ x, y }))
}

export default function FlyngDragonEffect() {
  const rafRef = useRef(null)
  const prevTimeRef = useRef(0)
  const model = useRef({
    x: 0,
    y: 0,
    vx: 1.15,
    vy: 0.5,
    phase: 0,
    steerTimer: 0,
    history: makeHistory(0, 0)
  })
  const [renderState, setRenderState] = useState({
    x: 0,
    y: 0,
    angle: 0,
    segments: [],
    whiskerWave: 0
  })

  useEffect(() => {
    let mounted = true
    const init = () => {
      const s = model.current
      const maxX = Math.max(0, window.innerWidth - 120)
      const maxY = Math.max(0, window.innerHeight - 120)
      if (s.x === 0 && s.y === 0) {
        s.x = window.innerWidth * 0.5
        s.y = window.innerHeight * 0.42
        s.history = makeHistory(s.x, s.y)
      }
      s.x = clamp(s.x, 40, maxX)
      s.y = clamp(s.y, 40, maxY)
    }

    init()
    window.addEventListener('resize', init)

    const tick = (ts) => {
      if (!mounted) return
      const prev = prevTimeRef.current || ts
      const dt = Math.min(0.045, (ts - prev) / 1000)
      prevTimeRef.current = ts

      const s = model.current
      const maxX = Math.max(80, window.innerWidth - 80)
      const maxY = Math.max(80, window.innerHeight - 80)

      s.steerTimer -= dt
      if (s.steerTimer <= 0) {
        const speed = 0.8 + Math.random() * 0.65
        const a = Math.atan2(s.vy, s.vx) + (Math.random() - 0.5) * 0.5
        s.vx = Math.cos(a) * speed
        s.vy = Math.sin(a) * speed
        s.steerTimer = 1.8 + Math.random() * 2.8
      }

      s.x += s.vx * 68 * dt
      s.y += s.vy * 68 * dt
      s.phase += dt * 2.15

      const lift = Math.sin(s.phase) * 14 + Math.sin(s.phase * 0.52) * 9
      const hx = clamp(s.x, 40, maxX)
      const hy = clamp(s.y + lift, 40, maxY)

      if (s.x <= 40 || s.x >= maxX) s.vx *= -1
      if (s.y <= 40 || s.y >= maxY) s.vy *= -1

      s.history.unshift({ x: hx, y: hy })
      const cap = SEGMENT_COUNT * SEGMENT_STEP + 8
      if (s.history.length > cap) s.history.length = cap

      const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const idx = Math.min(s.history.length - 1, i * SEGMENT_STEP + 2)
        const p = s.history[idx]
        const n = s.history[Math.min(s.history.length - 1, idx + 1)] || p
        const t = 1 - i / SEGMENT_COUNT
        return {
          x: p.x,
          y: p.y,
          angle: Math.atan2(n.y - p.y, n.x - p.x) * (180 / Math.PI),
          rx: 22 * t + 3,
          ry: 12 * t + 2,
          opacity: 0.86 * t + 0.06
        }
      })

      setRenderState({
        x: hx,
        y: hy,
        angle: Math.atan2(s.vy, s.vx) * (180 / Math.PI) + Math.sin(s.phase * 1.15) * 3.8,
        whiskerWave: Math.sin(s.phase * 2.4),
        segments
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      mounted = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', init)
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 120 }} aria-hidden>
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="dragonScale" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#d6efff" />
            <stop offset="45%" stopColor="#8ac1e8" />
            <stop offset="100%" stopColor="#2a5787" />
          </radialGradient>
          <linearGradient id="dragonBelly" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d8c9a5" />
            <stop offset="100%" stopColor="#9e8158" />
          </linearGradient>
          <filter id="dragonGlow">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {renderState.segments.map((seg, i) => (
          <g key={`seg-${i}`} transform={`translate(${seg.x}, ${seg.y}) rotate(${seg.angle})`}>
            <ellipse
              cx="0"
              cy="0"
              rx={seg.rx}
              ry={seg.ry}
              fill="url(#dragonScale)"
              opacity={seg.opacity}
              filter="url(#dragonGlow)"
            />
            {i < SEGMENT_COUNT - 4 && (
              <ellipse
                cx="2"
                cy="4"
                rx={seg.rx * 0.58}
                ry={seg.ry * 0.32}
                fill="url(#dragonBelly)"
                opacity={seg.opacity * 0.6}
              />
            )}
          </g>
        ))}

        <g transform={`translate(${renderState.x}, ${renderState.y}) rotate(${renderState.angle})`}>
          <ellipse cx="0" cy="0" rx={HEAD_RADIUS + 4} ry={HEAD_RADIUS} fill="url(#dragonScale)" filter="url(#dragonGlow)" />
          <ellipse cx="8" cy="8" rx="16" ry="8" fill="url(#dragonBelly)" opacity="0.8" />
          <ellipse cx="14" cy="-3" rx="4.2" ry="4.2" fill="#f8fafc" />
          <circle cx="15" cy="-3" r="2" fill="#111827" />
          <ellipse cx="22" cy="5" rx="4" ry="2.2" fill="#0f172a" opacity="0.85" />
          <path d={`M-8,-26 L-1,-38 L7,-26`} fill="#c8d8ea" opacity="0.9" />
          <path d={`M8,-26 L15,-38 L23,-25`} fill="#c8d8ea" opacity="0.9" />
          <path
            d={`M22,2 C38,${-4 + renderState.whiskerWave * 3} 52,${-10 + renderState.whiskerWave * 6} 66,${-18 + renderState.whiskerWave * 7}`}
            fill="none"
            stroke="#dff4ff"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d={`M20,9 C34,${18 - renderState.whiskerWave * 4} 48,${24 - renderState.whiskerWave * 5} 63,${30 - renderState.whiskerWave * 6}`}
            fill="none"
            stroke="#dff4ff"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.92"
          />
          <path d="M23,10 L33,16 L23,19" fill="#fca5a5" opacity="0.75" />
        </g>
      </svg>
    </div>,
    document.body
  )
}
