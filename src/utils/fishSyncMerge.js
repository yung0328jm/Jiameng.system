const FISH_PACKS = {
  betta: true,
  guppy: true,
  gar: true,
  genghis: true,
  koi_platinum: true,
  redtail_cat: true,
  arowana: true,
  arowana_blue: true,
  ray_crown: true,
  ray_albino: true,
  arapaima: true,
  turtle_slider: true,
  turtle_pig: true,
  turtle_map: true
}
const MAX_FISH_SLOTS = 50

export function asObjectMap(raw) {
  let data = raw
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}')
    } catch (_) {
      return {}
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  return data
}

function tsOf(v) {
  return Date.parse(String(v || '')) || 0
}

function fishSkinItemId(id) {
  const s = String(id || '')
  return s.startsWith('fish_') && !s.startsWith('fish_potion_') && !s.startsWith('fish_slot')
}

function pickOwnedFish(a, b) {
  if (!a) return b
  if (!b) return a
  const ia = String(a.itemId || '').trim()
  const ib = String(b.itemId || '').trim()
  if (ia && !ib) return a
  if (ib && !ia) return b
  const ka = FISH_PACKS[a.key] && a.key !== 'betta'
  const kb = FISH_PACKS[b.key] && b.key !== 'betta'
  if (ka && !kb) return a
  if (kb && !ka) return b
  return tsOf(b.addedAt) >= tsOf(a.addedAt) ? b : a
}

function mergeRemoved(a, b) {
  const out = { ...(a && typeof a === 'object' ? a : {}), ...(b && typeof b === 'object' ? b : {}) }
  Object.keys(out).forEach((id) => {
    const ta = tsOf(a?.[id])
    const tb = tsOf(b?.[id])
    const keep = tb >= ta ? b?.[id] : a?.[id]
    if (keep) out[id] = keep
  })
  return out
}

function mergeOwned(aList, bList, removed) {
  const map = new Map()
  const add = (row) => {
    if (!row?.id) return
    const id = String(row.id)
    const tomb = tsOf(removed[id])
    const added = tsOf(row.addedAt)
    if (tomb && tomb >= added) return
    map.set(id, pickOwnedFish(map.get(id), row))
  }
  ;(Array.isArray(aList) ? aList : []).forEach(add)
  ;(Array.isArray(bList) ? bList : []).forEach(add)
  return Array.from(map.values()).slice(0, MAX_FISH_SLOTS)
}

function mergeMaps(a, b, pick) {
  const out = { ...(a && typeof a === 'object' ? a : {}) }
  Object.entries(b && typeof b === 'object' ? b : {}).forEach(([k, v]) => {
    if (out[k] == null) out[k] = v
    else out[k] = pick(out[k], v)
  })
  return out
}

function mergeGrowthRec(a, b) {
  if (!a) return b
  if (!b) return a
  const mealsA = Number(a.meals) || 0
  const mealsB = Number(b.meals) || 0
  const base = mealsB > mealsA ? b : a
  const other = base === b ? a : b
  const lastBirthAt = Math.max(Number(a.lastBirthAt) || 0, Number(b.lastBirthAt) || 0)
  const pregAtA = a.pregnant ? Number(a.pregnantAt) || 0 : 0
  const pregAtB = b.pregnant ? Number(b.pregnantAt) || 0 : 0
  const pregnantAt = Math.max(pregAtA, pregAtB)
  const pregnant = pregnantAt > 0 && lastBirthAt < pregnantAt && !!(a.pregnant || b.pregnant)
  const breed = lastBirthAt >= pregnantAt
    ? ((Number(a.lastBirthAt) || 0) >= (Number(b.lastBirthAt) || 0) ? a : b)
    : (pregAtA >= pregAtB ? a : b)
  const species = FISH_PACKS[a.species] && a.species !== 'betta'
    ? a.species
    : (FISH_PACKS[b.species] ? b.species : (base.species || other.species || 'betta'))
  return {
    ...other,
    ...base,
    species,
    meals: Math.max(mealsA, mealsB),
    births: Math.max(Number(a.births) || 0, Number(b.births) || 0),
    morph: base.morph || other.morph,
    gender: a.gender === 'f' || a.gender === 'm' ? a.gender : b.gender,
    lastBirthAt,
    pregnant,
    pregnantAt: pregnant ? pregnantAt : 0,
    courtshipAt: pregnant ? Number(breed.courtshipAt) || 0 : (lastBirthAt > 0 ? 0 : Number(breed.courtshipAt) || 0),
    courtshipHeld: pregnant ? Number(breed.courtshipHeld) || 0 : (lastBirthAt > 0 ? 0 : Number(breed.courtshipHeld) || 0),
    courtshipMate: pregnant
      ? (breed.courtshipMate || base.courtshipMate || other.courtshipMate || '')
      : (base.courtshipMate || other.courtshipMate || ''),
    wormDay: String(a.wormDay || '') >= String(b.wormDay || '') ? String(a.wormDay || '') : String(b.wormDay || ''),
    wormToday: String(a.wormDay || '') === String(b.wormDay || '')
      ? Math.max(Number(a.wormToday) || 0, Number(b.wormToday) || 0)
      : (String(a.wormDay || '') >= String(b.wormDay || '') ? Number(a.wormToday) || 0 : Number(b.wormToday) || 0)
  }
}

