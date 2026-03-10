import { useState, useMemo, useRef } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { getCurrentUserRole } from '../utils/authStorage'
import {
  normalizeWorkItem,
  getWorkItemCollaborators,
  expandWorkItemsToLogical
} from '../utils/workItemCollaboration'

/**
 * 將排程正規化為依案場分段（與行事曆邏輯一致）
 */
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

/**
 * 依行事曆排程彙整：使用者 -> 日期 -> 去過的案場；並統計各案場出工人次
 */
function buildMonthlyLocationMap(year, month) {
  const schedules = getSchedules()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const map = new Map()
  // 案場 -> 出工人次（每人每天每案場計 1；同日多案場則各案場各 +1）
  const siteWorkCount = new Map()

  const addSite = (name, dateStr, siteName) => {
    const s = String(siteName || '').trim()
    if (!s || !name) return
    const n = String(name).trim()
    if (!map.has(n)) map.set(n, new Map())
    const byDate = map.get(n)
    if (!byDate.has(dateStr)) byDate.set(dateStr, new Set())
    const set = byDate.get(dateStr)
    if (!set.has(s)) {
      set.add(s)
      siteWorkCount.set(s, (siteWorkCount.get(s) || 0) + 1)
    }
  }

  schedules.forEach((schedule) => {
    const dateStr = String(schedule?.date || '').slice(0, 10)
    if (!dateStr || dateStr < startDate || dateStr > endDate) return

    const segments = getScheduleSegments(schedule)

    segments.forEach((seg) => {
      const siteName = seg.siteName || '（未填案場）'
      const namesFromParticipants = parseParticipants(schedule.participants)

      namesFromParticipants.forEach((name) => addSite(name, dateStr, siteName))

      const items = Array.isArray(seg.workItems) ? seg.workItems : []
      const logical = expandWorkItemsToLogical(items)
      logical.forEach((raw) => {
        const it = normalizeWorkItem(raw)
        if (String(it?.changeRequest?.status || '') === 'pending') return
        const collabs = getWorkItemCollaborators(it)
        if (collabs.length > 0) {
          collabs.forEach((c) => addSite(c?.name, dateStr, siteName))
        } else {
          const rp = String(it?.responsiblePerson || '').trim()
          if (rp) addSite(rp, dateStr, siteName)
        }
      })
    })
  })

  return { map, lastDay, startDate, endDate, siteWorkCount }
}

/** 匯出 PDF（html2canvas + jspdf） */
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
  const imgW = canvas.width
  const imgH = canvas.height
  const ratio = Math.min(pageW / imgW, pageH / imgH) * 0.95
  const w = imgW * ratio
  const h = imgH * ratio
  const x = (pageW - w) / 2
  const y = (pageH - h) / 2
  pdf.addImage(imgData, 'PNG', x, y, w, h)
  let heightLeft = h
  let pos = y
  while (heightLeft > pageH) {
    pdf.addPage()
    pos = 0
    pdf.addImage(imgData, 'PNG', x, pos - (h - heightLeft), w, h)
    heightLeft -= pageH
  }
  pdf.save(filename)
}

