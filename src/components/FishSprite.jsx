export default function FishSprite({ src, variant, wide, shape, width, height, parts, className = '' }) {
  const overlay = parts?.overlay || ''
  return (
    <div
      className={`ocean-betta ocean-betta-${variant || 'a'}${wide ? ' ocean-betta-wide' : ''}${shape === 'ray' ? ' ocean-betta-ray' : ''}${shape === 'giant' ? ' ocean-betta-giant' : ''} ${className}`.trim()}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined
      }}
    >
      <img
        src={src}
        alt=""
        className="ocean-betta-layer ocean-betta-body"
        style={{ filter: parts?.body || undefined, WebkitFilter: parts?.body || undefined }}
        draggable={false}
      />
      <img
        src={src}
        alt=""
        className="ocean-betta-layer ocean-betta-tail"
        style={{ filter: parts?.tail || undefined, WebkitFilter: parts?.tail || undefined }}
        draggable={false}
      />
      {overlay ? (
        <img
          src={src}
          alt=""
          className={`ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-${overlay}`}
          style={{
            filter: parts?.overlayFilter || undefined,
            WebkitFilter: parts?.overlayFilter || undefined,
            opacity: parts?.overlayOpacity != null ? parts.overlayOpacity : undefined
          }}
          draggable={false}
        />
      ) : null}
    </div>
  )
}
