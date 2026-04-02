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
import { useSyncRevision } from '../contexts/SyncContext'

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

/** 與行事曆一致：未勾「全天」＝半天 0.5；勾全天或舊資料預設＝ 1 */
function getScheduleDayPortion(schedule) {
  if (schedule?.isAllDay === false) return 0.5
  return 1
}

/**
 * 行事曆自動：name -> dateStr -> Map(siteName -> 加權天數)。
 * 每張排程卡：全天計 1、非全天計 0.5，再除以該卡 segment 數分給各案場；多張卡同日則加總（例：兩張半天各一案場＝0.5+0.5）。
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

  schedules.forEach((schedule) => {
    const dateStr = String(schedule?.date || '').slice(0, 10)
    if (!dateStr || dateStr < startDate || dateStr > endDate) return
    if (String(schedule?.tag || '').trim() === SCHEDULE_TAG_EXCLUDE_FROM_LOCATION_REPORT) return

    const segments = getScheduleSegments(schedule)
    const nSeg = Math.max(1, segments.length)
    const portion = getScheduleDayPortion(schedule)
    const weightPerSeg = portion / nSeg

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
      namesForSeg.forEach((n) => addSiteWeight(n, dateStr, siteName, weightPerSeg))
    })
  })

  return { map, lastDay }
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

/** 手動覆寫格：多案場各分 1/n（無法區分半天／全天，預設滿格 1 天平分） */
function mergeOverrideToSiteWeights(overrideText) {
  const parts = splitCellIntoSiteParts(String(overrideText || '').trim())
  const workSites = parts.filter((p) => !isLeaveLabel(p))
  if (workSites.length === 0) return new Map()
  const w = 1 / workSites.length
  const m = new Map()
  workSites.forEach((s) => m.set(s, (m.get(s) || 0) + w))
  return m
}

