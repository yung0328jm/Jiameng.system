import { useLayoutEffect, useRef } from 'react'

const imgCache = new Map()

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

function loadFishImage(src) {
  if (!src) return null
  let rec = imgCache.get(src)
  if (rec) return rec
  rec = { img: new Image(), ready: false, wait: [] }
  rec.img.decoding = 'async'
  rec.img.onload = () => {
    rec.ready = true
    rec.wait.splice(0).forEach((fn) => fn())
  }
  rec.img.src = src
  imgCache.set(src, rec)
  return rec
}

function stripOffset(t, live, shape) {
  const phase = live.phase || 0
  const amp = live.amp || 0
  const fin = live.fin || 0
  const along = 1 - t
  if (shape === 'ray') {
    const wing = Math.sin(phase * 1.05) * amp * 0.35 * Math.sin(Math.PI * t)
    const whip = Math.sin(phase) * amp * Math.max(0, (along - 0.58) / 0.42) ** 2
    return wing + whip
  }
  if (shape === 'turtle') {
    const front = Math.sin(phase * 1.4 + 0.4) * fin * 0.7 * Math.exp(-((t - 0.78) ** 2) / 0.02)
    const rear = Math.sin(phase * 1.4 + 2.1) * fin * 0.55 * Math.exp(-((t - 0.18) ** 2) / 0.03)
    return front + rear
  }
  const rear = Math.max(0, (along - 0.56) / 0.44)
  const caudal = Math.sin(phase) * amp * rear
  const tip = Math.sin(phase * 1.22 + 0.28) * amp * 0.55 * rear * rear
  const pec = Math.sin(phase * 1.55 + 0.8) * fin * 0.22 * Math.exp(-((t - 0.74) ** 2) / 0.008)
  return caudal + tip + pec
}

function warpDraw(ctx, img, w, h, pad, live, shape) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (!srcW || !srcH) return
  const strips = Math.max(18, Math.min(48, Math.round(w / 3.2)))
  const slice = srcW / strips
  for (let i = 0; i < strips; i += 1) {
    const t = (i + 0.5) / strips
    const y = pad + stripOffset(t, live, shape)
    const sx = i * slice
    const dx = (sx / srcW) * w
    const dw = (slice / srcW) * w + 1.25
    ctx.drawImage(img, sx, 0, slice + 1.2, srcH, dx, y, dw, h)
  }
}

function paintFish(canvas, img, width, height, live, parts, shape) {
  if (!canvas || !img) return
  const amp = Number(live?.amp) || 0
  const fin = Number(live?.fin) || 0
  const pad = Math.max(10, Math.ceil(amp + fin + 8))
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const cssW = Math.max(1, width)
  const cssH = Math.max(1, height + pad * 2)
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
  }
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.style.top = `${-pad}px`
  const ctx = canvas.getContext('2d', { alpha: true })
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'medium'
  const overlay = parts?.overlay || ''
  ctx.save()
  ctx.filter = parts?.body || 'none'
  warpDraw(ctx, img, width, height, pad, live, shape)
  ctx.restore()
  if (parts?.tail) {
    ctx.save()
    ctx.filter = parts.tail
    ctx.globalAlpha = 0.55
    ctx.globalCompositeOperation = 'overlay'
    warpDraw(ctx, img, width, height, pad, live, shape)
    ctx.restore()
  }
  if (overlay === 'panda') {
    ctx.save()
    ctx.filter = 'brightness(0)'
    ctx.globalAlpha = 0.55
    ctx.globalCompositeOperation = 'multiply'
    warpDraw(ctx, img, width, height, pad, live, shape)
    ctx.restore()
  } else if (overlay) {
    ctx.save()
    ctx.filter = parts?.overlayFilter || 'none'
    ctx.globalAlpha = parts?.overlayOpacity != null ? parts.overlayOpacity : 0.55
    ctx.globalCompositeOperation = overlay === 'spots' ? 'screen' : 'overlay'
    warpDraw(ctx, img, width, height, pad, live, shape)
    ctx.restore()
  }
}

function shellClass(variant, wide, shape, glow, className) {
  return `ocean-betta ocean-betta-${variant || 'a'}${wide ? ' ocean-betta-wide' : ''}${shape === 'ray' ? ' ocean-betta-ray' : ''}${shape === 'turtle' ? ' ocean-betta-ray ocean-betta-turtle' : ''}${shape === 'cichlid' ? ' ocean-betta-cichlid' : ''}${shape === 'shark' ? ' ocean-betta-shark' : ''}${shape === 'koi' ? ' ocean-betta-koi' : ''}${shape === 'giant' ? ' ocean-betta-giant' : ''}${glow ? ' ocean-betta-glow' : ''} ${className}`.trim()
}

function StaticFish({ src, variant, wide, shape, width, height, parts, className }) {
  const overlay = parts?.overlay || ''
  const mask = parts?.overlayMask || ''
  const overlayLook = overlayMaskStyle(mask, {
    filter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    WebkitFilter: overlay === 'panda' ? undefined : parts?.overlayFilter || undefined,
    opacity: parts?.overlayOpacity != null ? parts.overlayOpacity : undefined
  })
  return (
    <div
      className={shellClass(variant, wide, shape, parts?.glow, className)}
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
        <img src={src} alt="" className="ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-panda" style={overlayLook} draggable={false} />
      ) : overlay === 'spots' ? (
        <img src={src} alt="" className="ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-spots" style={overlayLook} draggable={false} />
      ) : overlay ? (
        <img src={src} alt="" className={`ocean-betta-layer ocean-betta-overlay ocean-betta-overlay-${overlay}`} style={overlayLook} draggable={false} />
      ) : null}
    </div>
  )
}

export default function FishSprite({
  src,
  variant,
  wide,
  shape,
  width,
  height,
  parts,
  className = '',
  live = null
}) {
  const canvasRef = useRef(null)
  const liveRef = useRef(live)
  liveRef.current = live
  const w = Math.max(8, Number(width) || 0)
  const h = Math.max(8, Number(height) || 0)

  useLayoutEffect(() => {
    if (!live) return undefined
    const rec = loadFishImage(src)
    if (!rec) return undefined
    const run = () => {
      const canvas = canvasRef.current
      if (!rec.ready || !canvas || !w || !h) return
      paintFish(canvas, rec.img, w, h, liveRef.current, parts, shape)
    }
    if (rec.ready) run()
    else rec.wait.push(run)
    return undefined
  }, [src, w, h, shape, parts, live, live?.phase, live?.amp, live?.fin])

  if (!live) {
    return (
      <StaticFish
        src={src}
        variant={variant}
        wide={wide}
        shape={shape}
        width={width}
        height={height}
        parts={parts}
        className={className}
      />
    )
  }

  return (
    <div
      className={shellClass(variant, wide, shape, parts?.glow, className)}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        ...(parts?.glowAura || {})
      }}
    >
      <canvas ref={canvasRef} className="ocean-betta-canvas" />
    </div>
  )
}
