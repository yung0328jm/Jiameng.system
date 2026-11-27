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
  const pregnant = !!(a.pregnant || b.pregnant)
  const preg = a.pregnant ? a : b
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
    pregnant,
    pregnantAt: pregnant ? (preg.pregnantAt || base.pregnantAt || 0) : 0,
    courtshipMate: pregnant ? (preg.courtshipMate || base.courtshipMate || '') : (base.courtshipMate || other.courtshipMate || '')
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
  const fedAt = mergeMaps(a.fedAt, b.fedAt, (x, y) => (tsOf(y) >= tsOf(x) ? y : x))
  const born = mergeMaps(a.born, b.born, (x, y) => ({ ...x, ...y }))
  const roamingA = Array.isArray(a.roaming) ? a.roaming : []
  const roamingB = Array.isArray(b.roaming) ? b.roaming : []
  const roaming = Array.isArray(a.roaming) || Array.isArray(b.roaming)
    ? [...new Set([...roamingA, ...roamingB].map((id) => String(id || '')).filter((id) => live.has(id)))]
    : null
  const pairs = []
  const seen = new Set()
  ;[...(Array.isArray(a.breedPairs) ? a.breedPairs : []), ...(Array.isArray(b.breedPairs) ? b.breedPairs : [])].forEach((p) => {
    const maleId = String(p?.maleId || '')
    const femaleId = String(p?.femaleId || '')
    const k = `${maleId}:${femaleId}`
    if (!maleId || !femaleId || seen.has(k) || !live.has(maleId) || !live.has(femaleId)) return
    seen.add(k)
    pairs.push({ maleId, femaleId })
  })
  const newer = tsOf(b.updatedAt) >= tsOf(a.updatedAt) ? b : a
  const showcase = live.has(String(newer.showcaseSlotId || '')) ? String(newer.showcaseSlotId) : ''
  return {
    ...a,
    ...b,
    names,
    fedAt,
    growth,
    born,
    owned,
    ownedMigrated: !!(a.ownedMigrated || b.ownedMigrated),
    petBag: (a.ownedMigrated || b.ownedMigrated) ? [] : ([...(Array.isArray(a.petBag) ? a.petBag : []), ...(Array.isArray(b.petBag) ? b.petBag : [])]),
    vacant: { ...(a.vacant || {}), ...(b.vacant || {}) },
    roaming,
    breedPairs: pairs.slice(0, 3),
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

function qtyOf(list, id) {
  const row = (list || []).find((r) => String(r?.itemId || '') === id)
  return Math.max(0, Number(row?.quantity) || 0)
}

function mergeInvRows(aList, bList) {
  if (!Array.isArray(aList)) return Array.isArray(bList) ? bList : []
  if (!Array.isArray(bList)) return aList
  const map = new Map()
  ;[...aList, ...bList].forEach((row) => {
    const id = String(row?.itemId || '')
    if (!id) return
    const prev = map.get(id)
    const qty = fishSkinItemId(id)
      ? Math.min(qtyOf(aList, id), qtyOf(bList, id))
      : Math.max(qtyOf(aList, id), qtyOf(bList, id))
    const obtainedAt = tsOf(row.obtainedAt) >= tsOf(prev?.obtainedAt) ? row.obtainedAt : prev?.obtainedAt
    map.set(id, { ...(prev || {}), ...row, itemId: id, quantity: qty, obtainedAt })
  })
  return Array.from(map.values()).filter((row) => (Number(row.quantity) || 0) > 0)
}

export function mergeInventoriesStore(cloud, incoming) {
  const a = asObjectMap(cloud)
  const b = asObjectMap(incoming)
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