/** 該格用於統計的案場→加權天數（覆寫優先，否則行事曆加權） */
function getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap) {
  const ck = cellKey(name, dateStr)
  if (overrides[ck] != null && String(overrides[ck]).trim() !== '') {
    return mergeOverrideToSiteWeights(overrides[ck])
  }
  const bySite = scheduleMap.get(name)?.get(dateStr)
  if (!bySite || bySite.size === 0) return new Map()
  return new Map(bySite)
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
function buildPerUserSiteDayStats(userNames, days, year, month, overrides, scheduleMap) {
  return userNames.map((name) => {
    const siteDays = new Map()
    let sumSiteDays = 0
    let calendarDaysWithWork = 0
    days.forEach((d) => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const wmap = getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap)
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
    return { name, sitesSorted, sumSiteDays, calendarDaysWithWork }
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

  useEffect(() => {
    const onStorage = (e) => {
      if (
        e.key === MONTHLY_LOCATION_OVERRIDES_KEY ||
        e.key === 'jiameng_leave_applications' ||
        e.key === 'jiameng_engineering_schedules'
      ) {
        setRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const { map: scheduleMap, lastDay } = useMemo(
    () => buildScheduleMap(year, month),
    [year, month, refreshKey, syncRevision]
  )

  const overrides = useMemo(() => getMonthlyOverrides(year, month), [year, month, refreshKey])

  const leaveCellTextMap = useMemo(() => buildLeaveCellTextMap(year, month), [year, month, refreshKey])

  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay])

  const userNames = useMemo(() => {
    const fromSchedule = [...scheduleMap.keys()]
    const fromOverrides = getOverrideNamesForMonth(year, month)
    const set = new Set([...fromSchedule, ...fromOverrides])
    return sortNamesByPreferredOrder([...set])
  }, [scheduleMap, year, month, refreshKey])

  const getCellText = useCallback(
    (name, dateStr) => {
      const ck = cellKey(name, dateStr)
      if (overrides[ck] != null && String(overrides[ck]).trim() !== '') return String(overrides[ck]).trim()
      const bySite = scheduleMap.get(name)?.get(dateStr)
      if (bySite && bySite.size > 0) {
        return [...bySite.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('、')
      }
      // 無排程時帶入已核准請假（假別 = 事由 reason；無則「請假」）
      const leaveText = leaveCellTextMap.get(ck)
      if (leaveText) return leaveText
      return ''
    },
    [overrides, scheduleMap, leaveCellTextMap]
  )

  const siteStatsSorted = useMemo(() => {
    const siteWorkCount = new Map()
    userNames.forEach((name) => {
      days.forEach((d) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const wmap = getCellSiteWeightsForCell(name, dateStr, overrides, scheduleMap)
        wmap.forEach((wt, site) => {
          siteWorkCount.set(site, (siteWorkCount.get(site) || 0) + wt)
        })
      })
    })
    return [...siteWorkCount.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
    )
  }, [userNames, days, year, month, overrides, scheduleMap])

  const perUserSiteDayStats = useMemo(
    () => buildPerUserSiteDayStats(userNames, days, year, month, overrides, scheduleMap),
    [userNames, days, year, month, overrides, scheduleMap]
  )

  const perUserSiteDayStatsWithData = useMemo(
    () => perUserSiteDayStats.filter((r) => r.sitesSorted.length > 0),
    [perUserSiteDayStats]
  )

  const openEdit = (name, dateStr) => {
    if (!isAdmin) return
    const current = getCellText(name, dateStr)
    const ck = cellKey(name, dateStr)
    // 若目前為自動帶入，編輯框顯示自動內容，存檔後變成覆寫
    setEditCell({ name, dateStr, value: overrides[ck] != null ? overrides[ck] : current })
  }

  const saveEdit = () => {
    if (!editCell) return
    setMonthlyCellOverride(year, month, editCell.name, editCell.dateStr, editCell.value)
    setEditCell(null)
    setRefreshKey((k) => k + 1)
  }

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
              已核准請假且當日無排程時，會顯示請假單<strong>事由（假別）</strong>，例如特休、病假；未填事由則顯示「請假」。
              行事曆排程標籤為<strong className="text-gray-300">「行政」</strong>者不列入本表與下方統計。
              {isAdmin ? ' 管理員可點格編輯。' : ''}
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
            <p>編輯：點表格內任一格（含「—」）可修改該日顯示；多案場請用「、」分隔。清除覆寫可恢復行事曆自動。</p>
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
              每張排程：勾「全天」該卡計 1 天、未勾計 0.5 天，再依該卡案場段數平分；同日多張卡會加總。標籤「行政」不列入。僅統計案場／工作地點；假別不計入。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] sm:text-sm">
              {siteStatsSorted.map(([site, count]) => (
                <div key={site} className="flex justify-between gap-2 rounded border border-gray-600 bg-gray-900/50 px-2 py-1.5">
                  <span className="text-gray-200 truncate" title={site}>{site}</span>
                  <span className="shrink-0 font-mono text-yellow-400">{formatSiteStatNumber(count)}</span>
                </div>
              ))}
            </div>
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
            {siteStatsSorted.map(([s, c]) => `${s} ${formatSiteStatNumber(c)}`).join(' ｜ ')}
          </div>
        )}
        <div className="overflow-x-auto w-full">
          {/* 日期在左欄、姓名在表頭（直向閱讀為一天一列） */}
          <table className="w-full table-fixed border-collapse text-sm sm:text-base min-w-[560px]">
            <colgroup>
              <col className="w-[3.25rem] sm:w-16" />
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
                return (
                  <tr key={d} className="border-b border-gray-700">
                    <td
                      className="sticky left-0 z-[1] bg-gray-800 px-1.5 py-1.5 text-white font-medium border border-gray-600 align-top whitespace-nowrap"
                      title={dateStr}
                    >
                      <span className="block text-sm sm:text-base font-semibold">{d}</span>
                      <span className="block text-xs sm:text-sm text-gray-400 font-normal">
                        {weekdayChar(year, month, d)}
                      </span>
                    </td>
                    {userNames.map((name) => {
                      const text = getCellText(name, dateStr)
                      const ck = cellKey(name, dateStr)
                      const isOverride = overrides[ck] != null && String(overrides[ck]).trim() !== ''
                      return (
                        <td
                          key={name}
                          className={`px-1 py-1.5 align-top border border-gray-700 text-sm sm:text-base leading-snug break-words ${isAdmin ? 'cursor-pointer hover:bg-gray-700/40' : ''} ${isOverride ? 'bg-amber-900/20' : 'text-gray-200'}`}
                          title={isAdmin ? (isOverride ? '手動覆寫（點擊編輯）' : '點擊可手動編輯') : text || '—'}
                          onClick={() => isAdmin && openEdit(name, dateStr)}
                          onKeyDown={(e) => isAdmin && e.key === 'Enter' && openEdit(name, dateStr)}
                          role={isAdmin ? 'button' : undefined}
                          tabIndex={isAdmin ? 0 : undefined}
                        >
                          {text ? (
                            <span className={isLeaveOnlyCell(text) ? 'text-red-400 font-medium leave-red-print' : ''}>
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
              與行事曆一致：每卡全天 1／半天 0.5，再除以該卡案場段數；手動覆寫格多案場各 1÷n。「行政」標籤排程不計入。
              同一張卡上「參與人員」與工項負責人為同一人時<strong className="text-gray-400">只計一次</strong>（已修正先前重複加倍）。
              <strong className="text-gray-300">出工日數</strong>＝當月有案場（非假別）的<strong>日曆天數</strong>。
              <strong className="text-gray-300"> 下表加總</strong>＝下面每一案場「天數」<strong>全部加起來</strong>（例：27+6+4+…＝45）；同一天若出現在兩個案場常是 0.5+0.5，故<strong>加總幾乎一定 ≥ 出工日數</strong>，不是「多算錯誤」。
            </p>
            <div className="space-y-3 sm:space-y-4">
              {perUserSiteDayStatsWithData.map(({ name, sitesSorted, sumSiteDays, calendarDaysWithWork }) => (
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
                      <span className="block sm:inline mt-0.5 sm:mt-0" title="下列各案場天數相加；同日多案場會拆成分數，故常大於出工日數">
                        下表加總 <span className="text-amber-300 font-semibold">{formatSiteStatNumber(sumSiteDays)}</span> 天
                      </span>
                    </span>
                  </div>
                  <ul className="text-[11px] sm:text-sm text-gray-200 space-y-1 pl-0 list-none">
                    {sitesSorted.map(([site, dayCount]) => (
                      <li key={site} className="flex justify-between gap-2 border-b border-gray-700/50 last:border-0 pb-1 last:pb-0">
                        <span className="truncate" title={site}>{site}</span>
                        <span className="shrink-0 tabular-nums text-yellow-400/90">{formatSiteStatNumber(dayCount)} 天</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {userNames.length === 0 && (
          <p className="text-gray-500 text-sm">此月份尚無資料。</p>
        )}
        </div>
      </div>

      {/* 編輯 Modal */}
      {editCell && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl">
            <h3 className="text-yellow-400 font-semibold mb-2">編輯格子</h3>
            <p className="text-gray-400 text-xs mb-2">{editCell.name}　{editCell.dateStr}</p>
            <textarea
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white text-sm min-h-[80px]"
              value={editCell.value}
              onChange={(e) => setEditCell((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="例：中壢日月光、斗南小東（多案場用、分隔）；清空儲存可恢復行事曆自動"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={saveEdit} className="rounded bg-yellow-500 px-3 py-1.5 text-sm font-medium text-gray-900">儲存</button>
              <button type="button" onClick={clearEdit} className="rounded bg-gray-600 px-3 py-1.5 text-sm text-white">清除覆寫（恢復自動）</button>
              <button type="button" onClick={() => setEditCell(null)} className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300">取消</button>
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
