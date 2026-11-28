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

function SpriteLayer({ src, className, style }) {
  return (
    <img
      src={src}
      alt=""
      className={`ocean-betta-layer ${className}`}
      style={style}
      draggable={false}
    />
  )
}

export default function FishSprite({ src, variant, wide, shape, width, height, parts, className = '' }) {
  const overlay = parts?.overlay || ''
  const mask = parts?.overlayMask || ''
  const bodyLook = { filter: parts?.body || undefined, WebkitFilter: parts?.body || undefined }
  const overlayLook = overlayMaskStyle(mask, {
    filter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    WebkitFilter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    opacity: parts?.overlayOpacity != null ? parts.overlayOpacity : undefined
  })
  return (
    <div
      className={`ocean-betta ocean-betta-${variant || 'a'}${wide ? ' ocean-betta-wide' : ''}${shape === 'ray' ? ' ocean-betta-ray' : ''}${shape === 'turtle' ? ' ocean-betta-ray ocean-betta-turtle' : ''}${shape === 'cichlid' ? ' ocean-betta-cichlid' : ''}${shape === 'shark' ? ' ocean-betta-shark' : ''}${shape === 'koi' ? ' ocean-betta-koi' : ''}${shape === 'giant' ? ' ocean-betta-giant' : ''}${parts?.glow ? ' ocean-betta-glow' : ''} ${className}`.trim()}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        ...(parts?.glowAura || {})
      }}
    >
      <SpriteLayer src={src} className="ocean-betta-body" style={bodyLook} />
      <SpriteLayer src={src} className="ocean-betta-dorsal" style={bodyLook} />
      <SpriteLayer src={src} className="ocean-betta-ventral" style={bodyLook} />
      <SpriteLayer src={src} className="ocean-betta-pectoral" style={bodyLook} />
      <SpriteLayer
        src={src}
        className="ocean-betta-tail"
        style={{ filter: parts?.tail || undefined, WebkitFilter: parts?.tail || undefined }}
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
