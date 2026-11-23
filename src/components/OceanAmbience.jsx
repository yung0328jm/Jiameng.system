import { useMemo } from 'react'
import { createPortal } from 'react-dom'

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 17) % 92)}%`,
  size: `${7 + (i % 5) * 3}px`,
  duration: `${10 + (i % 7) * 2.2}s`,
  delay: `${-(i * 1.3)}s`,
  drift: `${(i % 2 === 0 ? 18 : -16) + (i % 5) * 4}px`,
  opacity: 0.22 + (i % 4) * 0.08
}))

function FishSvg({ body, stripe, fin, accent }) {
  return (
    <svg viewBox="0 0 88 44" className="ocean-fish-svg" aria-hidden>
      <ellipse cx="42" cy="22" rx="26" ry="14" fill={body} />
      <path d="M16 22 L2 8 L6 22 L2 36 Z" fill={fin} />
      <path d="M50 10 Q62 4 58 16" fill={accent} opacity="0.9" />
      <path d="M48 34 Q60 42 56 28" fill={accent} opacity="0.85" />
      <ellipse cx="54" cy="19" rx="3.2" ry="4.2" fill="#0b1f2a" />
      <circle cx="55.2" cy="17.6" r="1.1" fill="#fff" />
      <path d="M28 16 Q42 22 28 28" fill="none" stroke={stripe} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M34 14 Q48 22 34 30" fill="none" stroke={stripe} strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

export default function OceanAmbience() {
  const bubbles = useMemo(() => BUBBLES, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="ocean-ambience" aria-hidden>
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="ocean-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: b.duration,
            animationDelay: b.delay,
            '--drift': b.drift,
            opacity: b.opacity
          }}
        />
      ))}

      <div className="ocean-fish-lane ocean-fish-lane-a">
        <div className="ocean-fish-flip">
          <div className="ocean-fish-bob">
            <FishSvg body="#f59e0b" stripe="#f8fafc" fin="#ea580c" accent="#fb923c" />
          </div>
        </div>
      </div>
      <div className="ocean-fish-lane ocean-fish-lane-b">
        <div className="ocean-fish-flip">
          <div className="ocean-fish-bob">
            <FishSvg body="#22d3ee" stripe="#ecfeff" fin="#0891b2" accent="#67e8f9" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
