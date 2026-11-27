function overlayMaskStyle(mask, extra = {}) {
  if (!mask) return extra
  return {
    ...extra,
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%'
  }
}

export default function FishSprite({ src, variant, wide, shape, width, height, parts, className = '' }) {
  const overlay = parts?.overlay || ''
  const mask = parts?.overlayMask || ''
  const overlayLook = overlayMaskStyle(mask, {
    filter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    WebkitFilter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    opacity: parts?.overlayOpacity != null ? parts.overlayOpacity : undefined
  })
  return (
    <div
      className={`ocean-betta ocean-betta-${variant || 'a'}${wide ? ' ocean-betta-wide' : ''}${shape === 'ray' || shape === 'turtle' ? ' ocean-betta-ray' : ''}${shape === 'cichlid' ? ' ocean-betta-cichlid' : ''}${shape === 'shark' ? ' ocean-betta-shark' : ''}${shape === 'koi' ? ' ocean-betta-koi' : ''}${shape === 'giant' ? ' ocean-betta-giant' : ''}${parts?.glow ? ' ocean-betta-glow' : ''} ${className}`.trim()}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        ...(parts?.glowAura || {})
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
      {parts?.washMask ? (
        <img
          src={src}
          alt=""
          className="ocean-betta-layer ocean-betta-wash"
          style={overlayMaskStyle(parts.washMask, {
            filter: parts.washFilter || undefined,
            WebkitFilter: parts.washFilter || undefined,
            opacity: parts.washOpacity != null ? parts.washOpacity : 0.22
          })}
          draggable={false}
        />
      ) : null}
      {overlay === 'panda' ? (
        <img
          src={src}
          alt=""
          className="ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-panda"
          style={overlayLook}
          draggable={false}
        />
      ) : overlay === 'spots' ? (
        <img
          src={src}
          alt=""
          className="ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-spots"
          style={overlayLook}
          draggable={false}
        />
      ) : overlay ? (
        <img
          src={src}
          alt=""
          className={`ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-${overlay}`}
          style={overlayLook}
          draggable={false}
        />
      ) : null}
    </div>
  )
}
