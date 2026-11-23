import { useMemo } from 'react'
import { createPortal } from 'react-dom'

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 17) % 92)}%`,
  size: `${7 + (i % 5) * 3}px`,
  duration: `${10 + (i % 7) * 2.2}s`,
  delay: `${-(i * 1.3)}s`
}))

function Betta({ src, className }) {
  return (
    <img
      src={src}
      alt=""
      className={className}
      draggable={false}
    />
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
            <Betta src="/images/betta-a.png" className="ocean-fish-photo ocean-fish-photo-a" />
          </div>
        </div>
      </div>
      <div className="ocean-fish-lane ocean-fish-lane-b">
        <div className="ocean-fish-flip">
          <div className="ocean-fish-bob">
            <Betta src="/images/betta-b.png" className="ocean-fish-photo ocean-fish-photo-b" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
