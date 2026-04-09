import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SEGMENT_COUNT = 24
const SEGMENT_STEP = 4
const HEAD_RADIUS = 30
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
        const speed = 0.95 + Math.random() * 0.85
        const a = Math.atan2(s.vy, s.vx) + (Math.random() - 0.5) * 0.42
        s.vx = Math.cos(a) * speed
        s.vy = Math.sin(a) * speed
        s.steerTimer = 1.8 + Math.random() * 2.8
      }

      s.x += s.vx * 76 * dt
      s.y += s.vy * 76 * dt
      s.phase += dt * 2.15

      const lift = Math.sin(s.phase) * 18 + Math.sin(s.phase * 0.52) * 12
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
          <radialGradient id="dragonScale" cx="32%" cy="28%">
            <stop offset="0%" stopColor="#d9f0ff" />
            <stop offset="34%" stopColor="#7fb0d9" />
            <stop offset="72%" stopColor="#355f8f" />
            <stop offset="100%" stopColor="#162c45" />
          </radialGradient>
          <linearGradient id="dragonBelly" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e1cfaa" />
            <stop offset="100%" stopColor="#8d6b41" />
          </linearGradient>
          <linearGradient id="dragonSpine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5fbff" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#8eb7da" stopOpacity="0.35" />
          </linearGradient>
          <filter id="dragonGlow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
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
            {i % 2 === 0 && (
              <path
                d={`M${-seg.rx * 0.15},${-seg.ry * 0.9} L${seg.rx * 0.2},${-seg.ry * 1.55} L${seg.rx * 0.52},${-seg.ry * 0.84}`}
                fill="url(#dragonSpine)"
                opacity={seg.opacity * 0.82}
              />
            )}
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
          <path
            d="M-30,0 C-18,-22 16,-27 40,-11 C58,-1 60,19 42,27 C22,35 -4,29 -20,18 C-28,12 -33,7 -30,0 Z"
            fill="url(#dragonScale)"
            filter="url(#dragonGlow)"
          />
          <path
            d="M-6,14 C6,20 24,21 36,12 C30,23 16,29 2,27 C-4,25 -8,21 -6,14 Z"
            fill="url(#dragonBelly)"
            opacity="0.9"
          />
          <path d="M26,-16 L36,-38 L43,-14" fill="#dbe9f6" opacity="0.95" />
          <path d="M8,-20 L16,-40 L24,-19" fill="#dbe9f6" opacity="0.92" />
          <path d="M24,22 L33,38 L18,30" fill="#b8ccdf" opacity="0.88" />
          <ellipse cx="24" cy="-5" rx="4.6" ry="4.6" fill="#f8fafc" />
          <circle cx="25" cy="-5" r="2.3" fill="#7f1d1d" />
          <circle cx="25.8" cy="-5.8" r="0.9" fill="#fff" />
          <path d="M34,3 C41,2 46,6 47,11 C42,10 38,9 34,8 Z" fill="#0b1220" opacity="0.95" />
          <path d="M42,8 L50,12 L42,15" fill="#ef4444" opacity="0.82" />
          <path d="M42,11 L48,21 L39,15" fill="#f1f5f9" opacity="0.85" />
          <path d="M36,9 L41,18 L32,14" fill="#f1f5f9" opacity="0.8" />
          <path
            d={`M33,-1 C52,${-12 + renderState.whiskerWave * 5} 72,${-18 + renderState.whiskerWave * 7} 93,${-28 + renderState.whiskerWave * 8}`}
            fill="none"
            stroke="#eef9ff"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d={`M31,9 C50,${23 - renderState.whiskerWave * 5} 71,${30 - renderState.whiskerWave * 6} 93,${37 - renderState.whiskerWave * 7}`}
            fill="none"
            stroke="#eef9ff"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.92"
          />
          <path d="M10,-16 C17,-19 25,-19 32,-14 C24,-12 17,-12 10,-16 Z" fill="#b5d0ea" opacity="0.76" />
          <path d="M-8,3 C-3,-7 7,-11 17,-9 C8,-2 2,4 -8,3 Z" fill="#2d4b73" opacity="0.8" />
        </g>
      </svg>
    </div>,
    document.body
  )
}
