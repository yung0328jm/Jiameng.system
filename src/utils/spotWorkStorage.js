import { syncKeyToSupabase } from './supabaseSync'
import { isGuestCloudWriteBlocked } from './guestAuth'

export const SPOT_WORK_STORAGE_KEY = 'jiameng_spot_work_logs'
export const SPOT_WORK_PEOPLE_KEY = 'jiameng_spot_work_people'
export const SPOT_WORK_GROUPS_KEY = 'jiameng_spot_work_groups'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeNames(names) {
  const seen = new Set()
  const out = []
  ;(Array.isArray(names) ? names : []).forEach((n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  })
  return out
}

function roundHours(n) {
  const x = Number(n) || 0
  if (!Number.isFinite(x) || x <= 0) return 0
  return Math.round(x * 10) / 10
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    return parsed
  } catch (e) {
    return fallback
  }
}

function writeJson(key, data) {
  const val = JSON.stringify(data)
  localStorage.setItem(key, val)
  if (!isGuestCloudWriteBlocked()) syncKeyToSupabase(key, val)
}

function normalizeEntries(rec) {
  if (Array.isArray(rec?.entries) && rec.entries.length > 0) {
    return rec.entries
      .map((e) => ({
        name: String(e?.name || '').trim(),
        startTime: String(e?.startTime || '').trim().slice(0, 5),
        overtimeHours: roundHours(e?.overtimeHours)
      }))
      .filter((e) => e.name)
  }
  return (rec?.names || []).map((n) => ({
    name: String(n || '').trim(),
    startTime: String(rec?.startTime || '').trim().slice(0, 5),
    overtimeHours: 0
  })).filter((e) => e.name)
}

export function getSpotWorkGroups() {
  migrateLegacyIfNeeded()
  const list = readJson(SPOT_WORK_GROUPS_KEY, [])
  return Array.isArray(list) ? list : []
}

function saveGroups(list) {
  writeJson(SPOT_WORK_GROUPS_KEY, Array.isArray(list) ? list : [])
}

function migrateLegacyIfNeeded() {
  const existing = readJson(SPOT_WORK_GROUPS_KEY, null)
  if (Array.isArray(existing)) return
  const oldPeople = normalizeNames(readJson(SPOT_WORK_PEOPLE_KEY, []))
  const logs = Array.isArray(readJson(SPOT_WORK_STORAGE_KEY, [])) ? readJson(SPOT_WORK_STORAGE_KEY, []) : []
  const unnamed = logs.some((r) => !String(r?.groupId || '').trim())
  if (oldPeople.length === 0 && !unnamed) {
    if (!Array.isArray(existing)) writeJson(SPOT_WORK_GROUPS_KEY, [])
    return
  }
  const group = {
    id: newId('sg'),
    name: '未分群',
    people: oldPeople,
    createdAt: new Date().toISOString()
  }
  writeJson(SPOT_WORK_GROUPS_KEY, [group])
  const nextLogs = logs.map((r) => {
    if (String(r?.groupId || '').trim()) return r
    return { ...r, groupId: group.id, entries: normalizeEntries(r) }
  })
  writeJson(SPOT_WORK_STORAGE_KEY, nextLogs)
}

export function addSpotWorkGroup(name) {
  const t = String(name || '').trim()
  if (!t) return { success: false, message: '請輸入群組名稱' }
  const list = getSpotWorkGroups()
  if (list.some((g) => g.name === t)) return { success: false, message: '已有同名群組' }
  const rec = { id: newId('sg'), name: t, people: [], createdAt: new Date().toISOString() }
  try {
    saveGroups([...list, rec])
    return { success: true, group: rec }
  } catch (e) {
    return { success: false, message: '新增失敗' }
  }
}

export function renameSpotWorkGroup(id, name) {
  const gid = String(id || '').trim()
  const t = String(name || '').trim()
  if (!gid || !t) return { success: false, message: '名稱無效' }
  const list = getSpotWorkGroups()
  const idx = list.findIndex((g) => g.id === gid)
  if (idx < 0) return { success: false, message: '找不到群組' }
  if (list.some((g) => g.id !== gid && g.name === t)) return { success: false, message: '已有同名群組' }
  list[idx] = { ...list[idx], name: t }
  try {
    saveGroups(list)
    return { success: true, group: list[idx] }
  } catch (e) {
    return { success: false, message: '更新失敗' }
  }
}

export function deleteSpotWorkGroup(id) {
  const gid = String(id || '').trim()
  if (!gid) return { success: false, message: '群組無效' }
  try {
    saveGroups(getSpotWorkGroups().filter((g) => g.id !== gid))
    const logs = getSpotWorkLogs().filter((r) => String(r?.groupId || '') !== gid)
    writeJson(SPOT_WORK_STORAGE_KEY, logs)
    return { success: true }
  } catch (e) {
    return { success: false, message: '刪除失敗' }
  }
}

export function getSpotWorkPeople(groupId) {
  const gid = String(groupId || '').trim()
  const g = getSpotWorkGroups().find((x) => x.id === gid)
  const names = normalizeNames(g?.people)
  names.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return names
}

