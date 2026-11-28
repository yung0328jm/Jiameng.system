import { syncKeyToSupabase } from './supabaseSync'

export const TANK_LIGHTS_KEY = 'jiameng_tank_lights'
export const PLACE_TANK_LIGHT_FLAG = 'jiameng_place_tank_light'
export const TANK_LIGHT_COLOR_ITEM_ID = 'tank_light_color'
export const TANK_LIGHT_BAR_ITEM_ID = 'tank_light_bar'
const MAX_LIGHTS = 8
const COLORS = ['white', 'blue', 'red']

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

export function kindFromItemId(itemId) {
  const id = String(itemId || '')
  if (id === TANK_LIGHT_COLOR_ITEM_ID) return 'color'
  if (id === TANK_LIGHT_BAR_ITEM_ID) return 'bar'
  return 'barrel'
}

export function itemIdFromLight(row) {
  const kind = String(row?.kind || '')
  if (kind === 'color' || row?.itemId === TANK_LIGHT_COLOR_ITEM_ID) return TANK_LIGHT_COLOR_ITEM_ID
  if (kind === 'bar' || row?.itemId === TANK_LIGHT_BAR_ITEM_ID) return TANK_LIGHT_BAR_ITEM_ID
  return 'tank_light'
}

function clampKindX(kind, xFrac) {
  const v = Number(xFrac)
  if (!Number.isFinite(v)) return 0.5
  if (kind === 'bar') return Math.max(0.28, Math.min(0.72, v))
  return Math.max(0.06, Math.min(0.94, v))
}

function clampColor(c) {
  return COLORS.includes(c) ? c : 'white'
}

function normalizeLight(row) {
  const kind = ['barrel', 'color', 'bar'].includes(row?.kind)
    ? row.kind
    : kindFromItemId(row?.itemId)
  const x = clampKindX(kind, row?.x)
  if (!Number.isFinite(x)) return null
  return {
    id: String(row?.id || '').trim() || `lamp-${Date.now()}`,
    itemId: itemIdFromLight({ ...row, kind }),
    kind,
    x,
    on: row?.on !== false,
    color: kind === 'color' ? clampColor(row?.color) : 'white'
  }
}

export function listTankLights(account) {
  const user = String(account || '').trim()
  if (!user) return []
  const all = readAll()
  const rows = Array.isArray(all[user]) ? all[user] : []
  return rows.map(normalizeLight).filter(Boolean).slice(0, MAX_LIGHTS)
}

export function placeTankLight(account, xFrac, itemId = 'tank_light') {
  const user = String(account || '').trim()
  if (!user) return { success: false, message: '未登入' }
  const kind = kindFromItemId(itemId)
  const x = clampKindX(kind, xFrac)
  if (!Number.isFinite(x)) return { success: false, message: '位置無效' }
  const all = readAll()
  const rows = listTankLights(user)
  if (rows.length >= MAX_LIGHTS) return { success: false, message: '魚缸燈最多 8 盞' }
  const next = [
    ...rows,
    {
      id: `lamp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId: itemIdFromLight({ kind, itemId }),
      kind,
      x,
      on: true,
      color: 'white'
    }
  ]
  persist({ ...all, [user]: next })
  return { success: true, lights: next, id: next[next.length - 1].id }
}

export function moveTankLight(account, id, xFrac) {
  const user = String(account || '').trim()
  const want = String(id || '')
  if (!user || !want) return { success: false, lights: [] }
  const all = readAll()
  const next = listTankLights(user).map((row) => {
    if (row.id !== want) return row
    return { ...row, x: clampKindX(row.kind, xFrac) }
  })
  persist({ ...all, [user]: next })
  return { success: true, lights: next }
}

export function setTankLightColor(account, id, color) {
  const user = String(account || '').trim()
  const want = String(id || '')
  if (!user || !want) return { success: false, lights: listTankLights(user) }
  const all = readAll()
  const next = listTankLights(user).map((row) => {
    if (row.id !== want || row.kind !== 'color') return row
    return { ...row, color: clampColor(color) }
  })
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
  return { success: true, itemId: itemIdFromLight(found), lights: next }
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
