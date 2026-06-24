import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const STAR_COUNT = 12
const PARTICLE_DURATION_MS = 650
const MAX_PARTICLES = 50

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createParticles(clientX, clientY) {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    const angle = (i / STAR_COUNT) * Math.PI * 2 + Math.random() * 0.5
    const dist = 28 + Math.random() * 40
    const tx = Math.cos(angle) * dist
    const ty = Math.sin(angle) * dist
    const size = 6 + Math.random() * 6
    const delay = Math.random() * 80
    return {
      id: genId(),
      x: clientX,
      y: clientY,
      tx,
      ty,
      size,
      delay,
      hue: Math.random() > 0.15 ? 40 + Math.random() * 18 : 12 + Math.random() * 8
    }
  })
}

function StarParticle({ particle, onEnd }) {
  useEffect(() => {
    const t = setTimeout(() => onEnd(particle.id), PARTICLE_DURATION_MS + particle.delay + 50)
    return () => clearTimeout(t)
  }, [particle.id, particle.delay, onEnd])

  return (
    <div
      className="click-star-particle"
      style={{
        left: particle.x,
        top: particle.y,
        '--tx': particle.tx,
        '--ty': particle.ty,
        '--size': `${particle.size}px`,
        '--delay': `${particle.delay}ms`,
        '--hue': particle.hue
      }}
      aria-hidden
    >
      <span className="click-star-char">★</span>
    </div>
  )
}

export default function ClickStarsEffect() {
  const [particles, setParticles] = useState([])

  const handleClick = useCallback((e) => {
    const next = createParticles(e.clientX, e.clientY)
    setParticles((prev) => {
      const combined = [...prev, ...next]
      return combined.length > MAX_PARTICLES ? combined.slice(-MAX_PARTICLES) : combined
    })
  }, [])

  const removeParticle = useCallback((id) => {
    setParticles((prev) => prev.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [handleClick])

  if (particles.length === 0) return null

  const overlay = (
    <div
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
      aria-hidden
    >
      {particles.map((p) => (
        <StarParticle key={p.id} particle={p} onEnd={removeParticle} />
      ))}
    </div>
  )

  return createPortal(overlay, document.body)
}
