import { syncKeyToSupabase } from './supabaseSync'

export const TANK_LIGHTS_KEY = 'jiameng_tank_lights'
export const PLACE_TANK_LIGHT_FLAG = 'jiameng_place_tank_light'
const MAX_LIGHTS = 6

function readAll() {
  try {
    const data = localStorage.getItem(TANK_LIGHTS_KEY)
    const parsed = data ? JSON.parse(data) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function persist(all) {
  const val = JSON.stringify(all || {})
  localStorage.setItem(TANK_LIGHTS_KEY, val)
  syncKeyToSupabase(TANK_LIGHTS_KEY, val)
}

function normalizeLight(row) {
  const x = Math.max(0.06, Math.min(0.94, Number(row?.x)))
  if (!Number.isFinite(x)) return null
  return {
    id: String(row?.id || '').trim() || `lamp-${Date.now()}`,
    x,
    on: row?.on !== false
  }
}

export function listTankLights(account) {
  const user = String(account || '').trim()
  if (!user) return []
  const all = readAll()
  const rows = Array.isArray(all[user]) ? all[user] : []
  return rows.map(normalizeLight).filter(Boolean).slice(0, MAX_LIGHTS)
}

export function placeTankLight(account, xFrac) {
  const user = String(account || '').trim()
  if (!user) return { success: false, message: '未登入' }
  const x = Math.max(0.06, Math.min(0.94, Number(xFrac)))
  if (!Number.isFinite(x)) return { success: false, message: '位置無效' }
  const all = readAll()
  const rows = listTankLights(user)
  if (rows.length >= MAX_LIGHTS) return { success: false, message: '魚缸燈最多 6 盞' }
  const next = [...rows, { id: `lamp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x, on: true }]
  persist({ ...all, [user]: next })
  return { success: true, lights: next }
}

export function moveTankLight(account, id, xFrac) {
  const user = String(account || '').trim()
  const want = String(id || '')
  if (!user || !want) return { success: false, lights: [] }
  const x = Math.max(0.06, Math.min(0.94, Number(xFrac)))
  if (!Number.isFinite(x)) return { success: false, lights: listTankLights(user) }
  const all = readAll()
  const next = listTankLights(user).map((row) => (row.id === want ? { ...row, x } : row))
  persist({ ...all, [user]: next })
  return { success: true, lights: next }
}

export function recallTankLight(account, id) {
  const user = String(account || '').trim()
  const want = String(id || '')
  const rows = listTankLights(user)
  const found = rows.find((row) => row.id === want)
  if (!found) return { success: false, lights: rows }
  const next = rows.filter((row) => row.id !== want)
  const all = readAll()
  persist({ ...all, [user]: next })
  return { success: true, itemId: 'tank_light', lights: next }
}

export function toggleTankLight(account, id) {
  const user = String(account || '').trim()
  const want = String(id || '')
  if (!user || !want) return { success: false, lights: [] }
  const all = readAll()
  const next = listTankLights(user).map((row) => (row.id === want ? { ...row, on: !row.on } : row))
  persist({ ...all, [user]: next })
  return { success: true, lights: next }
}

export function beginPlaceTankLight() {
  try {
    sessionStorage.setItem(PLACE_TANK_LIGHT_FLAG, '1')
  } catch (_) {}
}

export function isPlacingTankLight() {
  try {
    return sessionStorage.getItem(PLACE_TANK_LIGHT_FLAG) === '1'
  } catch (_) {
    return false
  }
}

export function endPlaceTankLight() {
  try {
    sessionStorage.removeItem(PLACE_TANK_LIGHT_FLAG)
  } catch (_) {}
}
