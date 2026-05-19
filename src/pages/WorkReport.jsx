import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import {
  getDropdownOptionsByCategory,
  findBoundAccountForDisplayName,
  getDisplayNamesForAccount,
  addDropdownOption
} from '../utils/dropdownStorage'

const WORK_REPORT_SITE_CATEGORY = 'work_report_sites'
const WORK_REPORT_CONTRACTOR_CATEGORY = 'work_report_contractors'
import { getProjects } from '../utils/projectStorage'
import {
  getWorkReports,
  getWorkReportsForMonth,
  groupWorkReportsByDate,
  calcWorkReportHours,
  addWorkReports,
  deleteWorkReport,
  formatContractorPersonName,
  getWorkReportRowTotalHours,
  parseWorkReportHeadcount,
  getWorkReportStatsPersonKey,
  groupWorkReportRowsForDisplay,
  isWorkReportContractorName,
  getWorkReportRowShiftSummary,
  formatWorkReportHours
} from '../utils/workReportStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles } from '../utils/authSupabase'
import { getSupabaseClient } from '../utils/supabaseClient'
import { useRealtimeKeys } from '../contexts/SyncContext'

function WorkReportShiftSummary({ summary, className = '' }) {
  if (!summary || (summary.totalHeadcount == null && summary.headcount == null)) {
    return <span className="text-gray-500">—</span>
  }
  const n = summary.totalHeadcount ?? summary.headcount
  const ot = summary.totalOvertimeHours ?? 0
  const underN = summary.underHeadcount ?? 0
  const underHours = summary.underActualHours ?? 0
  const underPer = summary.underPerPersonHours ?? 0
  // 單人且未滿 8 小時：直接顯示時數，不顯示「出工 1 人」
  if (n === 1 && summary.hasUnderHours) {
    const hrs = underPer || underHours
    return (
      <div className={`text-right tabular-nums ${className}`}>
        <div className="text-orange-300/90 font-semibold">{formatWorkReportHours(hrs)} 小時</div>
      </div>
    )
  }
  return (
    <div className={`text-right tabular-nums ${className}`}>
      <div className="text-amber-200/90 font-semibold">出工 {n} 人</div>
      {summary.hasOvertime && (
        <div className="text-red-400/90 text-xs mt-0.5 font-medium">
          緊急入場時數 {formatWorkReportHours(ot)} 小時
        </div>
      )}
      {summary.hasUnderHours && !summary.hasOvertime && n > 1 && (
        <div className="text-orange-300/90 text-xs mt-0.5 font-medium">
          {underN} 人未滿 8 小時（共 {formatWorkReportHours(underHours)} 小時）
        </div>
      )}
      {!summary.hasOvertime && !summary.hasUnderHours && (
        <div className="text-gray-500 text-xs mt-0.5">滿 8 小時</div>
      )}
    </div>
  )
}



const pad2 = (n) => String(n).padStart(2, '0')
const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i))

function parseTime24(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!m) return { hour: '', minute: '' }
  const hour = pad2(Math.min(23, Math.max(0, parseInt(m[1], 10) || 0)))
  const minute = pad2(Math.min(59, Math.max(0, parseInt(m[2], 10) || 0)))
  return { hour, minute }
}

