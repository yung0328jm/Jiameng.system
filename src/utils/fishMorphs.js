function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

function pickWeighted(list) {
  const rows = list || []
  const total = rows.reduce((s, x) => s + (Number(x.w) || 1), 0)
  let r = Math.random() * Math.max(total, 1)
  for (const row of rows) {
    r -= Number(row.w) || 1
    if (r <= 0) return row
  }
  return rows[0] || null
}

/**
 * Palettes are hue-rotate offsets from each species sprite:
 * gold arowana (warm gold), blue-base arowana (gold + blue-grey tail),
 * betta (blue body, red/cyan fins), motoro ray (brown + gold ocelli),
 * albino ray (cream + yellow crown), arapaima (olive-silver + red tail).
 */
export const FISH_MORPHS = {
  arowana: [
    { id: 'gold', label: '金龍', w: 20, body: { h: 4, s: 1.12, b: 1.04 }, tail: { h: 2, s: 1.05, b: 1.0 } },
    { id: 'xbg', label: '過背金', w: 10, body: { h: 10, s: 1.22, b: 1.1 }, tail: { h: 8, s: 1.12, b: 1.04 } },
    { id: 'rtg', label: '紅尾金龍', w: 16, body: { h: 6, s: 1.1, b: 1.04 }, tail: { h: -28, s: 1.38, b: 0.94 } },
    { id: 'chili', label: '辣椒紅龍', w: 8, body: { h: -30, s: 1.42, b: 0.94 }, tail: { h: -34, s: 1.32, b: 0.9 } },
    { id: 'blood', label: '血紅', w: 5, body: { h: -38, s: 1.36, b: 0.88 }, tail: { h: -22, s: 1.22, b: 0.86 } },
    { id: 'green', label: '青龍', w: 9, body: { h: 78, s: 0.62, b: 1.0 }, tail: { h: 92, s: 0.68, b: 0.96 } },
    { id: 'gold_blue', label: '金藍混搭', w: 10, body: { h: 6, s: 1.14, b: 1.06 }, tail: { h: 168, s: 1.16, b: 1.02 } },
    { id: 'red_blue', label: '紅藍混搭', w: 8, body: { h: -26, s: 1.28, b: 0.96 }, tail: { h: 172, s: 1.12, b: 1.04 } },
    { id: 'pearl', label: '珍珠金', w: 6, overlay: 'spots', body: { h: 8, s: 0.88, b: 1.16 }, tail: { h: 12, s: 1.02, b: 1.08 } }
  ],
  arowana_blue: [
    { id: 'mgbb', label: '藍底過背', w: 22, body: { h: 18, s: 0.72, b: 1.08 }, tail: { h: 8, s: 1.12, b: 1.04 } },
    { id: 'blue_gold', label: '藍底金鱗', w: 16, body: { h: -6, s: 1.18, b: 1.1 }, tail: { h: 4, s: 1.0, b: 1.02 } },
    { id: 'blue_red', label: '藍底紅尾', w: 12, body: { h: 10, s: 0.85, b: 1.04 }, tail: { h: -155, s: 1.28, b: 0.96 } },
    { id: 'highback', label: '高背金', w: 8, body: { h: -4, s: 1.24, b: 1.12 }, tail: { h: 12, s: 0.78, b: 1.06 } },
    { id: 'silver', label: '銀龍', w: 10, body: { h: 8, s: 0.14, b: 1.22 }, tail: { h: 6, s: 0.22, b: 1.14 } }
  ],
  betta: [
    { id: 'solid_red', label: '紅鬥', w: 11, body: { h: 152, s: 1.32, b: 1.0 }, tail: { h: -8, s: 1.24, b: 0.98 } },
    { id: 'solid_blue', label: '藍鬥', w: 11, body: { h: 0, s: 1.18, b: 1.02 }, tail: { h: 158, s: 1.14, b: 1.0 } },
    { id: 'bicolor', label: '雙色紅尾', w: 11, body: { h: 4, s: 1.12, b: 1.0 }, tail: { h: -12, s: 1.28, b: 0.98 } },
    { id: 'red_blue', label: '紅藍雙色', w: 10, body: { h: 150, s: 1.26, b: 0.98 }, tail: { h: 162, s: 1.16, b: 1.04 } },
    { id: 'butterfly', label: '蝴蝶', w: 9, body: { h: 6, s: 1.08, b: 1.02 }, tail: { h: 8, s: 0.28, b: 1.24 } },
    { id: 'panda', label: '熊貓', w: 8, overlay: 'panda', body: { h: 0, s: 0.06, b: 1.3 }, tail: { h: 0, s: 0.1, b: 0.42 } },
    { id: 'marble', label: '大理石', w: 9, overlay: 'marble', body: { h: 8, s: 0.72, b: 1.08 }, tail: { h: -10, s: 1.18, b: 1.0 } },
    { id: 'koi', label: '錦鯉', w: 8, overlay: 'marble', body: { h: 148, s: 1.18, b: 1.08 }, tail: { h: 0, s: 0.22, b: 1.26 } },
    { id: 'mustard', label: '芥末氣', w: 6, body: { h: 8, s: 0.62, b: 0.58 }, tail: { h: 48, s: 1.28, b: 1.12 } }
  ],
  ray_crown: [
    { id: 'crown', label: '皇冠', w: 24, body: { h: 2, s: 1.02, b: 1.0 }, tail: { h: 0, s: 0.95, b: 0.96 } },
    { id: 'panda', label: '熊貓', w: 10, overlay: 'panda', body: { h: 0, s: 0.05, b: 1.3 }, tail: { h: 0, s: 0.08, b: 0.48 } },
    { id: 'black_diamond', label: '黑鑽', w: 9, overlay: 'spots', body: { h: 8, s: 0.18, b: 0.48 }, tail: { h: 0, s: 0.12, b: 0.42 } },
    { id: 'leopard', label: '雪豹', w: 8, overlay: 'spots', body: { h: 18, s: 0.42, b: 1.16 }, tail: { h: 12, s: 0.32, b: 1.08 } }
  ],
  ray_albino: [
    { id: 'albino', label: '白子', w: 24, body: { h: 4, s: 0.55, b: 1.16 }, tail: { h: 2, s: 0.42, b: 1.12 } },
    { id: 'albino_panda', label: '白熊貓', w: 10, overlay: 'panda', body: { h: 6, s: 0.18, b: 1.28 }, tail: { h: 4, s: 0.22, b: 0.72 } },
    { id: 'golden', label: '金冠', w: 10, body: { h: 16, s: 1.22, b: 1.1 }, tail: { h: 10, s: 1.08, b: 1.06 } }
  ],
  arapaima: [
    { id: 'olive', label: '橄欖褐', w: 22, body: { h: 18, s: 0.78, b: 0.96 }, tail: { h: -6, s: 1.12, b: 0.98 } },
    { id: 'red_tail', label: '紅尾巨骨', w: 18, body: { h: 4, s: 0.72, b: 0.98 }, tail: { h: -8, s: 1.38, b: 1.02 } },
    { id: 'silver', label: '銀腹', w: 10, body: { h: 6, s: 0.16, b: 1.18 }, tail: { h: -10, s: 1.18, b: 1.0 } }
  ]
}

