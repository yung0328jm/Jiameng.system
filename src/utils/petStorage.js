import { syncKeyToSupabase } from './supabaseSync'
import { isGuestAccount, isGuestCloudWriteBlocked } from './guestAuth'
import { setFishSlots } from './effectStorage'
import {
  FISH_ADULT_CM,
  FISH_FRY_CM,
  FISH_PACKS,
  equipOneFishSkin,
  getAmbientFishRoster,
  getEquippedFishSlots,
  getFishSlotCount
} from './fishSkinStorage'
import { addItemToInventory, countInventoryItem, removeItemFromInventory } from './inventoryStorage'
import {
  FISH_POTION_AFFECTION_ID,
  FISH_POTION_BIRTH_ID,
  FISH_POTION_HEAT_ID,
  getItem
} from './itemStorage'
import { addTransaction, addWalletBalance } from './walletStorage'
import { FISH_MORPHS, MORPH_PALETTE_VER, mixParentMorphs, morphById, morphPartFilters, rarityLabel, rollColorWash, rollFishMorph, rollOverlayMarks, shineLabel } from './fishMorphs'

export const PET_STORAGE_KEY = 'jiameng_pets'
export const PET_ADULT_MEALS = 90
export const PET_DAILY_GROWTH_CAP = 5
export const PET_GROWTH_GAP_MS = 90 * 1000
/** Temporary: force these species to adult so size and color can be reviewed. */
export const PREVIEW_ADULT_SPECIES = ['arowana', 'arowana_blue']

export const PET_PAIR_MS = 7 * 24 * 60 * 60 * 1000
export const PET_PREGNANT_MS = 5 * 24 * 60 * 60 * 1000
export const PET_BIRTH_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000
export const PET_RELEASE_COINS = 5

