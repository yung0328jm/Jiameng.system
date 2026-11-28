import { syncKeyToSupabase } from './supabaseSync'
import { getCurrentUser, getCurrentUserRole } from './authStorage'
import { getUsers } from './storage'
import { getDisplayNameForAccount } from './displayName'
import { getDropdownOptionsByCategory } from './dropdownStorage'
import { isGuestAccount, isGuestCloudWriteBlocked } from './guestAuth'
import { getAllEquippedEffects } from './effectStorage'
import {
  DEFAULT_FISH_SLOTS,
  FISH_ADULT_CM,
  FISH_FRY_CM,
  FISH_PACKS,
  MAX_FISH_SLOTS,
  getAmbientFishRoster,
  speciesKeyFromRefs
} from './fishSkinStorage'
import { addItemToInventory, countInventoryItem, getUserInventory, removeItemFromInventory } from './inventoryStorage'
import {
  FISH_POTION_AFFECTION_ID,
  FISH_POTION_BIRTH_ID,
  FISH_POTION_GENDER_ID,
  FISH_POTION_GROWTH_ID,
  FISH_POTION_HEAT_ID,
  FISH_POTION_WORM_ID,
  ITEM_TYPES,
  getItem,
  getItems
} from './itemStorage'
import { addTransaction, addWalletBalance } from './walletStorage'
import { MORPH_PALETTE_VER, ensureMorphLineage, mixParentMorphs, morphById, morphPartFilters, parentRareChance, rarityLabel, rollColorWash, rollFishMorph, rollOverlayMarks } from './fishMorphs'

export const PET_STORAGE_KEY = 'jiameng_pets'
export const PET_ADULT_MEALS = 45
export const PET_DAILY_GROWTH_CAP = 5
export const PET_HELP_DAILY_CAP = 3
export const PET_GROWTH_GAP_MS = 90 * 1000
export const PET_GROWTH_POTION_MEALS = 20
export const PET_WORM_MEALS = 2
export const PET_WORM_DAILY_CAP = 2

const PET_DAY_MS = 24 * 60 * 60 * 1000
/** One birth cycle = 7 days: courtship + pregnancy + cooldown. */
export const PET_PAIR_MS = 2 * PET_DAY_MS
export const PET_PREGNANT_MS = 3 * PET_DAY_MS
export const PET_BIRTH_COOLDOWN_MS = 2 * PET_DAY_MS
export const PET_RELEASE_RATES = {
  fry: 0.05,
  juvenile: 0.07,
  subadult: 0.1,
  adult: 0.15
}
export const MAX_ROAM_FISH = MAX_FISH_SLOTS
export const MAX_BREED_BIRTHS = 10
export const FEMALE_MAX_BIRTHS = MAX_BREED_BIRTHS
export const MAX_BREED_PAIRS = 3

function emptyUser() {
  return {
    names: {},
    fedAt: {},
    growth: {},
    showcaseSlotId: '',
    born: {},
    petBag: [],
    vacant: {},
    owned: null,
    ownedMigrated: false,
    roaming: null,
    breedPairs: [],
    endedPairs: {},
    favorites: {},
    visitors: [],
    tankClosed: false,
    removed: {},
    updatedAt: ''
  }
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
    owned: Array.isArray(row.owned) ? row.owned : null,
    ownedMigrated: !!row.ownedMigrated,
    showcaseSlotId: String(row.showcaseSlotId || '').trim(),
    roaming: Array.isArray(row.roaming) ? row.roaming.map((id) => String(id || '').trim()).filter(Boolean) : null,
    breedPairs: Array.isArray(row.breedPairs) ? row.breedPairs : [],
    endedPairs: row.endedPairs && typeof row.endedPairs === 'object' ? row.endedPairs : {},
    favorites: row.favorites && typeof row.favorites === 'object' ? row.favorites : {},
    visitors: Array.isArray(row.visitors) ? row.visitors : [],
    tankClosed: !!row.tankClosed,
    removed: row.removed && typeof row.removed === 'object' ? row.removed : {},
    updatedAt: String(row.updatedAt || '')
  }
}

const migratingUsers = new Set()

function nextFishId(owned, removed) {
  const used = new Set((owned || []).map((o) => String(o?.id || '')).filter(Boolean))
  Object.keys(removed || {}).forEach((id) => used.add(String(id)))
  let n = 0
  while (used.has(`fish-${n}`)) n += 1
  return `fish-${n}`
}

function ownedEntryFromFish(f) {
  return {
    id: f.id,
    itemId: String(f.itemId || ''),
    key: f.key || 'betta',
    born: !!f.born,
    variant: f.variant || 'a'
  }
}

function canPersistPets(username) {
  return !!username && username === getCurrentUser()
}

function resolveSpeciesKey(entry, rec, bornSpecies, nick) {
  return speciesKeyFromRefs({
    itemId: entry?.itemId,
    key: entry?.key,
    rec,
    bornSpecies,
    nick
  })
}

function fishFromOwned(entry, i, rec, bornSpecies, nick) {
  const itemId = String(entry?.itemId || rec?.itemId || '') || null
  const key = resolveSpeciesKey({ ...entry, itemId }, rec, bornSpecies, nick)
  const pack = FISH_PACKS[key] || FISH_PACKS.betta
  const variant = entry?.variant || (i % 2 === 0 ? 'a' : 'b')
  return {
    id: entry.id,
    itemId,
    key: pack.key,
    wide: !!pack.wide,
    shape: pack.shape || 'fish',
    src: variant === 'a' ? pack.a : pack.b,
    variant,
    born: !!entry.born
  }
}

function healOwnedSpecies(username, cur, persist = canPersistPets(username)) {
  const born = cur.born || {}
  const growth = cur.growth || {}
  let dirty = false
  const owned = (cur.owned || []).map((e) => {
    const rec = growth[e.id]
    const itemId = String(e.itemId || rec?.itemId || '')
    const key = resolveSpeciesKey({ ...e, itemId }, rec, born[e.id]?.species, cur.names?.[e.id])
    if (e.key !== key || String(e.itemId || '') !== itemId) {
      dirty = true
      return { ...e, key, itemId }
    }
    return e
  })
  if (!dirty) return cur
  const next = { ...cur, owned }
  if (!persist) return next
  saveUserPets(username, next)
  return getUserPets(username)
}

function pushBornMeta(born, id, snap, rec) {
  born[id] = {
    species: snap.species || rec.species || 'betta',
    generation: Number(rec.generation) || 1,
    pretty: !!rec.pretty,
    hue: rec.hue,
    sat: rec.sat,
    bri: rec.bri,
    fam: rec.fam,
    morph: rec.morph
  }
}

function absorbInventorySkins(username, cur) {
  const owned = [...(cur.owned || [])]
  const growth = { ...cur.growth }
  const used = {}
  owned.forEach((o) => {
    const id = String(o.itemId || '')
    if (id) used[id] = (used[id] || 0) + 1
  })
  let dirty = false
  getUserInventory(username).forEach((row) => {
    const item = getItem(row.itemId)
    if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return
    const have = Math.max(0, Number(row.quantity) || 0)
    const extra = have - (used[item.id] || 0)
    let take = 0
    for (let k = 0; k < extra && owned.length < MAX_FISH_SLOTS; k++) {
      const id = nextFishId(owned, cur.removed)
      const rec = hatchRecord(item.id, item.fishKey || 'betta', {
        growable: true,
        seed: `${username}:${id}:${item.id}`
      })
      growth[id] = rec
      owned.push({
        id,
        itemId: item.id,
        key: item.fishKey || 'betta',
        born: false,
        variant: k % 2 === 0 ? 'a' : 'b',
        addedAt: new Date().toISOString()
      })
      used[item.id] = (used[item.id] || 0) + 1
      take += 1
      dirty = true
    }
    if (take > 0) removeItemFromInventory(username, item.id, take)
  })
  if (!dirty) return cur
  saveUserPets(username, { ...cur, owned, growth })
  return getUserPets(username)
}

