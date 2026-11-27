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

function pick(arr, rand = Math.random) {
  if (!arr?.length) return null
  return arr[Math.floor(rand() * arr.length)]
}

export const FISH_COLORS = {
  white: { id: 'white', h: 0, s: 0.08, b: 1.3, art: 'a' },
  cream: { id: 'cream', h: 16, s: 0.28, b: 1.18, art: 'a' },
  yellow: { id: 'yellow', tint: 'yellow', s: 1, b: 1, art: 'b' },
  gold: { id: 'gold', tint: 'gold', s: 1, b: 1, art: 'a' },
  copper: { id: 'copper', tint: 'red', s: 0.92, b: 0.82, art: 'b' },
  red: { id: 'red', tint: 'red', s: 1, b: 1, art: 'b' },
  wine: { id: 'wine', tint: 'red', s: 1.12, b: 0.72, art: 'b' },
  purple: { id: 'purple', tint: 'purple', s: 1, b: 1, art: 'a' },
  blue: { id: 'blue', tint: 'blue', s: 1, b: 1, art: 'a' },
  teal: { id: 'teal', tint: 'green', s: 0.9, b: 1.08, art: 'a' },
  green: { id: 'green', tint: 'green', s: 1, b: 1, art: 'a' },
  olive: { id: 'olive', h: 28, s: 0.72, b: 0.92, art: 'a' },
  black: { id: 'black', h: 0, s: 0.18, b: 0.58, art: 'b' },
  silver: { id: 'silver', h: 0, s: 0.12, b: 1.16, art: 'a' }
}

const ALL_COLOR_IDS = Object.keys(FISH_COLORS)

const SHADES = {
  dark: { id: 'dark', bri: 0.76, sat: 1.16 },
  deep: { id: 'deep', bri: 0.88, sat: 1.1 },
  mid: { id: 'mid', bri: 1, sat: 1 },
  pale: { id: 'pale', bri: 1.14, sat: 0.78 },
  light: { id: 'light', bri: 1.28, sat: 0.52 }
}

const SHADE_IDS = Object.keys(SHADES)

const SHINE = [
  { id: 0, label: '暗色', bri: 0.86, w: 22 },
  { id: 1, label: '普通', bri: 1, w: 56 },
  { id: 2, label: '高亮', bri: 1.14, w: 22 }
]

export const SPECIES_COLOR_POOLS = {
  betta: ['red', 'wine', 'blue', 'purple', 'white', 'yellow', 'black', 'copper'],
  guppy: ['blue', 'red', 'yellow', 'white', 'purple', 'gold', 'black', 'wine'],
  gar: ['olive', 'gold', 'white', 'black', 'red', 'purple', 'green', 'cream'],
  genghis: ['black', 'silver', 'gold', 'white', 'blue', 'red', 'cream', 'olive'],
  koi_platinum: ['white', 'red', 'yellow', 'black', 'purple', 'gold', 'cream', 'wine'],
  redtail_cat: ['red', 'cream', 'black', 'gold', 'white', 'purple', 'wine', 'silver'],
  arowana: ['gold', 'red', 'green', 'blue', 'white', 'purple', 'wine', 'silver'],
  arowana_blue: ['blue', 'gold', 'white', 'red', 'purple', 'silver', 'black', 'cream'],
  ray_crown: ['gold', 'black', 'white', 'red', 'purple', 'silver', 'cream', 'olive'],
  ray_albino: ['white', 'gold', 'yellow', 'purple', 'cream', 'red', 'silver', 'wine'],
  arapaima: ['silver', 'red', 'olive', 'gold', 'black', 'wine', 'cream', 'green'],
  turtle_slider: ['olive', 'yellow', 'red', 'black', 'white', 'cream', 'gold', 'green'],
  turtle_pig: ['silver', 'black', 'white', 'gold', 'cream', 'olive', 'wine', 'red'],
  turtle_map: ['olive', 'yellow', 'black', 'white', 'green', 'gold', 'cream', 'red']
}

export const MORPH_PALETTE_VER = 7

function speciesPool(speciesKey) {
  return SPECIES_COLOR_POOLS[speciesKey] || SPECIES_COLOR_POOLS.betta
}

