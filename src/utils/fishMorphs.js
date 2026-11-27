function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

export function hashToSeed(seed) {
  const s = String(seed ?? '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function pickWeighted(list, rand = Math.random) {
  const rows = list || []
  const total = rows.reduce((s, x) => s + (Number(x.w) || 1), 0)
  let r = rand() * Math.max(total, 1)
  for (const row of rows) {
    r -= Number(row.w) || 1
    if (r <= 0) return row
  }
  return rows[0] || null
}

/**
 * Each morph is keyed to sprite A or B (they are different base colors):
 * betta a=藍身紅尾, b=紅鬥；arowana a=金龍, b=紅龍；
 * arowana_blue a=金身藍尾, b=藍底金鱗；ray_crown a=皇冠褐, b=黑鑽白點；
 * ray_albino a=白子黃冠, b=金粉白子；arapaima a=銀腹紅尾, b=橄欖紅尾；
 * guppy a=霓虹藍, b=禮服紅；gar a=褐斑, b=白化；genghis a=灰鯊, b=白化；
 * koi_platinum a=白金, b=山吹；redtail_cat a=紅尾招財, b=乳白.
 * Filters are small offsets from that art, not wild hue-rotate.
 */
export const FISH_MORPHS = {
  arowana: [
    { id: 'gold', label: '金龍', w: 20, art: 'a', body: { h: 0, s: 1.06, b: 1.04 }, tail: { h: 0, s: 1.02, b: 1.0 } },
    { id: 'xbg', label: '過背金', w: 10, art: 'a', body: { h: 6, s: 1.18, b: 1.1 }, tail: { h: 4, s: 1.1, b: 1.06 } },
    { id: 'rtg', label: '紅尾金龍', w: 16, art: 'a', body: { h: 2, s: 1.08, b: 1.04 }, tail: { tint: 'red', s: 1, b: 1 } },
    { id: 'chili', label: '辣椒紅龍', w: 10, art: 'b', body: { h: 0, s: 1.12, b: 1.0 }, tail: { h: -4, s: 1.18, b: 0.98 } },
    { id: 'blood', label: '血紅', w: 5, art: 'b', body: { h: -8, s: 1.22, b: 0.9 }, tail: { h: -10, s: 1.2, b: 0.88 } },
    { id: 'green', label: '青龍', w: 8, art: 'a', body: { tint: 'green' }, tail: { tint: 'green' } },
    { id: 'gold_blue', label: '金藍混搭', w: 10, art: 'a', body: { h: 4, s: 1.12, b: 1.06 }, tail: { tint: 'blue' } },
    { id: 'red_blue', label: '紅藍混搭', w: 8, art: 'b', body: { h: 0, s: 1.08, b: 1.0 }, tail: { tint: 'blue' } },
    { id: 'pearl', label: '珍珠金', w: 6, art: 'a', overlay: 'spots', body: { h: 4, s: 0.9, b: 1.14 }, tail: { h: 6, s: 1.0, b: 1.06 } }
  ],
  arowana_blue: [
    { id: 'mgbb', label: '藍底過背', w: 22, art: 'b', body: { h: 0, s: 1.08, b: 1.04 }, tail: { h: 0, s: 1.1, b: 1.02 } },
    { id: 'blue_gold', label: '藍底金鱗', w: 16, art: 'a', body: { h: 0, s: 1.1, b: 1.06 }, tail: { h: 0, s: 1.04, b: 1.02 } },
    { id: 'blue_red', label: '藍底紅尾', w: 12, art: 'b', body: { h: 0, s: 1.02, b: 1.02 }, tail: { tint: 'red' } },
    { id: 'highback', label: '高背金', w: 8, art: 'a', body: { h: -4, s: 1.2, b: 1.12 }, tail: { h: 8, s: 0.85, b: 1.06 } },
    { id: 'silver', label: '銀龍', w: 10, art: 'a', body: { h: 0, s: 0.12, b: 1.22 }, tail: { h: 0, s: 0.18, b: 1.16 } }
  ],
  betta: [
    { id: 'bicolor', label: '雙色紅尾', w: 18, art: 'a', body: { h: 0, s: 1.06, b: 1.02 }, tail: { h: -6, s: 1.12, b: 1.0 } },
    { id: 'solid_blue', label: '藍鬥', w: 12, art: 'a', body: { tint: 'blue' }, tail: { tint: 'blue' } },
    { id: 'solid_red', label: '紅鬥', w: 12, art: 'b', body: { h: 0, s: 1.12, b: 1.0 }, tail: { h: 0, s: 1.1, b: 0.98 } },
    { id: 'red_blue', label: '紅藍雙色', w: 10, art: 'a', body: { tint: 'red' }, tail: { tint: 'blue' } },
    { id: 'butterfly', label: '蝴蝶', w: 9, art: 'a', body: { h: 4, s: 1.08, b: 1.02 }, tail: { h: 8, s: 0.32, b: 1.22 } },
    { id: 'panda', label: '熊貓', w: 8, art: 'a', overlay: 'panda', body: { h: 0, s: 0.06, b: 1.28 }, tail: { h: 0, s: 0.06, b: 1.28 } },
    { id: 'marble', label: '大理石', w: 9, art: 'a', overlay: 'marble', body: { h: 4, s: 0.75, b: 1.08 }, tail: { h: -8, s: 1.12, b: 1.0 } },
    { id: 'koi', label: '錦鯉', w: 8, art: 'b', overlay: 'marble', body: { h: 0, s: 1.1, b: 1.08 }, tail: { h: 0, s: 0.28, b: 1.22 } },
    { id: 'mustard', label: '芥末氣', w: 6, art: 'a', body: { h: 8, s: 0.45, b: 0.5 }, tail: { tint: 'yellow' } }
  ],
  ray_crown: [
    { id: 'crown', label: '皇冠', w: 24, art: 'a', body: { h: 0, s: 1.04, b: 1.0 }, tail: { h: 0, s: 0.98, b: 0.98 } },
    { id: 'black_diamond', label: '黑鑽', w: 12, art: 'b', body: { h: 0, s: 1.02, b: 0.98 }, tail: { h: 0, s: 0.95, b: 0.92 } },
    { id: 'panda', label: '熊貓', w: 10, art: 'a', overlay: 'panda', body: { h: 0, s: 0.06, b: 1.28 }, tail: { h: 0, s: 0.06, b: 1.28 } },
    { id: 'leopard', label: '雪豹', w: 8, art: 'b', overlay: 'spots', body: { h: 8, s: 0.55, b: 1.12 }, tail: { h: 4, s: 0.4, b: 1.06 } }
  ],
  ray_albino: [
    { id: 'albino', label: '白子', w: 24, art: 'a', body: { h: 0, s: 0.7, b: 1.08 }, tail: { h: 0, s: 0.55, b: 1.06 } },
    { id: 'golden', label: '金冠', w: 12, art: 'b', body: { h: 4, s: 1.12, b: 1.06 }, tail: { h: 2, s: 1.0, b: 1.04 } },
    { id: 'albino_panda', label: '白熊貓', w: 10, art: 'a', overlay: 'panda', body: { h: 0, s: 0.16, b: 1.24 }, tail: { h: 0, s: 0.16, b: 1.24 } }
  ],
  arapaima: [
    { id: 'silver', label: '銀腹', w: 16, art: 'a', body: { h: 0, s: 0.55, b: 1.08 }, tail: { h: -4, s: 1.2, b: 1.0 } },
    { id: 'red_tail', label: '紅尾巨骨', w: 18, art: 'a', body: { h: 0, s: 0.85, b: 1.0 }, tail: { h: -6, s: 1.35, b: 1.02 } },
    { id: 'olive', label: '橄欖褐', w: 16, art: 'b', body: { h: 0, s: 1.02, b: 0.98 }, tail: { h: 0, s: 1.12, b: 1.0 } }
  ],
  guppy: [
    { id: 'neon', label: '霓虹藍', w: 18, art: 'a', body: { h: 0, s: 1.08, b: 1.04 }, tail: { h: 8, s: 1.12, b: 1.02 } },
    { id: 'tuxedo', label: '禮服紅', w: 16, art: 'b', body: { h: 0, s: 1.06, b: 1.0 }, tail: { h: -8, s: 1.18, b: 1.02 } },
    { id: 'mosaic', label: '馬賽克', w: 10, art: 'a', overlay: 'marble', body: { h: 6, s: 1.1, b: 1.06 }, tail: { h: 12, s: 1.2, b: 1.04 } },
    { id: 'cobra', label: '蛇紋', w: 9, art: 'b', overlay: 'spots', body: { h: 4, s: 0.85, b: 1.04 }, tail: { h: -4, s: 1.1, b: 1.0 } },
    { id: 'platinum', label: '白金', w: 8, art: 'a', body: { h: 0, s: 0.18, b: 1.26 }, tail: { h: 10, s: 0.7, b: 1.16 } },
    { id: 'gold', label: '黃金', w: 8, art: 'b', body: { tint: 'yellow' }, tail: { tint: 'yellow' } }
  ],
  gar: [
    { id: 'olive', label: '褐斑', w: 20, art: 'a', body: { h: 0, s: 1.04, b: 1.0 }, tail: { h: 0, s: 1.0, b: 0.98 } },
    { id: 'albino', label: '白化', w: 12, art: 'b', body: { h: 0, s: 0.55, b: 1.18 }, tail: { h: 4, s: 0.6, b: 1.12 } },
    { id: 'gold', label: '黃金雀鱔', w: 8, art: 'b', body: { tint: 'gold' }, tail: { tint: 'gold' } },
    { id: 'blackgold', label: '黑金', w: 7, art: 'a', body: { h: -8, s: 0.7, b: 0.82 }, tail: { h: 12, s: 1.1, b: 1.06 } }
  ],
  genghis: [
    { id: 'steel', label: '灰鯊', w: 20, art: 'a', body: { h: 0, s: 0.85, b: 1.0 }, tail: { h: 0, s: 0.8, b: 0.98 } },
    { id: 'dark', label: '黑金', w: 12, art: 'a', body: { h: -8, s: 0.55, b: 0.78 }, tail: { h: 4, s: 0.7, b: 0.86 } },
    { id: 'albino', label: '白化', w: 10, art: 'b', body: { h: 0, s: 0.35, b: 1.18 }, tail: { h: 4, s: 0.4, b: 1.12 } },
    { id: 'gold', label: '黃金', w: 8, art: 'b', body: { tint: 'yellow' }, tail: { tint: 'gold' } }
  ],
  koi_platinum: [
    { id: 'platinum', label: '白金', w: 20, art: 'a', body: { h: 0, s: 0.22, b: 1.16 }, tail: { h: 0, s: 0.2, b: 1.12 } },
    { id: 'pearl', label: '珍珠白', w: 12, art: 'a', body: { h: 6, s: 0.18, b: 1.22 }, tail: { h: 8, s: 0.16, b: 1.18 } },
    { id: 'yamabuki', label: '山吹', w: 12, art: 'b', body: { h: 0, s: 0.7, b: 1.08 }, tail: { h: 4, s: 0.55, b: 1.06 } },
    { id: 'blush', label: '淡紅白金', w: 8, art: 'a', overlay: 'marble', body: { h: -8, s: 0.45, b: 1.1 }, tail: { h: -10, s: 0.55, b: 1.06 } }
  ],
  redtail_cat: [
    { id: 'classic', label: '紅尾招財', w: 20, art: 'a', body: { h: 0, s: 0.7, b: 0.96 }, tail: { tint: 'red' } },
    { id: 'dark', label: '暗紋', w: 12, art: 'a', body: { h: -6, s: 0.55, b: 0.82 }, tail: { h: -12, s: 1.2, b: 0.9 } },
    { id: 'cream', label: '乳白', w: 10, art: 'b', body: { h: 6, s: 0.45, b: 1.16 }, tail: { h: -8, s: 1.15, b: 1.04 } }
  ],
  turtle_slider: [
    { id: 'redear', label: '紅耳', w: 20, art: 'a', body: { h: 0, s: 1.06, b: 1.02 }, tail: { h: -8, s: 1.18, b: 1.0 } },
    { id: 'yellowbelly', label: '黃腹', w: 14, art: 'b', body: { h: 8, s: 1.08, b: 1.06 }, tail: { h: 10, s: 1.04, b: 1.04 } },
    { id: 'pastel', label: '淡彩', w: 8, art: 'b', body: { h: 4, s: 0.55, b: 1.18 }, tail: { h: 6, s: 0.6, b: 1.14 } }
  ],
  turtle_pig: [
    { id: 'grey', label: '灰青', w: 20, art: 'a', body: { h: 0, s: 0.7, b: 1.02 }, tail: { h: 0, s: 0.65, b: 1.0 } },
    { id: 'charcoal', label: '深灰', w: 12, art: 'a', body: { h: -4, s: 0.45, b: 0.86 }, tail: { h: 0, s: 0.4, b: 0.88 } },
    { id: 'albino', label: '白化', w: 8, art: 'b', body: { h: 8, s: 0.28, b: 1.22 }, tail: { h: 6, s: 0.32, b: 1.16 } }
  ],
  turtle_map: [
    { id: 'map', label: '地圖紋', w: 18, art: 'a', overlay: 'marble', body: { h: 4, s: 0.95, b: 1.04 }, tail: { h: 2, s: 0.9, b: 1.0 } },
    { id: 'yellowspot', label: '黃斑', w: 14, art: 'b', overlay: 'spots', body: { h: 10, s: 1.08, b: 1.06 }, tail: { h: 8, s: 1.0, b: 1.02 } },
    { id: 'darkkeel', label: '黑瘤', w: 8, art: 'a', body: { h: -6, s: 0.7, b: 0.88 }, tail: { h: 0, s: 0.65, b: 0.9 } }
  ]
}

const SHINE = [
  { id: 0, label: '暗色', bri: 0.9, w: 18 },
  { id: 1, label: '普通', bri: 1, w: 64 },
  { id: 2, label: '高亮', bri: 1.1, w: 18 }
]

function jitterPart(part, stable, rand = Math.random) {
  const p = part || { h: 0, s: 1, b: 1 }
  if (p.tint) return { tint: p.tint }
  if (stable) {
    return { h: Number(p.h) || 0, s: Number(p.s) || 1, b: Number(p.b) || 1 }
  }
  return {
    h: (Number(p.h) || 0) + (rand() - 0.5) * 10,
    s: clamp((Number(p.s) || 1) + (rand() - 0.5) * 0.16, 0.08, 1.45),
    b: clamp((Number(p.b) || 1) + (rand() - 0.5) * 0.12, 0.55, 1.32)
  }
}

function makeRng(seed) {
  if (seed == null) return Math.random
  const n = typeof seed === 'number' && Number.isFinite(seed) ? seed : hashToSeed(seed)
  let t = (n || 1) >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function jitterAround(base, span, lo, hi, rand, amount = 1) {
  const v = Number(base)
  const n = Number.isFinite(v) ? v : (lo + hi) / 2
  return clamp(n + (rand() - 0.5) * span * amount, lo, hi)
}

function isRaySpecies(speciesKey) {
  return String(speciesKey || '').startsWith('ray')
}

function ellipseCss(w, h, x, y, hard = 68, fade = 74) {
  return `radial-gradient(ellipse ${w.toFixed(1)}% ${h.toFixed(1)}% at ${x.toFixed(1)}% ${y.toFixed(1)}%, #000 ${hard}%, transparent ${fade}%)`
}

export function rollOverlayMarks(kind, speciesKey, opts = {}) {
  if (!kind) return null
  const rand = makeRng(opts.seed)
  const parent = opts.parent || null
  const amount = opts.inherit ? 0.42 : opts.stable ? 0 : 1
  const ray = isRaySpecies(speciesKey)

  if (kind === 'panda') {
    const hx0 = ray ? 36 : 86
    const hy0 = ray ? 42 : 46
    const marks = {
      hx: jitterAround(parent?.hx ?? hx0, ray ? 14 : 10, ray ? 24 : 76, ray ? 48 : 94, rand, amount || 1),
      hy: jitterAround(parent?.hy ?? hy0, 12, ray ? 28 : 32, ray ? 56 : 62, rand, amount || 1),
      hw: jitterAround(parent?.hw ?? (ray ? 16 : 16), 8, 10, 24, rand, amount || 1),
      hh: jitterAround(parent?.hh ?? (ray ? 18 : 22), 8, 12, 30, rand, amount || 1)
    }
    const wantCheek = parent?.gx != null ? rand() < 0.88 : rand() < (opts.stable ? 0 : 0.72)
    if (wantCheek || opts.stable) {
      marks.gx = jitterAround(parent?.gx ?? (ray ? 48 : 74), 10, ray ? 38 : 62, ray ? 58 : 84, rand, amount || 1)
      marks.gy = jitterAround(parent?.gy ?? (ray ? 58 : 56), 10, ray ? 46 : 42, ray ? 70 : 70, rand, amount || 1)
      marks.gw = jitterAround(parent?.gw ?? 9, 5, 6, 14, rand, amount || 1)
      marks.gh = jitterAround(parent?.gh ?? 11, 5, 7, 16, rand, amount || 1)
    }
    const wantTail = parent?.tx != null ? rand() < 0.86 : rand() < (ray || opts.stable ? 1 : 0.38)
    if (wantTail) {
      marks.tx = jitterAround(parent?.tx ?? (ray ? 64 : 26), 12, ray ? 52 : 12, ray ? 78 : 40, rand, amount || 1)
      marks.ty = jitterAround(parent?.ty ?? (ray ? 40 : 52), 10, ray ? 28 : 38, ray ? 54 : 68, rand, amount || 1)
      marks.tw = jitterAround(parent?.tw ?? (ray ? 15 : 12), 6, 8, 22, rand, amount || 1)
      marks.th = jitterAround(parent?.th ?? (ray ? 17 : 14), 6, 8, 24, rand, amount || 1)
    }
    if (opts.stable) {
      marks.hx = hx0
      marks.hy = hy0
      marks.hw = ray ? 16 : 16
      marks.hh = ray ? 18 : 22
      marks.gx = undefined
      marks.gy = undefined
      marks.gw = undefined
      marks.gh = undefined
      marks.tx = ray ? 64 : undefined
      marks.ty = ray ? 40 : undefined
      marks.tw = ray ? 15 : undefined
      marks.th = ray ? 17 : undefined
    }
    return marks
  }

  if (kind === 'spots') {
    const src = Array.isArray(parent?.dots) ? parent.dots : null
    const n = src ? src.length : 11 + Math.floor(rand() * 6)
    const dots = []
    for (let i = 0; i < n; i++) {
      const d = src?.[i]
      dots.push({
        x: jitterAround(d?.x ?? 50 + rand() * 34, 6, 42, 90, rand, src ? amount : 1),
        y: jitterAround(d?.y ?? 34 + rand() * 28, 6, 30, 68, rand, src ? amount : 1),
        r: jitterAround(d?.r ?? 1.15 + rand() * 0.55, 0.35, 0.9, 2.1, rand, src ? amount : 1)
      })
    }
    if (opts.stable) return { dots: null }
    return { dots }
  }

  if (kind === 'marble') {
    const blobs = (parent?.blobs || [
      { x: 32, y: 40, w: 40, h: 28 },
      { x: 68, y: 58, w: 34, h: 24 },
      { x: 54, y: 28, w: 22, h: 18 }
    ]).map((b) => ({
      x: jitterAround(b.x, 16, 18, 82, rand, amount || 1),
      y: jitterAround(b.y, 14, 22, 72, rand, amount || 1),
      w: jitterAround(b.w, 12, 16, 48, rand, amount || 1),
      h: jitterAround(b.h, 10, 12, 36, rand, amount || 1)
    }))
    if (opts.stable) return { blobs: null }
    return { blobs }
  }

  return null
}

export function overlayMaskImage(kind, marks) {
  if (kind === 'panda') {
    const m = marks || { hx: 86, hy: 46, hw: 16, hh: 22 }
    const layers = [ellipseCss(m.hw || 16, m.hh || 22, m.hx || 86, m.hy || 46)]
    if (m.gx != null) layers.push(ellipseCss(m.gw || 9, m.gh || 11, m.gx, m.gy || 56, 64, 72))
    if (m.tx != null) layers.push(ellipseCss(m.tw || 14, m.th || 16, m.tx, m.ty || 48, 64, 72))
    return layers.join(',')
  }
  if (kind === 'spots' && marks?.dots?.length) {
    return marks.dots
      .map((d) => `radial-gradient(circle at ${d.x.toFixed(1)}% ${d.y.toFixed(1)}%, #000 ${d.r.toFixed(2)}%, transparent ${(d.r + 0.35).toFixed(2)}%)`)
      .join(',')
  }
  if (kind === 'marble' && marks?.blobs?.length) {
    return marks.blobs
      .map((b) => ellipseCss(b.w, b.h, b.x, b.y, 40, 44))
      .join(',')
  }
  return ''
}

export function rollColorWash(speciesKey, opts = {}) {
  const rand = makeRng(opts.seed)
  const parent = opts.parent || null
  const amount = opts.inherit ? 0.46 : 1
  const ray = isRaySpecies(speciesKey)
  return {
    bodySat: jitterAround(parent?.bodySat ?? 1, 0.28, 0.72, 1.32, rand, amount),
    bodyBri: jitterAround(parent?.bodyBri ?? 1, 0.2, 0.8, 1.24, rand, amount),
    bodyHue: jitterAround(parent?.bodyHue ?? 0, 14, -16, 16, rand, amount),
    tailSat: jitterAround(parent?.tailSat ?? 1, 0.3, 0.7, 1.36, rand, amount),
    tailBri: jitterAround(parent?.tailBri ?? 1, 0.2, 0.8, 1.24, rand, amount),
    tailHue: jitterAround(parent?.tailHue ?? 0, 16, -18, 18, rand, amount),
    wx: jitterAround(parent?.wx ?? (ray ? 48 : 64), 28, 24, 90, rand, amount),
    wy: jitterAround(parent?.wy ?? 46, 18, 26, 72, rand, amount),
    ww: jitterAround(parent?.ww ?? 36, 22, 18, 62, rand, amount),
    wh: jitterAround(parent?.wh ?? 30, 18, 16, 52, rand, amount),
    mix: jitterAround(parent?.mix ?? 0.24, 0.18, 0.1, 0.46, rand, amount)
  }
}

export const MORPH_PALETTE_VER = 6

export function rarityLabel(weight) {
  const w = Number(weight) || 0
  if (w >= 16) return '常見'
  if (w >= 10) return '少見'
  return '稀有'
}

export function rollFishMorph(speciesKey, extra = {}) {
  const rand = extra.seed != null ? makeRng(hashToSeed(extra.seed)) : Math.random
  const list = FISH_MORPHS[speciesKey] || FISH_MORPHS.betta
  const base = extra.template || pickWeighted(list, rand) || list[0]
  const shine = extra.shine != null ? extra.shine : pickWeighted(SHINE, rand).id
  const stable = !!extra.stable
  const overlay = base.overlay || extra.overlay || ''
  const markSeed = extra.markSeed != null ? extra.markSeed : extra.seed != null ? hashToSeed(`${extra.seed}:mark`) : undefined
  return {
    v: MORPH_PALETTE_VER,
    id: base.id,
    label: base.label,
    w: Number(base.w) || extra.w || 10,
    overlay,
    art: extra.art || base.art || 'a',
    shine,
    marks:
      extra.marks !== undefined
        ? extra.marks
        : rollOverlayMarks(overlay, speciesKey, {
            parent: extra.parentMarks,
            inherit: extra.inheritMarks,
            seed: markSeed
          }),
    wash:
      extra.wash !== undefined
        ? extra.wash
        : rollColorWash(speciesKey, {
            parent: extra.parentWash,
            inherit: extra.inheritMarks,
            seed: markSeed != null ? Number(markSeed) + 97 : undefined
          }),
    body: jitterPart(extra.body || base.body, stable, rand),
    tail: jitterPart(extra.tail || base.tail, stable, rand)
  }
}

export function morphById(speciesKey, id) {
  return (FISH_MORPHS[speciesKey] || []).find((x) => x.id === id) || null
}

export function shineLabel(shine) {
  return SHINE.find((x) => x.id === Number(shine))?.label || '普通'
}

export function shineBri(shine) {
  return SHINE.find((x) => x.id === Number(shine))?.bri || 1
}

function tintFilter(name, shine, wash = {}) {
  const bri = shineBri(shine) * (Number(wash.bri) || 1)
  const satMul = Number(wash.sat) || 1
  const hueAdd = Number(wash.hue) || 0
  if (name === 'blue') {
    return `grayscale(1) sepia(1) hue-rotate(${(185 + hueAdd).toFixed(1)}deg) saturate(${(4.6 * satMul).toFixed(2)}) brightness(${(0.7 * bri).toFixed(2)})`
  }
  if (name === 'red') {
    return `grayscale(1) sepia(1) hue-rotate(${(338 + hueAdd).toFixed(1)}deg) saturate(${(5.4 * satMul).toFixed(2)}) brightness(${(0.76 * bri).toFixed(2)})`
  }
  if (name === 'gold') {
    return `grayscale(1) sepia(1) hue-rotate(${(8 + hueAdd).toFixed(1)}deg) saturate(${(3.3 * satMul).toFixed(2)}) brightness(${(0.96 * bri).toFixed(2)})`
  }
  if (name === 'green') {
    return `grayscale(1) sepia(1) hue-rotate(${(72 + hueAdd).toFixed(1)}deg) saturate(${(2.5 * satMul).toFixed(2)}) brightness(${(0.82 * bri).toFixed(2)})`
  }
  if (name === 'yellow') {
    return `grayscale(1) sepia(1) hue-rotate(${(28 + hueAdd).toFixed(1)}deg) saturate(${(4.2 * satMul).toFixed(2)}) brightness(${(1.02 * bri).toFixed(2)})`
  }
  return ''
}

function partCss(part, reveal, shine, wash = {}) {
  const t = clamp(Number(reveal) || 0, 0, 1)
  const satMul = Number(wash.sat) || 1
  const briMul = Number(wash.bri) || 1
  const hueAdd = Number(wash.hue) || 0
  if (t <= 0.001) {
    return 'grayscale(1) saturate(0) brightness(1.14) contrast(0.86)'
  }
  if (part?.tint) {
    if (t < 0.55) {
      return `grayscale(1) saturate(${(0.15 * t).toFixed(2)}) brightness(1.12) contrast(0.88)`
    }
    return tintFilter(part.tint, shine, { sat: satMul, bri: briMul, hue: hueAdd })
  }
  const hue = ((Number(part?.h) || 0) + hueAdd) * t
  const gray = clamp(1 - t, 0, 1)
  const sat = (Number(part?.s) || 1) * satMul * (0.12 + 0.88 * t)
  const bri = (Number(part?.b) || 1) * shineBri(shine) * briMul * (1.1 - 0.1 * t)
  const contrast = 0.88 + 0.12 * t
  return `grayscale(${gray.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) contrast(${contrast.toFixed(2)})`
}

export function morphPartFilters(morph, reveal) {
  const rec = morph && morph.body ? morph : rollFishMorph('betta', { stable: true })
  const t = clamp(Number(reveal) || 0, 0, 1)
  const wash = rec.wash || {}
  const overlayKind = t < 0.12 ? '' : rec.overlay || ''
  const overlayOpacity = overlayKind ? clamp((t - 0.12) / 0.7, 0.08, 0.9) : 0
  const overlayFilter =
    overlayKind === 'panda'
      ? partCss({ h: 0, s: 0.05, b: 0.32 }, t, rec.shine)
      : overlayKind === 'spots'
        ? partCss({ h: 18, s: 0.4, b: 1.22 }, t, rec.shine)
        : overlayKind === 'marble'
          ? partCss({ h: 0, s: 0.2, b: 1.18 }, t, rec.shine)
          : ''
  const bodyWash = { sat: wash.bodySat, bri: wash.bodyBri, hue: wash.bodyHue }
  const tailWash = { sat: wash.tailSat, bri: wash.tailBri, hue: wash.tailHue }
  const washMask =
    t > 0.2 && wash.wx != null
      ? ellipseCss(Number(wash.ww) || 36, Number(wash.wh) || 30, Number(wash.wx) || 64, Number(wash.wy) || 46, 42, 78)
      : ''
  return {
    body: partCss(rec.body, t, rec.shine, bodyWash),
    tail: partCss(rec.tail, t, rec.shine, tailWash),
    overlay: overlayKind,
    overlayFilter,
    overlayOpacity,
    overlayMask: overlayKind ? overlayMaskImage(overlayKind, rec.marks) : '',
    washMask,
    washFilter: partCss(rec.body, t, rec.shine, {
      sat: (Number(wash.bodySat) || 1) * 1.18,
      bri: (Number(wash.bodyBri) || 1) * 0.92,
      hue: (Number(wash.bodyHue) || 0) + (Number(wash.tailHue) || 0) * 0.25
    }),
    washOpacity: t > 0.2 ? clamp(Number(wash.mix) || 0.22, 0.08, 0.48) : 0
  }
}

export function listSpeciesMorphLooks(speciesKey) {
  return (FISH_MORPHS[speciesKey] || []).map((m) => {
    const overlay = m.overlay || ''
    const samples = [11, 27, 43].map((seed, i) =>
      morphPartFilters(
        {
          id: m.id,
          label: m.label,
          overlay,
          shine: i,
          body: m.body,
          tail: m.tail,
          marks: overlay ? rollOverlayMarks(overlay, speciesKey, { seed }) : null,
          wash: rollColorWash(speciesKey, { seed: seed + 5 })
        },
        1
      )
    )
    return {
      id: m.id,
      label: m.label,
      rarity: rarityLabel(m.w),
      art: m.art || 'a',
      parts: samples[1],
      samples
    }
  })
}

export function mixParentMorphs(species, mother, father, prettier) {
  const list = FISH_MORPHS[species] || FISH_MORPHS.betta
  const rare = Math.random() < 0.28
  if (rare) {
    const rares = list.filter((x) => (x.w || 10) <= 10)
    return rollFishMorph(species, { template: pickWeighted(rares.length ? rares : list), shine: prettier ? 2 : undefined })
  }
  if (mother?.body && father?.tail && Math.random() < 0.42) {
    const overlay = mother.overlay || father.overlay || ''
    const parentMarks = (mother.overlay && mother.marks) || (father.overlay && father.marks) || null
    return rollFishMorph(species, {
      template: {
        id: 'hybrid',
        label: '混血顯色',
        w: 1,
        art: mother.art || father.art || 'a',
        overlay,
        body: mother.body,
        tail: father.tail
      },
      body: mother.body,
      tail: father.tail,
      art: mother.art || father.art || 'a',
      parentMarks,
      parentWash: mother.wash || father.wash,
      inheritMarks: true,
      shine: prettier ? Math.max(Number(mother.shine) || 1, Number(father.shine) || 1) : undefined
    })
  }
  const inherit = Math.random() < 0.55 ? mother : father
  const found = morphById(species, inherit?.id)
  return rollFishMorph(species, {
    template: found || pickWeighted(list),
    shine: inherit?.shine,
    parentMarks: inherit?.marks,
    parentWash: inherit?.wash,
    inheritMarks: true
  })
}
