import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const RIPPLE_DURATION_MS = 780
const MAX_RIPPLES = 10

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
      <span className="ocean-ripple-ring" style={{ '--ripple-delay': '0ms', '--ripple-size': '108px' }} />
      <span className="ocean-ripple-ring" style={{ '--ripple-delay': '90ms', '--ripple-size': '168px' }} />
      <span className="ocean-ripple-ring" style={{ '--ripple-delay': '180ms', '--ripple-size': '232px' }} />
      {ripple.droplets.map((d) => (
        <span
          key={d.id}
          className="ocean-click-droplet"
          style={{
            '--tx': `${d.tx}px`,
            '--ty': `${d.ty}px`,
            '--size': `${d.size}px`,
            '--delay': `${d.delay}ms`
          }}
        />
      ))}
    </div>
  )
}

export default function ClickStarsEffect() {
  const [ripples, setRipples] = useState([])

  const handleClick = useCallback((e) => {
    const droplets = Array.from({ length: 5 }, (_, i) => {
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.4
      const dist = 18 + Math.random() * 28
      return {
        id: `${i}`,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 10,
        size: 4 + Math.random() * 5,
        delay: Math.random() * 60
      }
    })
    const next = { id: genId(), x: e.clientX, y: e.clientY, droplets }
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
