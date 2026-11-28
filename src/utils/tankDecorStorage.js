import { syncKeyToSupabase } from './supabaseSync'

export const TANK_DECORS_KEY = 'jiameng_tank_decors'
export const TANK_EDIT_EVENT = 'ocean-tank-edit'
const MAX_DECORS = 40

function readAll() {
  try {
    const data = localStorage.getItem(TANK_DECORS_KEY)
    const parsed = data ? JSON.parse(data) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function persist(all) {
  const val = JSON.stringify(all || {})
  localStorage.setItem(TANK_DECORS_KEY, val)
  syncKeyToSupabase(TANK_DECORS_KEY, val)
}

function clampFrac(n, lo = 0.06, hi = 0.94) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0.5
  return Math.max(lo, Math.min(hi, v))
}

function clampScale(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 1
  return Math.max(0.35, Math.min(2.6, v))
}

function clampRot(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  const r = v % 360
  return r < 0 ? r + 360 : r
}

function normalizeDecor(row) {
  const itemId = String(row?.itemId || '').trim()
  if (!itemId) return null
  return {
    id: String(row?.id || '').trim() || `decor-${Date.now()}`,
    itemId,
    look: String(row?.look || 'plant'),
    x: clampFrac(row?.x),
    y: clampFrac(row?.y, 0.18, 0.94),
    scale: clampScale(row?.scale == null ? 1 : row.scale),
    rot: clampRot(row?.rot == null ? 0 : row.rot)
  }
}

export function listTankDecors(account) {
  const user = String(account || '').trim()
  if (!user) return []
  const all = readAll()
  const rows = Array.isArray(all[user]) ? all[user] : []
  return rows.map(normalizeDecor).filter(Boolean).slice(0, MAX_DECORS)
}

export function placeTankDecor(account, itemId, xFrac, yFrac, look = 'plant') {
  const user = String(account || '').trim()
  const id = String(itemId || '').trim()
  if (!user) return { success: false, message: '未登入' }
  if (!id) return { success: false, message: '道具無效' }
  const all = readAll()
  const rows = listTankDecors(user)
  if (rows.length >= MAX_DECORS) return { success: false, message: '水族道具最多 40 件' }
  const next = [
    ...rows,
    {
      id: `decor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId: id,
      look: String(look || 'plant'),
      x: clampFrac(xFrac),
      y: clampFrac(yFrac, 0.18, 0.94),
      scale: 1,
      rot: 0
    }
  ]
  persist({ ...all, [user]: next })
  return { success: true, decors: next, id: next[next.length - 1].id }
}

export function moveTankDecor(account, decorId, xFrac, yFrac) {
  return updateTankDecor(account, decorId, { x: xFrac, y: yFrac })
}

export function updateTankDecor(account, decorId, patch = {}) {
  const user = String(account || '').trim()
  const want = String(decorId || '')
  if (!user || !want) return { success: false, decors: listTankDecors(user) }
  const all = readAll()
  const next = listTankDecors(user).map((row) => {
    if (row.id !== want) return row
    return {
      ...row,
      x: patch.x == null ? row.x : clampFrac(patch.x),
      y: patch.y == null ? row.y : clampFrac(patch.y, 0.18, 0.94),
      scale: patch.scale == null ? row.scale : clampScale(patch.scale),
      rot: patch.rot == null ? row.rot : clampRot(patch.rot)
    }
  })
  persist({ ...all, [user]: next })
  return { success: true, decors: next }
}

export function recallTankDecor(account, decorId) {
  const user = String(account || '').trim()
  const want = String(decorId || '')
  const rows = listTankDecors(user)
  const found = rows.find((row) => row.id === want)
  if (!found) return { success: false, message: '找不到這件道具', decors: rows }
  const next = rows.filter((row) => row.id !== want)
  const all = readAll()
  persist({ ...all, [user]: next })
  return { success: true, itemId: found.itemId, decors: next }
}

export function openTankEdit(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TANK_EDIT_EVENT, { detail: { action: 'open', ...detail } }))
}

export function closeTankEdit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TANK_EDIT_EVENT, { detail: { action: 'close' } }))
}