/** 24 小時制時分選擇（避免 type=time 在中文環境顯示上午/下午） */
function TimeInput24({ label, value, onChange, required, compact }) {
  const { hour, minute } = parseTime24(value)
  const selectClass = compact
    ? 'w-[4.25rem] min-w-0 bg-gray-700 border border-gray-600 rounded px-1 py-1 text-white text-xs tabular-nums'
    : 'flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm tabular-nums'

  const setPart = (nextHour, nextMinute) => {
    if (nextHour !== '' && nextMinute !== '') onChange(`${nextHour}:${nextMinute}`)
    else onChange('')
  }

  const timeRow = (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      <select
        value={hour}
        onChange={(e) => setPart(e.target.value, minute || '00')}
        className={selectClass}
        required={required}
        aria-label={`${label || '時間'} 時`}
      >
        <option value="">時</option>
        {HOUR_OPTIONS_24.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-400 font-mono">:</span>
      <select
        value={minute}
        onChange={(e) => setPart(hour || '00', e.target.value)}
        className={selectClass}
        required={required}
        aria-label={`${label || '時間'} 分`}
      >
        <option value="">分</option>
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )

  if (compact) return timeRow

  return (
    <div>
      <label className="block text-blue-300 text-sm mb-1">
        {label}
        <span className="text-gray-500 font-normal ml-1">（24小時制）</span>
      </label>
      {timeRow}
    </div>
  )
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function collectResignedSnapshotSync() {
  const accounts = new Set()
  const names = new Set()
  ;(getUsers() || []).forEach((u) => {
    if (u?.role !== 'resigned') return
    const acc = String(u?.account || '').trim()
    const uname = String(u?.name || '').trim()
    if (acc) {
      accounts.add(acc)
      ;(getDisplayNamesForAccount(acc) || []).forEach((n) => {
        const t = String(n || '').trim()
        if (t) names.add(t)
      })
    }
    if (uname) names.add(uname)
  })
  return { accounts: [...accounts], names: [...names] }
}

function profileRowIsResigned(p) {
  const v = p?.is_resigned
  return v === true || v === 't' || v === 1
}

async function fetchResignedProfileIdentifiers() {
  const sb = getSupabaseClient()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_resigned_profile_identifiers')
  if (error) {
    console.warn('fetchResignedProfileIdentifiers', error)
    return []
  }
  return Array.isArray(data) ? data : []
}

async function mergeSupabaseResignedIntoSnapshot(snap, userRole) {
  const accounts = new Set(snap.accounts)
  const names = new Set(snap.names)
  if (!isAuthSupabase()) return snap

  const addResignedRow = (p) => {
    const acc = String(p?.account || '').trim()
    if (acc) {
      accounts.add(acc)
      ;(getDisplayNamesForAccount(acc) || []).forEach((n) => {
        const t = String(n || '').trim()
        if (t) names.add(t)
      })
    }
    const dn = String(p?.display_name || '').trim()
    if (dn) names.add(dn)
  }

  try {
    if (userRole === 'admin') {
      const all = await getAllProfiles()
      ;(all || []).filter(profileRowIsResigned).forEach(addResignedRow)
    } else {
      const rows = await fetchResignedProfileIdentifiers()
      ;(rows || []).forEach(addResignedRow)
    }
  } catch (_) {}

  return { accounts: [...accounts], names: [...names] }
}

function isResignedPersonName(name, snap) {
  const t = String(name || '').trim()
  if (!t || !snap) return false
  const accounts = new Set(snap.accounts || [])
  const names = new Set(snap.names || [])
  if (names.has(t) || accounts.has(t)) return true
  const bound = findBoundAccountForDisplayName(t)
  if (bound && accounts.has(bound)) return true
  const user = (getUsers() || []).find((u) => String(u?.name || '').trim() === t)
  return user?.role === 'resigned'
}

function getParticipantNames(snap) {
  const seen = new Set()
  const names = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t) || isResignedPersonName(t, snap)) return
    seen.add(t)
    names.push(t)
  }
  const addFromOptions = (options) => {
    const accSet = new Set(snap.accounts || [])
    ;(options || []).forEach((opt) => {
      const bound = String(opt?.boundAccount || '').trim()
      if (bound && accSet.has(bound)) return
      add(opt?.value)
    })
  }
  addFromOptions(getDropdownOptionsByCategory('participants'))
  addFromOptions(getDropdownOptionsByCategory('responsible_persons'))
  return names.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

function getSiteNameOptions() {
  const seen = new Set()
  const sites = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    sites.push(t)
  }
  ;(getDropdownOptionsByCategory(WORK_REPORT_SITE_CATEGORY) || []).forEach((o) => add(o?.value))
  ;(getProjects() || []).forEach((p) => add(p?.name || p?.siteName))
  return sites.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

function getContractorNameOptions() {
  const seen = new Set()
  const names = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    names.push(t)
  }
  ;(getDropdownOptionsByCategory(WORK_REPORT_CONTRACTOR_CATEGORY) || []).forEach((o) => add(o?.value))
  return names.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