export const FISH_MORPHS = Object.fromEntries(
  Object.entries(SPECIES_COLOR_POOLS).map(([key, colors]) => [
    key,
    colors.map((id) => ({ id, color: id, w: 10, art: FISH_COLORS[id]?.art || 'a' }))
  ])
)

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
    return marks
  }

  if (kind === 'spots') {
    const src = Array.isArray(parent?.dots) ? parent.dots : null
    const n = src ? src.length : (opts.dense ? 16 : 8) + Math.floor(rand() * 8)
    const dots = []
    for (let i = 0; i < n; i++) {
      const d = src?.[i]
      dots.push({
        x: jitterAround(d?.x ?? 48 + rand() * 38, 6, 40, 92, rand, src ? amount : 1),
        y: jitterAround(d?.y ?? 32 + rand() * 32, 6, 28, 70, rand, src ? amount : 1),
        r: jitterAround(d?.r ?? 1.05 + rand() * (opts.dense ? 0.9 : 0.55), 0.35, 0.8, 2.4, rand, src ? amount : 1)
      })
    }
    return { dots }
  }

  if (kind === 'marble') {
    const big = !!opts.blocks
    const fallback = big
      ? [
          { x: 28, y: 38, w: 54, h: 38 },
          { x: 72, y: 58, w: 48, h: 34 },
          { x: 50, y: 24, w: 36, h: 28 },
          { x: 62, y: 46, w: 30, h: 24 }
        ]
      : [
          { x: 32, y: 40, w: 40, h: 28 },
          { x: 68, y: 58, w: 34, h: 24 },
          { x: 54, y: 28, w: 22, h: 18 }
        ]
    const blobs = (parent?.blobs || fallback).map((b) => ({
      x: jitterAround(b.x, big ? 18 : 16, 16, 84, rand, amount || 1),
      y: jitterAround(b.y, big ? 16 : 14, 20, 74, rand, amount || 1),
      w: jitterAround(b.w, big ? 16 : 12, big ? 22 : 16, big ? 62 : 48, rand, amount || 1),
      h: jitterAround(b.h, big ? 14 : 10, big ? 18 : 12, big ? 48 : 36, rand, amount || 1)
    }))
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
  const mix0 = opts.mix != null ? Number(opts.mix) : 0.24
  return {
    bodySat: jitterAround(parent?.bodySat ?? 1, 0.2, 0.78, 1.22, rand, amount),
    bodyBri: jitterAround(parent?.bodyBri ?? 1, 0.14, 0.86, 1.16, rand, amount),
    bodyHue: jitterAround(parent?.bodyHue ?? 0, 8, -10, 10, rand, amount),
    tailSat: jitterAround(parent?.tailSat ?? 1, 0.2, 0.78, 1.24, rand, amount),
    tailBri: jitterAround(parent?.tailBri ?? 1, 0.14, 0.86, 1.16, rand, amount),
    tailHue: jitterAround(parent?.tailHue ?? 0, 8, -12, 12, rand, amount),
    wx: jitterAround(parent?.wx ?? (ray ? 48 : 64), 28, 24, 90, rand, amount),
    wy: jitterAround(parent?.wy ?? 46, 18, 26, 72, rand, amount),
    ww: jitterAround(parent?.ww ?? 36, 22, 18, 62, rand, amount),
    wh: jitterAround(parent?.wh ?? 30, 18, 16, 52, rand, amount),
    mix: jitterAround(parent?.mix ?? mix0, 0.12, 0.06, 0.5, rand, amount)
  }
}

function colorPart(colorId, shadeId, rand = Math.random) {
  const c = FISH_COLORS[colorId] || FISH_COLORS.red
  const sh = SHADES[shadeId] || SHADES.mid
  const satJ = 1 + (rand() - 0.5) * 0.1
  const briJ = 1 + (rand() - 0.5) * 0.08
  if (c.tint) {
    return {
      tint: c.tint,
      s: clamp((Number(c.s) || 1) * sh.sat * satJ, 0.35, 1.45),
      b: clamp((Number(c.b) || 1) * sh.bri * briJ, 0.48, 1.36)
    }
  }
  return {
    h: (Number(c.h) || 0) + (rand() - 0.5) * 6,
    s: clamp((Number(c.s) || 1) * sh.sat * satJ, 0.05, 1.4),
    b: clamp((Number(c.b) || 1) * sh.bri * briJ, 0.48, 1.4)
  }
}