export default function MonthlyLocationReport() {
  const role = getCurrentUserRole()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const printRef = useRef(null)

  const { map, lastDay, siteWorkCount } = useMemo(
    () => buildMonthlyLocationMap(year, month),
    [year, month, refreshKey]
  )

  const userNames = useMemo(() => {
    return [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [map])

  const siteStatsSorted = useMemo(() => {
    return [...siteWorkCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
  }, [siteWorkCount])

  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay])

  const handlePrint = () => window.print()

  const handlePdf = async () => {
    if (!printRef.current || pdfBusy) return
    setPdfBusy(true)
    try {
      await exportPdf(
        printRef.current,
        `整月去處報表_${year}年${month}月.pdf`
      )
    } catch (e) {
      console.error(e)
      alert('匯出 PDF 失敗，請改用列印另存 PDF。')
    } finally {
      setPdfBusy(false)
    }
  }

  if (role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6 text-white">
        <p className="text-gray-400">僅管理員可查看整月份去處報表。</p>
      </div>
    )
  }

  return (
    <div className="max-w-[100vw] text-white monthly-report-root">
      {/* 列印用：只印這塊；螢幕上仍顯示完整 UI */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .monthly-report-print-area,
          .monthly-report-print-area * { visibility: visible !important; }
          .monthly-report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            opacity: 1 !important;
            z-index: 0 !important;
            width: 100% !important;
            background: #fff !important;
            color: #111 !important;
            padding: 12px !important;
          }
          .monthly-report-print-area table { font-size: 9px !important; }
          .monthly-report-print-area th,
          .monthly-report-print-area td { border: 1px solid #333 !important; color: #111 !important; }
          .monthly-report-no-print { display: none !important; }
        }
      `}</style>

      <div className="p-3 sm:p-6 monthly-report-no-print">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-yellow-400">整月份去處報表</h1>
            <p className="text-gray-400 text-[11px] sm:text-sm mt-1">
              依行事曆排程彙整每日案場；手機直式以姓名在上、日期在下。
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
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 各案場出工統計 */}
        {siteStatsSorted.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-3 sm:p-4">
            <h2 className="text-sm sm:text-base font-semibold text-yellow-400 mb-2">
              各案場出工統計（人次）
            </h2>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-2">
              每人每日每案場計 1 人次；同日去多所案場則分別累加。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] sm:text-sm">
              {siteStatsSorted.map(([site, count]) => (
                <div
                  key={site}
                  className="flex justify-between gap-2 rounded border border-gray-600 bg-gray-900/50 px-2 py-1.5"
                >
                  <span className="text-gray-200 truncate" title={site}>
                    {site}
                  </span>
                  <span className="shrink-0 font-mono text-yellow-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 手機直式：姓名在上，底下依日期列表 */}
        <div className="md:hidden space-y-3 pb-8">
          {userNames.length === 0 ? (
            <p className="text-gray-500 text-sm">此月份尚無排程資料。</p>
          ) : (
            userNames.map((name) => (
              <div
                key={name}
                className="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden"
              >
                <div className="bg-gray-900 px-2 py-1.5 text-xs font-semibold text-yellow-400 border-b border-gray-600">
                  {name}
                </div>
                <div className="divide-y divide-gray-700/80 max-h-[60vh] overflow-y-auto">
                  {days.map((d) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const sites = map.get(name)?.get(dateStr)
                    const text = sites && sites.size > 0 ? [...sites].join('、') : ''
                    if (!text) return null
                    return (
                      <div key={d} className="flex gap-2 px-2 py-1 text-[10px] leading-tight">
                        <span className="shrink-0 w-8 text-gray-500">{d}日</span>
                        <span className="text-gray-200 break-words">{text}</span>
                      </div>
                    )
                  })}
                </div>
                {/* 若整月都無資料仍顯示姓名列 */}
                {days.every((d) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  const sites = map.get(name)?.get(dateStr)
                  return !sites || sites.size === 0
                }) && (
                  <div className="px-2 py-2 text-[10px] text-gray-600">本月無排程</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 橫表 + 列印/PDF 擷取區：手機離屏避免重排，匯出 PDF 時仍可擷取 */}
      <div
        ref={printRef}
        className="monthly-report-print-area border border-gray-700 rounded-lg bg-gray-800/50 p-2 sm:p-4 print:block print:border-0 md:relative md:block
          max-md:fixed max-md:left-[-9999px] max-md:top-0 max-md:w-[900px] max-md:z-[-1] max-md:opacity-0 max-md:pointer-events-none"
      >
        <h2 className="text-yellow-400 font-bold mb-2 text-sm sm:text-base print:text-black">
          整月份去處報表 {year} 年 {month} 月
        </h2>
        {siteStatsSorted.length > 0 && (
          <div className="mb-3 text-[10px] sm:text-xs print:text-black">
            <strong>各案場出工人次：</strong>
            {siteStatsSorted.map(([s, c]) => `${s} ${c}`).join(' ｜ ')}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] sm:text-xs min-w-[640px] print:text-black">
            <thead>
              <tr className="bg-gray-900 border-b border-yellow-500/50 print:bg-gray-200">
                <th className="sticky left-0 z-10 bg-gray-900 print:bg-gray-200 px-1 sm:px-2 py-1 text-left text-yellow-400 print:text-black font-semibold border border-gray-600 whitespace-nowrap">
                  姓名
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className="px-0.5 py-1 text-center text-yellow-400 print:text-black font-semibold border border-gray-700 w-8 sm:w-10"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userNames.map((name) => (
                <tr key={name} className="border-b border-gray-700">
                  <td className="sticky left-0 z-[1] bg-gray-800 print:bg-white px-1 sm:px-2 py-1 text-white print:text-black font-medium border border-gray-600 whitespace-nowrap">
                    {name}
                  </td>
                  {days.map((d) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const sites = map.get(name)?.get(dateStr)
                    const text = sites && sites.size > 0 ? [...sites].join('、') : ''
                    return (
                      <td
                        key={d}
                        className="px-0.5 py-1 align-top text-gray-200 print:text-black border border-gray-700 text-[9px] sm:text-[10px] max-w-[90px]"
                        title={text}
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
          <p className="text-gray-500 text-sm print:text-black">此月份尚無排程或參與人員資料。</p>
        )}
      </div>

      <div className="md:hidden monthly-report-no-print">
        <p className="text-[10px] text-gray-500 mb-2">
          手機可看直式列表；匯出 PDF 會擷取完整橫表。列印建議選「另存 PDF」。
        </p>
      </div>
    </div>
  )
}
