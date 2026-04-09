import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DRAGON_PUBLIC = `${import.meta.env.BASE_URL}images/flying-dragon.png`
const HEAD_SIZE = 220
const SEGMENT_COUNT = 14
const SEGMENT_STEP = 7

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function seedHistory(x, y) {
  return Array.from({ length: SEGMENT_COUNT * SEGMENT_STEP + 4 }, () => ({ x, y }))
}

export default function FlyngDragonEffect() {
  const rafRef = useRef(null)
  const tRef = useRef(0)
  const physics = useRef({
    x: 0,
    y: 0,
    vx: 1.35,
    vy: 0.55,
    phase: 0,
    turnTimer: 0,
    history: seedHistory(0, 0)
  })
  const [renderState, setRenderState] = useState({
    x: 0,
    y: 0,
    angle: 0,
    glow: 0.5,
    segments: []
  })
  const [broken, setBroken] = useState(false)
  const dragonSrc = DRAGON_PUBLIC

  useEffect(() => {
    let mounted = true
    const init = () => {
      const p = physics.current
      const maxX = Math.max(0, window.innerWidth - HEAD_SIZE)
      const maxY = Math.max(0, window.innerHeight - HEAD_SIZE)
      if (p.x === 0 && p.y === 0) {
        p.x = Math.max(0, window.innerWidth * 0.45)
        p.y = Math.max(0, window.innerHeight * 0.36)
        p.history = seedHistory(p.x, p.y)
      }
      p.x = clamp(p.x, 0, maxX)
      p.y = clamp(p.y, 0, maxY)
    }
    init()
    window.addEventListener('resize', init)

    const tick = (ts) => {
      if (!mounted) return
      const prev = tRef.current || ts
      const dt = Math.min(0.04, (ts - prev) / 1000)
      tRef.current = ts

      const p = physics.current
      const maxX = Math.max(0, window.innerWidth - HEAD_SIZE)
      const maxY = Math.max(0, window.innerHeight - HEAD_SIZE)

      p.turnTimer -= dt
      if (p.turnTimer <= 0) {
        const speed = 0.9 + Math.random() * 1.15
        const a = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 0.6
        p.vx = Math.cos(a) * speed
        p.vy = Math.sin(a) * speed
        p.turnTimer = 1 + Math.random() * 2.2
      }

      p.x += p.vx * 60 * dt
      p.y += p.vy * 60 * dt
      p.phase += dt * 3.3
      const bob = Math.sin(p.phase) * 10

      if (p.x <= 0 || p.x >= maxX) {
        p.vx *= -1
        p.x = clamp(p.x, 0, maxX)
      }
      if (p.y <= 0 || p.y >= maxY) {
        p.vy *= -1
        p.y = clamp(p.y, 0, maxY)
      }

      const hx = p.x
      const hy = p.y + bob
      p.history.unshift({ x: hx, y: hy })
      if (p.history.length > SEGMENT_COUNT * SEGMENT_STEP + 4) p.history.length = SEGMENT_COUNT * SEGMENT_STEP + 4

      const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const idx = Math.min(p.history.length - 1, 2 + i * SEGMENT_STEP)
        const now = p.history[idx]
        const next = p.history[Math.min(p.history.length - 1, idx + 1)] || now
        const t = 1 - i / SEGMENT_COUNT
        return {
          x: now.x,
          y: now.y,
          angle: Math.atan2(next.y - now.y, next.x - now.x) * (180 / Math.PI),
          scale: 0.8 * t + 0.18,
          opacity: 0.8 * t + 0.08
        }
      })

      setRenderState({
        x: hx,
        y: hy,
        angle: Math.atan2(p.vy, p.vx) * (180 / Math.PI),
        glow: 0.45 + (Math.sin(p.phase * 1.4) + 1) * 0.18,
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
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2147483000 }} aria-hidden>
      {renderState.segments.map((seg, idx) => (
        <div
          key={`dragon-seg-${idx}`}
          style={{
            position: 'absolute',
            left: `${seg.x + HEAD_SIZE * 0.36}px`,
            top: `${seg.y + HEAD_SIZE * 0.47}px`,
            width: `${Math.max(18, 72 * seg.scale)}px`,
            height: `${Math.max(14, 56 * seg.scale)}px`,
            borderRadius: '999px',
            transform: `translate(-50%, -50%) rotate(${seg.angle}deg)`,
            backgroundImage: `url('${dragonSrc}')`,
            backgroundSize: '240% 240%',
            backgroundPosition: '58% 58%',
            opacity: seg.opacity,
            filter: `blur(${idx > 11 ? 1 : 0.3}px) drop-shadow(0 0 10px rgba(180,220,255,${0.12 + renderState.glow * 0.14}))`
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: `${renderState.x}px`,
          top: `${renderState.y}px`,
          width: `${HEAD_SIZE}px`,
          transform: `${physics.current.vx < 0 ? 'scaleX(-1) ' : ''}rotate(${renderState.angle}deg)`,
          transformOrigin: '52% 48%',
          opacity: 0.98,
          filter: `drop-shadow(0 10px 24px rgba(15,12,10,0.72)) drop-shadow(0 0 34px rgba(180,220,255,${renderState.glow}))`
        }}
      >
        {!broken ? (
          <img
            src={dragonSrc}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            style={{ width: '100%', height: 'auto', userSelect: 'none' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '82px',
              lineHeight: 1
            }}
          >
            🐉
          </div>
        )}
      </div>

      {/* 固定角落保證可見（即使巡航跑到別處也看得到） */}
      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          width: 88,
          opacity: 0.9,
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.55))',
          animation: 'dragon-corner-float 2.2s ease-in-out infinite'
        }}
      >
        {!broken ? (
          <img
            src={dragonSrc}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            style={{ width: '100%', height: 'auto', userSelect: 'none' }}
          />
        ) : (
          <div style={{ fontSize: 44, textAlign: 'center' }}>🐉</div>
        )}
      </div>

      <style>{`
        @keyframes dragon-corner-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>,
    document.body
  )
}
