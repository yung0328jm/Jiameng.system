import { syncKeyToSupabase } from './supabaseSync'
import { isGuestAccount, isGuestCloudWriteBlocked } from './guestAuth'
import { setFishSlots } from './effectStorage'
import {
  FISH_PACKS,
  equipOneFishSkin,
  getAmbientFishRoster,
  getEquippedFishSlots,
  getFishSlotCount
} from './fishSkinStorage'
import { addItemToInventory, removeItemFromInventory } from './inventoryStorage'
import { getItem } from './itemStorage'

export const PET_STORAGE_KEY = 'jiameng_pets'
export const PET_ADULT_MEALS = 90
export const PET_DAILY_GROWTH_CAP = 5
export const PET_GROWTH_GAP_MS = 90 * 1000
export const PET_PAIR_MS = 7 * 24 * 60 * 60 * 1000
export const PET_PREGNANT_MS = 5 * 24 * 60 * 60 * 1000
export const PET_BIRTH_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

function emptyUser() {
  return { names: {}, fedAt: {}, growth: {}, showcaseSlotId: '', born: {}, petBag: [] }
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

export function growthScale(meals) {
  return 0.32 + growthProgress(meals) * 0.68
}

export function growthStage(meals) {
  const t = growthProgress(meals)
  if (t < 0.22) return { key: 'fry', label: '魚苗' }
  if (t < 0.55) return { key: 'juvenile', label: '幼魚' }
  if (t < 0.88) return { key: 'subadult', label: '亞成' }
  return { key: 'adult', label: '成魚' }
}

export function colorReveal(t) {
  const x = clamp(t, 0, 1)
  if (x < 0.22) return 0.05 + (x / 0.22) * 0.08
  if (x < 0.55) return 0.13 + ((x - 0.22) / 0.33) * 0.45
  if (x < 0.88) return 0.58 + ((x - 0.55) / 0.33) * 0.32
  return 0.9 + ((x - 0.88) / 0.12) * 0.1
}

export function colorFilterFromGrowth(rec, meals) {
  if (!rec) return ''
  const t = growthProgress(meals)
  const reveal = colorReveal(t)
  const hue = Number(rec.hue) || 0
  const sat = (Number(rec.sat) || 1) * (0.16 + 0.84 * reveal)
  const bri = (Number(rec.bri) || 1) * (1.24 - 0.24 * reveal)
  return `hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)})`
}

function lookFromRecord(rec, growable) {
  if (!growable || !rec) {
    return {
      purchased: false,
      growable: false,
      scale: 1,
      filter: '',
      meals: PET_ADULT_MEALS,
      progress: 1,
      stage: { key: 'adult', label: '成魚' },
      gender: rec?.gender === 'f' ? 'f' : rec?.gender === 'm' ? 'm' : '',
      pregnant: false,
      generation: 0
    }
  }
  const meals = Number(rec.meals) || 0
  return {
    purchased: true,
    growable: true,
    scale: growthScale(meals),
    filter: colorFilterFromGrowth(rec, meals),
    meals,
    progress: growthProgress(meals),
    stage: growthStage(meals),
    gender: rec.gender === 'f' ? 'f' : 'm',
    pregnant: !!rec.pregnant,
    generation: Number(rec.generation) || 0
  }
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
  return applyBornFish(username, getAmbientFishRoster(username))
}

function defaultPairSlots(username, cur) {
  const roster = getAmbientFishRoster(username)
  return roster.filter((f) => !f.itemId && !cur?.born?.[f.id])
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
    return { rec, dirty: true }
  }
  let dirty = false
  if (pairGender && rec.gender !== pairGender) {
    rec = { ...rec, gender: pairGender }
    dirty = true
  } else if (!rec.gender) {
    rec = { ...rec, gender: pairGender || randomGender() }
    dirty = true
  }
  if (rec.growable == null) {
    rec = { ...rec, growable }
    dirty = true
  }
  return { rec, dirty }
}