function DayRegisterTable({ rows, labelName, currentUser, userRole, onDelete }) {
  if (!rows?.length) return null
  return (
    <div className="rounded-lg border border-gray-600/80 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-700/60 text-left text-gray-500 text-xs">
              <th className="py-2 px-2 font-medium">案場</th>
              <th className="py-2 px-2 font-medium">{labelName}</th>
              <th className="py-2 px-2 font-medium">時間</th>
              <th className="py-2 px-2 font-medium text-right">工時</th>
              <th className="py-2 px-2 w-14" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const canDelete =
                userRole === 'admin' || String(row.submittedBy || '') === String(currentUser || '')
              return (
                <tr key={row.id} className="border-b border-gray-700/40">
                  <td className="py-2 px-2 text-gray-400 text-xs">{row.siteName}</td>
                  <td className="py-2 px-2 text-teal-100">{row.personName}</td>
                  <td className="py-2 px-2 text-cyan-200 tabular-nums text-xs">
                    {row.arrivalTime}–{row.departureTime}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <WorkReportShiftSummary
                      summary={getWorkReportRowShiftSummary(row)}
                      className="text-xs"
                    />
                  </td>
                  <td className="py-2 px-2">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        刪
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkReport() {
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || '')
  const [participantNames, setParticipantNames] = useState([])
  const [siteOptions, setSiteOptions] = useState([])
  const [contractorOptions, setContractorOptions] = useState([])

  const [date, setDate] = useState(todayStr)
  const [siteSelect, setSiteSelect] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [contractorHeadcount, setContractorHeadcount] = useState(1)
  const [contractorArrival, setContractorArrival] = useState('')
  const [contractorDeparture, setContractorDeparture] = useState('')
  const [contractorOpen, setContractorOpen] = useState(true)
  const [laborNames, setLaborNames] = useState([])
  const [laborArrival, setLaborArrival] = useState('')
  const [laborDeparture, setLaborDeparture] = useState('')
  const [laborOpen, setLaborOpen] = useState(true)
  const [listsOpen, setListsOpen] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newContractorName, setNewContractorName] = useState('')
  const [message, setMessage] = useState(null)

  const now = new Date()
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [monthRecords, setMonthRecords] = useState([])
  const [resignedSnapshot, setResignedSnapshot] = useState({ accounts: [], names: [] })

  const refetch = useCallback(async () => {
    const role = getCurrentUserRole()
    setUserRole(role)
    const user = getCurrentUser() || ''
    setCurrentUser(user)
    let snap = collectResignedSnapshotSync()
    snap = await mergeSupabaseResignedIntoSnapshot(snap, role)
    setResignedSnapshot(snap)
    setParticipantNames(getParticipantNames(snap))
    const sites = getSiteNameOptions()
    const contractors = getContractorNameOptions()
    setSiteOptions(sites)
    setContractorOptions(contractors)
    setSiteSelect((prev) => (prev && sites.includes(prev) ? prev : sites[0] || ''))
    setContractorName((prev) => (prev && contractors.includes(prev) ? prev : ''))
    setLaborNames((prev) => {
      const valid = getParticipantNames(snap)
      return Array.isArray(prev) ? prev.filter((n) => valid.includes(n)) : []
    })
    setMonthRecords(getWorkReportsForMonth(filterYear, filterMonth))
  }, [filterYear, filterMonth])

  useRealtimeKeys(
    ['jiameng_work_reports', 'jiameng_dropdown_options', 'jiameng_projects', 'jiameng_users'],
    refetch
  )

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const resolvedSite = siteSelect.trim()

  const contractorPerHours = useMemo(
    () => calcWorkReportHours(contractorArrival, contractorDeparture),
    [contractorArrival, contractorDeparture]
  )

  const contractorPreviewHeadcount = Math.max(1, Math.floor(Number(contractorHeadcount) || 1))

  const contractorPreviewSummary = useMemo(() => {
    if (contractorPerHours == null) return null
    return getWorkReportRowShiftSummary({
      arrivalTime: contractorArrival,
      departureTime: contractorDeparture,
      headcount: contractorPreviewHeadcount,
      personName: formatContractorPersonName('_', contractorPreviewHeadcount)
    })
  }, [contractorPerHours, contractorArrival, contractorDeparture, contractorPreviewHeadcount])

  const dayContractorRecords = useMemo(() => {
    const d = String(date || '').slice(0, 10)
    if (!d) return []
    return getWorkReports({ date: d })
      .filter((r) => isWorkReportContractorName(r.personName))
      .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
  }, [date, monthRecords])

  const dayLaborRecords = useMemo(() => {
    const d = String(date || '').slice(0, 10)
    if (!d) return []
    return getWorkReports({ date: d })
      .filter((r) => !isWorkReportContractorName(r.personName))
      .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
  }, [date, monthRecords])

  const laborPerHours = useMemo(
    () => calcWorkReportHours(laborArrival, laborDeparture),
    [laborArrival, laborDeparture]
  )

  const laborPreviewSummary = useMemo(() => {
    if (laborPerHours == null || laborNames.length === 0) return null
    return getWorkReportRowShiftSummary({
      arrivalTime: laborArrival,
      departureTime: laborDeparture,
      headcount: laborNames.length,
      personName: laborNames[0]
    })
  }, [laborPerHours, laborArrival, laborDeparture, laborNames])

  const refreshMonthForDate = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`)
    let y = filterYear
    let m = filterMonth
    if (!Number.isNaN(d.getTime())) {
      y = d.getFullYear()
      m = d.getMonth() + 1
      setFilterYear(y)
      setFilterMonth(m)
    }
    setMonthRecords(getWorkReportsForMonth(y, m))
  }

  const registerContractor = () => {
    setMessage(null)
    const siteName = resolvedSite
    if (!siteName) {
      setMessage({ type: 'error', text: '請選擇或輸入案場' })
      return
    }
    const name = contractorName.trim()
    if (!name || !contractorArrival || !contractorDeparture) {
      setMessage({ type: 'error', text: '請填寫包商名稱、抵達與離場時間' })
      return
    }
    const hc = Math.max(1, Math.floor(Number(contractorHeadcount) || 1))
    const result = addWorkReports([
      {
        date,
        siteName,
        personName: formatContractorPersonName(name, hc),
        headcount: hc,
        arrivalTime: contractorArrival,
        departureTime: contractorDeparture,
        submittedBy: currentUser,
        submittedByName: getDisplayNameForAccount(currentUser) || currentUser
      }
    ])
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '登記失敗' })
      return
    }
    setContractorArrival('')
    setContractorDeparture('')
    refreshMonthForDate(date)
    setMessage({
      type: 'success',
      text: `已登記 ${formatContractorPersonName(name, hc)}（${date}）`
    })
  }

  const registerLabor = () => {
    setMessage(null)
    const siteName = resolvedSite
    if (!siteName) {
      setMessage({ type: 'error', text: '請選擇案場' })
      return
    }
    const names = (laborNames || []).map((n) => String(n).trim()).filter(Boolean)
    if (names.length === 0 || !laborArrival || !laborDeparture) {
      setMessage({ type: 'error', text: '請至少選擇一位承攬者並填寫抵達與離場時間' })
      return
    }
    const resigned = names.filter((n) => isResignedPersonName(n, resignedSnapshot))
    if (resigned.length > 0) {
      setMessage({ type: 'error', text: `不可填寫離職人員：${resigned.join('、')}` })
      return
    }
    const result = addWorkReports(
      names.map((name) => ({
        date,
        siteName,
        personName: name,
        arrivalTime: laborArrival,
        departureTime: laborDeparture,
        submittedBy: currentUser,
        submittedByName: getDisplayNameForAccount(currentUser) || currentUser
      }))
    )
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '登記失敗' })
      return
    }
    setLaborNames([])
    setLaborArrival('')
    setLaborDeparture('')
    refreshMonthForDate(date)
    setMessage({ type: 'success', text: `已登記 ${names.join('、')}（${date}）` })
  }

  const addSiteToList = () => {
    const v = newSiteName.trim()
    if (!v) return
    const result = addDropdownOption(v, WORK_REPORT_SITE_CATEGORY)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '新增案場失敗' })
      return
    }
    const sites = getSiteNameOptions()
    setSiteOptions(sites)
    setSiteSelect(v)
    setNewSiteName('')
    setMessage({ type: 'success', text: `已新增案場「${v}」` })
  }

  const addContractorToList = () => {
    const v = newContractorName.trim()
    if (!v) return
    const result = addDropdownOption(v, WORK_REPORT_CONTRACTOR_CATEGORY)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '新增包商失敗' })
      return
    }
    const contractors = getContractorNameOptions()
    setContractorOptions(contractors)
    setContractorName(v)
    setNewContractorName('')
    setMessage({ type: 'success', text: `已新增包商「${v}」` })
  }

  const handleDelete = (row) => {
    const isAdmin = userRole === 'admin'
    const isOwner = String(row?.submittedBy || '') === String(currentUser || '')
    if (!isAdmin && !isOwner) {
      setMessage({ type: 'error', text: '僅能刪除自己送出的紀錄' })
      return
    }
    if (!window.confirm(`確定刪除此筆？\n${row.date} ${row.siteName} ${row.personName}`)) return
    const result = deleteWorkReport(row.id)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '刪除失敗' })
      return
    }
    refreshMonthForDate(row.date || date)
  }

  const recordsByDate = useMemo(() => groupWorkReportsByDate(monthRecords), [monthRecords])

  const sortedDateKeys = useMemo(
    () => [...recordsByDate.keys()].sort((a, b) => b.localeCompare(a)),
    [recordsByDate]
  )

  const personMonthTotals = useMemo(() => {
    const map = new Map()
    monthRecords.forEach((row) => {
      const person = getWorkReportStatsPersonKey(row?.personName)
      if (!person) return
      const shift = getWorkReportRowShiftSummary(row)
      if (!shift) return
      const prev = map.get(person) || {
        fullDays: 0,
        overtimeHours: 0,
        underHours: 0
      }
      prev.fullDays += shift.fullDayHeadcount || 0
      prev.overtimeHours += shift.totalOvertimeHours || 0
      prev.underHours += shift.underActualHours || 0
      map.set(person, prev)
    })
    const round = (x) => Math.round(x * 10) / 10
    return [...map.entries()]
      .map(([personName, agg]) => {
        const baseDays = agg.fullDays
        const totalUnder = agg.underHours
        const carryDays = Math.floor((totalUnder + 1e-9) / 8)
        const remainUnder = round(Math.max(0, totalUnder - carryDays * 8))
        return {
          personName,
          fullDays: baseDays + carryDays,
          baseDays,
          carryDays,
          overtimeHours: round(agg.overtimeHours),
          underHours: remainUnder
        }
      })
      .sort(
        (a, b) =>
          b.fullDays - a.fullDays ||
          b.overtimeHours - a.overtimeHours ||
          a.personName.localeCompare(b.personName, 'zh-Hant')
      )
  }, [monthRecords])

  return (
    <div className="max-w-5xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">出工回報表單</h1>
        <p className="text-gray-400 text-sm mt-1">
          選日期與案場後，包商或勞務承攬者填一筆按「登記」即寫入當日。顯示出工人數與緊急入場時數（每人超過 8 小時）。非下午抵達扣 1 小時午休。
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-200'
              : 'border-red-600/50 bg-red-950/30 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 sm:p-6 space-y-5 mb-8">
        <div>
          <label className="block text-blue-300 text-sm mb-1">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          />
        </div>

        <div className="rounded-lg border border-gray-600/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setListsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-gray-900/40"
          >
            <span className="text-gray-300 text-sm">常用清單（案場、包商名稱）</span>
            <span className="text-gray-500 text-xs">{listsOpen ? '收合 ▲' : '展開 ▼'}</span>
          </button>
          {listsOpen && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-700/60">
              <div>
                <label className="block text-gray-400 text-xs mb-1">新增案場</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    placeholder="案場名稱"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <button type="button" onClick={addSiteToList} className="shrink-0 px-3 py-2 rounded-lg border border-yellow-600/50 text-yellow-200 text-sm hover:bg-yellow-950/30">
                    加入
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">新增包商名稱</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newContractorName}
                    onChange={(e) => setNewContractorName(e.target.value)}
                    placeholder="例：小豪"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <button type="button" onClick={addContractorToList} className="shrink-0 px-3 py-2 rounded-lg border border-teal-600/50 text-teal-200 text-sm hover:bg-teal-950/30">
                    加入
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-blue-300 text-sm mb-1">案場</label>
          <select
            value={siteSelect}
            onChange={(e) => setSiteSelect(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value="">— 請選擇案場 —</option>
            {siteOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-yellow-700/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setLaborOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-yellow-950/20 transition-colors"
          >
            <span className="text-yellow-300/90 text-sm font-medium">勞務承攬者（登記即存當日）</span>
            <span className="text-gray-500 text-xs shrink-0">
              {laborOpen ? '收合 ▲' : '展開 ▼'}
              {dayLaborRecords.length > 0 ? ` · 本日 ${dayLaborRecords.length} 筆` : ''}
            </span>
          </button>
          {laborOpen && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-yellow-700/30">
              {dayLaborRecords.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">{date} 已登記承攬者 {dayLaborRecords.length} 筆</p>
                  <DayRegisterTable
                    rows={dayLaborRecords}
                    labelName="姓名"
                    currentUser={currentUser}
                    userRole={userRole}
                    onDelete={handleDelete}
                  />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-gray-400 text-xs">承攬者（可多選）</label>
                  {participantNames.length > 0 && (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setLaborNames(participantNames.slice())}
                        className="text-yellow-300/80 hover:text-yellow-200"
                      >
                        全選
                      </button>
                      <span className="text-gray-600">|</span>
                      <button
                        type="button"
                        onClick={() => setLaborNames([])}
                        className="text-gray-400 hover:text-gray-200"
                      >
                        清除
                      </button>
                    </div>
                  )}
                </div>
                {participantNames.length === 0 ? (
                  <p className="text-gray-500 text-xs mt-1">尚無人員，請至下拉選單管理新增「參與人員」。</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-gray-900/30 border border-gray-700 rounded p-2">
                    {participantNames.map((n) => {
                      const checked = laborNames.includes(n)
                      return (
                        <label
                          key={n}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm select-none ${
                            checked
                              ? 'bg-yellow-600/20 border border-yellow-500/50 text-yellow-100'
                              : 'border border-gray-700 text-gray-200 hover:bg-gray-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-yellow-500"
                            checked={checked}
                            onChange={(e) => {
                              setLaborNames((prev) =>
                                e.target.checked
                                  ? [...prev, n]
                                  : prev.filter((x) => x !== n)
                              )
                            }}
                          />
                          <span>{n}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {laborNames.length > 0 && (
                  <p className="text-yellow-300/80 text-xs mt-2">已選 {laborNames.length} 人：{laborNames.join('、')}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TimeInput24 label="抵達時間" value={laborArrival} onChange={setLaborArrival} />
                <TimeInput24 label="離場時間" value={laborDeparture} onChange={setLaborDeparture} />
              </div>
              {laborPreviewSummary && <WorkReportShiftSummary summary={laborPreviewSummary} />}
              <button
                type="button"
                onClick={registerLabor}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-semibold transition-colors"
              >
                登記
              </button>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-teal-700/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setContractorOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-teal-950/30 transition-colors"
          >
            <span className="text-teal-300 text-sm font-medium">包商出工（登記即存當日）</span>
            <span className="text-gray-500 text-xs shrink-0">
              {contractorOpen ? '收合 ▲' : '展開 ▼'}
              {dayContractorRecords.length > 0 ? ` · 本日 ${dayContractorRecords.length} 筆` : ''}
            </span>
          </button>
          {contractorOpen && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-teal-700/30">
              {dayContractorRecords.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">{date} 已登記包商 {dayContractorRecords.length} 筆</p>
                  <DayRegisterTable
                    rows={dayContractorRecords}
                    labelName="包商"
                    currentUser={currentUser}
                    userRole={userRole}
                    onDelete={handleDelete}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">包商名稱</label>
                  <select
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value="">— 請選擇包商 —</option>
                    {contractorOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">人數</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={contractorHeadcount}
                    onChange={(e) => setContractorHeadcount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TimeInput24 label="抵達時間" value={contractorArrival} onChange={setContractorArrival} />
                <TimeInput24 label="離場時間" value={contractorDeparture} onChange={setContractorDeparture} />
              </div>
              {contractorPreviewSummary && <WorkReportShiftSummary summary={contractorPreviewSummary} />}
              <button
                type="button"
                onClick={registerContractor}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white font-semibold transition-colors"
              >
                登記
              </button>
            </div>
          )}
        </div>

      </div>


      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-yellow-400">當月回報統計</h2>
            <p className="text-gray-500 text-xs mt-1">
              出工天 = 當日滿 8 小時計 1 天；未滿 8 小時的時數累計每滿 8 小時補 1 天，剩餘以「出工 X 小時」列出；緊急入場時數 = 超過 8 小時的時數。
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-gray-400 text-xs mb-1">年</label>
              <input
                type="number"
                min={2020}
                max={2035}
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value) || filterYear)}
                className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">月</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                  <option key={mo} value={mo}>{mo} 月</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {personMonthTotals.length > 0 && (
          <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 px-3 py-3">
            <h3 className="text-sm font-medium text-cyan-300 mb-2">當月個人總工時</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {personMonthTotals.map(
                ({ personName, fullDays, baseDays, carryDays, overtimeHours, underHours }) => (
                  <div
                    key={personName}
                    className="rounded border border-cyan-700/50 bg-gray-900/50 px-3 py-2 text-gray-200 min-w-[8rem]"
                  >
                    <div className="text-white font-semibold mb-1">{personName}</div>
                    <div className="space-y-0.5 tabular-nums">
                      <div className="text-amber-200/90">
                        出工 <span className="font-semibold">{fullDays}</span> 天
                        {carryDays > 0 && (
                          <span className="text-cyan-300/80 text-xs ml-1">
                            （含未滿補 {carryDays} 天）
                          </span>
                        )}
                      </div>
                      {overtimeHours > 0 && (
                        <div className="text-red-400/90">
                          緊急入場時數 <span className="font-semibold">{formatWorkReportHours(overtimeHours)}</span> 小時
                        </div>
                      )}
                      {underHours > 0 && (
                        <div className="text-orange-300/90">
                          出工 <span className="font-semibold">{formatWorkReportHours(underHours)}</span> 小時
                        </div>
                      )}
                      {overtimeHours === 0 && underHours === 0 && fullDays === 0 && (
                        <div className="text-gray-500 text-xs">—</div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className={personMonthTotals.length > 0 ? 'border-t border-gray-700 pt-4' : ''}>
          <h3 className="text-base font-semibold text-yellow-400/90 mb-3">當月明細</h3>
          {sortedDateKeys.length === 0 ? (
            <p className="text-gray-500 text-sm">尚無紀錄。</p>
          ) : (
            <div className="space-y-6">
              {sortedDateKeys.map((dateKey) => {
                const dayGroups = groupWorkReportRowsForDisplay(recordsByDate.get(dateKey) || [])
                return (
                  <div key={dateKey}>
                    <h4 className="text-sm font-medium text-gray-200 mb-2 tabular-nums">{dateKey}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[560px]">
                        <thead>
                          <tr className="border-b border-gray-600 text-left text-gray-400">
                            <th className="py-2 pr-3 font-medium">案場</th>
                            <th className="py-2 pr-3 font-medium">姓名</th>
                            <th className="py-2 pr-3 font-medium" colSpan={2}>時間</th>
                            <th className="py-2 pr-3 font-medium text-right">工時</th>
                            <th className="py-2 pr-3 font-medium">填寫人</th>
                            <th className="py-2 font-medium w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {dayGroups.map((group) => {
                            const isContractor = group.kind === 'contractor'
                            return (
                              <tr key={group.id} className="border-b border-gray-700/60">
                                <td className="py-2.5 pr-3 text-gray-200">{group.siteName}</td>
                                <td className="py-2.5 pr-3 text-white">
                                  {group.personName}
                                  {isContractor && group.batchCount > 1 && (
                                    <span className="block text-teal-300/80 text-xs mt-0.5">
                                      {group.batchCount} 批
                                    </span>
                                  )}
                                </td>
                                <td colSpan={2} className="py-2.5 pr-3 text-cyan-200 tabular-nums text-xs">
                                  {group.timeLabel}
                                </td>
                                <td className="py-2.5 pr-3 text-right font-medium">
                                  <WorkReportShiftSummary summary={group.shiftSummary} />
                                </td>
                                <td className="py-2.5 pr-3 text-gray-400 text-xs">
                                  {group.rows[0]?.submittedByName || group.rows[0]?.submittedBy || '—'}
                                </td>
                                <td className="py-2.5">
                                  <div className="flex flex-col gap-1 items-end">
                                    {userRole === 'admin' && group.rows.map((row) => (
                                      <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => handleDelete(row)}
                                        className="text-red-400 hover:text-red-300 text-xs whitespace-nowrap"
                                      >
                                        {group.rows.length > 1 ? '刪此批' : '刪除'}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WorkReport
