import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DRAGON_SIZE = 160
const MAX_SPEED = 1.8
const MIN_SPEED = 0.8

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export default function FlyingDragonEffect() {
  const frameRef = useRef(null)
  const lastTimeRef = useRef(0)
  const stateRef = useRef({
    x: 120,
    y: 120,
    vx: 1.1,
    vy: 0.8,
    tilt: 0,
    phase: 0,
    boostTimer: 0
  })
  const [renderState, setRenderState] = useState({
    x: 120,
    y: 120,
    rotation: 0,
    bob: 0,
    flip: false,
    glow: 0.4
  })

  useEffect(() => {
    let mounted = true
    const onResize = () => {
      const s = stateRef.current
      const maxX = Math.max(0, window.innerWidth - DRAGON_SIZE)
      const maxY = Math.max(0, window.innerHeight - DRAGON_SIZE)
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
      const maxX = Math.max(0, window.innerWidth - DRAGON_SIZE)
      const maxY = Math.max(0, window.innerHeight - DRAGON_SIZE)

      // 偶爾小幅加速，讓飛行更有生命感
      s.boostTimer -= dt
      if (s.boostTimer <= 0) {
        const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
        const angle = Math.atan2(s.vy, s.vx) + (Math.random() - 0.5) * 0.8
        s.vx = Math.cos(angle) * speed
        s.vy = Math.sin(angle) * speed
        s.boostTimer = 1.2 + Math.random() * 2.6
      }

      s.x += s.vx * 60 * dt
      s.y += s.vy * 60 * dt
      s.phase += dt * 3.2

      // 邊界反彈，避免飛出可視區
      if (s.x <= 0 || s.x >= maxX) {
        s.vx *= -1
        s.x = clamp(s.x, 0, maxX)
      }
      if (s.y <= 0 || s.y >= maxY) {
        s.vy *= -1
        s.y = clamp(s.y, 0, maxY)
      }

      s.tilt += ((s.vy * 6) - s.tilt) * 0.07
      const bob = Math.sin(s.phase) * 8
      const glow = 0.35 + (Math.sin(s.phase * 1.4) + 1) * 0.16

      setRenderState({
        x: s.x,
        y: s.y,
        rotation: s.tilt,
        bob,
        flip: s.vx < 0,
        glow
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
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden" aria-hidden>
      <div
        style={{
          position: 'absolute',
          left: `${renderState.x}px`,
          top: `${renderState.y + renderState.bob}px`,
          width: `${DRAGON_SIZE}px`,
          transform: `${renderState.flip ? 'scaleX(-1) ' : ''}rotate(${renderState.rotation}deg)`,
          transition: 'filter 280ms ease-out',
          filter: `drop-shadow(0 8px 16px rgba(15,12,10,0.55)) drop-shadow(0 0 20px rgba(180,220,255,${renderState.glow}))`
        }}
      >
        <img
          src="/images/flying-dragon.png"
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