function overlayForPattern(pattern) {
  if (pattern === 'spots') return 'spots'
  if (pattern === 'marble' || pattern === 'blocks') return 'marble'
  if (pattern === 'panda') return 'panda'
  return ''
}

export function geneFromMorph(morph) {
  if (morph?.gene?.bodyColor) return { ...morph.gene }
  const tint = morph?.body?.tint || morph?.tail?.tint
  let bodyColor = morph?.color || ''
  if (!FISH_COLORS[bodyColor]) {
    if (tint === 'blue') bodyColor = 'blue'
    else if (tint === 'red') bodyColor = 'red'
    else if (tint === 'gold') bodyColor = 'gold'
    else if (tint === 'green') bodyColor = 'green'
    else if (tint === 'yellow') bodyColor = 'yellow'
    else if (tint === 'purple') bodyColor = 'purple'
    else if (Number(morph?.body?.s) < 0.22 && Number(morph?.body?.b) > 1.12) bodyColor = 'white'
    else if (Number(morph?.body?.b) < 0.78) bodyColor = 'black'
    else bodyColor = 'olive'
  }
  const tailTint = morph?.tail?.tint
  let tailColor = bodyColor
  if (tailTint === 'blue') tailColor = 'blue'
  else if (tailTint === 'red') tailColor = 'red'
  else if (tailTint === 'gold') tailColor = 'gold'
  else if (tailTint === 'purple') tailColor = 'purple'
  else if (tailTint === 'yellow') tailColor = 'yellow'
  const pattern = morph?.overlay === 'spots' ? 'spots' : morph?.overlay === 'panda' ? 'panda' : morph?.overlay === 'marble' ? 'marble' : 'solid'
  const bri = Number(morph?.body?.b)
  const shade = bri < 0.8 ? 'dark' : bri < 0.92 ? 'deep' : bri > 1.22 ? 'light' : bri > 1.1 ? 'pale' : 'mid'
  return {
    bodyColor,
    tailColor,
    markColor: tailColor !== bodyColor ? tailColor : bodyColor,
    bodyShade: shade,
    tailShade: shade,
    markShade: shade,
    shine: Number(morph?.shine) || 1,
    pattern,
    glow: Math.max(0, Math.min(2, Math.floor(Number(morph?.gene?.glow ?? morph?.glow) || 0))),
    size: clamp(Number(morph?.gene?.size ?? morph?.size) || 1, 0.9, 1.62),
    length: clamp(Number(morph?.gene?.length ?? morph?.length) || 1, 0.9, 1.72),
    girth: clamp(Number(morph?.gene?.girth ?? morph?.girth) || 1, 0.9, 1.62)
  }
}

export function glowHueForColor(colorId) {
  const id = String(colorId || '')
  if (id === 'red' || id === 'wine' || id === 'copper') return { hue: 0, css: 'rgba(255, 72, 88, 0.92)', label: '紅' }
  if (id === 'blue' || id === 'teal') return { hue: 206, css: 'rgba(72, 168, 255, 0.92)', label: '藍' }
  if (id === 'purple') return { hue: 272, css: 'rgba(188, 92, 255, 0.9)', label: '紫' }
  if (id === 'green') return { hue: 128, css: 'rgba(72, 230, 120, 0.88)', label: '綠' }
  if (id === 'gold' || id === 'yellow' || id === 'cream') return { hue: 38, css: 'rgba(255, 196, 72, 0.9)', label: '金' }
  if (id === 'white' || id === 'silver') return { hue: 200, css: 'rgba(210, 236, 255, 0.88)', label: '白' }
  return { hue: 0, css: 'rgba(255, 120, 140, 0.85)', label: '紅' }
}

export function glowLabel(glow) {
  const n = Math.max(0, Math.min(2, Math.floor(Number(glow) || 0)))
  if (n >= 2) return '發光'
  if (n === 1) return '微光'
  return ''
}