export function getPetAppearance(username, slotId, itemId, speciesKey) {
  if (!username) return lookFromRecord(null, false)
  const cur = getUserPets(username)
  const sid = String(slotId || '')
  const bornMeta = cur.born?.[sid]
  const shop = String(itemId || '').trim()
  const { rec, dirty } = ensureRecord(cur, sid, shop, speciesKey, !shop ? bornMeta : null, username)
  if (dirty) {
    saveUserPets(username, { ...cur, growth: { ...cur.growth, [sid]: rec } })
  }
  const growable = Boolean(shop) || Boolean(bornMeta)
  return lookFromRecord(rec, growable)
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

export function tickPetBreeding(username) {
  if (!username) return { success: false }
  flushPetBag(username)
  const tank = getTankRoster(username)
  if (tank.length < 2) return { success: true }
  const cur = getUserPets(username)
  const growth = { ...cur.growth }
  const born = { ...cur.born }
  let dirty = false
  const now = Date.now()

  const defaultOnly = tank.filter((f) => !f.itemId && !born[f.id])
  const emptyIds = new Set(defaultOnly.slice(2).map((f) => f.id))

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
    const growable = Boolean(fish.itemId) || Boolean(fish.born)
    const adult = !growable || growthStage(rec.meals).key === 'adult'
    if (adult) adults.push({ fish, rec: growth[fish.id] || rec })
  })

  adults.forEach(({ fish, rec }) => {
    if (!rec.pregnant) return
    const started = Number(rec.pregnantAt) || 0
    if (!started || now - started < PET_PREGNANT_MS) return
    const empty = tank.find((f) => emptyIds.has(f.id) && f.id !== fish.id)
    if (!empty) return
    const mate = growth[rec.courtshipMate] || {}
    const species = rec.species || fish.key || 'betta'
    const colors = mixOffspringColors(rec, mate, species)
    const gen = Math.max(Number(rec.generation) || 0, Number(mate.generation) || 0) + 1
    born[empty.id] = {
      species,
      generation: gen,
      pretty: true,
      mother: fish.id,
      father: rec.courtshipMate || '',
      hue: colors.hue,
      sat: colors.sat,
      bri: colors.bri,
      fam: colors.fam
    }
    growth[empty.id] = hatchRecord('', species, {
      growable: true,
      generation: gen,
      pretty: true,
      fam: colors.fam,
      hue: colors.hue,
      sat: colors.sat,
      bri: colors.bri
    })
    growth[fish.id] = {
      ...rec,
      pregnant: false,
      pregnantAt: 0,
      courtshipAt: 0,
      courtshipMate: '',
      lastBirthAt: now
    }
    dirty = true
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
  return saveUserPets(username, { ...cur, growth, born })
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
  const mine = getTankRoster(username).map((f) => ({
    ...f,
    owner: username,
    growthSlotId: f.id,
    showcase: false
  }))
  return [...mine, ...getPublicShowcaseFish(username)]
}

const FISH_BASE_PRICE = {
  betta: 40,
  arowana: 88,
  arowana_blue: 98,
  ray_crown: 108,
  ray_albino: 118,
  arapaima: 128
}

export function canTradeTankFish(fish) {
  return Boolean(fish?.itemId || fish?.born)
}

export function getFishShopPrice(itemId, species) {
  const item = itemId ? getItem(itemId) : null
  const listed = Number(item?.price)
  if (listed > 0) return listed
  return FISH_BASE_PRICE[species] || FISH_BASE_PRICE.betta
}

export function getFishSellBackPrice(itemId, species) {
  if (!String(itemId || '').trim() && String(species || '') === 'betta') return 2
  return Math.max(1, Math.floor(getFishShopPrice(itemId, species) * 0.5))
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
    return { success: false, message: '預設鬥魚不能上架或賣回' }
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
  return saveUserPets(username, {
    ...cur,
    names,
    growth: { ...cur.growth, [slotId]: rec },
    born
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
