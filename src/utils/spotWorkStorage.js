import { syncKeyToSupabase } from './supabaseSync'
import { isGuestCloudWriteBlocked } from './guestAuth'

export const SPOT_WORK_STORAGE_KEY = 'jiameng_spot_work_logs'
export const SPOT_WORK_PEOPLE_KEY = 'jiameng_spot_work_people'
export const SPOT_WORK_GROUPS_KEY = 'jiameng_spot_work_groups'
export const DIAN_WORK_STORAGE_KEY = 'jiameng_dian_work_logs'
export const DIAN_WORK_GROUPS_KEY = 'jiameng_dian_work_groups'

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

export function createSpotWorkStore({ logsKey, groupsKey, peopleLegacyKey = '' }) {
  function migrateLegacyIfNeeded() {
    const existing = readJson(groupsKey, null)
    if (Array.isArray(existing)) return
    const oldPeople = peopleLegacyKey ? normalizeNames(readJson(peopleLegacyKey, [])) : []
    const logs = Array.isArray(readJson(logsKey, [])) ? readJson(logsKey, []) : []
    const unnamed = logs.some((r) => !String(r?.groupId || '').trim())
    if (oldPeople.length === 0 && !unnamed) {
      if (!Array.isArray(existing)) writeJson(groupsKey, [])
      return
    }
    const group = {
      id: newId('sg'),
      name: '未分群',
      people: oldPeople,
      createdAt: new Date().toISOString()
    }
    writeJson(groupsKey, [group])
    const nextLogs = logs.map((r) => {
      if (String(r?.groupId || '').trim()) return r
      return { ...r, groupId: group.id, entries: normalizeEntries(r) }
    })
    writeJson(logsKey, nextLogs)
  }

  function getGroups() {
    migrateLegacyIfNeeded()
    const list = readJson(groupsKey, [])
    return Array.isArray(list) ? list : []
  }

  function saveGroups(list) {
    writeJson(groupsKey, Array.isArray(list) ? list : [])
  }

  function getLogs() {
    migrateLegacyIfNeeded()
    const list = readJson(logsKey, [])
    return (Array.isArray(list) ? list : []).map((r) => ({
      ...r,
      entries: normalizeEntries(r)
    }))
  }

  return {
    logsKey,
    groupsKey,
    syncKeys: [logsKey, groupsKey],
    getGroups,
    getLogs,
    addGroup(name) {
      const t = String(name || '').trim()
      if (!t) return { success: false, message: '請輸入群組名稱' }
      const list = getGroups()
      if (list.some((g) => g.name === t)) return { success: false, message: '已有同名群組' }
      const rec = { id: newId('sg'), name: t, people: [], createdAt: new Date().toISOString() }
      try {
        saveGroups([...list, rec])
        return { success: true, group: rec }
      } catch (e) {
        return { success: false, message: '新增失敗' }
      }
    },
    deleteGroup(id) {
      const gid = String(id || '').trim()
      if (!gid) return { success: false, message: '群組無效' }
      try {
        saveGroups(getGroups().filter((g) => g.id !== gid))
        writeJson(logsKey, getLogs().filter((r) => String(r?.groupId || '') !== gid))
        return { success: true }
      } catch (e) {
        return { success: false, message: '刪除失敗' }
      }
    },
    getPeople(groupId) {
      const gid = String(groupId || '').trim()
      const g = getGroups().find((x) => x.id === gid)
      const names = normalizeNames(g?.people)
      names.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      return names
    },
    addPerson(groupId, name) {
      const gid = String(groupId || '').trim()
      const t = String(name || '').trim()
      if (!gid) return { success: false, message: '請先選擇群組' }
      if (!t) return { success: false, message: '請輸入姓名' }
      const list = getGroups()
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
    },
    deletePerson(groupId, name) {
      const gid = String(groupId || '').trim()
      const t = String(name || '').trim()
      if (!gid || !t) return { success: false, message: '參數無效' }
      const list = getGroups()
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
    },
    getLogByDate(groupId, dateStr) {
      const gid = String(groupId || '').trim()
      const d = String(dateStr || '').trim().slice(0, 10)
      if (!gid || !d) return null
      return (
        getLogs().find(
          (r) => String(r?.groupId || '') === gid && String(r?.date || '').slice(0, 10) === d
        ) || null
      )
    },
    upsertLog({ groupId, date, entries, count, note, createdBy }) {
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
      const logs = getLogs()
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
      logs.sort(
        (a, b) => String(b.date).localeCompare(String(a.date)) || String(a.groupId).localeCompare(String(b.groupId))
      )
      try {
        writeJson(logsKey, logs)
        return { success: true, record: rec }
      } catch (e) {
        console.error('Error saving spot work log:', e)
        return { success: false, message: '儲存失敗' }
      }
    },
    deleteLog(groupId, dateStr) {
      const gid = String(groupId || '').trim()
      const d = String(dateStr || '').trim().slice(0, 10)
      if (!gid || !d) return { success: false, message: '參數無效' }
      try {
        writeJson(
          logsKey,
          getLogs().filter(
            (r) => !(String(r?.groupId || '') === gid && String(r?.date || '').slice(0, 10) === d)
          )
        )
        return { success: true }
      } catch (e) {
        return { success: false, message: '刪除失敗' }
      }
    },
    getMonthStats(groupId, yearMonth) {
      const gid = String(groupId || '').trim()
      const ym = String(yearMonth || '').trim()
      const logs = getLogs().filter(
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
  }
}

/** 窗花連點 6 下：隱藏點工（獨立資料） */
export const hiddenSpotWorkStore = createSpotWorkStore({
  logsKey: SPOT_WORK_STORAGE_KEY,
  groupsKey: SPOT_WORK_GROUPS_KEY,
  peopleLegacyKey: SPOT_WORK_PEOPLE_KEY
})

/** 行事曆「點工登記」：同一套操作，另一份資料 */
export const dianWorkStore = createSpotWorkStore({
  logsKey: DIAN_WORK_STORAGE_KEY,
  groupsKey: DIAN_WORK_GROUPS_KEY
})

export function getSpotWorkGroups() {
  return hiddenSpotWorkStore.getGroups()
}
export function addSpotWorkGroup(name) {
  return hiddenSpotWorkStore.addGroup(name)
}
export function deleteSpotWorkGroup(id) {
  return hiddenSpotWorkStore.deleteGroup(id)
}
export function getSpotWorkPeople(groupId) {
  return hiddenSpotWorkStore.getPeople(groupId)
}
export function addSpotWorkPerson(groupId, name) {
  return hiddenSpotWorkStore.addPerson(groupId, name)
}
export function deleteSpotWorkPerson(groupId, name) {
  return hiddenSpotWorkStore.deletePerson(groupId, name)
}
export function getSpotWorkLogs() {
  return hiddenSpotWorkStore.getLogs()
}
export function getSpotWorkLogByDate(groupId, dateStr) {
  return hiddenSpotWorkStore.getLogByDate(groupId, dateStr)
}
export function upsertSpotWorkLog(payload) {
  return hiddenSpotWorkStore.upsertLog(payload)
}
export function deleteSpotWorkLog(groupId, dateStr) {
  return hiddenSpotWorkStore.deleteLog(groupId, dateStr)
}
export function getSpotWorkMonthStats(groupId, yearMonth) {
  return hiddenSpotWorkStore.getMonthStats(groupId, yearMonth)
}