function packGene(g) {
  if (!g?.bodyColor) return null
  return {
    bodyColor: g.bodyColor,
    tailColor: g.tailColor || g.bodyColor,
    markColor: g.markColor || g.tailColor || g.bodyColor,
    bodyShade: g.bodyShade || g.shade || 'mid',
    tailShade: g.tailShade || g.shade || 'mid',
    markShade: g.markShade || 'mid',
    shine: Number(g.shine) || 1,
    pattern: g.pattern || 'solid',
    glow: Math.max(0, Math.min(2, Math.floor(Number(g.glow) || 0))),
    size: clamp(Number(g.size) || 1, 0.9, 1.62),
    length: clamp(Number(g.length) || 1, 0.9, 1.72),
    girth: clamp(Number(g.girth) || 1, 0.9, 1.62)
  }
}

export function ensureMorphLineage(morph) {
  if (!morph?.body && !morph?.gene) return morph
  if (Array.isArray(morph.lineage) && morph.lineage.length) return morph
  const self = packGene(morph.gene || geneFromMorph(morph))
  return { ...morph, lineage: self ? [self] : [] }
}

function collectGenes(morph) {
  const out = []
  const seen = new Set()
  const push = (row) => {
    const g = packGene(row?.gene ? row.gene : row)
    if (!g) return
    const k = `${g.bodyColor}:${g.tailColor}:${g.pattern}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(g)
  }
  push(morph)
  ;(Array.isArray(morph?.lineage) ? morph.lineage : []).forEach(push)
  return out
}

function collectColors(genes) {
  const set = new Set()
  genes.forEach((g) => {
    if (g.bodyColor) set.add(g.bodyColor)
    if (g.tailColor) set.add(g.tailColor)
    if (g.markColor) set.add(g.markColor)
  })
  return [...set]
}

function rollFryGene(species, rand) {
  const pool = speciesPool(species)
  const color = pick(pool, rand)
  const shade = pick(SHADE_IDS, rand)
  const shine = pickWeighted(SHINE, rand).id
  const r = rand()
  const pattern = r < 0.88 ? 'solid' : r < 0.95 ? 'wash' : 'spots'
  const tailShade = rand() < 0.22 ? pick(SHADE_IDS, rand) : shade
  return {
    bodyColor: color,
    tailColor: color,
    markColor: color,
    bodyShade: shade,
    tailShade,
    markShade: shade,
    shine,
    pattern,
    glow: 0,
    size: 1,
    length: 1,
    girth: 1
  }
}

function paintFromGene(species, gene, extra = {}) {
  const rand = extra.seed != null ? makeRng(hashToSeed(String(extra.seed))) : Math.random
  const g = packGene(gene) || rollFryGene(species, rand)
  const pattern = g.pattern || 'solid'
  const overlay = overlayForPattern(pattern)
  const markSeed = extra.seed != null ? hashToSeed(`${extra.seed}:mark`) : undefined
  const washMix = pattern === 'wash' ? 0.4 : pattern === 'solid' ? 0.08 : 0.22
  const body = extra.stable
    ? colorPart(g.bodyColor, g.bodyShade, () => 0.5)
    : colorPart(g.bodyColor, g.bodyShade, rand)
  const tail = extra.stable
    ? colorPart(g.tailColor, g.tailShade, () => 0.5)
    : colorPart(g.tailColor, g.tailShade, rand)
  const overlayPart = overlay
    ? colorPart(g.markColor || g.tailColor, g.markShade || 'mid', extra.stable ? () => 0.5 : rand)
    : undefined
  return {
    v: MORPH_PALETTE_VER,
    id: `gene-${g.bodyColor}-${g.tailColor}-${pattern}-${g.bodyShade}`,
    gene: g,
    color: g.bodyColor,
    w: pattern === 'solid' ? 16 : 8,
    overlay,
    overlayPart,
    art: FISH_COLORS[g.bodyColor]?.art || 'a',
    shine: g.shine,
    glow: g.glow,
    size: g.size,
    length: g.length,
    girth: g.girth,
    lineage: Array.isArray(extra.lineage) ? extra.lineage : undefined,
    marks: extra.marks !== undefined
      ? extra.marks
      : overlay
        ? rollOverlayMarks(overlay, species, {
            parent: extra.parentMarks,
            inherit: extra.inheritMarks,
            seed: markSeed,
            blocks: pattern === 'blocks',
            dense: pattern === 'spots' && extra.dense
          })
        : null,
    wash: extra.wash !== undefined
      ? extra.wash
      : rollColorWash(species, {
          parent: extra.parentWash,
          inherit: extra.inheritMarks,
          seed: markSeed != null ? Number(markSeed) + 97 : undefined,
          mix: washMix
        }),
    body,
    tail
  }
}

export function rollFishMorph(speciesKey, extra = {}) {
  const species = speciesKey || 'betta'
  if (extra.gene) return ensureMorphLineage(paintFromGene(species, extra.gene, extra))
  if (extra.from?.gene) return ensureMorphLineage(paintFromGene(species, extra.from.gene, { ...extra, lineage: extra.lineage || extra.from.lineage }))
  if (extra.from?.body || extra.template?.body) {
    const src = extra.from || extra.template
    return ensureMorphLineage(paintFromGene(species, geneFromMorph(src), {
      ...extra,
      lineage: extra.lineage || src.lineage,
      parentMarks: src.marks,
      parentWash: src.wash
    }))
  }
  const rand = extra.seed != null ? makeRng(hashToSeed(extra.seed)) : Math.random
  const gene = extra.fry === false && extra.template?.color
    ? geneFromMorph(extra.template)
    : rollFryGene(species, rand)
  if (extra.shine != null) gene.shine = extra.shine
  return ensureMorphLineage(paintFromGene(species, gene, extra))
}

export function morphById(speciesKey, id) {
  const pool = FISH_MORPHS[speciesKey] || []
  return pool.find((x) => x.id === id) || null
}

export function rarityLabel(weight) {
  const w = Number(weight) || 0
  if (w >= 16) return '常見'
  if (w >= 10) return '少見'
  return '稀有'
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
  if (name === 'purple') {
    return `grayscale(1) sepia(1) hue-rotate(${(258 + hueAdd).toFixed(1)}deg) saturate(${(4.8 * satMul).toFixed(2)}) brightness(${(0.68 * bri).toFixed(2)})`
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
    return tintFilter(part.tint, shine, {
      sat: satMul * (Number(part.s) || 1),
      bri: briMul * (Number(part.b) || 1),
      hue: hueAdd
    })
  }
  const hue = ((Number(part?.h) || 0) + hueAdd) * t
  const gray = clamp(1 - t, 0, 1)
  const sat = (Number(part?.s) || 1) * satMul * (0.12 + 0.88 * t)
  const bri = (Number(part?.b) || 1) * shineBri(shine) * briMul * (1.1 - 0.1 * t)
  const contrast = 0.88 + 0.12 * t
  return `grayscale(${gray.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) contrast(${contrast.toFixed(2)})`
}

export function morphPartFilters(morph, reveal) {
  const rec = morph && morph.body ? morph : rollFishMorph('betta', { fry: true, stable: true, seed: 'fallback' })
  const t = clamp(Number(reveal) || 0, 0, 1)
  const wash = rec.wash || {}
  const overlayKind = t < 0.12 ? '' : rec.overlay || ''
  const overlayOpacity = overlayKind ? clamp((t - 0.12) / 0.7, 0.08, 0.92) : 0
  const overlayPart =
    rec.overlayPart ||
    (overlayKind === 'panda'
      ? { h: 0, s: 0.05, b: 0.32 }
      : overlayKind === 'spots'
        ? { h: 18, s: 0.4, b: 1.22 }
        : overlayKind === 'marble'
          ? { h: 0, s: 0.2, b: 1.18 }
          : null)
  const overlayFilter = overlayPart ? partCss(overlayPart, t, rec.shine) : ''
  const bodyWash = { sat: wash.bodySat, bri: wash.bodyBri, hue: wash.bodyHue }
  const tailWash = { sat: wash.tailSat, bri: wash.tailBri, hue: wash.tailHue }
  const washMask =
    t > 0.2 && wash.wx != null
      ? ellipseCss(Number(wash.ww) || 36, Number(wash.wh) || 30, Number(wash.wx) || 64, Number(wash.wy) || 46, 42, 78)
      : ''
  const washOn = rec.gene?.pattern === 'wash' || Number(wash.mix) > 0.18
  return {
    body: partCss(rec.body, t, rec.shine, bodyWash),
    tail: partCss(rec.tail, t, rec.shine, tailWash),
    overlay: overlayKind,
    overlayFilter,
    overlayOpacity,
    overlayMask: overlayKind ? overlayMaskImage(overlayKind, rec.marks) : '',
    washMask,
    washFilter: partCss(rec.overlayPart || rec.tail || rec.body, t, rec.shine, {
      sat: (Number(wash.bodySat) || 1) * 1.18,
      bri: (Number(wash.bodyBri) || 1) * 0.92,
      hue: (Number(wash.bodyHue) || 0) + (Number(wash.tailHue) || 0) * 0.25
    }),
    washOpacity: t > 0.2 && washOn ? clamp(Number(wash.mix) || 0.22, 0.08, 0.52) : t > 0.2 ? clamp(Number(wash.mix) || 0.08, 0.04, 0.16) : 0,
    glow: Number(rec.gene?.glow) || 0,
    glowAura: glowAuraStyle(rec.gene, t)
  }
}

function glowAuraStyle(gene, reveal) {
  const glow = Math.max(0, Math.min(2, Math.floor(Number(gene?.glow) || 0)))
  const t = clamp(Number(reveal) || 0, 0, 1)
  if (glow <= 0 || t < 0.32) return null
  const tone = glowHueForColor(gene?.bodyColor)
  const strength = glow === 1 ? 0.28 + 0.42 * t : 0.5 + 0.5 * t
  const blur = glow === 1 ? 7 + 6 * t : 12 + 10 * t
  const css = tone.css.replace(/0\.\d+\)$/, `${strength.toFixed(2)})`)
  return {
    filter: `drop-shadow(0 0 ${blur.toFixed(1)}px ${css}) drop-shadow(0 0 ${(blur * 0.45).toFixed(1)}px ${css})`
  }
}

function catalogRow(speciesKey, gene, seed, tag) {
  const morph = paintFromGene(speciesKey, gene, { seed, stable: true })
  return {
    id: `${morph.id}-${tag || 'n'}`,
    art: morph.art,
    tag: tag || '',
    form: { size: gene.size || 1, length: gene.length || 1, girth: gene.girth || 1 },
    parts: morphPartFilters(morph, 1),
    samples: [morphPartFilters(morph, 1)]
  }
}

export function listSpeciesMorphLooks(speciesKey) {
  const pool = speciesPool(speciesKey)
  const patterns = ['solid', 'wash', 'spots', 'marble', 'blocks', 'panda']
  const rows = []
  pool.forEach((color, i) => {
    const gene = {
      bodyColor: color,
      tailColor: color,
      markColor: color,
      bodyShade: SHADE_IDS[i % SHADE_IDS.length],
      tailShade: SHADE_IDS[(i + 1) % SHADE_IDS.length],
      markShade: SHADE_IDS[i % SHADE_IDS.length],
      shine: i % 3,
      pattern: 'solid'
    }
    const morph = paintFromGene(speciesKey, gene, { seed: `${speciesKey}-solid-${i}`, stable: true })
    rows.push({
      id: morph.id,
      art: morph.art,
      tag: '',
      parts: morphPartFilters(morph, 1),
      samples: [0, 1, 2].map((shine) =>
        morphPartFilters(paintFromGene(speciesKey, { ...gene, shine }, { seed: `${speciesKey}-s-${i}-${shine}`, stable: true }), 1)
      )
    })
  })
  for (let i = 0; i < 16; i++) {
    const a = pool[i % pool.length]
    const b = pool[(i + 3) % pool.length]
    const pattern = patterns[1 + (i % (patterns.length - 1))]
    const gene = {
      bodyColor: a,
      tailColor: pattern === 'wash' ? a : b,
      markColor: b,
      bodyShade: SHADE_IDS[i % SHADE_IDS.length],
      tailShade: SHADE_IDS[(i + 2) % SHADE_IDS.length],
      markShade: SHADE_IDS[(i + 1) % SHADE_IDS.length],
      shine: (i + 1) % 3,
      pattern
    }
    const morph = paintFromGene(speciesKey, gene, { seed: `${speciesKey}-mix-${i}`, stable: true })
    rows.push({
      id: morph.id,
      art: morph.art,
      tag: '',
      parts: morphPartFilters(morph, 1),
      samples: [0, 1, 2].map((k) =>
        morphPartFilters(
          paintFromGene(speciesKey, { ...gene, bodyShade: SHADE_IDS[k % SHADE_IDS.length], shine: k }, { seed: `${speciesKey}-m-${i}-${k}`, stable: true }),
          1
        )
      )
    })
  }
  const extras = []
  const glowColors = pool.filter((c) => c === 'red' || c === 'wine' || c === 'blue' || c === 'teal')
  if (!glowColors.includes('red') && pool.includes('copper')) glowColors.push('red')
  ;['red', 'blue'].forEach((c) => {
    if (!glowColors.includes(c) && pool.includes(c)) glowColors.push(c)
  })
  const uniqueGlow = [...new Set(glowColors.length ? glowColors : pool.filter((c) => c === 'red' || c === 'blue'))]
  uniqueGlow.forEach((color) => {
    const tone = glowHueForColor(color)
    extras.push(catalogRow(speciesKey, {
      bodyColor: color, tailColor: color, markColor: color, bodyShade: 'mid', tailShade: 'mid', markShade: 'mid', shine: 2, pattern: 'solid', glow: 1
    }, `${speciesKey}-glow1-${color}`, `${tone.label}微光`))
    extras.push(catalogRow(speciesKey, {
      bodyColor: color, tailColor: color, markColor: color, bodyShade: 'pale', tailShade: 'pale', markShade: 'mid', shine: 2, pattern: 'solid', glow: 2
    }, `${speciesKey}-glow2-${color}`, `${tone.label}發光`))
  })
  const base = pool[0]
  extras.push(catalogRow(speciesKey, {
    bodyColor: base, tailColor: base, markColor: base, bodyShade: 'mid', tailShade: 'mid', markShade: 'mid', shine: 1, pattern: 'solid', size: 1.28
  }, `${speciesKey}-giant`, '巨體'))
  extras.push(catalogRow(speciesKey, {
    bodyColor: base, tailColor: base, markColor: base, bodyShade: 'mid', tailShade: 'mid', markShade: 'mid', shine: 1, pattern: 'solid', length: 1.38
  }, `${speciesKey}-long`, '長體'))
  extras.push(catalogRow(speciesKey, {
    bodyColor: base, tailColor: pool[1] || base, markColor: pool[1] || base, bodyShade: 'deep', tailShade: 'mid', markShade: 'mid', shine: 1, pattern: 'solid', girth: 1.36, size: 1.08
  }, `${speciesKey}-fat`, '寬胖'))
  extras.push(catalogRow(speciesKey, {
    bodyColor: uniqueGlow[0] || base, tailColor: uniqueGlow[0] || base, markColor: uniqueGlow[0] || base, bodyShade: 'pale', tailShade: 'pale', markShade: 'mid', shine: 2, pattern: 'marble', glow: 2, size: 1.18, length: 1.12
  }, `${speciesKey}-glow-giant`, '發光巨體'))
  return rows.slice(0, 24).concat(extras)
}

function pickShade(parentGene, rand) {
  if (parentGene?.bodyShade && rand() < 0.42) return parentGene.bodyShade
  return pick(SHADE_IDS, rand)
}

function mixGlowGene(momG, dadG, gen, rand) {
  const parentGlow = Math.max(Number(momG.glow) || 0, Number(dadG.glow) || 0)
  let glow = 0
  if (parentGlow > 0) {
    if (rand() < 0.64) glow = parentGlow
    else if (rand() < 0.22) glow = Math.max(1, parentGlow - 1)
  }
  if (gen >= 4) {
    if (rand() < 0.24) glow = Math.max(glow, 1)
    if (rand() < 0.14) glow = 2
  } else if (gen >= 3) {
    if (rand() < 0.09) glow = Math.max(glow, 1)
    if (rand() < 0.025) glow = 2
  } else if (rand() < 0.01) glow = 1
  return Math.max(0, Math.min(2, glow))
}

function mixFormGene(momG, dadG, gen, rand) {
  const avg = (key) => {
    const a = Number(momG[key])
    const b = Number(dadG[key])
    return ((Number.isFinite(a) ? a : 1) + (Number.isFinite(b) ? b : 1)) / 2
  }
  let size = avg('size')
  let length = avg('length')
  let girth = avg('girth')
  const chance = Math.min(0.48, 0.06 + gen * 0.055)
  const bump = 0.035 + gen * 0.016
  if (rand() < chance) {
    const kind = rand()
    if (kind < 0.25) size += bump + rand() * bump
    else if (kind < 0.5) length += bump + rand() * bump
    else if (kind < 0.75) girth += bump + rand() * bump
    else {
      size += bump * 0.55
      girth += bump
      length += bump * 0.35
    }
  }
  return {
    size: clamp(size, 0.92, 1.58),
    length: clamp(length, 0.92, 1.68),
    girth: clamp(girth, 0.92, 1.58)
  }
}

export function mixParentMorphs(species, mother, father, prettier, extra = {}) {
  const momG = geneFromMorph(mother)
  const dadG = geneFromMorph(father)
  const family = [...collectGenes(mother), ...collectGenes(father)]
  const parentColors = collectColors([momG, dadG])
  const familyColors = collectColors(family)
  const grands = familyColors.filter((c) => !parentColors.includes(c))
  const rand = Math.random
  const lineage = family.map(packGene).filter(Boolean).slice(0, 8)
  const gen = Math.max(1, Number(extra.generation) || 1)

  const pickFamilyColor = () => {
    const r = rand()
    if (r < 0.05) {
      const outsiders = ALL_COLOR_IDS.filter((c) => !familyColors.includes(c))
      return pick(outsiders.length ? outsiders : ALL_COLOR_IDS, rand)
    }
    if (r < 0.14 && grands.length) return pick(grands, rand)
    if (r < 0.57) return pick([momG.bodyColor, momG.tailColor, momG.markColor].filter(Boolean), rand)
    return pick([dadG.bodyColor, dadG.tailColor, dadG.markColor].filter(Boolean), rand)
  }

  const bodyColor = pickFamilyColor()
  let tailColor = rand() < 0.36 ? bodyColor : pickFamilyColor()
  let markColor = tailColor !== bodyColor ? tailColor : pickFamilyColor()
  const twoTone = bodyColor !== tailColor || bodyColor !== markColor
  const pr = rand()
  let pattern = 'solid'
  if (twoTone) {
    if (pr < 0.26) pattern = 'marble'
    else if (pr < 0.46) pattern = 'blocks'
    else if (pr < 0.66) pattern = 'spots'
    else if (pr < 0.78 && (bodyColor === 'white' || tailColor === 'black' || bodyColor === 'black')) pattern = 'panda'
    else if (pr < 0.9) pattern = 'wash'
    else pattern = 'solid'
  } else if (pr < 0.16) pattern = 'wash'
  else if (pr < 0.26) pattern = 'spots'
  else if (pr < 0.32) pattern = 'marble'

  const form = mixFormGene(momG, dadG, gen, rand)
  const gene = {
    bodyColor,
    tailColor,
    markColor: pattern === 'solid' ? tailColor : markColor,
    bodyShade: pickShade(momG, rand),
    tailShade: pickShade(dadG, rand),
    markShade: pick(SHADE_IDS, rand),
    shine: prettier ? Math.max(Number(momG.shine) || 1, Number(dadG.shine) || 1, pickWeighted(SHINE, rand).id) : pickWeighted(SHINE, rand).id,
    pattern,
    glow: mixGlowGene(momG, dadG, gen, rand),
    size: form.size,
    length: form.length,
    girth: form.girth
  }

  return paintFromGene(species, gene, {
    lineage,
    parentMarks: mother?.marks || father?.marks,
    parentWash: mother?.wash || father?.wash,
    inheritMarks: pattern === mother?.gene?.pattern || pattern === father?.gene?.pattern
  })
}
