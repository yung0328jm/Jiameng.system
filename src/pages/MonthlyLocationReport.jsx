import { useState, useMemo } from 'react'
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

/** 從參與人員字串解析姓名列表 */
function parseParticipants(str) {
  if (!str || typeof str !== 'string') return []
  return str
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 依行事曆排程彙整：使用者 -> 日期 -> 去過的案場（不重複）
 */
function buildMonthlyLocationMap(year, month) {
  const schedules = getSchedules()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // name -> dateStr -> Set(siteName)
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

  return { map, lastDay, startDate, endDate }
}

export default function MonthlyLocationReport() {
  const role = getCurrentUserRole()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [refreshKey, setRefreshKey] = useState(0)

  const { map, lastDay } = useMemo(() => buildMonthlyLocationMap(year, month), [year, month, refreshKey])

  const userNames = useMemo(() => {
    return [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [map])

  if (role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6 text-white">
        <p className="text-gray-400">僅管理員可查看整月份去處報表。</p>
      </div>
    )
  }

  const days = Array.from({ length: lastDay }, (_, i) => i + 1)

  return (
    <div className="max-w-[100vw] overflow-x-auto p-4 sm:p-6 text-white">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">整月份去處報表</h1>
          <p className="text-gray-400 text-sm mt-1">
            依行事曆排程（參與人員與工作項目負責人）彙整每位使用者每日去過的案場。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-1 text-sm text-white"
          >
            重新整理
          </button>
          <label className="text-gray-400 text-sm">年</label>
          <input
            type="number"
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-24 text-white"
            value={year}
            min={2024}
            max={2030}
            onChange={(e) => setYear(Number(e.target.value) || year)}
          />
          <label className="text-gray-400 text-sm">月</label>
          <select
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
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

      <div className="overflow-x-auto border border-gray-700 rounded-lg bg-gray-800/50">
        <table className="w-full text-sm border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-900 border-b border-yellow-500/50">
              <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2 text-left text-yellow-400 font-semibold border-r border-gray-600 whitespace-nowrap min-w-[100px]">
                姓名
              </th>
              {days.map((d) => (
                <th key={d} className="px-1 py-2 text-center text-yellow-400 font-semibold border-r border-gray-700 min-w-[72px]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userNames.map((name) => (
              <tr key={name} className="border-b border-gray-700 hover:bg-gray-900/50">
                <td className="sticky left-0 z-[1] bg-gray-800 px-3 py-2 text-white font-medium border-r border-gray-600 whitespace-nowrap">
                  {name}
                </td>
                {days.map((d) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  const sites = map.get(name)?.get(dateStr)
                  const text = sites && sites.size > 0 ? [...sites].join('、') : ''
                  return (
                    <td
                      key={d}
                      className="px-1 py-2 align-top text-gray-200 border-r border-gray-700 text-xs max-w-[120px]"
                      title={text}
                    >
                      {text ? (
                        <span className="break-words line-clamp-4">{text}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {userNames.length === 0 && (
        <p className="text-gray-500 mt-4">此月份尚無排程或參與人員資料。</p>
      )}
    </div>
  )
}