export function migrateOwned(username, persist = canPersistPets(username)) {
  if (!username) return emptyUser()
  const cur = getUserPets(username)
  if (cur.ownedMigrated && Array.isArray(cur.owned)) {
    const next = persist ? absorbInventorySkins(username, cur) : cur
    return healOwnedSpecies(username, next, persist)
  }
  if (migratingUsers.has(username)) return cur
  migratingUsers.add(username)
  try {
    const ambient = applyBornFish(username, getAmbientFishRoster(username))
    const owned = []
    const fromTank = new Set()
    ambient.forEach((f) => {
      const idx = Number(String(f.id).replace('fish-', ''))
      const keep = f.itemId || f.born || (Number.isInteger(idx) && idx >= 0 && idx < DEFAULT_FISH_SLOTS && !cur.vacant?.[f.id])
      if (!keep) return
      fromTank.add(f.id)
      owned.push(ownedEntryFromFish(f))
    })
    const growth = { ...cur.growth }
    const names = { ...cur.names }
    const born = { ...cur.born }
    ;(cur.petBag || []).forEach((snap) => {
      if (owned.length >= MAX_FISH_SLOTS) return
      const id = nextFishId(owned, cur.removed)
      const rec = snap.growth
        ? { ...snap.growth, itemId: snap.itemId || '' }
        : hatchRecord(snap.itemId || '', snap.species || 'betta', { growable: true, seed: `${username}:${id}` })
      growth[id] = rec
      if (snap.name) names[id] = snap.name
      const isBorn = !String(snap.itemId || '').trim()
      if (isBorn) pushBornMeta(born, id, snap, rec)
      owned.push({
        id,
        itemId: String(snap.itemId || ''),
        key: snap.species || rec.species || 'betta',
        born: isBorn,
        variant: 'a'
      })
    })
    const used = {}
    owned.forEach((o) => {
      const id = String(o.itemId || '')
      if (id) used[id] = (used[id] || 0) + 1
    })
    getUserInventory(username).forEach((row) => {
      const item = getItem(row.itemId)
      if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return
      const have = Math.max(0, Number(row.quantity) || 0)
      const extra = have - (used[item.id] || 0)
      for (let k = 0; k < extra && owned.length < MAX_FISH_SLOTS; k++) {
        const id = nextFishId(owned, cur.removed)
        const rec = hatchRecord(item.id, item.fishKey || 'betta', {
          growable: true,
          seed: `${username}:${id}:${item.id}`
        })
        growth[id] = rec
        owned.push({
          id,
          itemId: item.id,
          key: item.fishKey || 'betta',
          born: false,
          variant: k % 2 === 0 ? 'a' : 'b'
        })
        used[item.id] = (used[item.id] || 0) + 1
      }
      const take = Math.min(have, used[item.id] || 0)
      if (persist && take > 0) removeItemFromInventory(username, item.id, take)
    })
    const live = new Set(owned.map((o) => o.id))
    const roaming = Array.isArray(cur.roaming)
      ? cur.roaming.filter((id) => live.has(id)).slice(0, MAX_ROAM_FISH)
      : owned.filter((o) => fromTank.has(o.id)).map((o) => o.id).slice(0, MAX_ROAM_FISH)
    const showcase = live.has(cur.showcaseSlotId) ? cur.showcaseSlotId : ''
    const next = {
      ...cur,
      owned,
      ownedMigrated: true,
      petBag: [],
      growth,
      names,
      born,
      roaming,
      showcaseSlotId: showcase
    }
    if (!persist) return healOwnedSpecies(username, next, false)
    saveUserPets(username, next)
    return healOwnedSpecies(username, getUserPets(username), true)
  } finally {
    migratingUsers.delete(username)
  }
}

export function addOwnedFromSnap(username, snap) {
  if (!username || !snap) return { success: false, message: '資料不完整' }
  const cur = migrateOwned(username)
  const owned = [...(cur.owned || [])]
  if (owned.length >= MAX_FISH_SLOTS) {
    return { success: false, message: `寵物欄已滿（最多 ${MAX_FISH_SLOTS} 隻）` }
  }
  const id = nextFishId(owned, cur.removed)
  const rec = snap.growth
    ? { ...snap.growth, itemId: snap.itemId || '' }
    : hatchRecord(snap.itemId || '', snap.species || 'betta', { growable: true, seed: `${username}:${id}` })
  const names = { ...cur.names }
  if (snap.name) names[id] = snap.name
  const born = { ...cur.born }
  const itemId = String(snap.itemId || '').trim()
  const isBorn = !itemId
  if (isBorn) pushBornMeta(born, id, snap, rec)
  owned.push({
    id,
    itemId,
    key: snap.species || rec.species || 'betta',
    born: isBorn,
    variant: owned.length % 2 === 0 ? 'a' : 'b'
  })
  const saved = saveUserPets(username, {
    ...cur,
    owned,
    names,
    born,
    growth: { ...cur.growth, [id]: rec }
  })
  if (!saved.success) return saved
  return { success: true, id }
}

export function addShopFishToPets(username, item) {
  if (!username || !item) return { success: false, message: '資料不完整' }
  const key = String(item.fishKey || 'betta')
  return addOwnedFromSnap(username, {
    itemId: item.id,
    species: key,
    name: '',
    growth: hatchRecord(item.id, key, { growable: true, seed: `${username}:${Date.now()}:${item.id}` })
  })
}