function emptyUser() {
  return { names: {}, fedAt: {}, growth: {}, showcaseSlotId: '', born: {}, petBag: [], vacant: {} }
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readAll() {
  try {
    const raw = localStorage.getItem(PET_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function writeAll(data) {
  const val = JSON.stringify(data || {})
  localStorage.setItem(PET_STORAGE_KEY, val)
  if (!isGuestCloudWriteBlocked()) syncKeyToSupabase(PET_STORAGE_KEY, val)
}

export function getUserPets(username) {
  if (!username) return emptyUser()
  const row = readAll()[username] || {}
  return {
    names: row.names && typeof row.names === 'object' ? row.names : {},
    fedAt: row.fedAt && typeof row.fedAt === 'object' ? row.fedAt : {},
    growth: row.growth && typeof row.growth === 'object' ? row.growth : {},
    born: row.born && typeof row.born === 'object' ? row.born : {},
    petBag: Array.isArray(row.petBag) ? row.petBag : [],
    vacant: row.vacant && typeof row.vacant === 'object' ? row.vacant : {},
    showcaseSlotId: String(row.showcaseSlotId || '').trim()
  }
}

function saveUserPets(username, patch) {
  if (!username) return { success: false, message: '請先登入' }
  const all = readAll()
  const prev = all[username] || {}
  all[username] = { ...emptyUser(), ...prev, ...patch }
  try {
    writeAll(all)
    return { success: true }
  } catch (e) {
    console.error('Error saving pets:', e)
    return { success: false, message: '儲存失敗' }
  }
}

function colorFamily(speciesKey, preferHue) {
  const key = String(speciesKey || 'betta')
  if (key === 'arowana') return { hue: [-12, 22], sat: [0.95, 1.22], bri: [0.94, 1.08] }
  if (key === 'arowana_blue') return { hue: [168, 214], sat: [0.92, 1.22], bri: [0.92, 1.08] }
  if (key === 'ray_crown') return { hue: [-10, 18], sat: [0.82, 1.14], bri: [0.92, 1.08] }
  if (key === 'ray_albino') return { hue: [6, 28], sat: [0.52, 0.82], bri: [1.06, 1.2] }
  if (key === 'arapaima') return { hue: [-18, 12], sat: [0.9, 1.18], bri: [0.92, 1.08] }
  if (key === 'guppy') return { hue: [-20, 40], sat: [1.0, 1.32], bri: [0.94, 1.1] }
  if (key === 'gar') return { hue: [-14, 18], sat: [0.7, 1.08], bri: [0.9, 1.08] }
  if (key === 'genghis') return { hue: [-18, 14], sat: [0.35, 0.85], bri: [0.82, 1.12] }
  if (key === 'redtail_cat') return { hue: [-18, 10], sat: [0.55, 1.05], bri: [0.88, 1.08] }
  if (key === 'turtle_slider') return { hue: [-8, 22], sat: [0.85, 1.18], bri: [0.92, 1.08] }
  if (key === 'turtle_pig') return { hue: [-10, 12], sat: [0.35, 0.8], bri: [0.9, 1.12] }
  if (key === 'turtle_map') return { hue: [4, 28], sat: [0.75, 1.12], bri: [0.92, 1.08] }
  const betta = [
    { hue: [-18, 38], sat: [1.0, 1.32], bri: [0.94, 1.08] },
    { hue: [198, 242], sat: [0.95, 1.25], bri: [0.92, 1.08] },
    { hue: [268, 312], sat: [0.98, 1.28], bri: [0.92, 1.08] }
  ]
  if (Number.isFinite(preferHue)) {
    let best = betta[0]
    let bestD = Infinity
    betta.forEach((fam) => {
      const mid = (fam.hue[0] + fam.hue[1]) / 2
      const d = Math.abs(preferHue - mid)
      if (d < bestD) {
        bestD = d
        best = fam
      }
    })
    return best
  }
  return betta[Math.floor(Math.random() * betta.length)]
}

function randBetween(a, b) {
  return a + Math.random() * (b - a)
}

function randomGender() {
  return Math.random() < 0.5 ? 'm' : 'f'
}

function hatchRecord(itemId, speciesKey, extra = {}) {
  const fam = extra.fam || colorFamily(speciesKey, extra.preferHue)
  const growable = extra.growable !== false
  return {
    itemId: String(itemId || ''),
    species: String(speciesKey || 'betta'),
    gender: extra.gender || randomGender(),
    growable,
    generation: Number(extra.generation) || 0,
    pretty: !!extra.pretty,
    meals: growable ? 0 : PET_ADULT_MEALS,
    today: 0,
    day: '',
    lastCountAt: 0,
    hueMin: fam.hue[0],
    hueMax: fam.hue[1],
    satMin: fam.sat[0],
    satMax: fam.sat[1],
    briMin: fam.bri[0],
    briMax: fam.bri[1],
    hue: extra.hue != null ? extra.hue : randBetween(fam.hue[0], fam.hue[1]),
    sat: extra.sat != null ? extra.sat : randBetween(fam.sat[0], fam.sat[1]),
    bri: extra.bri != null ? extra.bri : randBetween(fam.bri[0], fam.bri[1]),
    morph: extra.morph || rollFishMorph(speciesKey, extra.pretty ? { shine: 2 } : {}),
    pregnant: false,
    pregnantAt: 0,
    courtshipAt: 0,
    courtshipMate: '',
    lastBirthAt: 0
  }
}

export function growthProgress(meals) {
  const t = clamp((Number(meals) || 0) / PET_ADULT_MEALS, 0, 1)
  return 1 - Math.pow(1 - t, 1.45)
}

export function growthScale(meals, speciesKey = 'betta') {
  const adult = FISH_ADULT_CM[speciesKey] || FISH_ADULT_CM.betta
  const fry = FISH_FRY_CM[speciesKey] || FISH_FRY_CM.betta
  const start = clamp(fry / adult, 0.18, 0.28)
  return start + (1 - start) * growthProgress(meals)
}

export function fishLengthCm(speciesKey, meals, growable = true) {
  const sp = speciesKey || 'betta'
  const adult = FISH_ADULT_CM[sp] || FISH_ADULT_CM.betta
  const fry = FISH_FRY_CM[sp] || FISH_FRY_CM.betta
  if (!growable) return adult
  return fry + (adult - fry) * growthProgress(meals)
}

export function formatFishLength(cm, speciesKey) {
  const n = Number(cm) || 0
  const key = String(speciesKey || '')
  const unit = key.startsWith('turtle') ? '甲長' : key.startsWith('ray') ? '盤徑' : '體長'
  const text = n < 20 ? String(Number(n.toFixed(1))) : String(Math.round(n))
  return `${unit} ${text} cm`
}

export function growthStage(meals, speciesKey) {
  const t = growthProgress(meals)
  const turtle = String(speciesKey || '').startsWith('turtle')
  if (t < 0.22) return { key: 'fry', label: turtle ? '幼體' : '魚苗' }
  if (t < 0.55) return { key: 'juvenile', label: turtle ? '幼龜' : '幼魚' }
  if (t < 0.88) return { key: 'subadult', label: '亞成' }
  return { key: 'adult', label: turtle ? '成體' : '成魚' }
}

export function colorReveal(t) {
  const x = clamp(t, 0, 1)
  if (x < 0.22) return 0
  if (x < 0.55) return 0.05 + ((x - 0.22) / 0.33) * 0.13
  if (x < 0.88) return 0.4 + ((x - 0.55) / 0.33) * 0.35
  return 0.92 + ((x - 0.88) / 0.12) * 0.08
}

export function colorFilterFromGrowth(rec, meals) {
  if (!rec) return ''
  const sp = rec.species || 'betta'
  const t = growthProgress(meals)
  const reveal = colorReveal(t)
  const hue = (Number(rec.hue) || 0) * reveal
  const gray = clamp(1 - reveal * 1.08, 0, 0.95)
  const sat = (Number(rec.sat) || 1) * (0.03 + 0.97 * reveal)
  const bri = (Number(rec.bri) || 1) * (1.38 - 0.38 * reveal)
  const contrast = 0.55 + 0.45 * reveal
  return `grayscale(${gray.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) contrast(${contrast.toFixed(2)})`
}

function fallbackMorph(speciesKey) {
  const list = FISH_MORPHS[speciesKey] || FISH_MORPHS.betta
  const base = list[0]
  return {
    id: base.id,
    label: base.label,
    overlay: base.overlay || '',
    art: base.art || 'a',
    shine: 1,
    body: { ...base.body },
    tail: { ...base.tail }
  }
}

function lookParts(rec, meals, speciesKey, growable) {
  const sp = rec?.species || speciesKey || 'betta'
  const reveal = growable ? colorReveal(growthProgress(meals)) : 1
  const morph = rec?.morph && rec.morph.body ? rec.morph : fallbackMorph(sp)
  const parts = morphPartFilters(morph, reveal)
  const cat = morphById(sp, morph.id)
  return {
    morph,
    parts,
    art: morph.art || cat?.art || 'a',
    rarity: cat ? rarityLabel(cat.w) : '',
    morphLabel: reveal < 0.12 ? '未顯色' : morph.label || '',
    shineText: reveal < 0.4 ? '' : shineLabel(morph.shine)
  }
}

function lookFromRecord(rec, growable, speciesKey) {
  const sp = rec?.species || speciesKey || 'betta'
  if (!growable || !rec) {
    const cm = fishLengthCm(sp, PET_ADULT_MEALS, false)
    const look = lookParts(rec, PET_ADULT_MEALS, sp, false)
    return {
      purchased: false,
      growable: false,
      scale: 1,
      filter: look.parts.body,
      parts: look.parts,
      morphLabel: look.morphLabel,
      shineText: look.shineText,
      art: look.art,
      rarity: look.rarity,
      meals: PET_ADULT_MEALS,
      progress: 1,
      stage: growthStage(PET_ADULT_MEALS, sp),
      gender: rec?.gender === 'f' ? 'f' : rec?.gender === 'm' ? 'm' : '',
      pregnant: !!rec?.pregnant,
      generation: 0,
      lengthCm: cm,
      lengthText: formatFishLength(cm, sp)
    }
  }
  const meals = Number(rec.meals) || 0
  const cm = fishLengthCm(sp, meals, true)
  const look = lookParts(rec, meals, sp, true)
  return {
    purchased: true,
    growable: true,
    scale: growthScale(meals, sp),
    filter: look.parts.body,
    parts: look.parts,
    morphLabel: look.morphLabel,
    shineText: look.shineText,
    art: look.art,
    rarity: look.rarity,
    meals,
    progress: growthProgress(meals),
    stage: growthStage(meals, sp),
    gender: rec.gender === 'f' ? 'f' : 'm',
    pregnant: !!rec.pregnant,
    generation: Number(rec.generation) || 0,
    lengthCm: cm,
    lengthText: formatFishLength(cm, sp)
  }
}

export function formatBreedRemain(ms) {
  const s = Math.max(0, Math.floor(Number(ms) || 0))
  const d = Math.floor(s / 86400000)
  const h = Math.floor((s % 86400000) / 3600000)
  const m = Math.floor((s % 3600000) / 60000)
  if (d > 0) return `${d}日${h}時`
  if (h > 0) return `${h}時${m}分`
  return `${Math.max(s > 0 ? 1 : 0, m)}分`
}

function breedingView(rec, now) {
  if (!rec) return null
  if (rec.pregnant) {
    const remain = Math.max(0, (Number(rec.pregnantAt) || 0) + PET_PREGNANT_MS - now)
    return {
      phase: 'pregnant',
      affectionPct: 100,
      remainMs: remain,
      barPct: Math.round((1 - remain / PET_PREGNANT_MS) * 100),
      title: '懷孕中',
      detail: `倒數 ${formatBreedRemain(remain)}`
    }
  }
  if (rec.lastBirthAt && now - Number(rec.lastBirthAt) < PET_BIRTH_COOLDOWN_MS) {
    const remain = Math.max(0, Number(rec.lastBirthAt) + PET_BIRTH_COOLDOWN_MS - now)
    return {
      phase: 'cooldown',
      affectionPct: 0,
      remainMs: remain,
      barPct: Math.round((1 - remain / PET_BIRTH_COOLDOWN_MS) * 100),
      title: '再配冷卻',
      detail: `交配倒數 ${formatBreedRemain(remain)}`
    }
  }
  if (rec.courtshipMate && rec.courtshipAt) {
    const elapsed = Math.max(0, now - Number(rec.courtshipAt))
    const pct = Math.min(100, Math.round((elapsed / PET_PAIR_MS) * 100))
    const remain = Math.max(0, PET_PAIR_MS - elapsed)
    return {
      phase: 'courtship',
      affectionPct: pct,
      remainMs: remain,
      barPct: pct,
      title: `好感度 ${pct}%`,
      detail: pct >= 100 ? '即將懷孕' : `交配倒數 ${formatBreedRemain(remain)}`
    }
  }
  return null
}

export function getPairBreedingMap(username) {
  if (!username) return {}
  const tank = getTankRoster(username)
  const cur = getUserPets(username)
  const now = Date.now()
  const defaultOnly = tank.filter((f) => !f.itemId && !cur.born?.[f.id])
  const emptyIds = new Set(defaultOnly.slice(2).map((f) => f.id))
  const map = {}
  const adults = []
  tank.forEach((fish) => {
    if (fish.showcase || emptyIds.has(fish.id)) return
    const rec = cur.growth?.[fish.id]
    if (!rec) return
    const growable = Boolean(fish.itemId) || Boolean(fish.born)
    const adult = !growable || growthStage(rec.meals).key === 'adult'
    if (adult) adults.push({ fish, rec })
  })
  adults.forEach(({ fish, rec }) => {
    const view = breedingView(rec, now)
    if (!view) return
    const partnerId = rec.courtshipMate || ''
    map[fish.id] = { ...view, partnerId }
    if (partnerId) map[partnerId] = { ...view, partnerId: fish.id }
  })
  const bySpecies = {}
  adults.forEach((row) => {
    const sp = row.rec.species || row.fish.key || 'betta'
    if (!bySpecies[sp]) bySpecies[sp] = { m: [], f: [] }
    if (row.rec.gender === 'f') bySpecies[sp].f.push(row)
    else bySpecies[sp].m.push(row)
  })
  Object.keys(bySpecies).forEach((sp) => {
    const males = bySpecies[sp].m
    const females = bySpecies[sp].f
    if (!males.length || !females.length) return
    females.forEach((fRow, i) => {
      const mRow = males[Math.min(i, males.length - 1)]
      if (!mRow) return
      if (map[fRow.fish.id] || fRow.rec.pregnant) return
      const remain = PET_PAIR_MS
      const idle = {
        phase: 'courtship',
        affectionPct: 0,
        remainMs: remain,
        barPct: 0,
        title: '好感度 0%',
        detail: `交配倒數 ${formatBreedRemain(remain)}`,
        partnerId: mRow.fish.id
      }
      map[fRow.fish.id] = idle
      if (!map[mRow.fish.id]) map[mRow.fish.id] = { ...idle, partnerId: fRow.fish.id }
    })
  })
  return map
}

export function genderLabel(gender) {
  if (gender === 'f') return '母'
  if (gender === 'm') return '公'
  return ''
}

function applyBornFish(username, roster) {
  const born = getUserPets(username).born || {}
  return (roster || []).map((f) => {
    if (f?.itemId) return { ...f, born: false }
    const b = born[f.id]
    if (!b?.species) return { ...f, born: false }
    const pack = FISH_PACKS[b.species] || FISH_PACKS.betta
    const variant = f.variant || 'a'
    return {
      ...f,
      key: pack.key,
      wide: !!pack.wide,
      shape: pack.shape || 'fish',
      src: variant === 'a' ? pack.a : pack.b,
      born: true,
      generation: Number(b.generation) || 1
    }
  })
}

export function getTankRoster(username) {
  const cur = getUserPets(username)
  return applyBornFish(username, getAmbientFishRoster(username)).filter((f) => {
    if (f.itemId || f.born) return true
    return !cur.vacant?.[f.id]
  })
}

function defaultPairSlots(username, cur) {
  const roster = getAmbientFishRoster(username)
  return roster.filter((f) => !f.itemId && !cur?.born?.[f.id] && !cur?.vacant?.[f.id])
}

function genderForDefaultPair(username, slotId, cur) {
  const defaults = defaultPairSlots(username, cur)
  const i = defaults.findIndex((f) => f.id === slotId)
  if (i === 0) return 'm'
  if (i === 1) return 'f'
  return ''
}

function maturePreviewSpecies(rec, species, growable) {
  if (!growable || !rec) return rec
  const sp = String(species || rec.species || '')
  if (!PREVIEW_ADULT_SPECIES.includes(sp)) return rec
  if ((Number(rec.meals) || 0) >= PET_ADULT_MEALS) return rec
  return {
    ...rec,
    meals: PET_ADULT_MEALS,
    today: PET_DAILY_GROWTH_CAP,
    lastCountAt: Date.now()
  }
}

function ensureRecord(cur, slotId, itemId, speciesKey, bornMeta, username) {
  const sid = String(slotId || '')
  const shop = String(itemId || '').trim()
  const growable = Boolean(shop) || Boolean(bornMeta)
  let rec = cur.growth[sid]
  const species = String(bornMeta?.species || speciesKey || rec?.species || 'betta')
  const mismatchShop = shop && rec && String(rec.itemId || '') !== shop
  const mismatchBorn = !shop && bornMeta && rec && rec.species !== bornMeta.species
  const becameDefault = !shop && !bornMeta && rec && rec.growable
  const pairGender = !shop && !bornMeta && username ? genderForDefaultPair(username, sid, cur) : ''
  if (!rec || mismatchShop || mismatchBorn || becameDefault) {
    rec = hatchRecord(shop, species, {
      growable,
      generation: Number(bornMeta?.generation) || 0,
      pretty: !!bornMeta?.pretty,
      preferHue: bornMeta?.hue,
      hue: bornMeta?.hue,
      sat: bornMeta?.sat,
      bri: bornMeta?.bri,
      fam: bornMeta?.fam,
      gender: pairGender || undefined
    })
    if (!rec.gender) rec.gender = pairGender || randomGender()
    rec = maturePreviewSpecies(rec, species, growable)
    return { rec, dirty: true }
  }
  let dirty = false
  if (!rec.gender) {
    rec = { ...rec, gender: pairGender || randomGender() }
    dirty = true
  }
  if (rec.growable == null) {
    rec = { ...rec, growable }
    dirty = true
  }
  const matured = maturePreviewSpecies(rec, species, growable)
  if (matured !== rec) {
    rec = matured
    dirty = true
  }
  if (!rec.morph || !rec.morph.body || rec.morph.v !== MORPH_PALETTE_VER) {
    const found = morphById(species, rec.morph?.id)
    rec = {
      ...rec,
      morph: rollFishMorph(species, {
        template: found || undefined,
        shine: rec.morph?.shine,
        body: found?.body,
        tail: found?.tail,
        art: found?.art,
        stable: Boolean(found),
        marks: rec.morph?.marks,
        wash: rec.morph?.wash,
        parentMarks: rec.morph?.marks,
        parentWash: rec.morph?.wash
      })
    }
    dirty = true
  } else {
    const nextMorph = { ...rec.morph }
    let patched = false
    if (nextMorph.overlay && !nextMorph.marks) {
      nextMorph.marks = rollOverlayMarks(nextMorph.overlay, species)
      patched = true
    }
    if (!nextMorph.wash) {
      nextMorph.wash = rollColorWash(species)
      patched = true
    }
    if (patched) {
      rec = { ...rec, morph: nextMorph }
      dirty = true
    }
  }
  return { rec, dirty }
}

export function getPetAppearance(username, slotId, itemId, speciesKey) {
  if (!username) return lookFromRecord(null, false, speciesKey)
  const cur = getUserPets(username)
  const sid = String(slotId || '')
  const bornMeta = cur.born?.[sid]
  const shop = String(itemId || '').trim()
  const { rec, dirty } = ensureRecord(cur, sid, shop, speciesKey, !shop ? bornMeta : null, username)
  if (dirty) {
    saveUserPets(username, { ...cur, growth: { ...cur.growth, [sid]: rec } })
  }
  const growable = Boolean(shop) || Boolean(bornMeta)
  return lookFromRecord(rec, growable, speciesKey)
}

export function recordPetEat(username, slotId, itemId, speciesKey) {
  if (!username || !slotId) return { success: false }
  const cur = getUserPets(username)
  const sid = String(slotId)
  const fedAt = { ...cur.fedAt, [sid]: new Date().toISOString() }
  const growth = { ...cur.growth }
  const bornMeta = cur.born?.[sid]
  const shop = String(itemId || '').trim()
  const { rec } = ensureRecord(cur, sid, shop, speciesKey, !shop ? bornMeta : null, username)
  let next = rec
  const growable = Boolean(shop) || Boolean(bornMeta)
  if (growable) {
    const now = Date.now()
    const day = dayKey(now)
    const today = rec.day === day ? Number(rec.today) || 0 : 0
    const gap = now - (Number(rec.lastCountAt) || 0)
    if (today < PET_DAILY_GROWTH_CAP && gap >= PET_GROWTH_GAP_MS) {
      next = { ...rec }
      next.meals = (Number(next.meals) || 0) + 1
      next.today = today + 1
      next.day = day
      next.lastCountAt = now
      next.hue = clamp(next.hue + (Math.random() - 0.5) * 4.2, next.hueMin, next.hueMax)
      next.sat = clamp(next.sat + (Math.random() - 0.5) * 0.035, next.satMin, next.satMax)
      next.bri = clamp(next.bri + (Math.random() - 0.5) * 0.02, next.briMin, next.briMax)
    }
  }
  growth[sid] = next
  return saveUserPets(username, { ...cur, fedAt, growth })
}

function mixOffspringColors(mother, father, species) {
  const preferHue = ((Number(mother.hue) || 0) + (Number(father.hue) || 0)) / 2
  const fam = colorFamily(species, preferHue)
  const prettier = (Number(mother.sat) || 1) >= (Number(father.sat) || 1) ? mother : father
  const rare = Math.random() < 0.45
  let hue = preferHue + (Math.random() - 0.5) * 10
  if (Math.random() < 0.55) hue = (Number(prettier.hue) || hue) + (Math.random() - 0.5) * 6
  hue = clamp(hue, fam.hue[0], fam.hue[1])
  const parentSat = Math.max(Number(mother.sat) || 1, Number(father.sat) || 1)
  const sat = rare
    ? randBetween(fam.sat[0] * 0.35 + fam.sat[1] * 0.65, fam.sat[1] * 1.1)
    : clamp(parentSat + randBetween(0.04, 0.14), fam.sat[0], fam.sat[1] * 1.08)
  const bri = clamp(
    ((Number(mother.bri) || 1) + (Number(father.bri) || 1)) / 2 + (rare ? 0.04 : 0),
    fam.bri[0],
    fam.bri[1]
  )
  return { fam, hue, sat, bri, pretty: true }
}

function emptyBreedSlots(username, born) {
  const cur = getUserPets(username)
  const roster = getAmbientFishRoster(username)
  const empty = new Set()
  roster.forEach((f, i) => {
    if (f.itemId || born?.[f.id]) return
    if (cur.vacant?.[f.id] || i >= 2) empty.add(f.id)
  })
  return empty
}

function isAdultRow(fish, rec) {
  const growable = Boolean(fish?.itemId) || Boolean(fish?.born)
  return !growable || growthStage(rec?.meals).key === 'adult'
}

function deliverFry(growth, born, vacant, username, motherId, rec, now) {
  const emptyIds = emptyBreedSlots(username, born)
  const emptyId = [...emptyIds].find((id) => id !== motherId)
  if (!emptyId) return { ok: false, message: '魚缸沒有空欄，生不出魚苗' }
  const mate = growth[rec.courtshipMate] || {}
  const species = rec.species || getAmbientFishRoster(username).find((f) => f.id === motherId)?.key || 'betta'
  const colors = mixOffspringColors(rec, mate, species)
  const gen = Math.max(Number(rec.generation) || 0, Number(mate.generation) || 0) + 1
  born[emptyId] = {
    species,
    generation: gen,
    pretty: true,
    mother: motherId,
    father: rec.courtshipMate || '',
    hue: colors.hue,
    sat: colors.sat,
    bri: colors.bri,
    fam: colors.fam
  }
  growth[emptyId] = hatchRecord('', species, {
    growable: true,
    generation: gen,
    pretty: true,
    fam: colors.fam,
    hue: colors.hue,
    sat: colors.sat,
    bri: colors.bri,
    morph: mixParentMorphs(species, rec.morph, mate.morph, true)
  })
  growth[motherId] = {
    ...rec,
    pregnant: false,
    pregnantAt: 0,
    courtshipAt: 0,
    courtshipMate: '',
    lastBirthAt: now
  }
  if (vacant && vacant[emptyId]) delete vacant[emptyId]
  return { ok: true }
}

export function tickPetBreeding(username) {
  if (!username) return { success: false }
  flushPetBag(username)
  const tank = getTankRoster(username)
  if (tank.length < 2) return { success: true }
  const cur = getUserPets(username)
  const growth = { ...cur.growth }
  const born = { ...cur.born }
  const vacant = { ...cur.vacant }
  let dirty = false
  const now = Date.now()

  const emptyIds = emptyBreedSlots(username, born)

  const adults = []
  tank.forEach((fish) => {
    if (fish.showcase) return
    if (emptyIds.has(fish.id)) return
    const { rec, dirty: d } = ensureRecord(
      cur,
      fish.id,
      fish.itemId,
      fish.key,
      fish.born ? born[fish.id] : null,
      username
    )
    if (d) {
      growth[fish.id] = rec
      dirty = true
    }
    if (isAdultRow(fish, rec)) adults.push({ fish, rec: growth[fish.id] || rec })
  })

  adults.forEach(({ fish, rec }) => {
    if (!rec.pregnant) return
    const started = Number(rec.pregnantAt) || 0
    if (!started || now - started < PET_PREGNANT_MS) return
    const bornOk = deliverFry(growth, born, vacant, username, fish.id, rec, now)
    if (bornOk.ok) dirty = true
  })

  const bySpecies = {}
  adults.forEach((row) => {
    const sp = row.rec.species || row.fish.key || 'betta'
    if (!bySpecies[sp]) bySpecies[sp] = { m: [], f: [] }
    if (row.rec.gender === 'f') bySpecies[sp].f.push(row)
    else bySpecies[sp].m.push(row)
  })

  Object.keys(bySpecies).forEach((sp) => {
    const males = bySpecies[sp].m
    const females = bySpecies[sp].f
    if (!males.length || !females.length) return
    females.forEach(({ fish, rec }) => {
      if (rec.pregnant) return
      if (rec.lastBirthAt && now - Number(rec.lastBirthAt) < PET_BIRTH_COOLDOWN_MS) return
      const mate = males[0]
      const mateId = mate.fish.id
      let next = { ...rec }
      if (next.courtshipMate !== mateId) {
        next.courtshipMate = mateId
        next.courtshipAt = now
        growth[fish.id] = next
        dirty = true
        return
      }
      const since = Number(next.courtshipAt) || 0
      if (since && now - since >= PET_PAIR_MS) {
        next.pregnant = true
        next.pregnantAt = now
        growth[fish.id] = next
        dirty = true
      }
    })
  })

  if (!dirty) return { success: true }
  return saveUserPets(username, { ...cur, growth, born, vacant })
}

export function setPetName(username, slotId, name) {
  const cur = getUserPets(username)
  const names = { ...cur.names }
  const t = String(name || '').trim().slice(0, 12)
  if (t) names[slotId] = t
  else delete names[slotId]
  return saveUserPets(username, { ...cur, names })
}

export function setShowcaseFish(username, slotId) {
  if (!username) return { success: false, message: '請先登入' }
  const sid = String(slotId || '').trim()
  if (!sid) return { success: false, message: '請選擇要展示的魚' }
  const mine = getTankRoster(username)
  if (!mine.some((f) => f.id === sid)) return { success: false, message: '找不到這隻魚' }
  const cur = getUserPets(username)
  return saveUserPets(username, { ...cur, showcaseSlotId: sid })
}

export function clearShowcaseFish(username) {
  if (!username) return { success: false, message: '請先登入' }
  const cur = getUserPets(username)
  return saveUserPets(username, { ...cur, showcaseSlotId: '' })
}

export function getPublicShowcaseFish(viewer) {
  const all = readAll()
  const extras = []
  Object.keys(all).forEach((owner) => {
    const acc = String(owner || '').trim()
    if (!acc || acc === viewer || isGuestAccount(acc)) return
    const slotId = String(all[acc]?.showcaseSlotId || '').trim()
    if (!slotId) return
    const ownerRoster = getTankRoster(acc)
    const entry = ownerRoster.find((f) => f.id === slotId)
    if (!entry) return
    extras.push({
      ...entry,
      id: `showcase-${acc}-${slotId}`,
      owner: acc,
      growthSlotId: slotId,
      showcase: true,
      nick: String(all[acc]?.names?.[slotId] || '').trim()
    })
  })
  extras.sort((a, b) => String(a.owner).localeCompare(String(b.owner), 'zh-Hant'))
  return extras
}

export function getWorldFishRoster(username) {
  const pets = getUserPets(username)
  const mine = getTankRoster(username).map((f) => ({
    ...f,
    owner: username,
    growthSlotId: f.id,
    showcase: false,
    nick: String(pets.names?.[f.id] || '').trim()
  }))
  return [...mine, ...getPublicShowcaseFish(username)]
}

const FISH_BASE_PRICE = {
  betta: 40,
  arowana: 88,
  arowana_blue: 98,
  ray_crown: 108,
  ray_albino: 118,
  arapaima: 128,
  guppy: 32,
  gar: 96,
  genghis: 78,
  redtail_cat: 118,
  turtle_slider: 48,
  turtle_pig: 108,
  turtle_map: 58
}

export function canTradeTankFish(fish) {
  return Boolean(fish?.itemId || fish?.born)
}

export function listFishSkinCards(username, itemId, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  const id = String(itemId || '')
  if (!username || !id || qty <= 0) return []
  const slots = getEquippedFishSlots(username)
  const pets = getUserPets(username)
  const cards = []
  slots.forEach((sid, i) => {
    if (String(sid) !== id) return
    const slotId = `fish-${i}`
    cards.push({
      key: `${id}:${slotId}`,
      slotId,
      equipped: true,
      name: String(pets.names?.[slotId] || '').trim()
    })
  })
  ;(pets.petBag || []).forEach((p, i) => {
    if (String(p?.itemId || '') !== id) return
    cards.push({
      key: `${id}:bag-${i}`,
      slotId: '',
      equipped: false,
      name: String(p.name || '').trim()
    })
  })
  while (cards.length < qty) {
    cards.push({
      key: `${id}:spare-${cards.length}`,
      slotId: '',
      equipped: false,
      name: ''
    })
  }
  return cards.slice(0, qty)
}

export function remapPetsAfterFishUnequip(username, removedIndex) {
  if (!username || !Number.isInteger(removedIndex) || removedIndex < 0) return { success: false }
  const cur = getUserPets(username)
  const showcase = remapSlotKey(cur.showcaseSlotId, removedIndex) || ''
  return saveUserPets(username, {
    ...cur,
    names: remapKeyedMap(cur.names, removedIndex),
    fedAt: remapKeyedMap(cur.fedAt, removedIndex),
    growth: remapKeyedMap(cur.growth, removedIndex),
    born: remapKeyedMap(cur.born, removedIndex),
    vacant: remapKeyedMap(cur.vacant, removedIndex),
    showcaseSlotId: showcase
  })
}

export function lookFromSnapshot(snap) {
  const rec = snap?.growth || null
  const sp = snap?.species || rec?.species || 'betta'
  return lookFromRecord(rec, Boolean(rec), sp)
}

export function getFishShopPrice(itemId, species) {
  const item = itemId ? getItem(itemId) : null
  const listed = Number(item?.price)
  if (listed > 0) return listed
  return FISH_BASE_PRICE[species] || FISH_BASE_PRICE.betta
}

function remapSlotKey(key, removedIndex) {
  const m = /^fish-(\d+)$/.exec(String(key || ''))
  if (!m) return key
  const n = Number(m[1])
  if (n === removedIndex) return null
  if (n > removedIndex) return `fish-${n - 1}`
  return key
}

function remapKeyedMap(map, removedIndex) {
  const next = {}
  Object.entries(map || {}).forEach(([k, v]) => {
    const nk = remapSlotKey(k, removedIndex)
    if (nk == null) return
    next[nk] = v
  })
  return next
}

export function snapshotLiveFish(username, slotId) {
  if (!username) return { success: false, message: '請先登入' }
  const fish = getTankRoster(username).find((f) => f.id === slotId)
  if (!fish) return { success: false, message: '找不到這隻魚' }
  if (!canTradeTankFish(fish)) {
    return { success: false, message: '預設鬥魚不能送去競拍' }
  }
  getPetAppearance(username, fish.id, fish.itemId, fish.key)
  const cur = getUserPets(username)
  const rec = cur.growth[slotId]
  return {
    success: true,
    snapshot: {
      itemId: fish.itemId || '',
      species: fish.key,
      name: cur.names[slotId] || '',
      growth: rec ? { ...rec } : null
    }
  }
}

export function removeLiveFish(username, slotId) {
  const shot = snapshotLiveFish(username, slotId)
  if (!shot.success) return shot
  const idx = Number(String(slotId).replace('fish-', ''))
  if (!Number.isFinite(idx)) return { success: false, message: '欄位錯誤' }
  const cur = getUserPets(username)
  const itemId = String(shot.snapshot.itemId || '').trim()
  if (itemId) {
    const slots = getEquippedFishSlots(username)
    if (slots[idx] !== itemId) return { success: false, message: '魚欄資料不一致' }
    const nextSlots = slots.filter((_, i) => i !== idx)
    const unset = setFishSlots(username, nextSlots)
    if (!unset.success) return unset
    const inv = removeItemFromInventory(username, itemId, 1)
    if (!inv.success) {
      setFishSlots(username, slots)
      return inv
    }
    const showcase = remapSlotKey(cur.showcaseSlotId, idx) || ''
    saveUserPets(username, {
      ...cur,
      names: remapKeyedMap(cur.names, idx),
      fedAt: remapKeyedMap(cur.fedAt, idx),
      growth: remapKeyedMap(cur.growth, idx),
      born: remapKeyedMap(cur.born, idx),
      vacant: remapKeyedMap(cur.vacant, idx),
      showcaseSlotId: showcase
    })
  } else {
    const names = { ...cur.names }
    const fedAt = { ...cur.fedAt }
    const growth = { ...cur.growth }
    const born = { ...cur.born }
    delete names[slotId]
    delete fedAt[slotId]
    delete growth[slotId]
    delete born[slotId]
    const showcase = cur.showcaseSlotId === slotId ? '' : cur.showcaseSlotId
    saveUserPets(username, { ...cur, names, fedAt, growth, born, showcaseSlotId: showcase })
  }
  return { success: true, snapshot: shot.snapshot }
}

export function releaseLiveFish(username, slotId) {
  if (!username) return { success: false, message: '請先登入' }
  const fish = getTankRoster(username).find((f) => f.id === slotId)
  if (!fish) return { success: false, message: '找不到這隻魚' }
  const traded = canTradeTankFish(fish)
  let snapshot = null
  if (traded) {
    const removed = removeLiveFish(username, slotId)
    if (!removed.success) return removed
    snapshot = removed.snapshot
  } else {
    const cur = getUserPets(username)
    const names = { ...cur.names }
    const fedAt = { ...cur.fedAt }
    const growth = { ...cur.growth }
    const born = { ...cur.born }
    const vacant = { ...cur.vacant, [slotId]: true }
    delete names[slotId]
    delete fedAt[slotId]
    delete growth[slotId]
    delete born[slotId]
    const showcase = cur.showcaseSlotId === slotId ? '' : cur.showcaseSlotId
    const saved = saveUserPets(username, { ...cur, names, fedAt, growth, born, vacant, showcaseSlotId: showcase })
    if (!saved.success) return saved
  }
  const pay = addWalletBalance(username, PET_RELEASE_COINS)
  if (!pay.success) {
    if (traded && snapshot) attachLiveFish(username, snapshot)
    else {
      const cur = getUserPets(username)
      const vacant = { ...cur.vacant }
      delete vacant[slotId]
      saveUserPets(username, { ...cur, vacant })
    }
    return { success: false, message: pay.message || '放生失敗' }
  }
  addTransaction({
    type: 'release',
    from: 'system',
    to: username,
    amount: PET_RELEASE_COINS,
    description: '放生魚隻'
  })
  return { success: true, coins: PET_RELEASE_COINS }
}

export function listOwnedFishPotions(username) {
  return {
    heat: countInventoryItem(username, FISH_POTION_HEAT_ID),
    affection: countInventoryItem(username, FISH_POTION_AFFECTION_ID),
    birth: countInventoryItem(username, FISH_POTION_BIRTH_ID)
  }
}

function potionItemId(kind) {
  if (kind === 'heat') return FISH_POTION_HEAT_ID
  if (kind === 'affection') return FISH_POTION_AFFECTION_ID
  if (kind === 'birth') return FISH_POTION_BIRTH_ID
  return ''
}

export function useFishPotion(username, slotId, kind) {
  if (!username) return { success: false, message: '請先登入' }
  const itemId = potionItemId(kind)
  if (!itemId) return { success: false, message: '不明藥水' }
  if (countInventoryItem(username, itemId) < 1) {
    return { success: false, message: '背包沒有這個藥水' }
  }
  tickPetBreeding(username)
  const tank = getTankRoster(username)
  const fish = tank.find((f) => f.id === slotId)
  if (!fish || fish.showcase) return { success: false, message: '只能用在自己的魚' }
  const cur = getUserPets(username)
  const { rec, dirty } = ensureRecord(cur, fish.id, fish.itemId, fish.key, fish.born ? cur.born[fish.id] : null, username)
  const growth = { ...cur.growth, [fish.id]: rec }
  const born = { ...cur.born }
  const vacant = { ...cur.vacant }
  if (dirty) saveUserPets(username, { ...cur, growth })
  if (rec.gender !== 'f') return { success: false, message: '只能給母魚使用' }
  const now = Date.now()
  const species = rec.species || fish.key || 'betta'
  const pairMales = tank.filter((row) => {
    if (row.id === fish.id || row.showcase) return false
    const other = growth[row.id] || cur.growth[row.id]
    if (!other) return false
    const sp = other.species || row.key
    return other.gender === 'm' && sp === species && isAdultRow(row, other)
  })

  if (kind === 'heat') {
    if (rec.pregnant) return { success: false, message: '懷孕中不必用發情藥水' }
    growth[fish.id] = {
      ...rec,
      lastBirthAt: 0,
      courtshipMate: rec.courtshipMate || pairMales[0]?.id || '',
      courtshipAt: rec.courtshipAt || (pairMales[0] ? now : rec.courtshipAt || 0)
    }
  } else if (kind === 'affection') {
    if (rec.pregnant) return { success: false, message: '這隻已經懷孕' }
    if (!isAdultRow(fish, rec)) return { success: false, message: '成魚才能用好感藥水' }
    if (!pairMales.length) return { success: false, message: '需要同品種一公一母同時在魚缸巡遊' }
    growth[fish.id] = {
      ...rec,
      lastBirthAt: 0,
      courtshipMate: pairMales[0].id,
      courtshipAt: now,
      pregnant: true,
      pregnantAt: now
    }
  } else if (kind === 'birth') {
    if (!rec.pregnant) return { success: false, message: '這隻沒有懷孕' }
    const bornOk = deliverFry(growth, born, vacant, username, fish.id, rec, now)
    if (!bornOk.ok) return { success: false, message: bornOk.message }
  } else {
    return { success: false, message: '不明藥水' }
  }

  const spent = removeItemFromInventory(username, itemId, 1)
  if (!spent.success) return spent
  const saved = saveUserPets(username, { ...cur, growth, born, vacant })
  if (!saved.success) {
    addItemToInventory(username, itemId, 1)
    return saved
  }
  const labels = { heat: '已使用發情藥水，可再交配', affection: '已使用好感藥水，母魚懷孕了', birth: '已使用催生藥水，魚苗出生了' }
  return { success: true, message: labels[kind] || '已使用' }
}

function writeSnapToSlot(username, slotId, snap, asBorn) {
  const cur = getUserPets(username)
  const rec = snap.growth
    ? { ...snap.growth, itemId: snap.itemId || '' }
    : hatchRecord(snap.itemId || '', snap.species || 'betta', { growable: true })
  const names = { ...cur.names }
  if (snap.name) names[slotId] = snap.name
  else delete names[slotId]
  const born = { ...cur.born }
  if (asBorn) {
    born[slotId] = {
      species: snap.species || rec.species || 'betta',
      generation: Number(rec.generation) || 1,
      pretty: !!rec.pretty,
      hue: rec.hue,
      sat: rec.sat,
      bri: rec.bri,
      fam: rec.fam
    }
  } else {
    delete born[slotId]
  }
  const vacant = { ...cur.vacant }
  delete vacant[slotId]
  return saveUserPets(username, {
    ...cur,
    names,
    growth: { ...cur.growth, [slotId]: rec },
    born,
    vacant
  })
}

function placeLiveFish(username, snap) {
  const itemId = String(snap?.itemId || '').trim()
  if (itemId) {
    const eq = equipOneFishSkin(username, itemId)
    if (!eq.success) return { placed: false }
    const idx = getEquippedFishSlots(username).length - 1
    writeSnapToSlot(username, `fish-${idx}`, snap, false)
    return { placed: true }
  }
  const cap = getFishSlotCount(username)
  const slots = getEquippedFishSlots(username)
  const cur = getUserPets(username)
  for (let i = slots.length; i < cap; i += 1) {
    const sid = `fish-${i}`
    if (cur.born[sid]) continue
    writeSnapToSlot(username, sid, snap, true)
    return { placed: true }
  }
  return { placed: false }
}

export function attachLiveFish(username, snap, { creditInventory = true } = {}) {
  if (!username || !snap) return { success: false, message: '資料不完整' }
  const itemId = String(snap.itemId || '').trim()
  if (itemId && creditInventory) addItemToInventory(username, itemId, 1)
  const placed = placeLiveFish(username, snap)
  if (placed.placed) return { success: true }
  const cur = getUserPets(username)
  saveUserPets(username, { ...cur, petBag: [...(cur.petBag || []), snap] })
  return {
    success: true,
    stored: true,
    message: '魚缸已滿，魚已暫存，有空欄會自動游進缸裡'
  }
}

export function flushPetBag(username) {
  if (!username) return
  const bag = [...(getUserPets(username).petBag || [])]
  if (!bag.length) return
  const remain = []
  bag.forEach((snap) => {
    const r = placeLiveFish(username, snap)
    if (!r.placed) remain.push(snap)
  })
  const latest = getUserPets(username)
  saveUserPets(username, { ...latest, petBag: remain })
}

export function applyPetBagOnEquip(username, itemId) {
  const cur = getUserPets(username)
  const bag = [...(cur.petBag || [])]
  const i = bag.findIndex((p) => String(p.itemId || '') === String(itemId || ''))
  if (i < 0) return
  const snap = bag.splice(i, 1)[0]
  const idx = getEquippedFishSlots(username).length - 1
  if (idx < 0) {
    saveUserPets(username, { ...cur, petBag: bag })
    return
  }
  writeSnapToSlot(username, `fish-${idx}`, snap, false)
  const latest = getUserPets(username)
  saveUserPets(username, { ...latest, petBag: bag })
}

export function hungerStatus(fedAtIso, now = Date.now()) {
  const t = Date.parse(fedAtIso || '')
  if (!Number.isFinite(t)) return { key: 'hungry', label: '還沒餵過', hours: Infinity }
  const hours = (now - t) / 3600000
  if (hours < 6) return { key: 'full', label: '吃飽了', hours }
  if (hours < 18) return { key: 'ok', label: '還可以', hours }
  return { key: 'hungry', label: '肚子餓了', hours }
}
