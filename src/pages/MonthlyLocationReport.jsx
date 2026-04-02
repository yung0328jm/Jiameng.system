import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { getCurrentUserRole } from '../utils/authStorage'
import {
  normalizeWorkItem,
  getWorkItemCollaborators,
  expandWorkItemsToLogical
} from '../utils/workItemCollaboration'
import {
  getMonthlyOverrides,
  setMonthlyCellOverride,
  getOverrideNamesForMonth,
  MONTHLY_LOCATION_OVERRIDES_KEY
} from '../utils/monthlyLocationReportStorage'
import { getLeaveApplications } from '../utils/leaveApplicationStorage'
import { getOvertimeApplications } from '../utils/overtimeApplicationStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { useSyncRevision } from '../contexts/SyncContext'
import {
  getDayNature,
  getAllDayNatureStorage,
  setMonthlyDayNatureOverride,
  MONTHLY_DAY_NATURE_KEY
} from '../utils/monthlyDayNatureStorage'

const OVERTIME_APPLICATIONS_STORAGE_KEY = 'jiameng_overtime_applications'

function getScheduleSegments(schedule) {
  if (!schedule) return []
  const segs = Array.isArray(schedule.segments) ? schedule.segments : null
  if (segs && segs.length > 0) {
    return segs.map((s) => ({
      siteName: String(s?.siteName ?? '').trim(),
      workItems: Array.isArray(s?.workItems) ? s.workItems : []
    }))
  }
  const siteName = String(schedule.siteName ?? '').trim()
  const workItems = Array.isArray(schedule.workItems) ? schedule.workItems : []
  return [{ siteName, workItems }]
}

function parseParticipants(str) {
  if (!str || typeof str !== 'string') return []
  return str
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 不列入工時／案場報表統計的排程標籤（與行事曆表單一致） */
const SCHEDULE_TAG_EXCLUDE_FROM_LOCATION_REPORT = '行政'

/**
 * 行事曆自動：name -> dateStr -> Map(siteName -> 加權天數)。
 * 同一人在同一天：所有排程的每個案場 segment 各算一「筆」，合計 K 筆則每筆權重 1/K（單卡多案場、或多張卡上午／下午皆同）。
 * 參與者與工項人員同 segment 去重；標籤「行政」整卡略過。不含手動覆寫。
 */
function buildScheduleMap(year, month) {
  const schedules = getSchedules()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const map = new Map()

  const addSiteWeight = (name, dateStr, siteName, weight) => {
    const n = String(name || '').trim()
    if (!n || !dateStr) return
    const w = Number(weight)
    if (!w || w <= 0) return
    const s = String(siteName || '').trim() || '（未填案場）'
    if (!map.has(n)) map.set(n, new Map())
    const byDate = map.get(n)
    if (!byDate.has(dateStr)) byDate.set(dateStr, new Map())
    const bySite = byDate.get(dateStr)
    bySite.set(s, (bySite.get(s) || 0) + w)
  }

  const personDayGroupKey = (name, dateStr) => `${String(name || '').trim()}\0${dateStr}`
  const contributions = []

  schedules.forEach((schedule) => {
    const dateStr = String(schedule?.date || '').slice(0, 10)
    if (!dateStr || dateStr < startDate || dateStr > endDate) return
    if (String(schedule?.tag || '').trim() === SCHEDULE_TAG_EXCLUDE_FROM_LOCATION_REPORT) return

    const segments = getScheduleSegments(schedule)
    segments.forEach((seg) => {
      const siteName = String(seg.siteName || '').trim() || '（未填案場）'
      const namesForSeg = new Set()
      parseParticipants(schedule.participants).forEach((name) => {
        const n = String(name || '').trim()
        if (n) namesForSeg.add(n)
      })
      const items = Array.isArray(seg.workItems) ? seg.workItems : []
      expandWorkItemsToLogical(items).forEach((raw) => {
        const it = normalizeWorkItem(raw)
        if (String(it?.changeRequest?.status || '') === 'pending') return
        const collabs = getWorkItemCollaborators(it)
        if (collabs.length > 0) {
          collabs.forEach((c) => {
            const n = String(c?.name || '').trim()
            if (n) namesForSeg.add(n)
          })
        } else {
          const rp = String(it?.responsiblePerson || '').trim()
          if (rp) namesForSeg.add(rp)
        }
      })
      namesForSeg.forEach((n) => contributions.push({ name: n, dateStr, siteName }))
    })
  })

  const byPersonDay = new Map()
  contributions.forEach((c) => {
    const k = personDayGroupKey(c.name, c.dateStr)
    if (!byPersonDay.has(k)) byPersonDay.set(k, [])
    byPersonDay.get(k).push(c.siteName)
  })

  byPersonDay.forEach((siteNames, k) => {
    const sep = k.indexOf('\0')
    if (sep < 0) return
    const name = k.slice(0, sep)
    const dateStr = k.slice(sep + 1)
    const K = siteNames.length
    if (K === 0) return
    const w = 1 / K
    siteNames.forEach((site) => addSiteWeight(name, dateStr, site, w))
  })

  return { map, lastDay }
}

/** 與 buildScheduleMap 同規則：該 segment 內參與者＋工項人員 */
function namesForScheduleSegment(schedule, seg) {
  const namesForSeg = new Set()
  parseParticipants(schedule.participants).forEach((n) => {
    const x = String(n || '').trim()
    if (x) namesForSeg.add(x)
  })
  const items = Array.isArray(seg.workItems) ? seg.workItems : []
  expandWorkItemsToLogical(items).forEach((raw) => {
    const it = normalizeWorkItem(raw)
    if (String(it?.changeRequest?.status || '') === 'pending') return
    const collabs = getWorkItemCollaborators(it)
    if (collabs.length > 0) {
      collabs.forEach((c) => {
        const x = String(c?.name || '').trim()
        if (x) namesForSeg.add(x)
      })
    } else {
      const rp = String(it?.responsiblePerson || '').trim()
      if (rp) namesForSeg.add(rp)
    }
  })
  return namesForSeg
}

function computeOvertimeRecordHours(oa) {
  if (oa?.hours != null && oa.hours !== '') {
    const h = Number(oa.hours)
    if (Number.isFinite(h) && h > 0) return h
  }
  const start = String(oa?.startTime || '').trim()
  const end = String(oa?.endTime || '').trim()
  if (!start || !end) return null
  const st = start.split(':').map(Number)
  const en = end.split(':').map(Number)
  if (st.length < 2 || en.length < 2) return null
  let minStart = st[0] * 60 + st[1]
  let minEnd = en[0] * 60 + en[1]
  if (minEnd <= minStart) minEnd += 24 * 60
  const hrs = (minEnd - minStart) / 60
  return Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 10) / 10 : null
}

function overtimeHoursKey(personName, dateStr, siteName) {
  return `${String(personName || '').trim()}\0${String(dateStr || '').slice(0, 10)}\0${String(siteName || '').trim()}`
}

/**
 * 已核准加班 → Map「姓名\0日期\0案場」→ 小時；同人同排程多 segment 時數平分至有列入的案場。
 * 與績效頁一致：排程已刪則不計；行政標籤排程不計。
 */