function saveUserPets(username, patch) {
  if (!username) return { success: false, message: '請先登入' }
  const all = readAll()
  const prev = all[username] || {}
  const now = new Date().toISOString()
  const ownedSrc = Array.isArray(patch.owned) ? patch.owned : prev.owned
  const owned = Array.isArray(ownedSrc)
    ? ownedSrc.map((o) => (o?.addedAt ? o : { ...o, addedAt: o?.addedAt || now }))
    : ownedSrc
  all[username] = {
    ...emptyUser(),
    ...prev,
    ...patch,
    owned,
    removed: { ...(prev.removed || {}), ...(patch.removed || {}) },
    updatedAt: now
  }
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
  if (key === 'koi_platinum') return { hue: [-14, 22], sat: [0.12, 0.55], bri: [1.02, 1.22] }
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

function stableGender(seed) {
  const s = String(seed || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 === 0 ? 'm' : 'f'
}

function lockedGender(rec, seed, preferred) {
  if (rec?.gender === 'f' || rec?.gender === 'm') return rec.gender
  if (preferred === 'f' || preferred === 'm') return preferred
  return stableGender(seed)
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
    meals: extra.meals != null ? Math.max(0, Number(extra.meals) || 0) : (growable ? 0 : PET_ADULT_MEALS),
    today: extra.today != null ? Math.max(0, Number(extra.today) || 0) : 0,
    day: extra.day || '',
    lastCountAt: Number(extra.lastCountAt) || 0,
    hueMin: fam.hue[0],
    hueMax: fam.hue[1],
    satMin: fam.sat[0],
    satMax: fam.sat[1],
    briMin: fam.bri[0],
    briMax: fam.bri[1],
    hue: extra.hue != null ? extra.hue : randBetween(fam.hue[0], fam.hue[1]),
    sat: extra.sat != null ? extra.sat : randBetween(fam.sat[0], fam.sat[1]),
    bri: extra.bri != null ? extra.bri : randBetween(fam.bri[0], fam.bri[1]),
    morph: ensureMorphLineage(
      extra.morph && (extra.morph.body || extra.morph.gene)
        ? extra.morph
        : rollFishMorph(speciesKey, { seed: extra.seed, fry: true, shine: extra.pretty ? 2 : undefined })
    ),
    pregnant: false,
    pregnantAt: 0,
    courtshipAt: 0,
    courtshipHeld: 0,
    courtshipMate: '',
    lastBirthAt: 0,
    births: Number(extra.births) || 0,
    wormDay: extra.wormDay || '',
    wormToday: extra.wormToday != null ? Math.max(0, Number(extra.wormToday) || 0) : 0
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
  const rounded = n < 100 ? Number(n.toFixed(1)) : Math.round(n)
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${unit} ${text} cm`
}

/** Sprite length vs typical adult of the same species, matching the shown 體長. */
export function spriteLengthRatio(look, speciesKey) {
  const sp = look?.species || speciesKey || 'betta'
  const adult = FISH_ADULT_CM[sp] || FISH_ADULT_CM.betta
  const cm = Number(look?.lengthCm)
  if (Number.isFinite(cm) && cm > 0 && adult > 0) {
    return Math.max(0.16, Math.min(2.8, cm / adult))
  }
  const scale = Number(look?.scale)
  return Number.isFinite(scale) && scale > 0 ? Math.max(0.18, scale) : 1
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
  return rollFishMorph(speciesKey, { fry: true, stable: true, seed: `fallback:${speciesKey || 'betta'}` })
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
    rarity: rarityLabel(Number(morph.w) || cat?.w),
    morphLabel: '',
    shineText: ''
  }
}

function formFromRec(rec) {
  const g = rec?.morph?.gene || {}
  const size = clamp(Number(g.size) || 1, 0.9, 1.62)
  const length = clamp(Number(g.length) || 1, 0.9, 1.72)
  const girth = clamp(Number(g.girth) || 1, 0.9, 1.62)
  const glow = Math.max(0, Math.min(2, Math.floor(Number(g.glow) || 0)))
  return {
    sizeMul: size,
    lengthMul: length,
    girthMul: girth,
    glow,
    glowText: ''
  }
}

function lookFromRecord(rec, growable, speciesKey) {
  const sp = speciesKeyFromRefs({ itemId: rec?.itemId, key: speciesKey, rec })
  const form = formFromRec(rec)
  if (!growable || !rec) {
    const cm = fishLengthCm(sp, PET_ADULT_MEALS, false) * form.lengthMul * (0.6 + 0.4 * form.sizeMul)
    const look = lookParts(rec, PET_ADULT_MEALS, sp, false)
    return {
      purchased: false,
      growable: false,
      scale: form.sizeMul,
      sizeMul: form.sizeMul,
      lengthMul: form.lengthMul,
      girthMul: form.girthMul,
      glow: form.glow,
      glowText: form.glowText,
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
      births: Math.max(0, Math.floor(Number(rec?.births) || 0)),
      generation: Number(rec?.generation) || 0,
      lengthCm: cm,
      lengthText: formatFishLength(cm, sp),
      species: sp
    }
  }
  const meals = Number(rec.meals) || 0
  const cm = fishLengthCm(sp, meals, true) * form.lengthMul * (0.6 + 0.4 * form.sizeMul)
  const look = lookParts(rec, meals, sp, true)
  return {
    purchased: true,
    growable: true,
    scale: growthScale(meals, sp) * form.sizeMul,
    sizeMul: form.sizeMul,
    lengthMul: form.lengthMul,
    girthMul: form.girthMul,
    glow: form.glow,
    glowText: form.glowText,
    filter: look.parts.body,
    parts: look.parts,
    morphLabel: look.morphLabel,
    shineText: look.shineText,
    art: look.art,
    rarity: look.rarity,
    meals,
    progress: growthProgress(meals),
    stage: growthStage(meals, sp),
    gender: rec.gender === 'f' ? 'f' : rec.gender === 'm' ? 'm' : '',
    pregnant: !!rec.pregnant,
    births: Math.max(0, Math.floor(Number(rec.births) || 0)),
    generation: Number(rec.generation) || 0,
    lengthCm: cm,
    lengthText: formatFishLength(cm, sp),
    species: sp
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
  const lastBirth = Number(rec.lastBirthAt) || 0
  const pregAt = Number(rec.pregnantAt) || 0
  const inCool = lastBirth > 0 && now - lastBirth < PET_BIRTH_COOLDOWN_MS
  if (inCool && lastBirth >= pregAt) {
    const remain = Math.max(0, lastBirth + PET_BIRTH_COOLDOWN_MS - now)
    return {
      phase: 'cooldown',
      affectionPct: 0,
      remainMs: remain,
      barPct: Math.round((1 - remain / PET_BIRTH_COOLDOWN_MS) * 100),
      title: '冷卻中',
      detail: `7 日週期 · 倒數 ${formatBreedRemain(remain)}`
    }
  }
  if (rec.pregnant) {
    const remain = Math.max(0, pregAt + PET_PREGNANT_MS - now)
    return {
      phase: 'pregnant',
      affectionPct: 100,
      remainMs: remain,
      barPct: Math.round((1 - remain / PET_PREGNANT_MS) * 100),
      title: '懷孕中',
      detail: `7 日週期 · 倒數 ${formatBreedRemain(remain)}`
    }
  }
  if (rec.courtshipMate && (rec.courtshipAt || rec.courtshipHeld)) {
    const elapsed = rec.courtshipAt
      ? Math.max(0, now - Number(rec.courtshipAt))
      : Math.max(0, Number(rec.courtshipHeld) || 0)
    const pct = Math.min(100, Math.round((elapsed / PET_PAIR_MS) * 100))
    const remain = Math.max(0, PET_PAIR_MS - elapsed)
    return {
      phase: 'courtship',
      affectionPct: pct,
      remainMs: remain,
      barPct: pct,
      title: `週期 ${pct}%`,
      detail: pct >= 100 ? '即將懷孕' : `7 日週期 · 交配倒數 ${formatBreedRemain(remain)}`
    }
  }
  return null
}

function pairKeyOf(maleId, femaleId) {
  return `${String(maleId || '')}:${String(femaleId || '')}`
}

function endedAtOf(ended, maleId, femaleId) {
  return Date.parse(String((ended || {})[pairKeyOf(maleId, femaleId)] || '')) || 0
}

function withoutEndedPair(ended, maleId, femaleId) {
  const next = { ...(ended || {}) }
  delete next[pairKeyOf(maleId, femaleId)]
  return next
}

function markEndedPairs(ended, dropped) {
  const next = { ...(ended || {}) }
  const now = new Date().toISOString()
  ;(dropped || []).forEach((p) => {
    if (!p?.maleId || !p?.femaleId) return
    next[pairKeyOf(p.maleId, p.femaleId)] = now
  })
  return next
}

function activeBreedPairs(list, ended) {
  return normalizeBreedPairs(list).filter((p) => {
    const endedAt = endedAtOf(ended, p.maleId, p.femaleId)
    if (!endedAt) return true
    return (Number(p.startedAt) || 0) > endedAt
  })
}

function normalizeBreedPairs(list) {
  const seen = new Set()
  const out = []
  ;(Array.isArray(list) ? list : []).forEach((p) => {
    const maleId = String(p?.maleId || '').trim()
    const femaleId = String(p?.femaleId || '').trim()
    if (!maleId || !femaleId || maleId === femaleId) return
    if (seen.has(maleId) || seen.has(femaleId)) return
    seen.add(maleId)
    seen.add(femaleId)
    out.push({ maleId, femaleId, startedAt: Number(p.startedAt) || 0 })
  })
  return out.slice(0, MAX_BREED_PAIRS)
}

export function femaleBirthsUsed(rec) {
  return Math.max(0, Math.floor(Number(rec?.births) || 0))
}

export function femaleBirthsLeft(rec) {
  return Math.max(0, MAX_BREED_BIRTHS - femaleBirthsUsed(rec))
}

export const breedUsesLeft = femaleBirthsLeft
export const breedUsesUsed = femaleBirthsUsed

export function listBreedPairs(username) {
  if (!username) return []
  const cur = migrateOwned(username)
  const live = new Set((cur.owned || []).map((o) => o.id))
  const growth = cur.growth || {}
  return activeBreedPairs(cur.breedPairs, cur.endedPairs).filter((p) => {
    if (!live.has(p.maleId) || !live.has(p.femaleId)) return false
    const mom = growth[p.femaleId]
    if (mom && femaleBirthsLeft(mom) <= 0 && !mom.pregnant) return false
    const dad = growth[p.maleId]
    if (dad && femaleBirthsLeft(dad) <= 0) return false
    return true
  })
}

export function findBreedPair(username, slotId) {
  const sid = String(slotId || '')
  return listBreedPairs(username).find((p) => p.maleId === sid || p.femaleId === sid) || null
}

export function getPairBreedingMap(username) {
  if (!username) return {}
  const cur = getUserPets(username)
  const now = Date.now()
  const roam = new Set(listRoamingSlotIds(username))
  const map = {}
  listBreedPairs(username).forEach((pair) => {
    const rec = cur.growth?.[pair.femaleId]
    let view = breedingView(rec, now)
    if (!view) {
      const both = roam.has(pair.maleId) && roam.has(pair.femaleId)
      view = {
        phase: 'paired',
        affectionPct: 0,
        remainMs: PET_PAIR_MS,
        barPct: 0,
        title: both ? '已配對 · 懷孕週期進行中' : '已配對 · 請兩隻都放入魚缸',
        detail: both ? '7 日一輪。碰面愛心只是特效，與週期無關' : '兩隻放入魚缸後開始 7 日週期'
      }
    }
    map[pair.femaleId] = { ...view, partnerId: pair.maleId }
    map[pair.maleId] = { ...view, partnerId: pair.femaleId }
  })
  Object.keys(cur.growth || {}).forEach((id) => {
    if (map[id]) return
    const rec = cur.growth[id]
    if (!rec?.pregnant) return
    const view = breedingView(rec, now)
    if (view) map[id] = { ...view, partnerId: rec.courtshipMate || '' }
  })
  return map
}

function fishRecordForBreed(username, slotId) {
  const fish = getTankRoster(username).find((f) => f.id === slotId)
  if (!fish) return { ok: false, message: '找不到這隻魚' }
  const cur = getUserPets(username)
  const { rec } = ensureRecord(
    cur,
    fish.id,
    fish.itemId,
    fish.key,
    fish.born ? cur.born[fish.id] : null,
    username
  )
  return { ok: true, fish, rec, cur }
}

export function startBreedPair(username, maleId, femaleId) {
  if (!username) return { success: false, message: '請先登入' }
  const mid = String(maleId || '').trim()
  const fid = String(femaleId || '').trim()
  if (!mid || !fid || mid === fid) return { success: false, message: '請選一公一母' }
  migrateOwned(username)
  const dad = fishRecordForBreed(username, mid)
  const mom = fishRecordForBreed(username, fid)
  if (!dad.ok) return { success: false, message: dad.message }
  if (!mom.ok) return { success: false, message: mom.message }
  if (dad.rec.gender !== 'm') return { success: false, message: '公魚請選公的' }
  if (mom.rec.gender !== 'f') return { success: false, message: '母魚請選母的' }
  if (!isAdultRow(dad.fish, dad.rec)) return { success: false, message: '公魚要成魚才能繁育' }
  if (!isAdultRow(mom.fish, mom.rec)) return { success: false, message: '母魚要成魚才能繁育' }
  const dadSp = dad.rec.species || dad.fish.key
  const momSp = mom.rec.species || mom.fish.key
  if (dadSp !== momSp) return { success: false, message: '請選同一品種的公母' }
  if (femaleBirthsLeft(mom.rec) <= 0) return { success: false, message: `這隻母魚繁育次數已用盡（${MAX_BREED_BIRTHS} 次）` }
  if (femaleBirthsLeft(dad.rec) <= 0) return { success: false, message: `這隻公魚繁育次數已用盡（${MAX_BREED_BIRTHS} 次）` }
  const pairs = listBreedPairs(username)
  if (pairs.some((p) => p.maleId === mid || p.femaleId === mid || p.maleId === fid || p.femaleId === fid)) {
    return { success: false, message: '其中一隻已在繁育中' }
  }
  if (pairs.length >= MAX_BREED_PAIRS) {
    return { success: false, message: `魚缸同時最多 ${MAX_BREED_PAIRS} 組繁育` }
  }
  const cur = getUserPets(username)
  const growth = { ...cur.growth, [mid]: dad.rec, [fid]: { ...mom.rec, courtshipMate: mid } }
  return saveUserPets(username, {
    ...cur,
    growth,
    endedPairs: withoutEndedPair(cur.endedPairs, mid, fid),
    breedPairs: [...pairs, { maleId: mid, femaleId: fid, startedAt: Date.now() }]
  })
}

export function stopBreedPair(username, slotId) {
  if (!username) return { success: false, message: '請先登入' }
  const sid = String(slotId || '').trim()
  const cur = getUserPets(username)
  const current = normalizeBreedPairs(cur.breedPairs)
  const dropped = current.filter((p) => p.maleId === sid || p.femaleId === sid)
  if (!dropped.length) return { success: false, message: '找不到這組繁育' }
  const next = current.filter((p) => p.maleId !== sid && p.femaleId !== sid)
  const growth = { ...cur.growth }
  dropped.forEach((p) => {
    const rec = growth[p.femaleId]
    if (rec && !rec.pregnant) {
      growth[p.femaleId] = { ...rec, courtshipAt: 0, courtshipHeld: 0, courtshipMate: '' }
    }
  })
  return saveUserPets(username, {
    ...cur,
    breedPairs: next,
    endedPairs: markEndedPairs(cur.endedPairs, dropped),
    growth
  })
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
  if (!username) return []
  const cur = migrateOwned(username, canPersistPets(username))
  const born = cur.born || {}
  const growth = cur.growth || {}
  return applyBornFish(username, (cur.owned || []).map((e, i) => fishFromOwned(e, i, growth[e.id], born[e.id]?.species, cur.names?.[e.id])))
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

function ensureRecord(cur, slotId, itemId, speciesKey, bornMeta, username) {
  const sid = String(slotId || '')
  let rec = cur.growth[sid]
  const shop = String(itemId || rec?.itemId || '').trim()
  const gifted = !shop && !bornMeta
  const growable = Boolean(shop) || Boolean(bornMeta) || gifted
  const species = speciesKeyFromRefs({
    itemId: shop,
    key: speciesKey,
    rec,
    bornSpecies: bornMeta?.species
  })
  const mismatchShop = shop && rec && String(rec.itemId || '') && String(rec.itemId || '') !== shop
  const mismatchBorn = !shop && bornMeta && rec && rec.species && rec.species !== bornMeta.species && rec.species !== 'betta'
  const pairGender = gifted && username ? genderForDefaultPair(username, sid, cur) : ''
  const lockSeed = `${username || ''}:${sid}:${species}`
  if (!rec || mismatchShop || mismatchBorn) {
    const prev = rec
    rec = hatchRecord(shop, species, {
      growable,
      generation: Number(prev?.generation || bornMeta?.generation) || 0,
      pretty: !!(prev?.pretty || bornMeta?.pretty),
      preferHue: prev?.hue ?? bornMeta?.hue,
      hue: prev?.hue ?? bornMeta?.hue,
      sat: prev?.sat ?? bornMeta?.sat,
      bri: prev?.bri ?? bornMeta?.bri,
      fam: prev?.fam || bornMeta?.fam,
      gender: lockedGender(prev, lockSeed, pairGender),
      morph: prev?.morph || bornMeta?.morph,
      meals: prev?.meals,
      today: prev?.today,
      day: prev?.day,
      lastCountAt: prev?.lastCountAt,
      births: prev?.births,
      wormDay: prev?.wormDay,
      wormToday: prev?.wormToday,
      seed: lockSeed
    })
    const lastBirthAt = Number(prev?.lastBirthAt) || 0
    const pregnantAt = Number(prev?.pregnantAt) || 0
    const stillPregnant = !!prev?.pregnant && lastBirthAt < pregnantAt
    rec = {
      ...rec,
      lastBirthAt,
      pregnant: stillPregnant,
      pregnantAt: stillPregnant ? pregnantAt : 0,
      courtshipMate: prev?.courtshipMate || '',
      courtshipAt: stillPregnant ? Number(prev?.courtshipAt) || 0 : 0,
      courtshipHeld: stillPregnant ? Number(prev?.courtshipHeld) || 0 : 0
    }
    return { rec, dirty: true }
  }
  let dirty = false
  if (rec.gender !== 'f' && rec.gender !== 'm') {
    rec = { ...rec, gender: lockedGender(rec, `${username || ''}:${sid}:${species}`, pairGender) }
    dirty = true
  }
  if (gifted && rec.growable !== true) {
    rec = { ...rec, growable: true }
    dirty = true
  } else if (rec.growable == null) {
    rec = { ...rec, growable }
    dirty = true
  }
  if (!rec.morph?.gene || rec.morph.v !== MORPH_PALETTE_VER) {
    rec = {
      ...rec,
      morph: rollFishMorph(species, {
        seed: lockSeed,
        fry: true,
        from: rec.morph,
        lineage: rec.morph?.lineage
      })
    }
    rec = { ...rec, morph: ensureMorphLineage(rec.morph) }
    dirty = true
  } else {
    const nextMorph = { ...rec.morph }
    let patched = false
    const catalog = morphById(species, nextMorph.id)
    if (nextMorph.w == null && catalog) {
      nextMorph.w = catalog.w
      patched = true
    }
    if (nextMorph.overlay && !nextMorph.marks) {
      nextMorph.marks = rollOverlayMarks(nextMorph.overlay, species, { seed: `${lockSeed}:mark` })
      patched = true
    }
    if (!nextMorph.wash) {
      nextMorph.wash = rollColorWash(species, { seed: `${lockSeed}:wash` })
      patched = true
    }
    const lined = ensureMorphLineage(nextMorph)
    if (lined !== nextMorph) patched = true
    if (patched) {
      rec = { ...rec, morph: lined }
      dirty = true
    }
  }
  return { rec, dirty }
}

export function getPetAppearance(username, slotId, itemId, speciesKey) {
  if (!username) return lookFromRecord(null, false, speciesKey)
  const cur = getUserPets(username)
  const sid = String(slotId || '')
  const rec0 = cur.growth[sid]
  const shop = String(itemId || rec0?.itemId || '').trim()
  const bornMeta = shop ? null : cur.born?.[sid]
  const { rec, dirty } = ensureRecord(cur, sid, shop, speciesKey, bornMeta, username)
  if (dirty && canPersistPets(username)) {
    saveUserPets(username, { ...cur, growth: { ...cur.growth, [sid]: rec } })
  }
  const growable = rec.growable !== false
  return lookFromRecord(rec, growable, speciesKey)
}

export function addFishMeals(username, slotId, amount = PET_GROWTH_POTION_MEALS) {
  if (!username) return { success: false, message: '請先登入' }
  const add = Math.max(1, Math.floor(Number(amount) || 0))
  const sid = String(slotId || '').trim()
  if (!sid) return { success: false, message: '請選擇魚' }
  const cur = Array.isArray(getUserPets(username).owned)
    ? getUserPets(username)
    : migrateOwned(username, canPersistPets(username))
  const fish = (cur.owned || []).find((o) => o.id === sid)
  if (!fish) return { success: false, message: '找不到這隻魚' }
  const { rec } = ensureRecord(cur, sid, fish.itemId, fish.key, fish.born ? cur.born[sid] : null, username)
  const meals = Number(rec.meals) || 0
  if (rec.growable === false || meals >= PET_ADULT_MEALS) {
    return { success: false, message: '已經是成魚' }
  }
  const nextMeals = Math.min(PET_ADULT_MEALS, meals + add)
  const added = nextMeals - meals
  if (added <= 0) return { success: false, message: '已經是成魚' }
  const saved = saveUserPets(username, {
    ...cur,
    growth: { ...cur.growth, [sid]: { ...rec, meals: nextMeals } }
  })
  if (!saved.success) return saved
  return { success: true, added, meals: nextMeals, message: `餵食次數 +${added}（現在 ${nextMeals}/${PET_ADULT_MEALS}）` }
}

export function recordPetEat(username, slotId, itemId, speciesKey, helperAccount = '') {
  if (!username || !slotId) return { success: false }
  const cur = getUserPets(username)
  const sid = String(slotId)
  const rec0 = cur.growth[sid]
  const shop = String(itemId || rec0?.itemId || '').trim()
  const bornMeta = shop ? null : cur.born?.[sid]
  const helper = String(helperAccount || '').trim()
  const isHelp = !!(helper && helper !== username)
  const growth = { ...cur.growth }
  const { rec } = ensureRecord(cur, sid, shop, speciesKey, bornMeta, username)
  let next = rec
  let counted = false
  const growable = rec.growable !== false
  if (growable) {
    const now = Date.now()
    const day = dayKey(now)
    const today = rec.day === day ? Number(rec.today) || 0 : 0
    const helpToday = rec.helpDay === day ? Number(rec.helpToday) || 0 : 0
    const gap = now - (Number(rec.lastCountAt) || 0)
    const ownerOk = !isHelp && today < PET_DAILY_GROWTH_CAP
    const helpOk = isHelp && helpToday < PET_HELP_DAILY_CAP
    if ((ownerOk || helpOk) && gap >= PET_GROWTH_GAP_MS) {
      next = { ...rec }
      next.meals = (Number(next.meals) || 0) + 1
      next.lastCountAt = now
      next.hue = clamp(next.hue + (Math.random() - 0.5) * 4.2, next.hueMin, next.hueMax)
      next.sat = clamp(next.sat + (Math.random() - 0.5) * 0.035, next.satMin, next.satMax)
      next.bri = clamp(next.bri + (Math.random() - 0.5) * 0.02, next.briMin, next.briMax)
      if (isHelp) {
        const prevHelpers = rec.helpDay === day && Array.isArray(rec.helpers) ? rec.helpers : []
        next.helpToday = helpToday + 1
        next.helpDay = day
        const row = { account: helper, at: new Date(now).toISOString() }
        next.helpers = [row, ...prevHelpers.filter((h) => String(h?.account || '') !== helper)].slice(0, 8)
      } else {
        next.today = today + 1
        next.day = day
      }
      counted = true
    }
  }
  const fedAt = counted
    ? { ...cur.fedAt, [sid]: new Date().toISOString() }
    : cur.fedAt
  growth[sid] = next
  const saved = saveUserPets(username, { ...cur, fedAt, growth })
  if (isHelp) markTankVisitorFed(username, helper)
  return saved
}

export function listVisitTanks(viewer) {
  const me = String(viewer || '').trim()
  const seen = new Set()
  const out = []
  const add = (raw) => {
    const acc = String(raw || '').trim()
    if (!acc || acc === me || isGuestAccount(acc) || seen.has(acc) || isTankClosed(acc)) return
    seen.add(acc)
    out.push({ account: acc, count: listRoamingSlotIds(acc).length })
  }
  try {
    ;(getUsers() || []).forEach((u) => {
      if (String(u?.role || '') === 'resigned') return
      add(u?.account)
    })
  } catch (_) {}
  try {
    ;['participants', 'responsible_persons'].forEach((cat) => {
      ;(getDropdownOptionsByCategory(cat) || []).forEach((opt) => add(opt?.boundAccount))
    })
  } catch (_) {}
  Object.keys(readAll()).forEach(add)
  out.sort((a, b) =>
    getDisplayNameForAccount(a.account).localeCompare(getDisplayNameForAccount(b.account), 'zh-Hant')
  )
  return out
}

function upsertVisitor(owner, visitor, extra = {}) {
  const host = String(owner || '').trim()
  const who = String(visitor || '').trim()
  if (!host || !who || host === who || isGuestAccount(who)) return { success: false }
  const cur = getUserPets(host)
  const now = new Date().toISOString()
  const prev = Array.isArray(cur.visitors) ? cur.visitors : []
  const existing = prev.find((v) => String(v?.account || '') === who) || {}
  const row = {
    account: who,
    at: now,
    fed: !!(existing.fed || extra.fed),
    fedAt: extra.fed ? now : (existing.fedAt || '')
  }
  const visitors = [row, ...prev.filter((v) => String(v?.account || '') !== who)].slice(0, 40)
  return saveUserPets(host, { ...cur, visitors })
}

export function isTankClosed(username) {
  return !!getUserPets(username)?.tankClosed
}

export function setTankClosed(username, closed) {
  if (getCurrentUserRole() !== 'admin') return { success: false, message: '僅管理者可設定' }
  const acc = String(username || '').trim()
  if (!acc) return { success: false, message: '帳號無效' }
  const cur = getUserPets(acc)
  return saveUserPets(acc, { ...cur, tankClosed: !!closed })
}

export function noteTankVisit(owner, visitor) {
  return upsertVisitor(owner, visitor)
}

export function markTankVisitorFed(owner, helper) {
  return upsertVisitor(owner, helper, { fed: true })
}

export function listTankVisitors(owner) {
  const rows = Array.isArray(getUserPets(owner)?.visitors) ? getUserPets(owner).visitors : []
  return rows
    .map((v) => ({
      account: String(v?.account || '').trim(),
      at: v?.at || '',
      fed: !!v?.fed
    }))
    .filter((v) => v.account)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export function recentHelpers(rec, now = Date.now()) {
  const day = dayKey(now)
  if (String(rec?.helpDay || '') !== day) return []
  return (Array.isArray(rec?.helpers) ? rec.helpers : [])
    .map((h) => ({ account: String(h?.account || '').trim(), at: h?.at || '' }))
    .filter((h) => h.account)
}

function mixOffspringColors(mother, father, species) {
  const preferHue = ((Number(mother.hue) || 0) + (Number(father.hue) || 0)) / 2
  const fam = colorFamily(species, preferHue)
  const prettier = (Number(mother.sat) || 1) >= (Number(father.sat) || 1) ? mother : father
  const rare = Math.random() < parentRareChance(father?.generation, mother?.generation)
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
    if (cur.vacant?.[f.id] || i >= DEFAULT_FISH_SLOTS) empty.add(f.id)
  })
  return empty
}

function isAdultRow(fish, rec) {
  if (rec?.growable === false) return true
  return growthStage(rec?.meals).key === 'adult'
}

function frySnapshot(username, motherId, rec, mate) {
  const species = rec.species || getTankRoster(username).find((f) => f.id === motherId)?.key || 'betta'
  const colors = mixOffspringColors(rec, mate, species)
  const gen = Math.max(Number(rec.generation) || 0, Number(mate.generation) || 0) + 1
  return {
    itemId: '',
    species,
    name: '',
    growth: hatchRecord('', species, {
      growable: true,
      generation: gen,
      pretty: true,
      fam: colors.fam,
      hue: colors.hue,
      sat: colors.sat,
      bri: colors.bri,
      morph: mixParentMorphs(species, rec.morph, mate.morph, true, {
        generation: gen,
        dadGen: Number(mate.generation) || 0,
        momGen: Number(rec.generation) || 0
      })
    })
  }
}

function tryDeliverFry(growth, owned, born, username, motherId, rec, now, removed) {
  if ((owned || []).length >= MAX_FISH_SLOTS) {
    return { ok: false, message: `寵物欄已滿（最多 ${MAX_FISH_SLOTS} 隻）` }
  }
  const mate = growth[rec.courtshipMate] || {}
  const snap = frySnapshot(username, motherId, rec, mate)
  const id = nextFishId(owned, removed)
  const recFry = snap.growth
  growth[id] = recFry
  pushBornMeta(born, id, snap, recFry)
  owned.push({
    id,
    itemId: '',
    key: snap.species || recFry.species || 'betta',
    born: true,
    variant: owned.length % 2 === 0 ? 'a' : 'b'
  })
  growth[motherId] = {
    ...rec,
    pregnant: false,
    pregnantAt: 0,
    courtshipAt: 0,
    courtshipHeld: 0,
    courtshipMate: rec.courtshipMate || '',
    lastBirthAt: now,
    births: femaleBirthsUsed(rec) + 1
  }
  const mateId = String(rec.courtshipMate || '').trim()
  if (mateId && growth[mateId]) {
    growth[mateId] = { ...growth[mateId], births: femaleBirthsUsed(growth[mateId]) + 1 }
  }
  return { ok: true }
}

export function tickPetBreeding(username) {
  if (!username) return { success: false }
  migrateOwned(username)
  const tank = getTankRoster(username)
  if (!tank.length) return { success: true }
  const roamIds = new Set(listRoamingSlotIds(username))
  const cur = getUserPets(username)
  const growth = { ...cur.growth }
  const born = { ...cur.born }
  const vacant = { ...cur.vacant }
  const owned = [...(cur.owned || [])]
  let dirty = false
  const now = Date.now()

  const adults = []
  tank.forEach((fish) => {
    if (fish.showcase) return
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
    const lastBirth = Number(rec.lastBirthAt) || 0
    const pregAt = Number(rec.pregnantAt) || 0
    if (rec.pregnant && lastBirth >= pregAt && lastBirth > 0 && now - lastBirth < PET_BIRTH_COOLDOWN_MS) {
      growth[fish.id] = { ...rec, pregnant: false, pregnantAt: 0 }
      dirty = true
      return
    }
    if (!rec.pregnant) return
    const started = Number(rec.pregnantAt) || 0
    if (!started || now - started < PET_PREGNANT_MS) return
    const bornOk = tryDeliverFry(growth, owned, born, username, fish.id, rec, now, cur.removed)
    if (bornOk.ok) dirty = true
  })

  const liveIds = new Set((owned || []).map((o) => o.id))
  let pairs = activeBreedPairs(cur.breedPairs, cur.endedPairs).filter((p) => liveIds.has(p.maleId) && liveIds.has(p.femaleId))
  pairs.forEach((pair) => {
    const rec = growth[pair.femaleId]
    if (!rec) return
    if (femaleBirthsLeft(rec) <= 0 && !rec.pregnant) {
      pairs = pairs.filter((p) => p.femaleId !== pair.femaleId)
      dirty = true
      return
    }
    if (femaleBirthsLeft(growth[pair.maleId]) <= 0) {
      pairs = pairs.filter((p) => p.maleId !== pair.maleId)
      dirty = true
      return
    }
    if (rec.pregnant) {
      const lastBirth = Number(rec.lastBirthAt) || 0
      const pregAt = Number(rec.pregnantAt) || 0
      if (lastBirth > 0 && lastBirth >= pregAt && now - lastBirth < PET_BIRTH_COOLDOWN_MS) {
        growth[pair.femaleId] = {
          ...rec,
          pregnant: false,
          pregnantAt: 0,
          courtshipAt: 0,
          courtshipHeld: 0,
          courtshipMate: pair.maleId
        }
        dirty = true
        return
      }
      if (rec.courtshipMate !== pair.maleId) {
        growth[pair.femaleId] = { ...rec, courtshipMate: pair.maleId }
        dirty = true
      }
      return
    }
    if (rec.lastBirthAt && now - Number(rec.lastBirthAt) < PET_BIRTH_COOLDOWN_MS) return
    const both = roamIds.has(pair.maleId) && roamIds.has(pair.femaleId)
    let next = { ...rec, courtshipMate: pair.maleId }
    if (both) {
      if (!next.courtshipAt) next.courtshipAt = now - (Number(next.courtshipHeld) || 0)
      if (now - Number(next.courtshipAt) >= PET_PAIR_MS) {
        next.pregnant = true
        next.pregnantAt = now
        next.courtshipHeld = 0
      }
    } else if (next.courtshipAt) {
      next.courtshipHeld = Math.max(0, now - Number(next.courtshipAt))
      next.courtshipAt = 0
    }
    if (
      next.pregnant !== rec.pregnant ||
      next.courtshipAt !== rec.courtshipAt ||
      next.courtshipHeld !== rec.courtshipHeld ||
      next.courtshipMate !== rec.courtshipMate
    ) {
      growth[pair.femaleId] = next
      dirty = true
    }
  })

  const nextPairs = pairs.filter((p) => {
    const rec = growth[p.femaleId]
    if (!rec) return false
    if (!(femaleBirthsLeft(rec) > 0 || rec.pregnant)) return false
    return femaleBirthsLeft(growth[p.maleId]) > 0
  })
  const prevPairs = activeBreedPairs(cur.breedPairs, cur.endedPairs)
  const droppedPairs = prevPairs.filter((p) => !nextPairs.some((n) => n.maleId === p.maleId && n.femaleId === p.femaleId))
  const endedPairs = droppedPairs.length ? markEndedPairs(cur.endedPairs, droppedPairs) : cur.endedPairs
  if (JSON.stringify(nextPairs) !== JSON.stringify(prevPairs) || droppedPairs.length) dirty = true

  if (!dirty) return { success: true }
  return saveUserPets(username, { ...cur, growth, born, vacant, owned, breedPairs: nextPairs, endedPairs })
}

export function setPetName(username, slotId, name) {
  const cur = getUserPets(username)
  const names = { ...cur.names }
  const t = String(name || '').trim().slice(0, 12)
  if (t) names[slotId] = t
  else delete names[slotId]
  return saveUserPets(username, { ...cur, names })
}

export function isPetFavorite(favorites, slotId) {
  const v = favorites?.[slotId]
  if (v === true) return true
  if (v && typeof v === 'object') return !!v.on
  return false
}

export function setPetFavorite(username, slotId, on) {
  if (!username) return { success: false, message: '請先登入' }
  const sid = String(slotId || '').trim()
  if (!sid) return { success: false, message: '請選擇魚' }
  const cur = getUserPets(username)
  const favorites = {
    ...(cur.favorites || {}),
    [sid]: { on: !!on, at: new Date().toISOString() }
  }
  return saveUserPets(username, { ...cur, favorites })
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

export function listRoamingSlotIds(username) {
  const tank = getTankRoster(username)
  const live = new Set(tank.map((f) => f.id))
  const cur = getUserPets(username)
  if (!Array.isArray(cur.roaming)) {
    return tank.slice(0, MAX_ROAM_FISH).map((f) => f.id)
  }
  return cur.roaming.filter((id) => live.has(id)).slice(0, MAX_ROAM_FISH)
}

export function setFishRoaming(username, slotId, on) {
  if (!username) return { success: false, message: '請先登入' }
  const sid = String(slotId || '').trim()
  const tank = getTankRoster(username)
  if (!tank.some((f) => f.id === sid)) return { success: false, message: '找不到這隻魚' }
  let roam = listRoamingSlotIds(username)
  if (on) {
    if (roam.includes(sid)) return { success: true }
    if (roam.length >= MAX_ROAM_FISH) {
      return { success: false, message: `魚缸最多同時放入 ${MAX_ROAM_FISH} 隻，請先收回一隻` }
    }
    roam = [...roam, sid]
  } else {
    roam = roam.filter((id) => id !== sid)
  }
  const cur = getUserPets(username)
  return saveUserPets(username, { ...cur, roaming: roam })
}

export function getTankRoamRoster(username) {
  const pets = getUserPets(username)
  const roam = new Set(listRoamingSlotIds(username))
  return getTankRoster(username)
    .filter((f) => roam.has(f.id))
    .map((f) => ({
      ...f,
      owner: username,
      growthSlotId: f.id,
      showcase: false,
      nick: String(pets.names?.[f.id] || '').trim()
    }))
}

export function getOwnShowcaseFish(username) {
  if (!username) return []
  const pets = getUserPets(username)
  const slotId = String(pets.showcaseSlotId || '').trim()
  if (!slotId) return []
  const entry = getTankRoster(username).find((f) => f.id === slotId)
  if (!entry) return []
  return [{
    ...entry,
    id: `showcase-${username}-${slotId}`,
    owner: username,
    growthSlotId: slotId,
    showcase: true,
    nick: String(pets.names?.[slotId] || '').trim()
  }]
}

export function getShowcaseWorldRoster(username) {
  return [...getOwnShowcaseFish(username), ...getPublicShowcaseFish(username)]
}

export function getWorldFishRoster(username) {
  return getShowcaseWorldRoster(username)
}

const FISH_BASE_PRICE = {
  betta: 10,
  arowana: 40,
  arowana_blue: 45,
  ray_crown: 35,
  ray_albino: 45,
  arapaima: 70,
  guppy: 6,
  gar: 40,
  genghis: 30,
  koi_platinum: 25,
  redtail_cat: 30,
  turtle_slider: 15,
  turtle_pig: 60,
  turtle_map: 18
}

export function canTradeTankFish(fish) {
  return Boolean(fish?.id)
}

export function listFishSkinCards(username, itemId, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  const id = String(itemId || '')
  if (!username || !id || qty <= 0) return []
  const pets = migrateOwned(username)
  const cards = []
  ;(pets.owned || []).forEach((o) => {
    if (String(o?.itemId || '') !== id) return
    cards.push({
      key: `${id}:${o.id}`,
      slotId: o.id,
      equipped: true,
      name: String(pets.names?.[o.id] || '').trim()
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

export function purgeFishItemFromUser(username, itemId) {
  const id = String(itemId || '').trim()
  if (!username || !id) return { success: false }
  const fishKey = String(getItem(id)?.fishKey || '').trim()
  const cur = migrateOwned(username)
  const names = { ...cur.names }
  const fedAt = { ...cur.fedAt }
  const growth = { ...cur.growth }
  const born = { ...cur.born }
  const vacant = { ...cur.vacant }
  let roaming = Array.isArray(cur.roaming) ? cur.roaming.filter(Boolean) : cur.roaming
  const drop = new Set()
  ;(cur.owned || []).forEach((o) => {
    if (String(o.itemId || '') === id) drop.add(o.id)
    else if (!o.itemId && fishKey && o.key === fishKey) drop.add(o.id)
  })
  drop.forEach((fid) => {
    vacant[fid] = true
    delete names[fid]
    delete fedAt[fid]
    delete growth[fid]
    delete born[fid]
    if (Array.isArray(roaming)) roaming = roaming.filter((x) => x !== fid)
  })
  const owned = (cur.owned || []).filter((o) => !drop.has(o.id))
  const bag = (cur.petBag || []).filter((p) => {
    if (String(p?.itemId || '') === id) return false
    if (fishKey && String(p?.species || '') === fishKey) return false
    return true
  })
  const sid = String(cur.showcaseSlotId || '')
  const shown = (cur.owned || []).find((o) => o.id === sid)
  const dropShow = !shown || drop.has(sid) || String(shown.itemId || '') === id || (fishKey && shown.key === fishKey)
  return saveUserPets(username, {
    ...cur,
    names,
    fedAt,
    growth,
    born,
    vacant,
    roaming,
    owned,
    petBag: bag,
    breedPairs: normalizeBreedPairs(cur.breedPairs).filter((p) => !drop.has(p.maleId) && !drop.has(p.femaleId)),
    endedPairs: markEndedPairs(cur.endedPairs, normalizeBreedPairs(cur.breedPairs).filter((p) => drop.has(p.maleId) || drop.has(p.femaleId))),
    showcaseSlotId: dropShow ? '' : sid
  })
}

export function purgeFishItemFromEveryone(itemId) {
  const names = new Set()
  Object.keys(readAll()).forEach((k) => {
    if (k) names.add(k)
  })
  try {
    Object.keys(getAllEquippedEffects() || {}).forEach((k) => {
      if (k) names.add(k)
    })
  } catch (_) {}
  names.forEach((u) => purgeFishItemFromUser(u, itemId))
  return { success: true }
}

export function remapPetsAfterFishUnequip(username, removedIndex) {
  if (!username || !Number.isInteger(removedIndex) || removedIndex < 0) return { success: false }
  const cur = getUserPets(username)
  const showcase = remapSlotKey(cur.showcaseSlotId, removedIndex) || ''
  return saveUserPets(username, {
    ...cur,
    names: remapKeyedMap(cur.names, removedIndex),
    favorites: remapKeyedMap(cur.favorites, removedIndex),
    fedAt: remapKeyedMap(cur.fedAt, removedIndex),
    growth: remapKeyedMap(cur.growth, removedIndex),
    born: remapKeyedMap(cur.born, removedIndex),
    vacant: remapKeyedMap(cur.vacant, removedIndex),
    showcaseSlotId: showcase,
    roaming: remapIdList(cur.roaming, removedIndex)
  })
}

export function lookFromSnapshot(snap) {
  const rec = snap?.growth || null
  const sp = snap?.species || rec?.species || 'betta'
  const growable = rec?.growable !== false && Boolean(rec)
  return lookFromRecord(rec, growable, sp)
}

export function getFishShopPrice(itemId, species) {
  const byId = itemId ? getItem(itemId) : null
  let listed = Number(byId?.price)
  if (listed > 0) return listed
  const key = String(species || '').trim()
  if (key) {
    const match = (getItems() || []).find((it) => it?.type === ITEM_TYPES.FISH_SKIN && String(it.fishKey || '') === key)
    listed = Number(match?.price)
    if (listed > 0) return listed
  }
  return FISH_BASE_PRICE[species] || FISH_BASE_PRICE.betta
}

export function releaseRateForGrowth(meals, species, growable = true) {
  if (growable === false) return PET_RELEASE_RATES.adult
  const key = growthStage(meals, species).key
  return PET_RELEASE_RATES[key] || PET_RELEASE_RATES.fry
}

export function releasePayoutCoins(itemId, species, meals, growable = true) {
  const price = Number(getFishShopPrice(itemId, species)) || FISH_BASE_PRICE.betta
  return Math.max(1, Math.round(price * releaseRateForGrowth(meals, species, growable)))
}

function remapSlotKey(key, removedIndex) {
  const m = /^fish-(\d+)$/.exec(String(key || ''))
  if (!m) return key
  const n = Number(m[1])
  if (n === removedIndex) return null
  if (n > removedIndex) return `fish-${n - 1}`
  return key
}

function remapIdList(list, removedIndex) {
  if (!Array.isArray(list)) return list
  return list.map((id) => remapSlotKey(id, removedIndex)).filter(Boolean)
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
  const cur = getUserPets(username)
  const owned = (cur.owned || []).filter((o) => o.id !== slotId)
  const names = { ...cur.names }
  const fedAt = { ...cur.fedAt }
  const growth = { ...cur.growth }
  const born = { ...cur.born }
  delete names[slotId]
  delete fedAt[slotId]
  delete growth[slotId]
  delete born[slotId]
  const favorites = { ...(cur.favorites || {}) }
  delete favorites[slotId]
  const roaming = Array.isArray(cur.roaming) ? cur.roaming.filter((id) => id !== slotId) : cur.roaming
  const showcase = cur.showcaseSlotId === slotId ? '' : cur.showcaseSlotId
  const currentPairs = normalizeBreedPairs(cur.breedPairs)
  const breedPairs = currentPairs.filter((p) => p.maleId !== slotId && p.femaleId !== slotId)
  const saved = saveUserPets(username, {
    ...cur,
    owned,
    names,
    fedAt,
    growth,
    born,
    roaming,
    favorites,
    breedPairs,
    endedPairs: markEndedPairs(cur.endedPairs, currentPairs.filter((p) => p.maleId === slotId || p.femaleId === slotId)),
    showcaseSlotId: showcase,
    removed: { ...(cur.removed || {}), [slotId]: new Date().toISOString() }
  })
  if (!saved.success) return saved
  return { success: true, snapshot: shot.snapshot }
}

export function releaseLiveFish(username, slotId) {
  if (!username) return { success: false, message: '請先登入' }
  const fish = getTankRoster(username).find((f) => f.id === slotId)
  if (!fish) return { success: false, message: '找不到這隻魚' }
  const rec = getUserPets(username).growth?.[slotId]
  const coins = releasePayoutCoins(fish.itemId, fish.key, rec?.meals, rec?.growable)
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
    const favorites = { ...(cur.favorites || {}) }
    delete favorites[slotId]
    const showcase = cur.showcaseSlotId === slotId ? '' : cur.showcaseSlotId
    const saved = saveUserPets(username, { ...cur, names, fedAt, growth, born, vacant, favorites, showcaseSlotId: showcase })
    if (!saved.success) return saved
  }
  const pay = addWalletBalance(username, coins)
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
    amount: coins,
    description: '放生魚隻'
  })
  return { success: true, coins }
}

export function listOwnedFishPotions(username) {
  return {
    heat: countInventoryItem(username, FISH_POTION_HEAT_ID),
    affection: countInventoryItem(username, FISH_POTION_AFFECTION_ID),
    birth: countInventoryItem(username, FISH_POTION_BIRTH_ID),
    growth: countInventoryItem(username, FISH_POTION_GROWTH_ID),
    gender: countInventoryItem(username, FISH_POTION_GENDER_ID),
    worm: countInventoryItem(username, FISH_POTION_WORM_ID)
  }
}

function potionItemId(kind) {
  if (kind === 'heat') return FISH_POTION_HEAT_ID
  if (kind === 'affection') return FISH_POTION_AFFECTION_ID
  if (kind === 'birth') return FISH_POTION_BIRTH_ID
  if (kind === 'growth') return FISH_POTION_GROWTH_ID
  if (kind === 'gender') return FISH_POTION_GENDER_ID
  if (kind === 'worm') return FISH_POTION_WORM_ID
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
  const owned = [...(cur.owned || [])]
  if (dirty) saveUserPets(username, { ...cur, growth })
  if (kind === 'worm') {
    const day = dayKey(Date.now())
    const used = rec.wormDay === day ? Math.max(0, Number(rec.wormToday) || 0) : 0
    if (used >= PET_WORM_DAILY_CAP) {
      return { success: false, message: `這隻魚今天已經吃過 ${PET_WORM_DAILY_CAP} 次紅蟲` }
    }
    const meals = Number(rec.meals) || 0
    const canGrow = rec.growable !== false && meals < PET_ADULT_MEALS
    const nextMeals = canGrow ? Math.min(PET_ADULT_MEALS, meals + PET_WORM_MEALS) : meals
    const added = nextMeals - meals
    growth[fish.id] = {
      ...rec,
      meals: nextMeals,
      wormDay: day,
      wormToday: used + 1
    }
    const spent = removeItemFromInventory(username, itemId, 1)
    if (!spent.success) return spent
    const fedAt = { ...cur.fedAt, [fish.id]: new Date().toISOString() }
    const saved = saveUserPets(username, { ...cur, growth, fedAt })
    if (!saved.success) {
      addItemToInventory(username, itemId, 1)
      return saved
    }
    const ate = used + 1
    if (added > 0) {
      return { success: true, message: `已餵紅蟲，餵食次數 +${added}（今天 ${ate}/${PET_WORM_DAILY_CAP}）` }
    }
    return { success: true, message: `已餵紅蟲（今天 ${ate}/${PET_WORM_DAILY_CAP}）` }
  }
  if (kind === 'growth') {
    if (rec.growable === false) return { success: false, message: '這隻不會再長大' }
    const meals = Number(rec.meals) || 0
    if (meals >= PET_ADULT_MEALS) return { success: false, message: '已經是成魚' }
    const nextMeals = Math.min(PET_ADULT_MEALS, meals + PET_GROWTH_POTION_MEALS)
    const added = nextMeals - meals
    if (added <= 0) return { success: false, message: '已經是成魚' }
    growth[fish.id] = { ...rec, meals: nextMeals }
    const spent = removeItemFromInventory(username, itemId, 1)
    if (!spent.success) return spent
    const saved = saveUserPets(username, { ...cur, growth })
    if (!saved.success) {
      addItemToInventory(username, itemId, 1)
      return saved
    }
    return { success: true, message: `已使用成長藥水，餵食次數 +${added}` }
  }
  if (kind === 'gender') {
    if (rec.pregnant) return { success: false, message: '懷孕中不能變性' }
    const from = rec.gender === 'f' ? 'f' : 'm'
    const to = from === 'f' ? 'm' : 'f'
    growth[fish.id] = {
      ...rec,
      gender: to,
      courtshipAt: 0,
      courtshipHeld: 0,
      courtshipMate: '',
      lastBirthAt: 0
    }
    const spent = removeItemFromInventory(username, itemId, 1)
    if (!spent.success) return spent
    const currentPairs = normalizeBreedPairs(cur.breedPairs)
    const dropped = currentPairs.filter((p) => p.maleId === fish.id || p.femaleId === fish.id)
    const breedPairs = currentPairs.filter((p) => p.maleId !== fish.id && p.femaleId !== fish.id)
    const saved = saveUserPets(username, {
      ...cur,
      growth,
      breedPairs,
      endedPairs: markEndedPairs(cur.endedPairs, dropped)
    })
    if (!saved.success) {
      addItemToInventory(username, itemId, 1)
      return saved
    }
    return { success: true, message: to === 'f' ? '已變成母魚' : '已變成公魚' }
  }
  if (rec.gender !== 'f') return { success: false, message: '只能給母魚使用' }
  const now = Date.now()
  const pair = listBreedPairs(username).find((p) => p.femaleId === fish.id)
  if (kind === 'heat') {
    if (rec.pregnant) return { success: false, message: '懷孕中不必用發情藥水' }
    if (!pair) return { success: false, message: '請先在繁育系統選好公母' }
    growth[fish.id] = {
      ...rec,
      lastBirthAt: 0,
      courtshipMate: pair.maleId,
      courtshipAt: rec.courtshipAt || now,
      courtshipHeld: 0
    }
  } else if (kind === 'affection') {
    if (rec.pregnant) return { success: false, message: '這隻已經懷孕' }
    if (!isAdultRow(fish, rec)) return { success: false, message: '成魚才能用好感藥水' }
    if (!pair) return { success: false, message: '請先在繁育系統選好公母' }
    if (femaleBirthsLeft(rec) <= 0) return { success: false, message: '這隻母魚繁育次數已用盡' }
    if (femaleBirthsLeft(growth[pair.maleId] || cur.growth[pair.maleId] || {}) <= 0) {
      return { success: false, message: '這隻公魚繁育次數已用盡' }
    }
    growth[fish.id] = {
      ...rec,
      lastBirthAt: 0,
      courtshipMate: pair.maleId,
      courtshipAt: now,
      courtshipHeld: 0,
      pregnant: true,
      pregnantAt: now
    }
  } else if (kind === 'birth') {
    if (!rec.pregnant) return { success: false, message: '這隻沒有懷孕' }
    const bornOk = tryDeliverFry(growth, owned, born, username, fish.id, rec, now, cur.removed)
    if (!bornOk.ok) return { success: false, message: bornOk.message }
  } else {
    return { success: false, message: '不明藥水' }
  }

  const spent = removeItemFromInventory(username, itemId, 1)
  if (!spent.success) return spent
  let breedPairs = normalizeBreedPairs(cur.breedPairs)
  let endedPairs = cur.endedPairs
  const mom = growth[fish.id]
  if (mom && femaleBirthsLeft(mom) <= 0 && !mom.pregnant) {
    const dropped = breedPairs.filter((p) => p.femaleId === fish.id)
    breedPairs = breedPairs.filter((p) => p.femaleId !== fish.id)
    endedPairs = markEndedPairs(endedPairs, dropped)
  }
  const saved = saveUserPets(username, { ...cur, growth, born, vacant, owned, breedPairs, endedPairs })
  if (!saved.success) {
    addItemToInventory(username, itemId, 1)
    return saved
  }
  const labels = { heat: '已使用發情藥水，可再交配', affection: '已使用好感藥水，母魚懷孕了', birth: '已使用催生藥水，魚苗已進我的寵物' }
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
      fam: rec.fam,
      morph: rec.morph
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
  const added = addOwnedFromSnap(username, snap)
  return { placed: !!added.success, message: added.message }
}

export function setPetBagName(username, index, name) {
  if (!username) return { success: false, message: '請先登入' }
  const cur = getUserPets(username)
  const bag = [...(cur.petBag || [])]
  const i = Math.floor(Number(index))
  if (!Number.isInteger(i) || i < 0 || i >= bag.length) return { success: false, message: '找不到這隻' }
  const t = String(name || '').trim().slice(0, 12)
  bag[i] = { ...bag[i], name: t }
  return saveUserPets(username, { ...cur, petBag: bag })
}

export function placePetBagFish(username, index) {
  if (!username) return { success: false, message: '請先登入' }
  const cur = getUserPets(username)
  const bag = [...(cur.petBag || [])]
  const i = Math.floor(Number(index))
  if (!Number.isInteger(i) || i < 0 || i >= bag.length) return { success: false, message: '找不到這隻' }
  const snap = bag[i]
  const placed = placeLiveFish(username, snap)
  if (!placed.placed) return { success: false, message: placed.message || '寵物欄已滿，無法放入' }
  const latest = getUserPets(username)
  const next = [...(latest.petBag || [])]
  if (i < next.length) next.splice(i, 1)
  saveUserPets(username, { ...latest, petBag: next })
  return { success: true }
}

export function releasePetBagFish(username, index) {
  if (!username) return { success: false, message: '請先登入' }
  const cur = getUserPets(username)
  const bag = [...(cur.petBag || [])]
  const i = Math.floor(Number(index))
  if (!Number.isInteger(i) || i < 0 || i >= bag.length) return { success: false, message: '找不到這隻' }
  const snap = bag.splice(i, 1)[0]
  const saved = saveUserPets(username, { ...cur, petBag: bag })
  if (!saved.success) return saved
  const coins = releasePayoutCoins(snap.itemId, snap.species, snap.growth?.meals, snap.growth?.growable)
  const pay = addWalletBalance(username, coins)
  if (!pay.success) {
    const latest = getUserPets(username)
    const restored = [...(latest.petBag || [])]
    restored.splice(i, 0, snap)
    saveUserPets(username, { ...latest, petBag: restored })
    return { success: false, message: pay.message || '放生失敗' }
  }
  addTransaction({
    type: 'release',
    from: 'system',
    to: username,
    amount: coins,
    description: '放生魚隻'
  })
  return { success: true, coins }
}

export function attachLiveFish(username, snap, { creditInventory = false } = {}) {
  if (!username || !snap) return { success: false, message: '資料不完整' }
  if (creditInventory) {
    const itemId = String(snap.itemId || '').trim()
    if (itemId) addItemToInventory(username, itemId, 1)
  }
  const placed = placeLiveFish(username, snap)
  if (placed.placed) return { success: true }
  return { success: false, message: placed.message || '寵物欄已滿' }
}

export function flushPetBag(username) {
  if (!username) return
  migrateOwned(username)
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

export function applyPetBagOnEquip(username) {
  migrateOwned(username)
}

export function hungerStatus(fedAtIso, rec, now = Date.now(), opts = {}) {
  const t = Date.parse(fedAtIso || '')
  if (!Number.isFinite(t)) return { key: 'hungry', label: '還沒餵過', hours: Infinity }
  const hours = (now - t) / 3600000
  const wait = nextFeedWait(fedAtIso, rec, now, opts)
  if (wait.reason === 'day') return { key: 'full', label: opts.asHelper ? '幫忙次數用完' : '今天餵滿了', hours }
  if (wait.waiting) return { key: 'full', label: '吃飽了', hours }
  if (hours < 18) return { key: 'ok', label: '還可以', hours }
  return { key: 'hungry', label: '肚子餓了', hours }
}

function nextLocalMidnight(now) {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

export function formatFeedCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
  return `${m}:${pad(sec)}`
}

export function nextFeedWait(fedAtIso, rec, now = Date.now(), opts = {}) {
  const growable = rec?.growable !== false
  const meals = Number(rec?.meals) || 0
  const day = dayKey(now)
  const today = rec?.day === day ? Number(rec.today) || 0 : 0
  const helpToday = rec?.helpDay === day ? Number(rec.helpToday) || 0 : 0
  const asHelper = !!opts.asHelper
  const cap = asHelper ? PET_HELP_DAILY_CAP : PET_DAILY_GROWTH_CAP
  const used = asHelper ? helpToday : today
  const base = { today, helpToday, cap, used, asHelper }
  if (!growable || meals >= PET_ADULT_MEALS) {
    return { waiting: false, ms: 0, text: '', reason: 'adult', ...base }
  }
  if (used >= cap) {
    const ms = nextLocalMidnight(now) - now
    if (ms > 0) return { waiting: true, ms, text: formatFeedCountdown(ms), reason: 'day', ...base }
  }
  const lastCount = Number(rec?.lastCountAt) || 0
  const lastEat = Date.parse(fedAtIso || '') || 0
  const last = Math.max(lastCount, lastEat)
  if (last > 0) {
    const ms = last + PET_GROWTH_GAP_MS - now
    if (ms > 0) return { waiting: true, ms, text: formatFeedCountdown(ms), reason: 'gap', ...base }
  }
  return { waiting: false, ms: 0, text: '', reason: '', ...base }
}
