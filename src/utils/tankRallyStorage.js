import { syncKeyToSupabase } from './supabaseSync'

export const TANK_RALLIES_KEY = 'jiameng_tank_rallies'
const MAX_RALLIES = 24

function readAll() {
  try {
    const data = localStorage.getItem(TANK_RALLIES_KEY)
    const parsed = data ? JSON.parse(data) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function persist(all) {
  const val = JSON.stringify(all || {})
  localStorage.setItem(TANK_RALLIES_KEY, val)
  syncKeyToSupabase(TANK_RALLIES_KEY, val)
}

function clampFrac(n, lo = 0.08, hi = 0.92) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0.5
  return Math.max(lo, Math.min(hi, v))
}

function normalizeRally(row) {
  const species = String(row?.species || 'all').trim() || 'all'
  return {
    id: species,
    species,
    xf: clampFrac(row?.xf, 0.08, 0.92),
    yf: clampFrac(row?.yf, 0.18, 0.9)
  }
}

export function listTankRallies(account) {
  const user = String(account || '').trim()
  if (!user) return []
  const all = readAll()
  const rows = Array.isArray(all[user]) ? all[user] : []
  const seen = new Set()
  const next = []
  rows.forEach((row) => {
    const item = normalizeRally(row)
    if (seen.has(item.species)) return
    seen.add(item.species)
    next.push(item)
  })
  return next.slice(0, MAX_RALLIES)
}

export function upsertTankRally(account, species, xf, yf) {
  const user = String(account || '').trim()
  if (!user) return { success: false, rallies: [] }
  const item = normalizeRally({ species, xf, yf })
  const all = readAll()
  const rows = listTankRallies(user).filter((row) => row.species !== item.species)
  const next = [...rows, item].slice(0, MAX_RALLIES)
  persist({ ...all, [user]: next })
  return { success: true, rallies: next }
}

export function clearTankRally(account, species) {
  const user = String(account || '').trim()
  const want = String(species || '').trim() || 'all'
  if (!user) return { success: false, rallies: [] }
  const all = readAll()
  const next = listTankRallies(user).filter((row) => row.species !== want)
  persist({ ...all, [user]: next })
  return { success: true, rallies: next }
}

export function clearAllTankRallies(account) {
  const user = String(account || '').trim()
  if (!user) return { success: false, rallies: [] }
  const all = readAll()
  persist({ ...all, [user]: [] })
  return { success: true, rallies: [] }
}