function buildOvertimeHoursMap(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const schedules = getSchedules()
  const acc = new Map()

  const add = (person, dateStr, site, hrs) => {
    const p = String(person || '').trim()
    const s = String(site || '').trim() || '（未填案場）'
    if (!p || !dateStr || !hrs || hrs <= 0) return
    const k = overtimeHoursKey(p, dateStr, s)
    acc.set(k, (acc.get(k) || 0) + hrs)
  }

  getOvertimeApplications().forEach((oa) => {
    if (String(oa?.status || '') !== 'approved') return
    const dateStr = String(oa.date || '').trim().replace(/\//g, '-').slice(0, 10)
    if (!dateStr || dateStr < startDate || dateStr > endDate) return
    const hours = computeOvertimeRecordHours(oa)
    if (hours == null || hours <= 0) return
    const schedule = schedules.find((s) => String(s?.id || '') === String(oa?.scheduleId || ''))
    if (!schedule) return
    if (String(schedule?.tag || '').trim() === SCHEDULE_TAG_EXCLUDE_FROM_LOCATION_REPORT) return

    const personnel = (Array.isArray(oa.overtimePersonnel) ? oa.overtimePersonnel : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
    const list =
      personnel.length > 0
        ? personnel
        : [String(oa.applicant || '').trim()].filter(Boolean)
    if (list.length === 0) return

    const segments = getScheduleSegments(schedule)
    list.forEach((personName) => {
      const sites = new Set()
      segments.forEach((seg) => {
        const set = namesForScheduleSegment(schedule, seg)
        if (set.has(personName)) {
          const sn = String(seg.siteName || '').trim() || '（未填案場）'
          sites.add(sn)
        }
      })
      if (sites.size === 0) {
        const fb =
          String(segments[0]?.siteName || schedule.siteName || '').trim() || '（未填案場）'
        add(personName, dateStr, fb, hours)
        return
      }
      const per = hours / sites.size
      sites.forEach((site) => add(personName, dateStr, site, per))
    })
  })

  return acc
}

/**
 * 標為「假日」且非週日：當日有出工加權時每人另計 8 小時（多案場平分），再與核准加班加總。
 * 週日不論標為平日或假日均不套用 +8。預設週六、週日為假日，其餘平日（可於日期欄覆寫）。
 */
const HOLIDAY_WORK_BONUS_HOURS = 8

function dayQualifiesForHolidayWorkBonus(year, month, day, dayNatureAll) {
  const dow = new Date(year, month - 1, day).getDay()
  if (dow === 0) return false
  return getDayNature(year, month, day, dayNatureAll) === 'holiday'
}

function applyHolidayAttendanceBonus(
  baseMap,
  year,
  month,
  userNames,
  days,
  overrides,
  scheduleMap,
  leaveCellTextMap,
  dayNatureAll
) {
  const out = new Map(baseMap)
  userNames.forEach((personName) => {
    days.forEach((d) => {
      if (!dayQualifiesForHolidayWorkBonus(year, month, d, dayNatureAll)) return
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const wmap = getCellSiteWeightsForCell(personName, dateStr, overrides, scheduleMap, leaveCellTextMap)
      const sites = [...wmap.entries()]
        .filter(([, w]) => (Number(w) || 0) > 0)
        .map(([s]) => s)
      if (sites.length === 0) return
      const per = HOLIDAY_WORK_BONUS_HOURS / sites.length
      sites.forEach((site) => {
        const k = overtimeHoursKey(personName, dateStr, site)
        out.set(k, (out.get(k) || 0) + per)
      })
    })
  })
  return out
}

function getOvertimeHoursForPersonDateSite(otMap, personName, dateStr, siteName) {
  const k = overtimeHoursKey(personName, dateStr, siteName)
  const v = otMap.get(k)
  return v != null && Number(v) > 0 ? Number(v) : 0
}

function sumOvertimeForPersonMonth(personName, otMap) {
  const pref = `${String(personName || '').trim()}\0`
  let t = 0
  otMap.forEach((hrs, key) => {
    if (String(key).startsWith(pref)) t += Number(hrs) || 0
  })
  return t
}

function sumOvertimeForPersonAtSiteMonth(personName, siteName, otMap) {
  const p = String(personName || '').trim()
  const s = String(siteName || '').trim()
  let t = 0
  otMap.forEach((hrs, key) => {
    const parts = String(key).split('\0')
    if (parts.length === 3 && parts[0] === p && parts[2] === s) t += Number(hrs) || 0
  })
  return t
}

/** 顯示用：+3 或 +3.5 */
function formatOvertimePlusHours(n) {
  const x = Number(n) || 0
  if (!Number.isFinite(x) || x <= 0) return ''
  const r = Math.round(x * 10) / 10
  if (Math.abs(r - Math.round(r)) < 1e-6) return `+${Math.round(r)}`
  const s = String(r)
  return s.endsWith('.0') ? `+${Math.round(r)}` : `+${s}`
}

function cellKey(name, dateStr) {
  return `${String(name || '').trim()}|${String(dateStr || '').slice(0, 10)}`
}

/** 姓名欄固定排列順序（未列於此之名單排在後面，仍照筆劃排序） */
const NAME_ROW_ORDER = [
  '蘇毓詠',
  '蔡韋霖',
  '羅智傑',
  '謝宏彬',
  '柳家輝',
  '陳思潔',
  '林家永',
  '鄧智元',
  '陳偉平',
  '許裕杰'
]

function sortNamesByPreferredOrder(names) {
  return [...names].sort((a, b) => {
    const ia = NAME_ROW_ORDER.indexOf(String(a || '').trim())
    const ib = NAME_ROW_ORDER.indexOf(String(b || '').trim())
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b, 'zh-Hant')
  })
}

/** 常見假別／請假預設字不計入「案場出工人次」 */
const LEAVE_LABELS = new Set([
  '休假', '請假', '—', '事假', '病假', '特休', '公假', '喪假', '產假', '陪產假', '生理假', '婚假', '補休', '曠職'
])

function isLeaveLabel(s) {
  const t = String(s || '').trim()
  if (!t) return true
  if (LEAVE_LABELS.has(t)) return true
  if (/假$/.test(t) && t.length <= 6) return true
  // 假別事由如「事假 (法院)」「病假-就醫」不計入案場統計
  if (/^事假|^病假|^特休|^公假|^喪假|^產假|^陪產假|^生理假|^婚假|^補休|^休假|^請假|^曠職/.test(t)) return true
  if (t.includes('假') && t.length <= 24) return true
  return false
}

/** 儲存格內多案場：支援「、」與半形／全形逗號 */
function splitCellIntoSiteParts(text) {
  const t = String(text || '').trim()
  if (!t || t === '—') return []
  return t.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
}

/** 整格皆為假別／請假文字時，用紅字顯示 */
function isLeaveOnlyCell(text) {
  const t = String(text || '').trim()
  if (!t || t === '—') return false
  const parts = splitCellIntoSiteParts(t)
  if (parts.length === 0) return false
  return parts.every((p) => isLeaveLabel(p))
}

/** 報表數字：整數顯示整數，否則最多兩位小數 */
function formatSiteStatNumber(n) {
  const x = Number(n) || 0
  if (!Number.isFinite(x)) return '0'
  const r = Math.round(x * 1000) / 1000
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r))
  return String(Math.round(r * 100) / 100).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