export function addSpotWorkPerson(groupId, name) {
  const gid = String(groupId || '').trim()
  const t = String(name || '').trim()
  if (!gid) return { success: false, message: '請先選擇群組' }
  if (!t) return { success: false, message: '請輸入姓名' }
  const list = getSpotWorkGroups()
  const idx = list.findIndex((g) => g.id === gid)
  if (idx < 0) return { success: false, message: '找不到群組' }
  const people = normalizeNames(list[idx].people)
  if (people.includes(t)) return { success: false, message: '這個人已經在名單裡' }
  people.push(t)
  people.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  list[idx] = { ...list[idx], people }
  try {
    saveGroups(list)
    return { success: true, names: people }
  } catch (e) {
    return { success: false, message: '新增失敗' }
  }
}

export function deleteSpotWorkPerson(groupId, name) {
  const gid = String(groupId || '').trim()
  const t = String(name || '').trim()
  if (!gid || !t) return { success: false, message: '參數無效' }
  const list = getSpotWorkGroups()
  const idx = list.findIndex((g) => g.id === gid)
  if (idx < 0) return { success: false, message: '找不到群組' }
  const people = normalizeNames(list[idx].people).filter((n) => n !== t)
  list[idx] = { ...list[idx], people }
  try {
    saveGroups(list)
    return { success: true, names: people }
  } catch (e) {
    return { success: false, message: '刪除失敗' }
  }
}

export function getSpotWorkLogs() {
  migrateLegacyIfNeeded()
  const list = readJson(SPOT_WORK_STORAGE_KEY, [])
  return (Array.isArray(list) ? list : []).map((r) => ({
    ...r,
    entries: normalizeEntries(r)
  }))
}

export function getSpotWorkLogByDate(groupId, dateStr) {
  const gid = String(groupId || '').trim()
  const d = String(dateStr || '').trim().slice(0, 10)
  if (!gid || !d) return null
  return getSpotWorkLogs().find(
    (r) => String(r?.groupId || '') === gid && String(r?.date || '').slice(0, 10) === d
  ) || null
}

export function upsertSpotWorkLog({ groupId, date, entries, count, note, createdBy }) {
  const gid = String(groupId || '').trim()
  const d = String(date || todayDateStr()).trim().slice(0, 10)
  if (!gid) return { success: false, message: '請先選擇群組' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { success: false, message: '日期無效' }
  const listEntries = normalizeEntries({ entries })
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const people = Math.max(n, listEntries.length)
  if (people <= 0 && listEntries.length === 0) {
    return { success: false, message: '請填人數或至少選一位出工者' }
  }
  const now = new Date().toISOString()
  const logs = getSpotWorkLogs()
  const idx = logs.findIndex(
    (r) => String(r?.groupId || '') === gid && String(r?.date || '').slice(0, 10) === d
  )
  const rec = {
    id: idx >= 0 ? logs[idx].id : newId('sw'),
    groupId: gid,
    date: d,
    names: listEntries.map((e) => e.name),
    entries: listEntries,
    count: people,
    note: String(note || '').trim(),
    createdAt: idx >= 0 ? logs[idx].createdAt || now : now,
    createdBy: String(createdBy || (idx >= 0 ? logs[idx].createdBy : '') || '').trim(),
    updatedAt: now
  }
  if (idx >= 0) logs[idx] = rec
  else logs.push(rec)
  logs.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.groupId).localeCompare(String(b.groupId)))
  try {
    writeJson(SPOT_WORK_STORAGE_KEY, logs)
    return { success: true, record: rec }
  } catch (e) {
    console.error('Error saving spot work log:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export function deleteSpotWorkLog(groupId, dateStr) {
  const gid = String(groupId || '').trim()
  const d = String(dateStr || '').trim().slice(0, 10)
  if (!gid || !d) return { success: false, message: '參數無效' }
  try {
    writeJson(
      SPOT_WORK_STORAGE_KEY,
      getSpotWorkLogs().filter(
        (r) => !(String(r?.groupId || '') === gid && String(r?.date || '').slice(0, 10) === d)
      )
    )
    return { success: true }
  } catch (e) {
    return { success: false, message: '刪除失敗' }
  }
}

export function getSpotWorkMonthStats(groupId, yearMonth) {
  const gid = String(groupId || '').trim()
  const ym = String(yearMonth || '').trim()
  const logs = getSpotWorkLogs().filter(
    (r) => String(r?.groupId || '') === gid && String(r?.date || '').startsWith(ym)
  )
  const byPerson = new Map()
  let unnamedDays = 0
  let overtimeHours = 0
  logs.forEach((r) => {
    const entries = normalizeEntries(r)
    const named = new Set()
    entries.forEach((e) => {
      named.add(e.name)
      const prev = byPerson.get(e.name) || { name: e.name, days: 0, overtimeHours: 0 }
      prev.days += 1
      prev.overtimeHours += roundHours(e.overtimeHours)
      byPerson.set(e.name, prev)
      overtimeHours += roundHours(e.overtimeHours)
    })
    const extra = Math.max(0, (Number(r.count) || 0) - named.size)
    unnamedDays += extra
  })
  const people = [...byPerson.values()]
    .map((p) => ({ ...p, overtimeHours: roundHours(p.overtimeHours) }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'zh-Hant'))
  const totalWork = people.reduce((s, p) => s + p.days, 0) + unnamedDays
  return {
    yearMonth: ym,
    dayCount: logs.length,
    totalWork,
    overtimeHours: roundHours(overtimeHours),
    unnamedDays,
    people
  }
}
