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

/** 行事曆自動：name -> dateStr -> Set(siteName)，不含手動覆寫 */
function buildScheduleMap(year, month) {
  const schedules = getSchedules()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const map = new Map()

  const addSite = (name, dateStr, siteName) => {
    const s = String(siteName || '').trim()
    if (!s || !name) return
    const n = String(name).trim()
    if (!map.has(n)) map.set(n, new Map())
    const byDate = map.get(n)
    if (!byDate.has(dateStr)) byDate.set(dateStr, new Set())
    byDate.get(dateStr).add(s)
  }

  schedules.forEach((schedule) => {
    const dateStr = String(schedule?.date || '').slice(0, 10)
    if (!dateStr || dateStr < startDate || dateStr > endDate) return

    const segments = getScheduleSegments(schedule)
    segments.forEach((seg) => {
      const siteName = seg.siteName || '（未填案場）'
      parseParticipants(schedule.participants).forEach((name) => addSite(name, dateStr, siteName))
      const items = Array.isArray(seg.workItems) ? seg.workItems : []
      expandWorkItemsToLogical(items).forEach((raw) => {
        const it = normalizeWorkItem(raw)
        if (String(it?.changeRequest?.status || '') === 'pending') return
        const collabs = getWorkItemCollaborators(it)
        if (collabs.length > 0) collabs.forEach((c) => addSite(c?.name, dateStr, siteName))
        else {
          const rp = String(it?.responsiblePerson || '').trim()
          if (rp) addSite(rp, dateStr, siteName)
        }
      })
    })
  })

  return { map, lastDay }
}

function cellKey(name, dateStr) {
  return `${String(name || '').trim()}|${String(dateStr || '').slice(0, 10)}`
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
  return false
}

/** 由顯示文字統計案場人次；假別不計入案場 */
function countSitesFromDisplayTexts(texts) {
  const siteWorkCount = new Map()
  texts.forEach((text) => {
    const t = String(text || '').trim()
    if (!t || t === '—') return
    if (isLeaveLabel(t)) return
    t.split(/、/).forEach((part) => {
      const s = part.trim()
      if (s && !isLeaveLabel(s)) siteWorkCount.set(s, (siteWorkCount.get(s) || 0) + 1)
    })
  })
  return siteWorkCount
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
  const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'l' : 'p', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height) * 0.95
  const w = canvas.width * ratio
  const h = canvas.height * ratio
  pdf.addImage(imgData, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
  pdf.save(filename)
}