function mergePetUser(a, b) {
  if (!a) return b
  if (!b) return a
  const removed = mergeRemoved(a.removed, b.removed)
  const ownedA = Array.isArray(a.owned) ? a.owned : null
  const ownedB = Array.isArray(b.owned) ? b.owned : null
  const owned = ownedA || ownedB
    ? mergeOwned(ownedA || [], ownedB || [], removed)
    : null
  const live = new Set((owned || []).map((o) => String(o.id)))
  const growth = mergeMaps(a.growth, b.growth, mergeGrowthRec)
  const names = mergeMaps(a.names, b.names, (x, y) => (String(y || '').trim() ? y : x))
  const favorites = mergeMaps(a.favorites, b.favorites, (x, y) => {
    const na = x && typeof x === 'object' && 'on' in x ? x : (x === true ? { on: true, at: '' } : x)
    const nb = y && typeof y === 'object' && 'on' in y ? y : (y === true ? { on: true, at: '' } : y)
    if (!na) return nb
    if (!nb) return na
    return tsOf(nb.at) >= tsOf(na.at) ? nb : na
  })
  const fedAt = mergeMaps(a.fedAt, b.fedAt, (x, y) => (tsOf(y) >= tsOf(x) ? y : x))
  const born = mergeMaps(a.born, b.born, (x, y) => ({ ...x, ...y }))
  const roamingA = Array.isArray(a.roaming) ? a.roaming : []
  const roamingB = Array.isArray(b.roaming) ? b.roaming : []
  const roaming = Array.isArray(a.roaming) || Array.isArray(b.roaming)
    ? [...new Set([...roamingA, ...roamingB].map((id) => String(id || '')).filter((id) => live.has(id)))]
    : null
  const endedPairs = { ...(a.endedPairs || {}) }
  Object.entries(b.endedPairs || {}).forEach(([k, v]) => {
    if (tsOf(v) >= tsOf(endedPairs[k])) endedPairs[k] = v
  })
  const pairMap = {}
  ;[...(Array.isArray(a.breedPairs) ? a.breedPairs : []), ...(Array.isArray(b.breedPairs) ? b.breedPairs : [])].forEach((p) => {
    const maleId = String(p?.maleId || '')
    const femaleId = String(p?.femaleId || '')
    if (!maleId || !femaleId || !live.has(maleId) || !live.has(femaleId)) return
    const k = `${maleId}:${femaleId}`
    const startedAt = Number(p?.startedAt) || 0
    const endedAt = tsOf(endedPairs[k])
    if (endedAt && startedAt <= endedAt) return
    const prev = pairMap[k]
    if (!prev || startedAt >= (Number(prev.startedAt) || 0)) pairMap[k] = { maleId, femaleId, startedAt }
  })
  const pairs = Object.values(pairMap).slice(0, 3)
  const newer = tsOf(b.updatedAt) >= tsOf(a.updatedAt) ? b : a
  const showcase = live.has(String(newer.showcaseSlotId || '')) ? String(newer.showcaseSlotId) : ''
  return {
    ...a,
    ...b,
    names,
    favorites,
    fedAt,
    growth,
    born,
    owned,
    ownedMigrated: !!(a.ownedMigrated || b.ownedMigrated),
    petBag: (a.ownedMigrated || b.ownedMigrated) ? [] : ([...(Array.isArray(a.petBag) ? a.petBag : []), ...(Array.isArray(b.petBag) ? b.petBag : [])]),
    vacant: { ...(a.vacant || {}), ...(b.vacant || {}) },
    roaming,
    breedPairs: pairs,
    endedPairs,
    showcaseSlotId: showcase,
    removed,
    updatedAt: tsOf(b.updatedAt) >= tsOf(a.updatedAt) ? (b.updatedAt || a.updatedAt) : (a.updatedAt || b.updatedAt)
  }
}