const WEIGHTED_CELL_MARK = '_jmlw'

/** 每格可存 JSON：自訂各案場加權天數（半天 0.5、全天 1 等） */
function parseWeightedCellOverride(str) {
  const t = String(str ?? '').trim()
  if (!t.startsWith('{')) return null
  try {
    const o = JSON.parse(t)
    if (!o || o[WEIGHTED_CELL_MARK] !== 1 || !Array.isArray(o.sites)) return null
    const sites = o.sites
      .map((x) => {
        const n = String(x?.n ?? x?.name ?? '').trim()
        const w = Number(x?.w ?? x?.weight)
        if (!n || !Number.isFinite(w) || w <= 0) return null
        return { name: n, weight: w }
      })
      .filter(Boolean)
    if (sites.length === 0) return null
    return { sites }
  } catch {
    return null
  }
}

function serializeWeightedCellOverride(siteRows) {
  return JSON.stringify({
    [WEIGHTED_CELL_MARK]: 1,
    sites: siteRows.map(({ name, weight }) => ({
      n: String(name || '').trim(),
      w: Number(weight) || 0
    }))
  })
}

/** 手動覆寫格：多案場各分 1/n（純文字、非 JSON） */
function mergeOverrideToSiteWeights(overrideText) {
  const parts = splitCellIntoSiteParts(String(overrideText || '').trim())
  const workSites = parts.filter((p) => !isLeaveLabel(p))
  if (workSites.length === 0) return new Map()
  const w = 1 / workSites.length
  const m = new Map()
  workSites.forEach((s) => m.set(s, (m.get(s) || 0) + w))
  return m
}

function overrideTextToSiteWeightMap(str) {
  const parsed = parseWeightedCellOverride(String(str).trim())
  if (parsed) {
    const m = new Map()
    parsed.sites.forEach(({ name, weight }) => {
      m.set(name, (m.get(name) || 0) + weight)
    })
    return m
  }
  return mergeOverrideToSiteWeights(str)
}

/** 該格用於統計的案場→加權天數（覆寫優先；已核准請假則不計行事曆案場） */
function getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap, leaveCellTextMap) {
  const ck = cellKey(name, dateStr)
  if (overrides[ck] != null && String(overrides[ck]).trim() !== '') {
    return overrideTextToSiteWeightMap(String(overrides[ck]).trim())
  }
  if (leaveCellTextMap?.get(ck)) return new Map()
  const bySite = scheduleMap.get(name)?.get(dateStr)
  if (!bySite || bySite.size === 0) return new Map()
  return new Map(bySite)
}

/**
 * 儲存格呈現與點選案場編輯用：weighted | plain_work | auto 可逐案場點加權；
 * plain_mixed（案場＋假別混寫）僅整格編輯。
 */
function getCellRenderState(name, dateStr, overrides, scheduleMap, leaveCellTextMap) {
  const ck = cellKey(name, dateStr)
  const oStr = overrides[ck] != null ? String(overrides[ck]).trim() : ''

  if (oStr) {
    const w = parseWeightedCellOverride(oStr)
    if (w) return { kind: 'weighted', sites: w.sites, ck }
    const parts = splitCellIntoSiteParts(oStr)
    if (parts.length === 0) return { kind: 'empty', ck }
    if (parts.every((p) => isLeaveLabel(p))) return { kind: 'leave', text: oStr, ck }
    if (parts.some((p) => isLeaveLabel(p)))
      return { kind: 'plain_mixed', text: oStr, parts, ck }
    const wt = 1 / parts.length
    return {
      kind: 'plain_work',
      sites: parts.map((n) => ({ name: n, weight: wt })),
      ck
    }
  }

  const lv = leaveCellTextMap.get(ck)
  if (lv) return { kind: 'leave', text: lv, ck }

  const bySite = scheduleMap.get(name)?.get(dateStr)
  if (bySite && bySite.size > 0) {
    const sites = [...bySite.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
      .map(([sn, weight]) => ({ name: sn, weight }))
    return { kind: 'auto', sites, ck }
  }

  return { kind: 'empty', ck }
}

function cellStateToDisplayString(state) {
  switch (state.kind) {
    case 'weighted':
    case 'plain_work':
    case 'auto':
      return state.sites
        .map((s) => `${s.name}(${formatSiteStatNumber(s.weight)})`)
        .join('、')
    case 'leave':
    case 'plain_mixed':
      return state.text || ''
    default:
      return ''
  }
}

/** 整格編輯框初值：加權覆寫為「案場 數字」每行一行；行事曆自動則帶入目前加權 */
function getCellEditorInitialValue(name, dateStr, overrides, scheduleMap, leaveCellTextMap) {
  const ck = cellKey(name, dateStr)
  const o = overrides[ck]
  if (o != null && String(o).trim() !== '') {
    const os = String(o).trim()
    const w = parseWeightedCellOverride(os)
    if (w) return w.sites.map((s) => `${s.name} ${formatSiteStatNumber(s.weight)}`).join('\n')
    return os
  }
  const lv = leaveCellTextMap.get(ck)
  if (lv) return lv
  const bySite = scheduleMap.get(name)?.get(dateStr)
  if (bySite && bySite.size > 0) {
    return [...bySite.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
      .map(([sn, wt]) => `${sn} ${formatSiteStatNumber(wt)}`)
      .join('\n')
  }
  return ''
}

function parseCellEditorValue(text) {
  const t = String(text ?? '').trim()
  if (!t) return { kind: 'clear' }
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { kind: 'clear' }
  const parsed = []
  for (const line of lines) {
    const m = line.match(/^(.*)\s+(\d+(?:\.\d+)?)\s*$/)
    if (!m) return { kind: 'plain', text: t }
    const nm = m[1].trim()
    if (!nm) return { kind: 'plain', text: t }
    const w = parseFloat(m[2])
    if (!Number.isFinite(w) || w <= 0) return { kind: 'plain', text: t }
    parsed.push({ name: nm, weight: w })
  }
  if (parsed.length === lines.length && parsed.length > 0) return { kind: 'weighted', sites: parsed }
  return { kind: 'plain', text: t }
}

/** 週幾（與 getDay 對應：0日 1一 … 6六）— 僅表頭顯示，不增加欄寬 */
function weekdayChar(year, month, day) {
  const d = new Date(year, month - 1, day)
  if (Number.isNaN(d.getTime())) return ''
  const chars = ['日', '一', '二', '三', '四', '五', '六']
  return chars[d.getDay()] || ''
}

/**
 * 單一使用者該月：各案場加權天數、加權合計、有出工日曆天數（與全表加權規則一致）
 */
function buildPerUserSiteDayStats(userNames, days, year, month, overrides, scheduleMap, leaveCellTextMap, otMap) {
  return userNames.map((name) => {
    const siteDays = new Map()
    let sumSiteDays = 0
    let calendarDaysWithWork = 0
    days.forEach((d) => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const wmap = getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap, leaveCellTextMap)
      let daySum = 0
      wmap.forEach((wt) => {
        daySum += wt
      })
      if (daySum <= 0) return
      calendarDaysWithWork += 1
      wmap.forEach((wt, site) => {
        siteDays.set(site, (siteDays.get(site) || 0) + wt)
        sumSiteDays += wt
      })
    })
    const sitesSorted = [...siteDays.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
    )
    const totalOvertimeHours = sumOvertimeForPersonMonth(name, otMap)
    return { name, sitesSorted, sumSiteDays, calendarDaysWithWork, totalOvertimeHours }
  })
}