export default function MonthlyLocationReport() {
  const role = getCurrentUserRole()
  const isAdmin = role === 'admin'
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const printRef = useRef(null)
  const [editCell, setEditCell] = useState(null) // { name, dateStr, value }

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MONTHLY_LOCATION_OVERRIDES_KEY || e.key === 'jiameng_leave_applications') {
        setRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const { map: scheduleMap, lastDay } = useMemo(
    () => buildScheduleMap(year, month),
    [year, month, refreshKey]
  )

  const overrides = useMemo(() => getMonthlyOverrides(year, month), [year, month, refreshKey])

  const leaveCellTextMap = useMemo(() => buildLeaveCellTextMap(year, month), [year, month, refreshKey])

  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay])

  const userNames = useMemo(() => {
    const fromSchedule = [...scheduleMap.keys()]
    const fromOverrides = getOverrideNamesForMonth(year, month)
    const set = new Set([...fromSchedule, ...fromOverrides])
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [scheduleMap, year, month, refreshKey])

  const getCellText = useCallback(
    (name, dateStr) => {
      const ck = cellKey(name, dateStr)
      if (overrides[ck] != null && String(overrides[ck]).trim() !== '') return String(overrides[ck]).trim()
      const sites = scheduleMap.get(name)?.get(dateStr)
      if (sites && sites.size > 0) return [...sites].join('、')
      // 無排程時帶入已核准請假（假別 = 事由 reason；無則「請假」）
      const leaveText = leaveCellTextMap.get(ck)
      if (leaveText) return leaveText
      return ''
    },
    [overrides, scheduleMap, leaveCellTextMap]
  )

  const siteStatsSorted = useMemo(() => {
    const allTexts = []
    userNames.forEach((name) => {
      days.forEach((d) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const text = getCellText(name, dateStr)
        if (text) allTexts.push(text)
      })
    })
    const siteWorkCount = countSitesFromDisplayTexts(allTexts)
    return [...siteWorkCount.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
    )
  }, [userNames, days, year, month, getCellText])

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

  const handlePrint = () => window.print()
  const handlePdf = async () => {
    if (!printRef.current || pdfBusy) return
    setPdfBusy(true)
    try {
      await exportPdf(printRef.current, `每月份工時匯總報表_${year}年${month}月.pdf`)
    } catch (e) {
      console.error(e)
      alert('匯出 PDF 失敗，請改用列印另存 PDF。')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="max-w-[100vw] text-white monthly-report-root">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .monthly-report-print-area,
          .monthly-report-print-area * { visibility: visible !important; }
          .monthly-report-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            opacity: 1 !important; z-index: 0 !important; width: 100% !important;
            background: #fff !important; color: #111 !important; padding: 12px !important;
          }
          .monthly-report-print-area table { font-size: 9px !important; table-layout: fixed !important; }
          .monthly-report-print-area col:first-child { width: 3rem !important; max-width: 3rem !important; }
          .monthly-report-print-area th,
          .monthly-report-print-area td { border: 1px solid #333 !important; color: #111 !important; }
          .monthly-report-no-print { display: none !important; }
        }
      `}</style>

      <div className="p-3 sm:p-6 monthly-report-no-print">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-yellow-400">每月份工時匯總報表</h1>
            <p className="text-gray-400 text-[11px] sm:text-sm mt-1">
              已核准請假且當日無排程時，會顯示請假單<strong>事由（假別）</strong>，例如特休、病假；未填事由則顯示「請假」。{isAdmin ? ' 管理員可點格編輯。' : ''}
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
              onClick={handlePrint}
              className="bg-blue-700 hover:bg-blue-600 border border-blue-600 rounded px-2 py-1 text-xs sm:text-sm text-white"
            >
              列印
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
            <h2 className="text-sm sm:text-base font-semibold text-yellow-400 mb-2">各案場出工統計（人次）</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] sm:text-sm">
              {siteStatsSorted.map(([site, count]) => (
                <div key={site} className="flex justify-between gap-2 rounded border border-gray-600 bg-gray-900/50 px-2 py-1.5">
                  <span className="text-gray-200 truncate" title={site}>{site}</span>
                  <span className="shrink-0 font-mono text-yellow-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 手機直式 */}
        <div className="md:hidden space-y-3 pb-8">
          {userNames.length === 0 ? (
            <p className="text-gray-500 text-sm">此月份尚無資料；管理員可點格新增（請用桌機版表格較順）。</p>
          ) : (
            userNames.map((name) => (
              <div key={name} className="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
                <div className="bg-gray-900 px-2 py-1.5 text-xs font-semibold text-yellow-400 border-b border-gray-600">{name}</div>
                <div className="divide-y divide-gray-700/80 max-h-[60vh] overflow-y-auto">
                  {days.map((d) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const text = getCellText(name, dateStr)
                    if (!text) return null
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => openEdit(name, dateStr)}
                        className={`flex w-full gap-2 px-2 py-1 text-left text-[10px] leading-tight ${isAdmin ? 'hover:bg-gray-700/50 cursor-pointer' : ''}`}
                      >
                        <span className="shrink-0 w-8 text-gray-500">{d}日</span>
                        <span className="text-gray-200 break-words">{text}</span>
                      </button>
                    )
                  })}
                </div>
                {days.every((d) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  return !getCellText(name, dateStr)
                }) && (
                  <div className="px-2 py-2 text-[10px] text-gray-600">本月無排程</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 列印/PDF 區 */}
      <div
        ref={printRef}
        className="monthly-report-print-area border border-gray-700 rounded-lg bg-gray-800/50 p-2 sm:p-4 print:block print:border-0 md:relative md:block
          max-md:fixed max-md:left-[-9999px] max-md:top-0 max-md:w-[900px] max-md:z-[-1] max-md:opacity-0 max-md:pointer-events-none"
      >
        <h2 className="text-yellow-400 font-bold mb-2 text-sm sm:text-base print:text-black">
          每月份工時匯總報表 {year} 年 {month} 月
        </h2>
        {siteStatsSorted.length > 0 && (
          <div className="mb-3 text-[10px] sm:text-xs print:text-black">
            <strong>各案場出工人次：</strong>
            {siteStatsSorted.map(([s, c]) => `${s}${c}`).join(' ｜ ')}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[10px] sm:text-xs min-w-[640px] print:text-black">
            <colgroup>
              <col className="w-[2.6rem] sm:w-[3rem]" />
              {days.map((d) => (
                <col key={d} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-900 border-b border-yellow-500/50 print:bg-gray-200">
                <th className="sticky left-0 z-10 bg-gray-900 print:bg-gray-200 w-[2.6rem] sm:w-[3rem] max-w-[3rem] px-0.5 py-1 text-left text-yellow-400 print:text-black font-semibold border border-gray-600 whitespace-nowrap overflow-hidden text-ellipsis" title="姓名">姓名</th>
                {days.map((d) => (
                  <th key={d} className="px-0.5 py-1 text-center text-yellow-400 print:text-black font-semibold border border-gray-700 w-8 sm:w-10">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userNames.map((name) => (
                <tr key={name} className="border-b border-gray-700">
                  <td
                    className="sticky left-0 z-[1] bg-gray-800 print:bg-white w-[2.6rem] sm:w-[3rem] max-w-[3rem] px-0.5 py-1 text-white print:text-black font-medium border border-gray-600 whitespace-nowrap overflow-hidden text-ellipsis align-middle"
                    title={name}
                  >
                    {name}
                  </td>
                  {days.map((d) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const text = getCellText(name, dateStr)
                    const ck = cellKey(name, dateStr)
                    const isOverride = overrides[ck] != null && String(overrides[ck]).trim() !== ''
                    return (
                      <td
                        key={d}
                        className={`px-0.5 py-1 align-top border border-gray-700 text-[9px] sm:text-[10px] max-w-[90px] print:text-black ${isAdmin ? 'cursor-pointer hover:bg-gray-700/40' : ''} ${isOverride ? 'bg-amber-900/20 print:bg-amber-50' : 'text-gray-200'}`}
                        title={isAdmin ? (isOverride ? '手動覆寫（點擊編輯）' : '點擊可手動編輯') : text}
                        onClick={() => isAdmin && openEdit(name, dateStr)}
                        onKeyDown={(e) => isAdmin && e.key === 'Enter' && openEdit(name, dateStr)}
                        role={isAdmin ? 'button' : undefined}
                        tabIndex={isAdmin ? 0 : undefined}
                      >
                        {text || '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {userNames.length === 0 && (
          <p className="text-gray-500 text-sm print:text-black">此月份尚無資料。</p>
        )}
      </div>

      {/* 編輯 Modal */}
      {editCell && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 monthly-report-no-print">
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

      <div className="md:hidden monthly-report-no-print">
        <p className="text-[10px] text-gray-500 mb-2">手機直式僅顯示有資料的日期；要新增空白格請用桌機點該格編輯。</p>
      </div>
    </div>
  )
}
