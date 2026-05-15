import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDropdownOptionsByCategory, findBoundAccountForDisplayName, getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { getProjects } from '../utils/projectStorage'
import { getWorkReports, addWorkReports, deleteWorkReport } from '../utils/workReportStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles } from '../utils/authSupabase'
import { getSupabaseClient } from '../utils/supabaseClient'
import { useRealtimeKeys } from '../contexts/SyncContext'

const pad2 = (n) => String(n).padStart(2, '0')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** @returns {{ accounts: string[], names: string[] }} */
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

/** 離職者帳號／顯示名（RPC：須在 Supabase 執行 docs/supabase-get-resigned-identifiers.sql） */
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

/**
 * 合併 Supabase 離職名單。
 * 注意：get_public_profiles() 在資料庫端已排除離職者，無法用來判斷離職；
 * 管理員改走 get_all_profiles()；一般用戶走 get_resigned_profile_identifiers()（須執行 docs 內 SQL）。
 */
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
  const [manualName, setManualName] = useState('')
  const [arrivalTime, setArrivalTime] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [message, setMessage] = useState(null)

  const [filterDate, setFilterDate] = useState(todayStr)
  const [records, setRecords] = useState([])
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
    setRecords(getWorkReports({ date: filterDate }))
  }, [filterDate])

  useRealtimeKeys(
    ['jiameng_work_reports', 'jiameng_dropdown_options', 'jiameng_projects', 'jiameng_users'],
    refetch
  )

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    const onFocus = () => {
      refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const resolvedSite = siteMode === 'manual' ? siteManual.trim() : siteSelect.trim()

  const allNamesForSubmit = useMemo(() => {
    const set = new Set(selectedNames.map((n) => String(n || '').trim()).filter(Boolean))
    const manual = manualName.trim()
    if (manual) set.add(manual)
    return [...set]
  }, [selectedNames, manualName])

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
    if (allNamesForSubmit.length === 0) {
      setMessage({ type: 'error', text: '請勾選或手動輸入至少一位姓名' })
      return
    }
    if (allNamesForSubmit.some((n) => isResignedPersonName(n, resignedSnapshot))) {
      setMessage({ type: 'error', text: '不可填寫離職人員' })
      return
    }
    if (!arrivalTime || !departureTime) {
      setMessage({ type: 'error', text: '請填寫抵達時間與離場時間' })
      return
    }
    const submittedByName = getDisplayNameForAccount(currentUser) || currentUser
    const entries = allNamesForSubmit.map((personName) => ({
      date,
      siteName,
      personName,
      arrivalTime,
      departureTime,
      submittedBy: currentUser,
      submittedByName
    }))
    const result = addWorkReports(entries)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '送出失敗' })
      return
    }
    setMessage({ type: 'success', text: `已送出 ${entries.length} 筆出工回報` })
    setSelectedNames([])
    setManualName('')
    setArrivalTime('')
    setDepartureTime('')
    setFilterDate(date)
    setRecords(getWorkReports({ date }))
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
    setRecords(getWorkReports({ date: filterDate }))
  }

  return (
    <div className="max-w-3xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">出工回報表單</h1>
        <p className="text-gray-400 text-sm mt-1">
          填寫案場、姓名與抵達／離場時間。可從選單勾選，也可手動輸入。此表單獨立於行事曆，不會修改排程資料。
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
          <label className="block text-blue-300 text-sm mb-2">姓名（可複選）</label>
          {participantNames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
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
            <p className="text-gray-500 text-xs mb-2">尚無人員選單，請於下方手動輸入姓名。</p>
          )}
          <label className="block text-gray-400 text-xs mb-1">或手動輸入姓名</label>
          <input
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="輸入姓名（可與勾選併用）"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          />
          {allNamesForSubmit.length > 0 && (
            <p className="text-gray-500 text-xs mt-2">
              將送出：{allNamesForSubmit.join('、')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-blue-300 text-sm mb-1">抵達時間</label>
            <input
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              required
            />
          </div>
          <div>
            <label className="block text-blue-300 text-sm mb-1">離場時間</label>
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-semibold transition-colors"
        >
          送出回報
        </button>
      </form>

      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-yellow-400">已送出紀錄</h2>
          <div>
            <label className="block text-gray-400 text-xs mb-1">篩選日期</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {records.length === 0 ? (
          <p className="text-gray-500 text-sm">此日期尚無出工回報。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-600 text-left text-gray-400">
                  <th className="py-2 pr-3 font-medium">案場</th>
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">抵達</th>
                  <th className="py-2 pr-3 font-medium">離場</th>
                  <th className="py-2 pr-3 font-medium">填寫人</th>
                  <th className="py-2 font-medium w-16" />
                </tr>
              </thead>
              <tbody>
                {records.map((row) => {
                  const canDelete =
                    userRole === 'admin' || String(row.submittedBy || '') === String(currentUser || '')
                  return (
                    <tr key={row.id} className="border-b border-gray-700/60">
                      <td className="py-2.5 pr-3 text-gray-200">{row.siteName}</td>
                      <td className="py-2.5 pr-3 text-white">{row.personName}</td>
                      <td className="py-2.5 pr-3 text-cyan-200 tabular-nums">{row.arrivalTime}</td>
                      <td className="py-2.5 pr-3 text-cyan-200 tabular-nums">{row.departureTime}</td>
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
        )}
      </div>
    </div>
  )
}

export default WorkReport
