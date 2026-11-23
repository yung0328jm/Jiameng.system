import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const RIPPLE_DURATION_MS = 520
const MAX_RIPPLES = 14

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ClickRipple({ ripple, onEnd }) {
  useEffect(() => {
    const t = setTimeout(() => onEnd(ripple.id), RIPPLE_DURATION_MS)
    return () => clearTimeout(t)
  }, [ripple.id, onEnd])

  return (
    <div
      className="ocean-ripple-burst"
      style={{ left: ripple.x, top: ripple.y }}
      aria-hidden
    >
      {ripple.rings.map((ring) => (
        <span
          key={ring.id}
          className="ocean-ripple-ring"
          style={{
            '--ripple-delay': `${ring.delay}ms`,
            '--ripple-w': `${ring.w}px`,
            '--ripple-h': `${ring.h}px`,
            '--ripple-rot': `${ring.rot}deg`,
            '--ripple-spin': `${ring.spin}deg`
          }}
        />
      ))}
      {ripple.droplets.map((d) => (
        <span
          key={d.id}
          className="ocean-click-droplet"
          style={{
            '--tx': `${d.tx}px`,
            '--up': `${d.up}px`,
            '--fall': `${d.fall}px`,
            '--size': `${d.size}px`,
            '--delay': `${d.delay}ms`
          }}
        />
      ))}
    </div>
  )
}

function createRipple(clientX, clientY) {
  const rings = [0, 1, 2].map((i) => ({
    id: `r${i}`,
    delay: i * 55,
    w: 28 + i * 12 + Math.random() * 6,
    h: 22 + i * 9 + Math.random() * 6,
    rot: (Math.random() * 24) - 12,
    spin: (Math.random() * 28) - 14
  }))
  const droplets = Array.from({ length: 8 }, (_, i) => {
    const angle = -Math.PI * 0.92 + (i / 7) * Math.PI * 0.84 + (Math.random() - 0.5) * 0.28
    const dist = 10 + Math.random() * 18
    return {
      id: `d${i}`,
      tx: Math.cos(angle) * dist,
      up: Math.abs(Math.sin(angle)) * dist + 6 + Math.random() * 10,
      fall: 10 + Math.random() * 14,
      size: 2.5 + Math.random() * 3.2,
      delay: Math.random() * 40
    }
  })
  return { id: genId(), x: clientX, y: clientY, rings, droplets }
}

export default function ClickStarsEffect() {
  const [ripples, setRipples] = useState([])

  const handleClick = useCallback((e) => {
    const next = createRipple(e.clientX, e.clientY)
    try {
      window.dispatchEvent(new CustomEvent('ocean-feed', { detail: { x: e.clientX, y: e.clientY } }))
    } catch (_) {}
    setRipples((prev) => {
      const combined = [...prev, next]
      return combined.length > MAX_RIPPLES ? combined.slice(-MAX_RIPPLES) : combined
    })
  }, [])

  const removeRipple = useCallback((id) => {
    setRipples((prev) => prev.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [handleClick])

  if (ripples.length === 0) return null

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden" aria-hidden>
      {ripples.map((r) => (
        <ClickRipple key={r.id} ripple={r} onEnd={removeRipple} />
      ))}
    </div>,
    document.body
  )
}
