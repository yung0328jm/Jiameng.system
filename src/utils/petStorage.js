import { syncKeyToSupabase } from './supabaseSync'
import { isGuestCloudWriteBlocked } from './guestAuth'

export const PET_STORAGE_KEY = 'jiameng_pets'

function emptyUser() {
  return { names: {}, fedAt: {} }
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
    fedAt: row.fedAt && typeof row.fedAt === 'object' ? row.fedAt : {}
  }
}

function saveUserPets(username, patch) {
  if (!username) return { success: false, message: '請先登入' }
  const all = readAll()
  all[username] = { ...emptyUser(), ...(all[username] || {}), ...patch }
  try {
    writeAll(all)
    return { success: true }
  } catch (e) {
    console.error('Error saving pets:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export function setPetName(username, slotId, name) {
  const cur = getUserPets(username)
  const names = { ...cur.names }
  const t = String(name || '').trim().slice(0, 12)
  if (t) names[slotId] = t
  else delete names[slotId]
  return saveUserPets(username, { names, fedAt: cur.fedAt })
}

export function feedPetSlots(username, slotIds) {
  const cur = getUserPets(username)
  const fedAt = { ...cur.fedAt }
  const now = new Date().toISOString()
  ;(Array.isArray(slotIds) ? slotIds : []).forEach((id) => {
    const k = String(id || '').trim()
    if (k) fedAt[k] = now
  })
  return saveUserPets(username, { names: cur.names, fedAt })
}

export function hungerStatus(fedAtIso, now = Date.now()) {
  const t = Date.parse(fedAtIso || '')
  if (!Number.isFinite(t)) return { key: 'hungry', label: '還沒餵過', hours: Infinity }
  const hours = (now - t) / 3600000
  if (hours < 6) return { key: 'full', label: '吃飽了', hours }
  if (hours < 18) return { key: 'ok', label: '還可以', hours }
  return { key: 'hungry', label: '肚子餓了', hours }
}

export function dropFishFood(x, y) {
  if (typeof window === 'undefined') return
  const cx = Number.isFinite(x) ? x : window.innerWidth * 0.5
  const cy = Number.isFinite(y) ? y : Math.max(90, window.innerHeight * 0.32)
  window.dispatchEvent(new CustomEvent('ocean-feed', { detail: { x: cx, y: cy } }))
}