export function mergePetsStore(cloud, incoming) {
  const a = asObjectMap(cloud)
  const b = asObjectMap(incoming)
  const out = {}
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((user) => {
    const row = mergePetUser(a[user], b[user])
    if (row) out[user] = row
  })
  return out
}

function remapInvItemId(id) {
  const s = String(id || '')
  if (s === 'fish_slot_expand') return 'fish_potion_worm'
  return s
}

function rowForId(list, id) {
  const want = remapInvItemId(id)
  let best = null
  ;(list || []).forEach((r) => {
    if (remapInvItemId(r?.itemId) !== want) return
    if (!best) {
      best = r
      return
    }
    const tr = tsOf(r.qtyAt)
    const tb = tsOf(best.qtyAt)
    const q = Math.max(0, Number(r.quantity) || 0)
    const bq = Math.max(0, Number(best.quantity) || 0)
    if (tr > tb || (tr === tb && q <= bq)) best = r
  })
  return best
}

function qtyOf(list, id) {
  return Math.max(0, Number(rowForId(list, id)?.quantity) || 0)
}

function pickInvQty(aList, bList, id) {
  const ra = rowForId(aList, id)
  const rb = rowForId(bList, id)
  const ta = tsOf(ra?.qtyAt)
  const tb = tsOf(rb?.qtyAt)
  const qa = qtyOf(aList, id)
  const qb = qtyOf(bList, id)
  if (ta && tb) {
    if (ta === tb) return Math.min(qa, qb)
    return ta > tb ? qa : qb
  }
  if (ta) return qa
  if (tb) return qb
  if (id.startsWith('fish_potion_') || fishSkinItemId(id)) return Math.min(qa, qb)
  return Math.max(qa, qb)
}

function mergeInvRows(aList, bList) {
  if (!Array.isArray(aList)) return Array.isArray(bList) ? bList : []
  if (!Array.isArray(bList)) return aList
  const map = new Map()
  ;[...aList, ...bList].forEach((row) => {
    const id = remapInvItemId(row?.itemId)
    if (!id) return
    const prev = map.get(id)
    const qty = pickInvQty(aList, bList, id)
    const obtainedAt = tsOf(row.obtainedAt) >= tsOf(prev?.obtainedAt) ? row.obtainedAt : prev?.obtainedAt
    const qtyAt = tsOf(row.qtyAt) >= tsOf(prev?.qtyAt) ? (row.qtyAt || prev?.qtyAt) : prev?.qtyAt
    map.set(id, { ...(prev || {}), ...row, itemId: id, quantity: qty, obtainedAt, qtyAt })
  })
  return Array.from(map.values()).filter((row) => {
    const q = Number(row.quantity) || 0
    if (q > 0) return true
    return tsOf(row.qtyAt) > 0
  })
}

function normalizeInvMap(raw) {
  const src = asObjectMap(raw)
  const out = {}
  Object.keys(src).forEach((k) => {
    const nk = String(k || '').trim()
    if (!nk) return
    const rows = Array.isArray(src[k]) ? src[k] : []
    out[nk] = out[nk] ? mergeInvRows(out[nk], rows) : rows
  })
  return out
}

export function mergeInventoriesStore(cloud, incoming) {
  const a = normalizeInvMap(cloud)
  const b = normalizeInvMap(incoming)
  const out = {}
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((user) => {
    out[user] = mergeInvRows(a[user], b[user])
  })
  return out
}

export function petsStoreRicher(merged, other) {
  const m = asObjectMap(merged)
  const o = asObjectMap(other)
  const count = (store) => Object.values(store).reduce((n, row) => n + (Array.isArray(row?.owned) ? row.owned.length : 0), 0)
  return count(m) > count(o)
}