const SHINE = [
  { id: 0, label: '暗色', bri: 0.86, w: 22 },
  { id: 1, label: '普通', bri: 1, w: 58 },
  { id: 2, label: '高亮', bri: 1.16, w: 20 }
]

function jitterPart(part) {
  const p = part || { h: 0, s: 1, b: 1 }
  return {
    h: (Number(p.h) || 0) + (Math.random() - 0.5) * 8,
    s: clamp((Number(p.s) || 1) + (Math.random() - 0.5) * 0.08, 0.05, 1.45),
    b: clamp((Number(p.b) || 1) + (Math.random() - 0.5) * 0.05, 0.4, 1.35)
  }
}

export const MORPH_PALETTE_VER = 2

export function rollFishMorph(speciesKey, extra = {}) {
  const list = FISH_MORPHS[speciesKey] || FISH_MORPHS.betta
  const base = extra.template || pickWeighted(list) || list[0]
  const shine = extra.shine != null ? extra.shine : pickWeighted(SHINE).id
  return {
    v: MORPH_PALETTE_VER,
    id: base.id,
    label: base.label,
    overlay: base.overlay || '',
    shine,
    body: jitterPart(extra.body || base.body),
    tail: jitterPart(extra.tail || base.tail)
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

function partCss(part, reveal, shine) {
  const t = clamp(Number(reveal) || 0, 0, 1)
  if (t <= 0.001) {
    return 'grayscale(1) saturate(0) brightness(1.14) contrast(0.86)'
  }
  const hue = (Number(part?.h) || 0) * t
  const gray = clamp(1 - t, 0, 1)
  const sat = (Number(part?.s) || 1) * t
  const bri = (Number(part?.b) || 1) * shineBri(shine) * (1.12 - 0.12 * t)
  const contrast = 0.86 + 0.14 * t
  return `grayscale(${gray.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) contrast(${contrast.toFixed(2)})`
}

export function morphPartFilters(morph, reveal) {
  const rec = morph && morph.body ? morph : rollFishMorph('betta')
  const t = clamp(Number(reveal) || 0, 0, 1)
  const overlayKind = t < 0.12 ? '' : rec.overlay || ''
  const overlayOpacity = overlayKind ? clamp((t - 0.12) / 0.7, 0.08, 0.9) : 0
  const overlayFilter =
    overlayKind === 'panda'
      ? partCss({ h: 0, s: 0.05, b: 0.32 }, t, rec.shine)
      : overlayKind === 'spots'
        ? partCss({ h: 28, s: 0.35, b: 1.28 }, t, rec.shine)
        : overlayKind === 'marble'
          ? partCss({ h: 0, s: 0.18, b: 1.2 }, t, rec.shine)
          : ''
  return {
    body: partCss(rec.body, t, rec.shine),
    tail: partCss(rec.tail, t, rec.shine),
    overlay: overlayKind,
    overlayFilter,
    overlayOpacity
  }
}

export function mixParentMorphs(species, mother, father, prettier) {
  const list = FISH_MORPHS[species] || FISH_MORPHS.betta
  const rare = Math.random() < 0.28
  if (rare) {
    const rares = list.filter((x) => (x.w || 10) <= 10)
    return rollFishMorph(species, { template: pickWeighted(rares.length ? rares : list), shine: prettier ? 2 : undefined })
  }
  if (mother?.body && father?.tail && Math.random() < 0.42) {
    return rollFishMorph(species, {
      template: { id: 'hybrid', label: '混血顯色', w: 1, overlay: mother.overlay || father.overlay || '', body: mother.body, tail: father.tail },
      body: mother.body,
      tail: father.tail,
      shine: prettier ? Math.max(Number(mother.shine) || 1, Number(father.shine) || 1) : undefined
    })
  }
  const inherit = Math.random() < 0.55 ? mother : father
  const found = morphById(species, inherit?.id)
  return rollFishMorph(species, { template: found || pickWeighted(list), shine: inherit?.shine })
}
