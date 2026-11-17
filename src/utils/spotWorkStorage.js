import { syncKeyToSupabase } from './supabaseSync'
import { isGuestCloudWriteBlocked } from './guestAuth'

export const SPOT_WORK_STORAGE_KEY = 'jiameng_spot_work_logs'
export const SPOT_WORK_PEOPLE_KEY = 'jiameng_spot_work_people'
export const SPOT_WORK_GROUPS_KEY = 'jiameng_spot_work_groups'
export const DIAN_WORK_STORAGE_KEY = 'jiameng_dian_work_logs'
export const DIAN_WORK_GROUPS_KEY = 'jiameng_dian_work_groups'
export const DIAN_WORK_SETTLE_KEY = 'jiameng_dian_work_settle'
export const SPOT_WORK_SETTLE_KEY = 'jiameng_spot_work_settle'

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

function normalizeSite(siteName) {
  return String(siteName || '').trim() || '（未填案場）'
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
    getLogByDate(groupId, dateStr, siteName) {
      const gid = String(groupId || '').trim()
      const d = String(dateStr || '').trim().slice(0, 10)
      const site = normalizeSite(siteName)
      if (!gid || !d) return null
      return (
        getLogs().find(
          (r) =>
            String(r?.groupId || '') === gid &&
            String(r?.date || '').slice(0, 10) === d &&
            normalizeSite(r?.siteName) === site
        ) || null
      )
    },
    getLogsForDateSite(dateStr, siteName) {
      const d = String(dateStr || '').trim().slice(0, 10)
      const site = normalizeSite(siteName)
      if (!d) return []
      const nameById = new Map(getGroups().map((g) => [g.id, g.name]))
      return getLogs()
        .filter(
          (r) =>
            String(r?.date || '').slice(0, 10) === d && normalizeSite(r?.siteName) === site
        )
        .map((r) => ({
          ...r,
          groupName: nameById.get(String(r?.groupId || '').trim()) || '點工'
        }))
        .sort((a, b) => String(a.groupName).localeCompare(String(b.groupName), 'zh-Hant'))
    },
    getMonthChips(year, month) {
      const y = Number(year)
      const mo = Number(month)
      if (!Number.isFinite(y) || !Number.isFinite(mo)) return new Map()
      const prefix = `${y}-${String(mo).padStart(2, '0')}`
      const nameById = new Map(getGroups().map((g) => [g.id, g.name]))
      const byDateSite = new Map()
      getLogs().forEach((r) => {
        const d = String(r?.date || '').slice(0, 10)
        if (!d.startsWith(prefix)) return
        const gid = String(r?.groupId || '').trim()
        if (!gid) return
        const siteName = normalizeSite(r.siteName)
        const k = `${d}\0${siteName}`
        if (!byDateSite.has(k)) {
          byDateSite.set(k, {
            date: d,
            siteName,
            count: 0,
            groups: []
          })
        }
        const chip = byDateSite.get(k)
        const n = Number(r.count) || 0
        chip.count += n
        chip.groups.push({
          groupId: gid,
          groupName: nameById.get(gid) || '點工',
          count: n
        })
      })
      const map = new Map()
      byDateSite.forEach((chip) => {
        chip.groups.sort((a, b) => String(a.groupName).localeCompare(String(b.groupName), 'zh-Hant'))
        if (!map.has(chip.date)) map.set(chip.date, [])
        map.get(chip.date).push(chip)
      })
      map.forEach((list, d) => {
        list.sort((a, b) => String(a.siteName).localeCompare(String(b.siteName), 'zh-Hant'))
        map.set(d, list)
      })
      return map
    },
    upsertLog({ groupId, date, siteName, entries, count, note, createdBy }) {
      const gid = String(groupId || '').trim()
      const d = String(date || todayDateStr()).trim().slice(0, 10)
      const site = String(siteName || '').trim()
      if (!gid) return { success: false, message: '請先選擇群組' }
      if (!site) return { success: false, message: '請選擇案場' }
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
        (r) =>
          String(r?.groupId || '') === gid &&
          String(r?.date || '').slice(0, 10) === d &&
          normalizeSite(r?.siteName) === normalizeSite(site)
      )
      const rec = {
        id: idx >= 0 ? logs[idx].id : newId('sw'),
        groupId: gid,
        date: d,
        siteName: site,
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
    deleteLog(groupId, dateStr, siteName) {
      const gid = String(groupId || '').trim()
      const d = String(dateStr || '').trim().slice(0, 10)
      const site = normalizeSite(siteName)
      if (!gid || !d) return { success: false, message: '參數無效' }
      try {
        writeJson(
          logsKey,
          getLogs().filter(
            (r) =>
              !(
                String(r?.groupId || '') === gid &&
                String(r?.date || '').slice(0, 10) === d &&
                normalizeSite(r?.siteName) === site
              )
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
    },
    getMonthReport(year, month) {
      const y = Number(year)
      const mo = Number(month)
      const empty = {
        year: y,
        month: mo,
        logCount: 0,
        totalWork: 0,
        overtimeHours: 0,
        unnamedDays: 0,
        sites: [],
        groups: []
      }
      if (!Number.isFinite(y) || !Number.isFinite(mo)) return empty
      const prefix = `${y}-${String(mo).padStart(2, '0')}`
      const nameById = new Map(getGroups().map((g) => [g.id, g.name]))
      const logs = getLogs().filter((r) => String(r?.date || '').slice(0, 10).startsWith(prefix))
      if (logs.length === 0) return empty

      const siteMap = new Map()
      const groupMap = new Map()

      const bumpSite = (siteName, { work = 0, ot = 0, unnamed = 0, groupName, personName, days = 0, personOt = 0 } = {}) => {
        if (!siteMap.has(siteName)) {
          siteMap.set(siteName, { siteName, workDays: 0, overtimeHours: 0, unnamedDays: 0, people: new Map() })
        }
        const s = siteMap.get(siteName)
        s.workDays += work
        s.overtimeHours += ot
        s.unnamedDays += unnamed
        if (personName) {
          const pk = `${groupName}\0${personName}`
          const prev = s.people.get(pk) || { groupName, name: personName, days: 0, overtimeHours: 0 }
          prev.days += days
          prev.overtimeHours += personOt
          s.people.set(pk, prev)
        }
      }

      const bumpGroupPerson = (gid, groupName, personName, siteName, days, ot) => {
        if (!groupMap.has(gid)) {
          groupMap.set(gid, {
            groupId: gid,
            groupName,
            workDays: 0,
            overtimeHours: 0,
            unnamedDays: 0,
            people: new Map()
          })
        }
        const g = groupMap.get(gid)
        g.workDays += days
        g.overtimeHours += ot
        if (personName === '未具名') g.unnamedDays += days
        if (!g.people.has(personName)) {
          g.people.set(personName, { name: personName, days: 0, overtimeHours: 0, sites: new Map() })
        }
        const p = g.people.get(personName)
        p.days += days
        p.overtimeHours += ot
        const prevSite = p.sites.get(siteName) || { siteName, days: 0, overtimeHours: 0 }
        prevSite.days += days
        prevSite.overtimeHours += ot
        p.sites.set(siteName, prevSite)
      }

      logs.forEach((r) => {
        const gid = String(r?.groupId || '').trim() || '_'
        const groupName = nameById.get(gid) || '未分群'
        const site = normalizeSite(r.siteName)
        const entries = normalizeEntries(r)
        const named = new Set()
        entries.forEach((e) => {
          named.add(e.name)
          const ot = roundHours(e.overtimeHours)
          bumpSite(site, {
            work: 1,
            ot,
            groupName,
            personName: e.name,
            days: 1,
            personOt: ot
          })
          bumpGroupPerson(gid, groupName, e.name, site, 1, ot)
        })
        const extra = Math.max(0, (Number(r.count) || 0) - named.size)
        if (extra > 0) {
          bumpSite(site, { work: extra, unnamed: extra, groupName, personName: '未具名', days: extra })
          bumpGroupPerson(gid, groupName, '未具名', site, extra, 0)
        }
      })

      const roundObjOt = (o) => ({ ...o, overtimeHours: roundHours(o.overtimeHours) })
      const sites = [...siteMap.values()]
        .map((s) =>
          roundObjOt({
            ...s,
            workDays: s.workDays,
            people: [...s.people.values()]
              .map(roundObjOt)
              .sort(
                (a, b) =>
                  b.days - a.days ||
                  String(a.groupName).localeCompare(String(b.groupName), 'zh-Hant') ||
                  String(a.name).localeCompare(String(b.name), 'zh-Hant')
              )
          })
        )
        .sort((a, b) => b.workDays - a.workDays || a.siteName.localeCompare(b.siteName, 'zh-Hant'))

      const groups = [...groupMap.values()]
        .map((g) =>
          roundObjOt({
            ...g,
            people: [...g.people.values()]
              .map((p) =>
                roundObjOt({
                  ...p,
                  sites: [...p.sites.values()]
                    .map(roundObjOt)
                    .sort((a, b) => b.days - a.days || a.siteName.localeCompare(b.siteName, 'zh-Hant'))
                })
              )
              .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'zh-Hant'))
          })
        )
        .sort((a, b) => String(a.groupName).localeCompare(String(b.groupName), 'zh-Hant'))

      return {
        year: y,
        month: mo,
        logCount: logs.length,
        totalWork: sites.reduce((s, x) => s + x.workDays, 0),
        overtimeHours: roundHours(sites.reduce((s, x) => s + x.overtimeHours, 0)),
        unnamedDays: sites.reduce((s, x) => s + x.unnamedDays, 0),
        sites,
        groups
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
export function getSpotWorkLogByDate(groupId, dateStr, siteName) {
  return hiddenSpotWorkStore.getLogByDate(groupId, dateStr, siteName)
}
export function upsertSpotWorkLog(payload) {
  return hiddenSpotWorkStore.upsertLog(payload)
}
export function deleteSpotWorkLog(groupId, dateStr, siteName) {
  return hiddenSpotWorkStore.deleteLog(groupId, dateStr, siteName)
}
export function getSpotWorkMonthStats(groupId, yearMonth) {
  return hiddenSpotWorkStore.getMonthStats(groupId, yearMonth)
}

export function getDianWorkMonthReport(year, month) {
  return dianWorkStore.getMonthReport(year, month)
}

function settleMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`
}

function settleCellKey(groupId, personName, siteName) {
  return `${String(groupId || '').trim()}|${String(personName || '').trim()}|${String(siteName || '').trim()}`
}

export function getSpotWorkSettleMap(year, month, settleKey = DIAN_WORK_SETTLE_KEY) {
  const all = readJson(settleKey, {})
  const data = all && typeof all === 'object' ? all[settleMonthKey(year, month)] : null
  return data && typeof data === 'object' ? { ...data } : {}
}

export function getDianWorkSettleMap(year, month) {
  return getSpotWorkSettleMap(year, month, DIAN_WORK_SETTLE_KEY)
}

export function isDianWorkSiteSettled(year, month, groupId, personName, siteName) {
  const map = getDianWorkSettleMap(year, month)
  return map[settleCellKey(groupId, personName, siteName)] === 'settled'
}

export function setSpotWorkSiteSettled(
  year,
  month,
  groupId,
  personName,
  siteName,
  settled,
  settleKey = DIAN_WORK_SETTLE_KEY
) {
  const allRaw = readJson(settleKey, {})
  const all = allRaw && typeof allRaw === 'object' && !Array.isArray(allRaw) ? allRaw : {}
  const mk = settleMonthKey(year, month)
  if (!all[mk] || typeof all[mk] !== 'object') all[mk] = {}
  const ck = settleCellKey(groupId, personName, siteName)
  if (settled) all[mk][ck] = 'settled'
  else delete all[mk][ck]
  if (Object.keys(all[mk]).length === 0) delete all[mk]
  try {
    writeJson(settleKey, all)
    return { success: true }
  } catch (e) {
    console.error('Error saving spot work settle status:', e)
    return { success: false, message: '儲存失敗' }
  }
}

export function setDianWorkSiteSettled(year, month, groupId, personName, siteName, settled) {
  return setSpotWorkSiteSettled(year, month, groupId, personName, siteName, settled, DIAN_WORK_SETTLE_KEY)
}
