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

function SnapperFish() {
  return (
    <svg viewBox="0 0 148 58" className="ocean-fish-svg" aria-hidden>
      <defs>
        <linearGradient id="snapper-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4f46" />
          <stop offset="38%" stopColor="#6d7f72" />
          <stop offset="72%" stopColor="#b7c2b6" />
          <stop offset="100%" stopColor="#e4eadf" />
        </linearGradient>
        <linearGradient id="snapper-fin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a5c52" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#2c3a34" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d="M78 11 C92 4 108 8 116 16 L122 8 L110 18" fill="url(#snapper-fin)" />
      <path d="M76 46 C90 54 106 50 114 42 L120 50 L108 40" fill="url(#snapper-fin)" />
      <g className="ocean-fish-tail">
        <path d="M30 29 L6 11 C10 22 10 29 8 29 C10 29 10 36 6 47 Z" fill="#3d4c44" />
        <path d="M30 29 L12 29" stroke="#9aa89d" strokeWidth="1.2" opacity="0.5" />
      </g>
      <path
        d="M118 29 C118 17 106 9 88 8 C64 6 44 12 32 29 C44 46 64 52 88 50 C106 49 118 41 118 29 Z"
        fill="url(#snapper-body)"
      />
      <path d="M108 22 C100 16 92 18 88 29 C92 40 100 42 108 36" fill="none" stroke="#2f3d37" strokeWidth="1.1" opacity="0.35" />
      <ellipse cx="96" cy="31" rx="7" ry="4.2" fill="#4e5d55" opacity="0.35" transform="rotate(-18 96 31)" />
      <path d="M70 18 C78 29 70 40 70 40" fill="none" stroke="#2f3d37" strokeWidth="0.7" opacity="0.18" />
      <path d="M82 16 C90 29 82 42 82 42" fill="none" stroke="#2f3d37" strokeWidth="0.7" opacity="0.14" />
      <circle cx="108.5" cy="24.5" r="3.1" fill="#1a2420" />
      <circle cx="109.3" cy="23.8" r="1.05" fill="#dfe7e2" />
      <circle cx="108.2" cy="25.2" r="0.7" fill="#6b7c72" />
      <path d="M117.5 29 C120 27.2 122.5 28.2 123 29.4 C122.2 30.4 119.8 31 117.2 30.2" fill="#c5cfc6" />
    </svg>
  )
}

function MackerelFish() {
  return (
    <svg viewBox="0 0 156 48" className="ocean-fish-svg" aria-hidden>
      <defs>
        <linearGradient id="mackerel-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c3344" />
          <stop offset="42%" stopColor="#3d5f73" />
          <stop offset="78%" stopColor="#9bb3bf" />
          <stop offset="100%" stopColor="#dce6ea" />
        </linearGradient>
        <linearGradient id="mackerel-fin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#234052" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#152833" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path d="M86 10 C104 3 118 8 124 16 L128 7 L120 17" fill="url(#mackerel-fin)" />
      <path d="M90 38 C106 45 118 40 124 34 L128 42 L118 33" fill="url(#mackerel-fin)" />
      <g className="ocean-fish-tail">
        <path d="M28 24 L4 8 C8 18 8 24 5 24 C8 24 8 30 4 40 Z" fill="#1a2e3c" />
      </g>
      <path
        d="M126 24 C126 14 114 8 96 7 C68 5 44 11 30 24 C44 37 68 43 96 41 C114 40 126 34 126 24 Z"
        fill="url(#mackerel-body)"
      />
      <path d="M70 11 C76 16 80 18 86 12" fill="none" stroke="#0f2230" strokeWidth="1.4" opacity="0.45" />
      <path d="M62 12 C68 18 74 20 80 13" fill="none" stroke="#0f2230" strokeWidth="1.2" opacity="0.35" />
      <path d="M54 13 C60 19 66 21 72 14" fill="none" stroke="#0f2230" strokeWidth="1.1" opacity="0.28" />
      <path d="M46 14 C52 20 58 22 64 15" fill="none" stroke="#0f2230" strokeWidth="1" opacity="0.22" />
      <path d="M108 18 C102 16 98 20 96 24 C98 28 102 32 108 30" fill="none" stroke="#163044" strokeWidth="1" opacity="0.3" />
      <circle cx="116.2" cy="20.4" r="2.6" fill="#101c24" />
      <circle cx="116.9" cy="19.8" r="0.85" fill="#e8eef1" />
      <path d="M125.2 24 C128 22.6 130.4 23.4 131 24.5 C130 25.6 127.4 26 125 25.1" fill="#c5d3da" />
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
            WebkitAnimationDuration: b.duration,
            animationDuration: b.duration,
            WebkitAnimationDelay: b.delay,
            animationDelay: b.delay
          }}
        />
      ))}

      <div className="ocean-fish-lane ocean-fish-lane-a">
        <div className="ocean-fish-flip">
          <div className="ocean-fish-bob">
            <SnapperFish />
          </div>
        </div>
      </div>
      <div className="ocean-fish-lane ocean-fish-lane-b">
        <div className="ocean-fish-flip">
          <div className="ocean-fish-bob">
            <MackerelFish />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
