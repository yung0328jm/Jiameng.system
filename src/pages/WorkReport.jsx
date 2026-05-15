import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDropdownOptionsByCategory, findBoundAccountForDisplayName, getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { getProjects } from '../utils/projectStorage'
import {
  getWorkReportsForMonth,
  groupWorkReportsByDate,
  calcWorkReportHours,
  addWorkReports,
  deleteWorkReport,
  getWorkReportDurationDisplay,
  formatContractorPersonName,
  getWorkReportRowTotalHours,
  parseWorkReportHeadcount
} from '../utils/workReportStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles } from '../utils/authSupabase'
import { getSupabaseClient } from '../utils/supabaseClient'
import { useRealtimeKeys } from '../contexts/SyncContext'

function WorkReportDuration({ hours, className, overtimeClassName }) {
  const d = getWorkReportDurationDisplay(hours, { className, overtimeClassName })
  return <span className={d.className}>{d.text}</span>
}

function WorkReportHoursDetail({ arrivalTime, departureTime, headcount = 1 }) {
  const perHours = calcWorkReportHours(arrivalTime, departureTime)
  if (perHours == null) return <span className="text-gray-500">—</span>

  const n = Math.max(1, Math.floor(Number(headcount) || 1))
  const totalHours = Math.round(perHours * n * 10) / 10

  if (n <= 1) {
    return <WorkReportDuration hours={perHours} className="text-amber-200/90 font-semibold" />
  }

  return (
    <div className="text-right">
      <div className="text-gray-500 text-[11px] mb-0.5">
        每人 <WorkReportDuration hours={perHours} className="inline text-amber-200/80" />
      </div>
      <WorkReportDuration hours={totalHours} className="text-amber-200/90 font-semibold" />
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
  ;(getProjects() || []).forEach((p) => add(p?.name || p?.siteName))
  return sites.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

function WorkReport() {
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || '')
  const [participantNames, setParticipantNames] = useState([])
  const [siteOptions, setSiteOptions] = useState([])

  const [date, setDate] = useState(todayStr)
  const [siteMode, setSiteMode] = useState('select')
  const [siteSelect, setSiteSelect] = useState('')
  const [siteManual, setSiteManual] = useState('')
  const [selectedNames, setSelectedNames] = useState([])
  /** @type {Record<string, { arrivalTime: string, departureTime: string }>} */
  const [personTimes, setPersonTimes] = useState({})
  const [contractorName, setContractorName] = useState('')
  const [contractorHeadcount, setContractorHeadcount] = useState(1)
  const [contractorArrival, setContractorArrival] = useState('')
  const [contractorDeparture, setContractorDeparture] = useState('')
  /** @type {Array<{ id: string, name: string, headcount: number, arrivalTime: string, departureTime: string }>} */
  const [contractorQueue, setContractorQueue] = useState([])
  const [contractorOpen, setContractorOpen] = useState(false)
  const [batchApplyArrival, setBatchApplyArrival] = useState('')
  const [batchApplyDeparture, setBatchApplyDeparture] = useState('')
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
    setSelectedNames((prev) => prev.filter((n) => !isResignedPersonName(n, snap)))
    const sites = getSiteNameOptions()
    setSiteOptions(sites)
    setSiteSelect((prev) => (prev && sites.includes(prev) ? prev : sites[0] || ''))
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

  const resolvedSite = siteMode === 'manual' ? siteManual.trim() : siteSelect.trim()

  const allNamesForSubmit = useMemo(() => {
    return selectedNames.map((n) => String(n || '').trim()).filter(Boolean)
  }, [selectedNames])

  const contractorPerHours = useMemo(
    () => calcWorkReportHours(contractorArrival, contractorDeparture),
    [contractorArrival, contractorDeparture]
  )

  const contractorPreviewHeadcount = Math.max(1, Math.floor(Number(contractorHeadcount) || 1))

  const contractorTotalHours = useMemo(() => {
    if (contractorPerHours == null) return null
    return Math.round(contractorPerHours * contractorPreviewHeadcount * 10) / 10
  }, [contractorPerHours, contractorPreviewHeadcount])

  useEffect(() => {
    setPersonTimes((prev) => {
      const next = {}
      allNamesForSubmit.forEach((name) => {
        next[name] = prev[name] || { arrivalTime: '', departureTime: '' }
      })
      return next
    })
  }, [allNamesForSubmit])

  const setPersonTime = (name, field, value) => {
    setPersonTimes((prev) => ({
      ...prev,
      [name]: { ...(prev[name] || { arrivalTime: '', departureTime: '' }), [field]: value }
    }))
  }

  const applySameArrivalToAll = () => {
    if (!batchApplyArrival) {
      setMessage({ type: 'error', text: '請先選擇要套用的抵達時間' })
      return
    }
    if (allNamesForSubmit.length === 0) {
      setMessage({ type: 'error', text: '請先勾選勞務承攬者' })
      return
    }
    setMessage(null)
    setPersonTimes((prev) => {
      const next = { ...prev }
      allNamesForSubmit.forEach((name) => {
        next[name] = { ...(next[name] || { arrivalTime: '', departureTime: '' }), arrivalTime: batchApplyArrival }
      })
      return next
    })
  }

  const applySameDepartureToAll = () => {
    if (!batchApplyDeparture) {
      setMessage({ type: 'error', text: '請先選擇要套用的離場時間' })
      return
    }
    if (allNamesForSubmit.length === 0) {
      setMessage({ type: 'error', text: '請先勾選勞務承攬者' })
      return
    }
    setMessage(null)
    setPersonTimes((prev) => {
      const next = { ...prev }
      allNamesForSubmit.forEach((name) => {
        next[name] = { ...(next[name] || { arrivalTime: '', departureTime: '' }), departureTime: batchApplyDeparture }
      })
      return next
    })
  }

  const selectAllNames = () => {
    setSelectedNames(participantNames.filter((n) => !isResignedPersonName(n, resignedSnapshot)))
  }

  const clearSelectedNames = () => {
    setSelectedNames([])
  }

  const addContractorToQueue = () => {
    const name = contractorName.trim()
    const headcount = Math.max(1, Math.floor(Number(contractorHeadcount) || 1))
    if (!name) {
      setMessage({ type: 'error', text: '請輸入包商名稱' })
      return
    }
    if (!contractorArrival || !contractorDeparture) {
      setMessage({ type: 'error', text: '請填寫包商抵達與離場時間' })
      return
    }
    setMessage(null)
    setContractorQueue((q) => [
      ...q,
      {
        id: `cq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        headcount,
        arrivalTime: contractorArrival,
        departureTime: contractorDeparture
      }
    ])
    setContractorName('')
    setContractorHeadcount(1)
    setContractorArrival('')
    setContractorDeparture('')
  }

  const removeContractorFromQueue = (id) => {
    setContractorQueue((q) => q.filter((x) => x.id !== id))
  }

  const toggleName = (name) => {
    setSelectedNames((prev) => {
      const t = String(name || '').trim()
      if (!t) return prev
      return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setMessage(null)
    const siteName = resolvedSite
    if (!siteName) {
      setMessage({ type: 'error', text: '請選擇或輸入案場' })
      return
    }
    const contractorEntries = contractorQueue.map((c) => ({
      date,
      siteName,
      personName: formatContractorPersonName(c.name, c.headcount),
      headcount: c.headcount,
      arrivalTime: c.arrivalTime,
      departureTime: c.departureTime,
      submittedBy: currentUser,
      submittedByName: getDisplayNameForAccount(currentUser) || currentUser
    }))

    const draftContractorName = contractorName.trim()
    if (draftContractorName && contractorArrival && contractorDeparture) {
      const hc = Math.max(1, Math.floor(Number(contractorHeadcount) || 1))
      contractorEntries.push({
        date,
        siteName,
        personName: formatContractorPersonName(draftContractorName, hc),
        headcount: hc,
        arrivalTime: contractorArrival,
        departureTime: contractorDeparture,
        submittedBy: currentUser,
        submittedByName: getDisplayNameForAccount(currentUser) || currentUser
      })
    }

    if (contractorEntries.length === 0 && allNamesForSubmit.length === 0) {
      setMessage({ type: 'error', text: '請新增包商或勾選至少一位勞務承攬者(個人)' })
      return
    }
    if (allNamesForSubmit.some((n) => isResignedPersonName(n, resignedSnapshot))) {
      setMessage({ type: 'error', text: '不可填寫離職人員' })
      return
    }
    const missingTime = allNamesForSubmit.filter((personName) => {
      const t = personTimes[personName]
      return !t?.arrivalTime || !t?.departureTime
    })
    if (missingTime.length > 0) {
      setMessage({
        type: 'error',
        text: `請為以下人員填寫抵達與離場時間：${missingTime.join('、')}`
      })
      return
    }
    const submittedByName = getDisplayNameForAccount(currentUser) || currentUser
    const personEntries = allNamesForSubmit.map((personName) => {
      const t = personTimes[personName] || {}
      return {
        date,
        siteName,
        personName,
        arrivalTime: t.arrivalTime,
        departureTime: t.departureTime,
        submittedBy: currentUser,
        submittedByName
      }
    })
    const entries = [...contractorEntries, ...personEntries]
    const result = addWorkReports(entries)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '送出失敗' })
      return
    }
    setMessage({ type: 'success', text: `已送出 ${entries.length} 筆出工回報` })
    setSelectedNames([])
    setPersonTimes({})
    setContractorName('')
    setContractorHeadcount(1)
    setContractorArrival('')
    setContractorDeparture('')
    setContractorQueue([])
    const d = new Date(`${date}T00:00:00`)
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
    setMonthRecords(getWorkReportsForMonth(filterYear, filterMonth))
  }

  const recordsByDate = useMemo(() => groupWorkReportsByDate(monthRecords), [monthRecords])

  const sortedDateKeys = useMemo(
    () => [...recordsByDate.keys()].sort((a, b) => b.localeCompare(a)),
    [recordsByDate]
  )

  const dailyPersonStats = useMemo(() => {
    const map = new Map()
    monthRecords.forEach((row) => {
      const dateKey = String(row?.date || '').slice(0, 10)
      const person = String(row?.personName || '').trim()
      if (!dateKey || !person) return
      const hrs = getWorkReportRowTotalHours(row)
      const key = `${dateKey}\0${person}`
      const prev = map.get(key) || { date: dateKey, personName: person, hours: 0, sites: new Set() }
      if (hrs != null) prev.hours += hrs
      const site = String(row?.siteName || '').trim()
      if (site) prev.sites.add(site)
      map.set(key, prev)
    })
    return [...map.values()]
      .map((x) => ({
        date: x.date,
        personName: x.personName,
        hours: Math.round(x.hours * 10) / 10,
        sites: [...x.sites].join('、')
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.personName.localeCompare(b.personName, 'zh-Hant'))
  }, [monthRecords])

  const personMonthTotals = useMemo(() => {
    const map = new Map()
    dailyPersonStats.forEach((row) => {
      map.set(row.personName, (map.get(row.personName) || 0) + row.hours)
    })
    return [...map.entries()]
      .map(([personName, hours]) => ({
        personName,
        hours: Math.round(hours * 10) / 10
      }))
      .sort((a, b) => b.hours - a.hours || a.personName.localeCompare(b.personName, 'zh-Hant'))
  }, [dailyPersonStats])

  return (
    <div className="max-w-5xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">出工回報表單</h1>
        <p className="text-gray-400 text-sm mt-1">
          包商：輸入名稱與人數、選時間，系統自動加總（例：2 人各 1 天 4 小時＝2 天 8 小時）。勞務承攬者(個人)可複選並個別填時間。8 小時＝1 天，超過 8 小時紅字；非下午抵達扣 1 小時午休。
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

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 sm:p-6 space-y-5 mb-8"
      >
        <div>
          <label className="block text-blue-300 text-sm mb-1">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            required
          />
        </div>

        <div>
          <label className="block text-blue-300 text-sm mb-2">案場</label>
          <div className="flex flex-wrap gap-3 mb-2">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="siteMode"
                checked={siteMode === 'select'}
                onChange={() => setSiteMode('select')}
                className="accent-yellow-500"
              />
              從選單選擇
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="siteMode"
                checked={siteMode === 'manual'}
                onChange={() => setSiteMode('manual')}
                className="accent-yellow-500"
              />
              手動輸入
            </label>
          </div>
          {siteMode === 'select' ? (
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
          ) : (
            <input
              type="text"
              value={siteManual}
              onChange={(e) => setSiteManual(e.target.value)}
              placeholder="輸入案場名稱"
              list="work-report-site-list"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          )}
          <datalist id="work-report-site-list">
            {siteOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="block text-blue-300 text-sm">勞務承攬者(個人)</label>
            {participantNames.length > 0 && (
              <div className="flex gap-2">
                <button type="button" onClick={selectAllNames} className="text-xs text-cyan-400 hover:text-cyan-300">
                  全選
                </button>
                <button type="button" onClick={clearSelectedNames} className="text-xs text-gray-400 hover:text-gray-300">
                  清除
                </button>
              </div>
            )}
          </div>
          {participantNames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
              {participantNames.map((name) => (
                <label
                  key={name}
                  className={`flex items-center gap-2 rounded border px-2.5 py-2 text-sm cursor-pointer transition-colors ${
                    selectedNames.includes(name)
                      ? 'border-yellow-500/60 bg-yellow-950/25 text-yellow-100'
                      : 'border-gray-600 bg-gray-900/40 text-gray-200 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedNames.includes(name)}
                    onChange={() => toggleName(name)}
                    className="accent-yellow-500 shrink-0"
                  />
                  <span className="truncate">{name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-xs mb-2">尚無人員選單。</p>
          )}
          {allNamesForSubmit.length > 0 && (
            <p className="text-gray-500 text-xs mt-2">
              已選 {allNamesForSubmit.length} 位勞務承攬者
            </p>
          )}
        </div>

        {allNamesForSubmit.length > 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-blue-300 text-sm mb-1">各人抵達／離場時間</label>
            </div>

            <div className="rounded-lg border border-gray-600/80 bg-gray-900/40 p-3 space-y-3">
              <p className="text-gray-500 text-xs">批次套用（選填）</p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-gray-400 text-xs shrink-0">相同抵達</span>
                  <TimeInput24 compact value={batchApplyArrival} onChange={setBatchApplyArrival} />
                  <button
                    type="button"
                    onClick={applySameArrivalToAll}
                    disabled={!batchApplyArrival || allNamesForSubmit.length === 0}
                    className="text-xs px-2.5 py-1.5 rounded border border-cyan-600/50 text-cyan-300 hover:bg-cyan-950/30 disabled:opacity-40"
                  >
                    套用到全部抵達
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-gray-400 text-xs shrink-0">相同離場</span>
                  <TimeInput24 compact value={batchApplyDeparture} onChange={setBatchApplyDeparture} />
                  <button
                    type="button"
                    onClick={applySameDepartureToAll}
                    disabled={!batchApplyDeparture || allNamesForSubmit.length === 0}
                    className="text-xs px-2.5 py-1.5 rounded border border-cyan-600/50 text-cyan-300 hover:bg-cyan-950/30 disabled:opacity-40"
                  >
                    套用到全部離場
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-600">
              <table className="w-full text-sm border-collapse min-w-[520px]">
                <thead>
                  <tr className="border-b border-gray-600 bg-gray-900/60 text-left text-gray-400">
                    <th className="py-2 px-2 font-medium">姓名</th>
                    <th className="py-2 px-2 font-medium">抵達</th>
                    <th className="py-2 px-2 font-medium">離場</th>
                    <th className="py-2 px-2 font-medium text-right">工時</th>
                  </tr>
                </thead>
                <tbody>
              {allNamesForSubmit.map((name) => {
                const t = personTimes[name] || { arrivalTime: '', departureTime: '' }
                const hrs = calcWorkReportHours(t.arrivalTime, t.departureTime)
                return (
                  <tr key={name} className="border-b border-gray-700/50">
                    <td className="py-2 px-2 text-yellow-100 whitespace-nowrap">{name}</td>
                    <td className="py-2 px-2">
                      <TimeInput24
                        compact
                        value={t.arrivalTime}
                        onChange={(v) => setPersonTime(name, 'arrivalTime', v)}
                        required
                      />
                    </td>
                    <td className="py-2 px-2">
                      <TimeInput24
                        compact
                        value={t.departureTime}
                        onChange={(v) => setPersonTime(name, 'departureTime', v)}
                        required
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <WorkReportHoursDetail
                        arrivalTime={t.arrivalTime}
                        departureTime={t.departureTime}
                      />
                    </td>
                  </tr>
                )
              })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-teal-700/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setContractorOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-teal-950/30 transition-colors"
          >
            <span className="text-teal-300 text-sm font-medium">包商出工</span>
            <span className="text-gray-500 text-xs shrink-0">{contractorOpen ? '收合 ▲' : '展開填寫 ▼'}</span>
          </button>
          {contractorOpen && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-teal-700/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">包商名稱</label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder=""
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              />
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
          {contractorPerHours != null && (
            <div className="text-sm text-gray-300 flex flex-wrap items-end justify-between gap-2">
              <span className="text-gray-400">
                × <span className="text-cyan-300">{contractorPreviewHeadcount}</span> 人
              </span>
              <WorkReportHoursDetail
                arrivalTime={contractorArrival}
                departureTime={contractorDeparture}
                headcount={contractorPreviewHeadcount}
              />
            </div>
          )}
          <button
            type="button"
            onClick={addContractorToQueue}
            className="text-sm px-4 py-2 rounded-lg border border-teal-600/50 text-teal-200 hover:bg-teal-950/40"
          >
            加入包商清單
          </button>
          {contractorQueue.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-600">
              <table className="w-full text-sm border-collapse min-w-[480px]">
                <thead>
                  <tr className="border-b border-gray-600 bg-gray-900/60 text-left text-gray-400">
                    <th className="py-2 px-2 font-medium">包商</th>
                    <th className="py-2 px-2 font-medium text-center">人數</th>
                    <th className="py-2 px-2 font-medium">抵達</th>
                    <th className="py-2 px-2 font-medium">離場</th>
                    <th className="py-2 px-2 font-medium text-right">工時</th>
                    <th className="py-2 px-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {contractorQueue.map((c) => (
                      <tr key={c.id} className="border-b border-gray-700/50">
                        <td className="py-2 px-2 text-teal-100">{c.name}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{c.headcount}</td>
                        <td className="py-2 px-2 text-cyan-200 tabular-nums">{c.arrivalTime}</td>
                        <td className="py-2 px-2 text-cyan-200 tabular-nums">{c.departureTime}</td>
                        <td className="py-2 px-2 text-right">
                          <WorkReportHoursDetail
                            arrivalTime={c.arrivalTime}
                            departureTime={c.departureTime}
                            headcount={c.headcount}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            onClick={() => removeContractorFromQueue(c.id)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            刪
                          </button>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-semibold transition-colors"
        >
          送出回報
        </button>
      </form>

      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-yellow-400">當月回報統計</h2>
            <p className="text-gray-500 text-xs mt-1">
              整月檢視，不需逐日搜尋；依日期加總各人出工時數。
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
              {personMonthTotals.map(({ personName, hours }) => (
                <span
                  key={personName}
                  className="rounded border border-cyan-700/50 bg-gray-900/50 px-2 py-1 text-gray-200"
                >
                  {personName}{' '}
                  <WorkReportDuration hours={hours} className="text-cyan-300 font-semibold" />
                </span>
              ))}
            </div>
          </div>
        )}

        {dailyPersonStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-600 text-left text-gray-400">
                  <th className="py-2 pr-3 font-medium">日期</th>
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">案場</th>
                  <th className="py-2 pr-3 font-medium text-right">當日工時</th>
                </tr>
              </thead>
              <tbody>
                {dailyPersonStats.map((row) => (
                  <tr key={`${row.date}-${row.personName}`} className="border-b border-gray-700/60">
                    <td className="py-2 pr-3 text-gray-300 tabular-nums">{row.date}</td>
                    <td className="py-2 pr-3 text-white">{row.personName}</td>
                    <td className="py-2 pr-3 text-gray-400 text-xs">{row.sites || '—'}</td>
                    <td className="py-2 pr-3 text-right">
                      <WorkReportDuration hours={row.hours} className="text-cyan-300 font-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">此月份尚無出工回報。</p>
        )}

        <div className="border-t border-gray-700 pt-4">
          <h3 className="text-base font-semibold text-yellow-400/90 mb-3">當月明細</h3>
          {sortedDateKeys.length === 0 ? (
            <p className="text-gray-500 text-sm">尚無紀錄。</p>
          ) : (
            <div className="space-y-6">
              {sortedDateKeys.map((dateKey) => {
                const dayRows = recordsByDate.get(dateKey) || []
                return (
                  <div key={dateKey}>
                    <h4 className="text-sm font-medium text-gray-200 mb-2 tabular-nums">{dateKey}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[560px]">
                        <thead>
                          <tr className="border-b border-gray-600 text-left text-gray-400">
                            <th className="py-2 pr-3 font-medium">案場</th>
                            <th className="py-2 pr-3 font-medium">姓名</th>
                            <th className="py-2 pr-3 font-medium">抵達</th>
                            <th className="py-2 pr-3 font-medium">離場</th>
                            <th className="py-2 pr-3 font-medium text-right">工時</th>
                            <th className="py-2 pr-3 font-medium">填寫人</th>
                            <th className="py-2 font-medium w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {dayRows.map((row) => {
                            const hc = parseWorkReportHeadcount(row.personName, row.headcount)
                            const canDelete =
                              userRole === 'admin' ||
                              String(row.submittedBy || '') === String(currentUser || '')
                            return (
                              <tr key={row.id} className="border-b border-gray-700/60">
                                <td className="py-2.5 pr-3 text-gray-200">{row.siteName}</td>
                                <td className="py-2.5 pr-3 text-white">{row.personName}</td>
                                <td className="py-2.5 pr-3 text-cyan-200 tabular-nums">{row.arrivalTime}</td>
                                <td className="py-2.5 pr-3 text-cyan-200 tabular-nums">{row.departureTime}</td>
                                <td className="py-2.5 pr-3 text-right font-medium">
                                  <WorkReportHoursDetail
                                    arrivalTime={row.arrivalTime}
                                    departureTime={row.departureTime}
                                    headcount={hc}
                                  />
                                </td>
                                <td className="py-2.5 pr-3 text-gray-400 text-xs">
                                  {row.submittedByName || row.submittedBy || '—'}
                                </td>
                                <td className="py-2.5">
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(row)}
                                      className="text-red-400 hover:text-red-300 text-xs"
                                    >
                                      刪除
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WorkReport