/**
 * 已核准請假 → Map<"name|dateStr", 假別顯示文字>
 * 假別來自請假單 reason（事由）；空白則顯示「請假」。
 * 同日多筆不同假別以「、」合併。
 */
function buildLeaveCellTextMap(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const map = new Map()
  const leaves = getLeaveApplications().filter((la) => (la.status || '') === 'approved')

  const labelFromReason = (la) => {
    const r = String(la?.reason || '').trim()
    return r || '請假'
  }

  const mergeCell = (ck, label) => {
    const prev = map.get(ck)
    if (!prev) {
      map.set(ck, label)
      return
    }
    const set = new Set(prev.split(/、/).map((x) => x.trim()).filter(Boolean))
    set.add(label)
    map.set(ck, [...set].join('、'))
  }

  const addRange = (nameKey, la) => {
    const a = String(la.startDate || '').slice(0, 10)
    const b = String(la.endDate || '').slice(0, 10)
    if (!a || !b || b < monthStart || a > monthEnd) return
    const start = a < monthStart ? monthStart : a
    const end = b > monthEnd ? monthEnd : b
    const d = new Date(`${start}T12:00:00`)
    const endD = new Date(`${end}T12:00:00`)
    const nk = String(nameKey || '').trim()
    if (!nk) return
    const label = labelFromReason(la)
    while (d <= endD) {
      const ymd = d.toISOString().slice(0, 10)
      mergeCell(`${nk}|${ymd}`, label)
      d.setDate(d.getDate() + 1)
    }
  }

  leaves.forEach((la) => {
    addRange(la.userName, la)
    if (String(la.userId || '').trim() !== String(la.userName || '').trim()) {
      addRange(la.userId, la)
    }
  })
  return map
}

async function exportPdf(el, filename) {
  if (!el) return
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#1f2937'
  })
  const imgData = canvas.toDataURL('image/png')
  // 版型為「日期在左、姓名在上」時畫布偏高，直向較合適；過寬時仍用橫向
  const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? 'l' : 'p', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height) * 0.95
  const w = canvas.width * ratio
  const h = canvas.height * ratio
  pdf.addImage(imgData, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
  pdf.save(filename)
}

