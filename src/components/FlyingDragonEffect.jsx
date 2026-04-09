import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dragonImage from '../assets/flying-dragon.png'

const HEAD_SIZE = 240
const SEGMENT_COUNT = 16
const SEGMENT_STEP = 7
const MIN_SPEED = 0.9
const MAX_SPEED = 1.95

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function initialHistory(x, y) {
  return Array.from({ length: SEGMENT_COUNT * SEGMENT_STEP + 3 }, () => ({ x, y }))
}

export default function FlyingDragonEffect() {
  const frameRef = useRef(null)
  const lastTimeRef = useRef(0)
  const stateRef = useRef({
    x: 0,
    y: 0,
    vx: 1.3,
    vy: 0.55,
    phase: 0,
    boostTimer: 0,
    history: initialHistory(0, 0)
  })
  const [renderState, setRenderState] = useState({
    x: 0,
    y: 0,
    angle: 0,
    bob: 0,
    flip: false,
    glow: 0.5,
    segments: []
  })
  useEffect(() => {
    let mounted = true
    const onResize = () => {
      const s = stateRef.current
      const maxX = Math.max(0, window.innerWidth - HEAD_SIZE)
      const maxY = Math.max(0, window.innerHeight - HEAD_SIZE)
      if (s.x === 0 && s.y === 0) {
        s.x = Math.max(0, window.innerWidth * 0.5 - HEAD_SIZE * 0.5)
        s.y = Math.max(0, window.innerHeight * 0.42 - HEAD_SIZE * 0.5)
        s.history = initialHistory(s.x, s.y)
      }
      s.x = clamp(s.x, 0, maxX)
      s.y = clamp(s.y, 0, maxY)
    }
    onResize()
    window.addEventListener('resize', onResize)

    const tick = (ts) => {
      if (!mounted) return
      const prev = lastTimeRef.current || ts
      const dt = Math.min(0.04, (ts - prev) / 1000)
      lastTimeRef.current = ts

      const s = stateRef.current
      const maxX = Math.max(0, window.innerWidth - HEAD_SIZE)
      const maxY = Math.max(0, window.innerHeight - HEAD_SIZE)

      // 偶爾改變速度與方向，保持巡航生動感
      s.boostTimer -= dt
      if (s.boostTimer <= 0) {
        const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
        const angle = Math.atan2(s.vy, s.vx) + (Math.random() - 0.5) * 0.65
        s.vx = Math.cos(angle) * speed
        s.vy = Math.sin(angle) * speed
        s.boostTimer = 1 + Math.random() * 2.2
      }

      s.x += s.vx * 60 * dt
      s.y += s.vy * 60 * dt
      s.phase += dt * 3.2

      if (s.x <= 0 || s.x >= maxX) {
        s.vx *= -1
        s.x = clamp(s.x, 0, maxX)
      }
      if (s.y <= 0 || s.y >= maxY) {
        s.vy *= -1
        s.y = clamp(s.y, 0, maxY)
      }

      const bob = Math.sin(s.phase) * 11
      const angle = Math.atan2(s.vy, s.vx) * (180 / Math.PI)
      const glow = 0.42 + (Math.sin(s.phase * 1.35) + 1) * 0.2

      const headX = s.x
      const headY = s.y + bob
      s.history.unshift({ x: headX, y: headY })
      const maxHistory = SEGMENT_COUNT * SEGMENT_STEP + 4
      if (s.history.length > maxHistory) s.history.length = maxHistory

      const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const idx = Math.min(s.history.length - 1, 2 + i * SEGMENT_STEP)
        const p = s.history[idx]
        const n = s.history[Math.min(s.history.length - 1, idx + 1)] || p
        const segAngle = Math.atan2(n.y - p.y, n.x - p.x) * (180 / Math.PI)
        const t = 1 - i / SEGMENT_COUNT
        return {
          x: p.x,
          y: p.y,
          angle: segAngle,
          scale: 0.85 * t + 0.16,
          opacity: 0.78 * t + 0.1
        }
      })

      setRenderState({
        x: headX,
        y: headY,
        angle,
        bob,
        flip: s.vx < 0,
        glow,
        segments
      })

      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      mounted = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const dragon = (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 2147483000 }}
      aria-hidden
    >
      {renderState.segments.map((seg, idx) => (
        <div
          key={`dragon-seg-${idx}`}
          style={{
            position: 'absolute',
            left: `${seg.x + HEAD_SIZE * 0.35}px`,
            top: `${seg.y + HEAD_SIZE * 0.48}px`,
            width: `${Math.max(22, 78 * seg.scale)}px`,
            height: `${Math.max(16, 60 * seg.scale)}px`,
            borderRadius: '999px',
            transform: `translate(-50%, -50%) rotate(${seg.angle}deg)`,
            backgroundImage: `url('${dragonImage}')`,
            backgroundSize: '240% 240%',
            backgroundPosition: '58% 58%',
            opacity: seg.opacity,
            filter: `blur(${idx > 11 ? 0.9 : 0.2}px) drop-shadow(0 0 12px rgba(173,216,255,${0.13 + renderState.glow * 0.16}))`
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: `${renderState.x}px`,
          top: `${renderState.y}px`,
          width: `${HEAD_SIZE}px`,
          transform: `${renderState.flip ? 'scaleX(-1) ' : ''}rotate(${renderState.angle}deg)`,
          transformOrigin: '52% 48%',
          transition: 'filter 280ms ease-out',
          opacity: 0.98,
          filter: `drop-shadow(0 10px 24px rgba(15,12,10,0.72)) drop-shadow(0 0 36px rgba(180,220,255,${renderState.glow}))`
        }}
      >
        <img
          src={dragonImage}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: 'auto',
            userSelect: 'none'
          }}
        />
      </div>
    </div>
  )

  return createPortal(dragon, document.body)
}