export default function MonthlyLocationReport() {
  const syncRevision = useSyncRevision()
  const role = getCurrentUserRole()
  const isAdmin = role === 'admin'
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const pdfRef = useRef(null)
  const [editCell, setEditCell] = useState(null) // { name, dateStr, value }
  const [siteWeightModal, setSiteWeightModal] = useState(null) // { personName, dateStr, siteName, weightInput }
  const [siteBreakdownModal, setSiteBreakdownModal] = useState(null) // 案場名稱
  const [dayNatureModal, setDayNatureModal] = useState(null) // { day, dateStr }

  useEffect(() => {
    const onStorage = (e) => {
      if (
        e.key === MONTHLY_LOCATION_OVERRIDES_KEY ||
        e.key === 'jiameng_leave_applications' ||
        e.key === 'jiameng_engineering_schedules' ||
        e.key === OVERTIME_APPLICATIONS_STORAGE_KEY ||
        e.key === MONTHLY_DAY_NATURE_KEY
      ) {
        setRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const onRt = (e) => {
      const k = e?.detail?.key
      if (k === OVERTIME_APPLICATIONS_STORAGE_KEY || k === 'jiameng_engineering_schedules') {
        setRefreshKey((r) => r + 1)
      }
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
  }, [])

  const { map: scheduleMap, lastDay } = useMemo(
    () => buildScheduleMap(year, month),
    [year, month, refreshKey, syncRevision]
  )

  const overrides = useMemo(() => getMonthlyOverrides(year, month), [year, month, refreshKey])

  const leaveCellTextMap = useMemo(() => buildLeaveCellTextMap(year, month), [year, month, refreshKey])

  const dayNatureAll = useMemo(() => getAllDayNatureStorage(), [year, month, refreshKey, syncRevision])

  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay])

  const userNames = useMemo(() => {
    const fromSchedule = [...scheduleMap.keys()]
    const fromOverrides = getOverrideNamesForMonth(year, month)
    const set = new Set([...fromSchedule, ...fromOverrides])
    return sortNamesByPreferredOrder([...set])
  }, [scheduleMap, year, month, refreshKey])

  const overtimeHoursMap = useMemo(() => {
    const base = buildOvertimeHoursMap(year, month)
    return applyHolidayAttendanceBonus(
      base,
      year,
      month,
      userNames,
      days,
      overrides,
      scheduleMap,
      leaveCellTextMap,
      dayNatureAll
    )
  }, [
    year,
    month,
    refreshKey,
    syncRevision,
    userNames,
    days,
    overrides,
    scheduleMap,
    leaveCellTextMap,
    dayNatureAll
  ])

  const siteStatsSorted = useMemo(() => {
    const siteWorkCount = new Map()
    userNames.forEach((name) => {
      days.forEach((d) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const wmap = getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap, leaveCellTextMap)
        wmap.forEach((wt, site) => {
          siteWorkCount.set(site, (siteWorkCount.get(site) || 0) + wt)
        })
      })
    })
    return [...siteWorkCount.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
    )
  }, [userNames, days, year, month, overrides, scheduleMap, leaveCellTextMap])

  /** 案場 → 各人該月於此案場加權天數（與上方卡片同源） */
  const siteBreakdownBySite = useMemo(() => {
    const siteToUser = new Map()
    userNames.forEach((personName) => {
      days.forEach((d) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const wmap = getCellSiteWeightsForCell(personName, dateStr, overrides, scheduleMap, leaveCellTextMap)
        wmap.forEach((wt, site) => {
          if (!siteToUser.has(site)) siteToUser.set(site, new Map())
          const byUser = siteToUser.get(site)
          byUser.set(personName, (byUser.get(personName) || 0) + wt)
        })
      })
    })
    const out = new Map()
    siteToUser.forEach((byUser, site) => {
      const rows = [...byUser.entries()]
        .filter(([, t]) => (Number(t) || 0) > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
      out.set(site, rows)
    })
    return out
  }, [userNames, days, year, month, overrides, scheduleMap, leaveCellTextMap])

  /** 全表加權人天：各案場數字加總＝各人「總工（加權）」加總 */
  const grandTotalWeightedDays = useMemo(
    () => siteStatsSorted.reduce((s, [, c]) => s + (Number(c) || 0), 0),
    [siteStatsSorted]
  )

  const siteOvertimeTotals = useMemo(() => {
    const m = new Map()
    overtimeHoursMap.forEach((hrs, key) => {
      const parts = String(key).split('\0')
      if (parts.length !== 3) return
      const site = parts[2]
      m.set(site, (m.get(site) || 0) + (Number(hrs) || 0))
    })
    return m
  }, [overtimeHoursMap])

  const grandTotalOvertimeHours = useMemo(() => {
    let s = 0
    overtimeHoursMap.forEach((h) => {
      s += Number(h) || 0
    })
    return s
  }, [overtimeHoursMap])

  const perUserSiteDayStats = useMemo(
    () =>
      buildPerUserSiteDayStats(
        userNames,
        days,
        year,
        month,
        overrides,
        scheduleMap,
        leaveCellTextMap,
        overtimeHoursMap
      ),
    [userNames, days, year, month, overrides, scheduleMap, leaveCellTextMap, overtimeHoursMap]
  )

  const perUserSiteDayStatsWithData = useMemo(
    () => perUserSiteDayStats.filter((r) => r.sitesSorted.length > 0),
    [perUserSiteDayStats]
  )

  const openEdit = (name, dateStr) => {
    if (!isAdmin) return
    setEditCell({
      name,
      dateStr,
      value: getCellEditorInitialValue(name, dateStr, overrides, scheduleMap, leaveCellTextMap)
    })
  }

  const saveEdit = () => {
    if (!editCell) return
    const parsed = parseCellEditorValue(editCell.value)
    let stored = ''
    if (parsed.kind === 'clear') stored = ''
    else if (parsed.kind === 'weighted') stored = serializeWeightedCellOverride(parsed.sites)
    else stored = parsed.text
    setMonthlyCellOverride(year, month, editCell.name, editCell.dateStr, stored)
    setEditCell(null)
    setRefreshKey((k) => k + 1)
  }

  const saveSiteWeight = useCallback(() => {
    if (!siteWeightModal) return
    const w = parseFloat(String(siteWeightModal.weightInput).replace(',', '.'))
    if (!Number.isFinite(w) || w <= 0 || w > 10) {
      alert('請輸入大於 0、至多 10 的數字（常用 0.5 或 1）')
      return
    }
    const { personName, dateStr, siteName } = siteWeightModal
    const st = getCellRenderState(personName, dateStr, overrides, scheduleMap, leaveCellTextMap)
    if (!st.sites || st.sites.length === 0) {
      setSiteWeightModal(null)
      return
    }
    const next = st.sites.map((s) =>
      s.name === siteName ? { name: s.name, weight: w } : { name: s.name, weight: s.weight }
    )
    setMonthlyCellOverride(year, month, personName, dateStr, serializeWeightedCellOverride(next))
    setSiteWeightModal(null)
    setRefreshKey((k) => k + 1)
  }, [siteWeightModal, overrides, scheduleMap, leaveCellTextMap, year, month])

  const clearEdit = () => {
    if (!editCell) return
    setMonthlyCellOverride(year, month, editCell.name, editCell.dateStr, '')
    setEditCell(null)
    setRefreshKey((k) => k + 1)
  }

  const handlePdf = async () => {
    if (!pdfRef.current || pdfBusy) return
    setPdfBusy(true)
    try {
      await exportPdf(pdfRef.current, `每月份工時匯總報表_${year}年${month}月.pdf`)
    } catch (e) {
      console.error(e)
      alert('匯出 PDF 失敗，請稍後再試或重新整理頁面。')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="max-w-[100vw] text-white monthly-report-root">
      <div className="p-3 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-yellow-400">每月份工時匯總報表</h1>
            <p className="text-gray-400 text-[11px] sm:text-sm mt-1">
              已核准請假之日期：顯示請假單<strong>事由（假別）</strong>，且<strong className="text-gray-300">不計入</strong>當日行事曆案場加權（避免與藍標排程重複）；該格若有<strong>手動覆寫</strong>仍以覆寫為準。
              僅在無請假紀錄時才帶入行事曆案場。未填事由則顯示「請假」。
              行事曆排程標籤為<strong className="text-gray-300">「行政」</strong>者不列入本表與下方統計。
              {isAdmin
                ? ' 管理員可點格編輯、點左欄日期設定平日／假日，有案場時可點案場名稱調整加權（0.5／1）。'
                : ' 左欄日期下方顯示平日／假日（預設週六、週日為假日）。'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 text-xs sm:text-sm text-white"
            >
              重新整理
            </button>
            <button
              type="button"
              onClick={handlePdf}
              disabled={pdfBusy}
              className="bg-green-700 hover:bg-green-600 border border-green-600 rounded px-2 py-1 text-xs sm:text-sm text-white disabled:opacity-50"
            >
              {pdfBusy ? '匯出中…' : '匯出 PDF'}
            </button>
            <label className="text-gray-400 text-xs sm:text-sm">年</label>
            <input
              type="number"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-20 sm:w-24 text-white text-sm"
              value={year}
              min={2024}
              max={2030}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
            <label className="text-gray-400 text-xs sm:text-sm">月</label>
            <select
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
        </div>

        {isAdmin && (
          <div className="mb-3 flex flex-col gap-2 rounded border border-amber-600/50 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200/90">
            <p>
              編輯：點格開啟整格編輯；<strong className="text-amber-100">點案場名稱</strong>
              可單獨改該案場加權天數（半天 0.5、全天 1）。多案場整格編輯可用「、」分隔，或每行「案場名 0.5」存成加權覆寫。清除覆寫恢復行事曆自動。
              <strong className="text-amber-100"> 點左欄日期</strong>可設定該日<strong>平日／假日</strong>（預設週六、週日為假日），影響假日出工 +8 小時（週日不加）。
            </p>
            <button
              type="button"
              className="self-start rounded bg-amber-600/30 px-2 py-1 text-amber-100 hover:bg-amber-600/50"
              onClick={() => {
                const name = window.prompt('要新增的姓名（會出現在表上）')
                if (!name || !String(name).trim()) return
                const d = window.prompt('日期（1～31）', String(today.getDate()))
                const day = parseInt(d, 10)
                if (Number.isNaN(day) || day < 1 || day > lastDay) {
                  alert('日期無效')
                  return
                }
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                setEditCell({ name: String(name).trim(), dateStr, value: '' })
              }}
            >
              新增一格（新姓名或補登）
            </button>
          </div>
        )}

        {siteStatsSorted.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-3 sm:p-4">
            <h2 className="text-sm sm:text-base font-semibold text-yellow-400 mb-2">各案場出工統計（加權天數）</h2>
            <p className="text-[10px] text-gray-500 mb-2">
              同一人在同一天，所有排程的案場合計 K 筆時每筆計 1÷K 天（含單卡多案場或多張卡上／下午）；標籤「行政」之排程不列入。僅統計案場／工作地點；假別不計入。
              <span className="text-gray-400"> 點案場卡片可查看各人出工加權明細。</span>
              已核准<strong className="text-gray-400">加班申請</strong>併入紅字「+小時」。左欄標<strong className="text-gray-400">假日</strong>且<strong className="text-gray-400">非週日</strong>、當日有出工加權者另計<strong className="text-gray-400"> 8 小時</strong>（多案場平分），再與加班單加總；<strong className="text-gray-400">週日不加 8</strong>。預設週六、週日為假日。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] sm:text-sm">
              {siteStatsSorted.map(([site, count]) => {
                const otH = siteOvertimeTotals.get(site) || 0
                return (
                  <button
                    key={site}
                    type="button"
                    onClick={() => setSiteBreakdownModal(site)}
                    className="flex justify-between gap-2 rounded border border-gray-600 bg-gray-900/50 px-2 py-1.5 text-left w-full cursor-pointer hover:bg-gray-800/80 hover:border-yellow-500/40 transition-colors"
                    title="查看此案場人員明細"
                  >
                    <span className="text-gray-200 truncate min-w-0">{site}</span>
                    <span className="shrink-0 flex flex-col items-end font-mono tabular-nums leading-tight">
                      <span className="text-yellow-400">{formatSiteStatNumber(count)}</span>
                      {otH > 0 && (
                        <span className="text-red-400 text-[10px] font-medium">
                          {formatOvertimePlusHours(otH)}h
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-yellow-500/35 bg-yellow-950/25 px-3 py-2">
              <span className="text-xs sm:text-sm font-medium text-gray-200">全部總工（加權天數）</span>
              <span className="shrink-0 font-mono text-base sm:text-lg font-semibold text-yellow-400 tabular-nums">
                {formatSiteStatNumber(grandTotalWeightedDays)}
              </span>
            </div>
            {grandTotalOvertimeHours > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-red-900/40 bg-red-950/20 px-3 py-2">
                <span className="text-xs sm:text-sm font-medium text-gray-200">全部總加班（小時）</span>
                <span className="shrink-0 font-mono text-base font-semibold text-red-400 tabular-nums">
                  {formatSiteStatNumber(grandTotalOvertimeHours)} 小時
                </span>
              </div>
            )}
          </div>
        )}

        {/* 表格：手機與網頁同版型（日期在左、姓名在上），手機可左右滑動 */}
        <div
          ref={pdfRef}
          className="monthly-report-pdf-capture border border-gray-700 rounded-lg bg-gray-800/50 p-2 sm:p-4 block w-full"
        >
        <h2 className="text-yellow-400 font-bold mb-2 text-base sm:text-lg">
          每月份工時匯總報表 {year} 年 {month} 月
        </h2>
        {siteStatsSorted.length > 0 && (
          <div className="mb-3 text-xs sm:text-sm text-gray-200 leading-snug">
            <strong>各案場出工（加權天數）：</strong>
            {siteStatsSorted.map(([s, c]) => {
              const oh = siteOvertimeTotals.get(s) || 0
              const otPart = oh > 0 ? ` 加班${formatOvertimePlusHours(oh)}h` : ''
              return `${s} ${formatSiteStatNumber(c)}${otPart}`
            }).join(' ｜ ')}
            <span className="block sm:inline sm:ml-1 mt-1 sm:mt-0 text-amber-200/90">
              ｜ <strong>全部總工</strong> {formatSiteStatNumber(grandTotalWeightedDays)} 天
            </span>
            {grandTotalOvertimeHours > 0 && (
              <span className="block text-red-300/90 mt-1">
                <strong>全部總加班</strong> {formatSiteStatNumber(grandTotalOvertimeHours)} 小時
              </span>
            )}
          </div>
        )}
        <div className="overflow-x-auto w-full">
          {/* 日期在左欄、姓名在表頭（直向閱讀為一天一列） */}
          <table className="w-full table-fixed border-collapse text-sm sm:text-base min-w-[560px]">
            <colgroup>
              <col className="w-[3.5rem] sm:w-[4.5rem]" />
              {userNames.map((name) => (
                <col key={name} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-900 border-b border-yellow-500/50">
                <th
                  className="sticky left-0 z-10 bg-gray-900 px-1.5 py-1.5 text-left text-yellow-400 font-semibold border border-gray-600 align-bottom text-sm sm:text-base"
                  title="日期"
                >
                  日期
                </th>
                {userNames.map((name) => (
                  <th
                    key={name}
                    className="px-1 py-1.5 text-center text-yellow-400 font-semibold border border-gray-700 align-bottom leading-snug min-w-0"
                    title={name}
                  >
                    <span className="block text-sm sm:text-base break-words hyphens-none">{name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const nature = getDayNature(year, month, d, dayNatureAll)
                const mkNat = `${year}-${String(month).padStart(2, '0')}`
                const natureOverrideRaw = dayNatureAll[mkNat]?.[dateStr]
                const hasNatureOverride =
                  natureOverrideRaw === 'weekday' || natureOverrideRaw === 'holiday'
                return (
                  <tr key={d} className="border-b border-gray-700">
                    <td
                      className={`sticky left-0 z-[1] bg-gray-800 px-1 py-1.5 sm:px-1.5 border border-gray-600 align-top ${
                        isAdmin ? 'cursor-pointer hover:bg-gray-700/55' : ''
                      }`}
                      title={
                        isAdmin
                          ? `${dateStr} — 點擊設定此日為平日或假日（影響假日出工 +8 小時規則，週日不加）`
                          : dateStr
                      }
                      onClick={isAdmin ? () => setDayNatureModal({ day: d, dateStr }) : undefined}
                      onKeyDown={
                        isAdmin
                          ? (e) => e.key === 'Enter' && setDayNatureModal({ day: d, dateStr })
                          : undefined
                      }
                      role={isAdmin ? 'button' : undefined}
                      tabIndex={isAdmin ? 0 : undefined}
                    >
                      <span className="block text-sm sm:text-base font-semibold text-white leading-tight">
                        {d}
                      </span>
                      <span className="block text-[10px] sm:text-xs text-gray-400 font-normal leading-tight">
                        {weekdayChar(year, month, d)}
                      </span>
                      <span
                        className={`block text-[9px] sm:text-[10px] font-medium leading-tight mt-0.5 ${
                          nature === 'holiday' ? 'text-amber-400/95' : 'text-slate-400'
                        }`}
                      >
                        {nature === 'holiday' ? '假日' : '平日'}
                        {hasNatureOverride ? (
                          <span className="text-gray-500 font-normal" title="已手動覆寫預設">
                            *
                          </span>
                        ) : null}
                      </span>
                    </td>
                    {userNames.map((name) => {
                      const ck = cellKey(name, dateStr)
                      const st = getCellRenderState(name, dateStr, overrides, scheduleMap, leaveCellTextMap)
                      const text = cellStateToDisplayString(st)
                      const isOverride = overrides[ck] != null && String(overrides[ck]).trim() !== ''
                      const chipKinds = new Set(['weighted', 'plain_work', 'auto'])
                      const showSiteChips = Boolean(st.sites?.length && chipKinds.has(st.kind))
                      return (
                        <td
                          key={name}
                          className={`px-1 py-1.5 align-top border border-gray-700 text-sm sm:text-base leading-snug break-words ${isAdmin ? 'cursor-pointer hover:bg-gray-700/40' : ''} ${isOverride ? 'bg-amber-900/20' : 'text-gray-200'}`}
                          title={
                            isAdmin
                              ? isOverride
                                ? '手動覆寫（點空白處編輯整格；點案場名改加權）'
                                : '點空白處編輯；點案場名改加權'
                              : text || '—'
                          }
                          onClick={() => isAdmin && openEdit(name, dateStr)}
                          onKeyDown={(e) => isAdmin && e.key === 'Enter' && openEdit(name, dateStr)}
                          role={isAdmin ? 'button' : undefined}
                          tabIndex={isAdmin ? 0 : undefined}
                        >
                          {showSiteChips ? (
                            <span className="text-gray-200">
                              {st.sites.map((s, i) => (
                                <span key={`${s.name}-${i}`}>
                                  {i > 0 ? <span className="text-gray-500">、</span> : null}
                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      className="text-sky-300 hover:text-sky-200 underline decoration-dotted underline-offset-2 text-left align-baseline max-w-full break-words"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSiteWeightModal({
                                          personName: name,
                                          dateStr,
                                          siteName: s.name,
                                          weightInput: formatSiteStatNumber(s.weight)
                                        })
                                      }}
                                    >
                                      {s.name}
                                      <span className="text-[10px] sm:text-xs opacity-80 ml-0.5 tabular-nums">
                                        ({formatSiteStatNumber(s.weight)})
                                      </span>
                                      {(() => {
                                        const oh = getOvertimeHoursForPersonDateSite(
                                          overtimeHoursMap,
                                          name,
                                          dateStr,
                                          s.name
                                        )
                                        if (!oh) return null
                                        return (
                                          <span className="text-red-400 font-semibold ml-0.5 text-[10px] sm:text-xs tabular-nums overtime-red-print">
                                            {formatOvertimePlusHours(oh)}
                                          </span>
                                        )
                                      })()}
                                    </button>
                                  ) : (
                                    <span>
                                      {s.name}
                                      <span className="text-[10px] sm:text-xs opacity-80 ml-0.5 tabular-nums">
                                        ({formatSiteStatNumber(s.weight)})
                                      </span>
                                      {(() => {
                                        const oh = getOvertimeHoursForPersonDateSite(
                                          overtimeHoursMap,
                                          name,
                                          dateStr,
                                          s.name
                                        )
                                        if (!oh) return null
                                        return (
                                          <span className="text-red-400 font-semibold ml-0.5 text-[10px] sm:text-xs tabular-nums overtime-red-print">
                                            {formatOvertimePlusHours(oh)}
                                          </span>
                                        )
                                      })()}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </span>
                          ) : text ? (
                            <span
                              className={isLeaveOnlyCell(text) ? 'text-red-400 font-medium leave-red-print' : ''}
                            >
                              {text}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {perUserSiteDayStatsWithData.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-600">
            <h3 className="text-sm sm:text-base font-semibold text-yellow-400 mb-2">個人案場天數統計</h3>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-3 leading-relaxed">
              與行事曆一致：同一人在同一天所有排程案場合併後每筆 1÷K 天；手動覆寫格多案場亦各 1÷n。「行政」標籤排程不計入。
              同一張卡上「參與人員」與工項負責人為同一人時<strong className="text-gray-400">只計一次</strong>（已修正先前重複加倍）。
              <strong className="text-gray-300">出工日數</strong>＝當月有案場（非假別）的<strong>日曆天數</strong>。
              <strong className="text-gray-300">總工（加權）</strong>＝下面每一案場「天數」<strong>全部加起來</strong>（例：2.7+0.4+…）；同一天若出現在兩個案場常是 0.5+0.5，故<strong>總工幾乎一定 ≥ 出工日數</strong>，不是「多算錯誤」。上方「各案場」卡片數字加總＝本區全員總工。
              紅字<strong className="text-red-400">+小時</strong>＝已核准加班＋<strong className="text-gray-400">「假日」且非週日</strong>出工另計 8 小時（該日多案場平分）；<strong className="text-gray-400">週日不加 8</strong>。日期欄可改平日／假日（預設週六日為假日）。
            </p>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-600/35 bg-cyan-950/20 px-3 py-2">
              <span className="text-xs sm:text-sm font-medium text-gray-200">全員總工（加權天數）</span>
              <span className="shrink-0 font-mono text-base font-semibold text-cyan-300/90 tabular-nums">
                {formatSiteStatNumber(grandTotalWeightedDays)}
              </span>
            </div>
            {grandTotalOvertimeHours > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-red-900/35 bg-red-950/15 px-3 py-2">
                <span className="text-xs sm:text-sm font-medium text-gray-200">全員總加班（小時）</span>
                <span className="shrink-0 font-mono text-base font-semibold text-red-400 tabular-nums">
                  {formatSiteStatNumber(grandTotalOvertimeHours)} 小時
                </span>
              </div>
            )}
            <div className="space-y-3 sm:space-y-4">
              {perUserSiteDayStatsWithData.map(
                ({ name, sitesSorted, sumSiteDays, calendarDaysWithWork, totalOvertimeHours }) => (
                <div
                  key={name}
                  className="rounded-lg border border-gray-600 bg-gray-900/40 px-3 py-2.5 sm:px-4 sm:py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1 mb-2">
                    <span className="text-white font-semibold text-sm sm:text-base">{name}</span>
                    <span className="text-[11px] sm:text-sm text-gray-400 tabular-nums text-right max-w-[min(100%,20rem)] leading-snug">
                      <span className="block sm:inline" title="當月日曆上，表格裡至少有一格案場（非假別）的天數">
                        出工日數 <span className="text-cyan-300/90 font-semibold">{calendarDaysWithWork}</span> 日
                      </span>
                      <span className="hidden sm:inline text-gray-600 mx-1.5">｜</span>
                      <span
                        className="block sm:inline mt-0.5 sm:mt-0"
                        title="各案場加權天數合計；同日多案場會拆成分數，故常大於出工日數"
                      >
                        總工（加權） <span className="text-amber-300 font-semibold">{formatSiteStatNumber(sumSiteDays)}</span> 天
                      </span>
                      {(totalOvertimeHours || 0) > 0 && (
                        <>
                          <span className="hidden sm:inline text-gray-600 mx-1.5">｜</span>
                          <span className="block sm:inline mt-0.5 sm:mt-0" title="當月已核准加班小時合計">
                            總加班{' '}
                            <span className="text-red-400 font-semibold">
                              {formatSiteStatNumber(totalOvertimeHours)} 小時
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <ul className="text-[11px] sm:text-sm text-gray-200 space-y-1 pl-0 list-none">
                    {sitesSorted.map(([site, dayCount]) => {
                      const siteOt = sumOvertimeForPersonAtSiteMonth(name, site, overtimeHoursMap)
                      return (
                        <li
                          key={site}
                          className="flex justify-between gap-2 border-b border-gray-700/50 last:border-0 pb-1 last:pb-0"
                        >
                          <span className="truncate" title={site}>
                            {site}
                          </span>
                          <span className="shrink-0 tabular-nums text-right">
                            <span className="text-yellow-400/90">{formatSiteStatNumber(dayCount)} 天</span>
                            {siteOt > 0 && (
                              <span className="text-red-400 font-medium ml-1.5">
                                {formatOvertimePlusHours(siteOt)}h
                              </span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
              )}
            </div>
          </div>
        )}

        {userNames.length === 0 && (
          <p className="text-gray-500 text-sm">此月份尚無資料。</p>
        )}
        </div>
      </div>

      {dayNatureModal && (
        <div
          className="fixed inset-0 z-[128] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDayNatureModal(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="day-nature-title"
          >
            <h3 id="day-nature-title" className="text-yellow-400 font-semibold text-base mb-1">
              日期性質（平日／假日）
            </h3>
            <p className="text-gray-300 text-sm mb-1 tabular-nums">{dayNatureModal.dateStr}</p>
            <p className="text-gray-500 text-xs mb-2">
              星期{weekdayChar(year, month, dayNatureModal.day)}
            </p>
            {(() => {
              const mk = `${year}-${String(month).padStart(2, '0')}`
              const ov = dayNatureAll[mk]?.[dayNatureModal.dateStr]
              const hasOv = ov === 'weekday' || ov === 'holiday'
              const eff = getDayNature(year, month, dayNatureModal.day, dayNatureAll)
              return (
                <p className="text-gray-400 text-sm mb-2">
                  目前為<strong className="text-gray-200">
                    {eff === 'holiday' ? '假日' : '平日'}
                  </strong>
                  {hasOv ? '（手動覆寫）' : '（週曆預設：週六、週日為假日）'}
                </p>
              )
            })()}
            <p className="text-gray-500 text-[11px] mb-3 leading-relaxed">
              標為「假日」且非週日、當日有出工加權時，加班欄另計 8 小時（與核准加班加總）。<strong className="text-gray-400">週日不論設定皆不加 8 小時。</strong>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-2 text-sm text-white text-left"
                onClick={() => {
                  setMonthlyDayNatureOverride(year, month, dayNatureModal.dateStr, 'weekday')
                  setDayNatureModal(null)
                  setRefreshKey((k) => k + 1)
                }}
              >
                設為平日（國定假補班等）
              </button>
              <button
                type="button"
                className="rounded bg-amber-700/80 hover:bg-amber-600 px-3 py-2 text-sm text-white text-left"
                onClick={() => {
                  setMonthlyDayNatureOverride(year, month, dayNatureModal.dateStr, 'holiday')
                  setDayNatureModal(null)
                  setRefreshKey((k) => k + 1)
                }}
              >
                設為假日（國定假等）
              </button>
              <button
                type="button"
                className="rounded border border-gray-500 px-3 py-2 text-sm text-gray-300 text-left"
                onClick={() => {
                  setMonthlyDayNatureOverride(year, month, dayNatureModal.dateStr, '')
                  setDayNatureModal(null)
                  setRefreshKey((k) => k + 1)
                }}
              >
                恢復週曆預設
              </button>
              <button
                type="button"
                className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-400"
                onClick={() => setDayNatureModal(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {editCell && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl">
            <h3 className="text-yellow-400 font-semibold mb-2">編輯格子</h3>
            <p className="text-gray-400 text-xs mb-2">{editCell.name}　{editCell.dateStr}</p>
            <textarea
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white text-sm min-h-[100px]"
              value={editCell.value}
              onChange={(e) => setEditCell((prev) => ({ ...prev, value: e.target.value }))}
              placeholder={
                '多案場：中壢日月光、斗南小東（用、分隔，各 1÷n）\n' +
                '或每行「案場名 數字」例如：\n中壢日月光 0.5\n斗南小東 1\n' +
                '清空儲存＝恢復行事曆自動'
              }
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={saveEdit} className="rounded bg-yellow-500 px-3 py-1.5 text-sm font-medium text-gray-900">儲存</button>
              <button type="button" onClick={clearEdit} className="rounded bg-gray-600 px-3 py-1.5 text-sm text-white">清除覆寫（恢復自動）</button>
              <button type="button" onClick={() => setEditCell(null)} className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300">取消</button>
            </div>
          </div>
        </div>
      )}

      {siteWeightModal && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSiteWeightModal(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="site-weight-title"
          >
            <h3 id="site-weight-title" className="text-yellow-400 font-semibold mb-1">
              案場加權天數
            </h3>
            <p className="text-gray-300 text-sm mb-1 break-words">{siteWeightModal.siteName}</p>
            <p className="text-gray-500 text-[11px] mb-3">
              {siteWeightModal.personName}　{siteWeightModal.dateStr}
            </p>
            <label className="block text-gray-400 text-xs mb-1">加權天數（人天）</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white text-sm font-mono mb-3"
              value={siteWeightModal.weightInput}
              onChange={(e) =>
                setSiteWeightModal((prev) => (prev ? { ...prev, weightInput: e.target.value } : prev))
              }
              placeholder="0.5 或 1"
            />
            <p className="text-gray-500 text-[11px] mb-3">例：請假半天下午到場填 0.5；全天填 1。存檔後此格改為加權覆寫。</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveSiteWeight}
                className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-sm font-medium text-white"
              >
                確定
              </button>
              <button
                type="button"
                onClick={() => setSiteWeightModal(null)}
                className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {siteBreakdownModal && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSiteBreakdownModal(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md max-h-[min(85vh,32rem)] flex flex-col rounded-lg border border-gray-600 bg-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="site-breakdown-title"
          >
            <div className="border-b border-gray-700 px-4 py-3 shrink-0">
              <h3 id="site-breakdown-title" className="text-yellow-400 font-semibold text-base break-words">
                {siteBreakdownModal}
              </h3>
              <p className="text-gray-500 text-xs mt-1">
                {year} 年 {month} 月　加權出工明細（與上方卡片數字同源）
              </p>
              <p className="text-amber-200/90 text-sm mt-2 font-mono tabular-nums">
                本案場合計{' '}
                <span className="font-semibold text-yellow-400">
                  {formatSiteStatNumber(
                    (siteBreakdownBySite.get(siteBreakdownModal) || []).reduce(
                      (s, [, w]) => s + (Number(w) || 0),
                      0
                    )
                  )}
                </span>{' '}
                天
              </p>
              {(siteOvertimeTotals.get(siteBreakdownModal) || 0) > 0 && (
                <p className="text-red-300/90 text-sm mt-1.5 font-mono tabular-nums">
                  本案場加班合計{' '}
                  <span className="font-semibold text-red-400">
                    {formatSiteStatNumber(siteOvertimeTotals.get(siteBreakdownModal) || 0)} 小時
                  </span>
                </p>
              )}
            </div>
            <ul className="overflow-y-auto px-4 py-2 text-sm space-y-0 list-none m-0 flex-1 min-h-0">
              {(siteBreakdownBySite.get(siteBreakdownModal) || []).length === 0 ? (
                <li className="text-gray-500 py-4 text-center">無人員資料</li>
              ) : (
                (siteBreakdownBySite.get(siteBreakdownModal) || []).map(([personName, wt]) => {
                  const pOt = sumOvertimeForPersonAtSiteMonth(
                    personName,
                    siteBreakdownModal,
                    overtimeHoursMap
                  )
                  return (
                    <li
                      key={personName}
                      className="flex justify-between gap-3 py-2 border-b border-gray-700/60 last:border-0"
                    >
                      <span className="text-gray-200 break-words min-w-0">{personName}</span>
                      <span className="shrink-0 font-mono text-right tabular-nums">
                        <span className="text-yellow-400/95 block">{formatSiteStatNumber(wt)} 天</span>
                        {pOt > 0 && (
                          <span className="text-red-400 text-xs font-medium block">
                            {formatOvertimePlusHours(pOt)}h
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="border-t border-gray-700 px-4 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setSiteBreakdownModal(null)}
                className="w-full rounded bg-gray-700 hover:bg-gray-600 px-3 py-2 text-sm text-white"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="md:hidden">
        <p className="text-[10px] text-gray-500 mb-2">左右滑動可查看完整表格；管理員可點格編輯。</p>
      </div>
    </div>
  )
}
