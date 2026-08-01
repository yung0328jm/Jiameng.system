import { useState, useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getCurrentUserRole } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m, maskPhoneForRecording as mPhone, maskCodeForRecording as mCode } from '../utils/recordingModeMask'
import {
  getContractorRegistrations,
  addContractorRegistration,
  updateContractorRegistration,
  deleteContractorRegistration,
  addContractorPersonnel,
  updateContractorPersonnel,
  deleteContractorPersonnel,
  CONTRACTOR_REGISTRATION_KEY
} from '../utils/contractorRegistrationStorage'
import {
  getContractorAttendanceByMonth,
  deleteContractorWorkLog,
  updateContractorWorkLog,
  requestContractorOvertime,
  reviewContractorOvertime,
  aggregateContractorWorkLogsSummary,
  CONTRACTOR_OVERTIME_HOUR_OPTIONS,
  CONTRACTOR_WORK_LOG_KEY
} from '../utils/contractorWorkCheckInStorage'
import { ContractorWorkHoursDetail, ContractorWorkHoursSummaryLine } from '../components/ContractorWorkHoursDetail'
import TimeInput24 from '../components/TimeInput24'
import { formatWorkReportHours, isWorkReportTimeFilled } from '../utils/workReportStorage'

const EMPTY_FORM = {
  name: '',
  checkInCode: '',
  attendanceMode: 'named',
  contactPerson: '',
  phone: '',
  taxId: '',
  address: '',
  notes: ''
}

const EMPTY_PERSON_FORM = {
  name: '',
  employeeNo: '',
  phone: '',
  notes: '',
  active: true
}

function ContractorRegistration() {
  useRecordingMode()
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [personnelCompany, setPersonnelCompany] = useState(null)
  const [personForm, setPersonForm] = useState(EMPTY_PERSON_FORM)
  const [editingPersonId, setEditingPersonId] = useState(null)
  const [attendanceCompany, setAttendanceCompany] = useState(null)
  const [attendanceMonth, setAttendanceMonth] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() + 1 }
  })
  const [workLogRevision, setWorkLogRevision] = useState(0)
  const [editingWorkLogId, setEditingWorkLogId] = useState(null)
  const [editWorkLogArrival, setEditWorkLogArrival] = useState('')
  const [editWorkLogDeparture, setEditWorkLogDeparture] = useState('')
  const [applyingOvertimeId, setApplyingOvertimeId] = useState(null)
  const [applyOvertimeHours, setApplyOvertimeHours] = useState('')

  const loadList = () => setList(getContractorRegistrations())

  useRealtimeKeys([CONTRACTOR_REGISTRATION_KEY], loadList)
  useRealtimeKeys([CONTRACTOR_WORK_LOG_KEY], () => setWorkLogRevision((r) => r + 1))

  useEffect(() => {
    setUserRole(getCurrentUserRole())
    loadList()
  }, [])

  useEffect(() => {
    if (!personnelCompany?.id) return
    const fresh = getContractorRegistrations().find((r) => r.id === personnelCompany.id)
    if (fresh) setPersonnelCompany(fresh)
  }, [list, personnelCompany?.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...list].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
    if (!q) return sorted
    return sorted.filter((r) => {
      const personNames = (r.personnel || []).map((p) => p?.name).join(' ')
      const hay = [r.name, r.checkInCode, r.contactPerson, r.phone, r.taxId, r.address, r.notes, personNames]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [list, search])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMessage(null)
  }

  const openEdit = (rec) => {
    setEditingId(rec.id)
    setForm({
      name: rec.name || '',
      checkInCode: rec.checkInCode || '',
      attendanceMode: rec.attendanceMode === 'headcount' ? 'headcount' : 'named',
      contactPerson: rec.contactPerson || '',
      phone: rec.phone || '',
      taxId: rec.taxId || '',
      address: rec.address || '',
      notes: rec.notes || ''
    })
    setShowForm(true)
    setMessage(null)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const openPersonnel = (rec) => {
    setPersonnelCompany(rec)
    setEditingPersonId(null)
    setPersonForm(EMPTY_PERSON_FORM)
    setMessage(null)
  }

  const closePersonnel = () => {
    setPersonnelCompany(null)
    setEditingPersonId(null)
    setPersonForm(EMPTY_PERSON_FORM)
  }

  const openAttendance = (rec) => {
    const n = new Date()
    setAttendanceCompany(rec)
    setAttendanceMonth({ year: n.getFullYear(), month: n.getMonth() + 1 })
    setMessage(null)
  }

  const closeAttendance = () => {
    setAttendanceCompany(null)
    setEditingWorkLogId(null)
    setEditWorkLogArrival('')
    setEditWorkLogDeparture('')
  }

  const shiftAttendanceMonth = (delta) => {
    setAttendanceMonth((prev) => {
      let y = prev.year
      let m = prev.month + delta
      while (m < 1) { m += 12; y -= 1 }
      while (m > 12) { m -= 12; y += 1 }
      return { year: y, month: m }
    })
  }

  const attendanceDays = useMemo(() => {
    void workLogRevision
    if (!attendanceCompany?.id) return []
    return getContractorAttendanceByMonth(attendanceCompany.id, attendanceMonth.year, attendanceMonth.month)
  }, [attendanceCompany?.id, attendanceMonth.year, attendanceMonth.month, workLogRevision])

  const attendanceMonthStats = useMemo(() => {
    let fullDayCount = 0
    let overtimeHours = 0
    let lateCount = 0
    let pendingOvertimeCount = 0
    attendanceDays.forEach((day) => {
      day.sites.forEach((site) => {
        const s = aggregateContractorWorkLogsSummary(site.rows)
        fullDayCount += s.fullDayHeadcount || 0
        overtimeHours += s.totalOvertimeHours || 0
        lateCount += s.lateHeadcount || 0
        site.rows.forEach((row) => {
          if (String(row?.overtimeStatus || '').trim() === 'pending') pendingOvertimeCount += 1
        })
      })
    })
    return {
      fullDayCount: Math.round(fullDayCount * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      lateCount,
      pendingOvertimeCount
    }
  }, [attendanceDays])

  /** 本月各案場個別合計 */
  const attendanceSiteMonthStats = useMemo(() => {
    const bySite = new Map()
    attendanceDays.forEach((day) => {
      day.sites.forEach((site) => {
        const name = String(site.siteName || '').trim() || '—'
        if (!bySite.has(name)) {
          bySite.set(name, { siteName: name, rows: [] })
        }
        bySite.get(name).rows.push(...(site.rows || []))
      })
    })
    return [...bySite.values()]
      .map((entry) => {
        const s = aggregateContractorWorkLogsSummary(entry.rows)
        let pendingOvertimeCount = 0
        entry.rows.forEach((row) => {
          if (String(row?.overtimeStatus || '').trim() === 'pending') pendingOvertimeCount += 1
        })
        return {
          siteName: entry.siteName,
          fullDayCount: Math.round((s.fullDayHeadcount || 0) * 10) / 10,
          overtimeHours: Math.round((s.totalOvertimeHours || 0) * 10) / 10,
          lateCount: s.lateHeadcount || 0,
          headcount: s.totalHeadcount || 0,
          pendingOvertimeCount
        }
      })
      .sort((a, b) => a.siteName.localeCompare(b.siteName, 'zh-Hant'))
  }, [attendanceDays])

  const startEditPerson = (person) => {
    setEditingPersonId(person.id)
    setPersonForm({
      name: person.name || '',
      employeeNo: person.employeeNo || '',
      phone: person.phone || '',
      notes: person.notes || '',
      active: person.active !== false
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setMessage(null)
    const payload = { ...form }
    const res = editingId
      ? updateContractorRegistration(editingId, payload)
      : addContractorRegistration(payload)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '儲存失敗' })
      return
    }
    loadList()
    setMessage({ type: 'success', text: editingId ? '已更新承攬商資料。' : '已新增承攬商資料。' })
    closeForm()
  }

  const handleDelete = (rec) => {
    if (!window.confirm(`確定要刪除承攬商「${rec.name || ''}」嗎？（含所有人員名單）`)) return
    const res = deleteContractorRegistration(rec.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (editingId === rec.id) closeForm()
    if (personnelCompany?.id === rec.id) closePersonnel()
    if (attendanceCompany?.id === rec.id) closeAttendance()
    loadList()
    setMessage({ type: 'success', text: '已刪除承攬商資料。' })
  }

  const handlePersonSubmit = (e) => {
    e.preventDefault()
    if (!personnelCompany?.id) return
    setMessage(null)
    const res = editingPersonId
      ? updateContractorPersonnel(personnelCompany.id, editingPersonId, personForm)
      : addContractorPersonnel(personnelCompany.id, personForm)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '儲存失敗' })
      return
    }
    loadList()
    setEditingPersonId(null)
    setPersonForm(EMPTY_PERSON_FORM)
    setMessage({ type: 'success', text: editingPersonId ? '已更新人員資料。' : '已新增人員。' })
  }

  const handleDeletePerson = (person) => {
    if (!personnelCompany?.id) return
    if (!window.confirm(`確定要刪除人員「${person.name || ''}」嗎？`)) return
    const res = deleteContractorPersonnel(personnelCompany.id, person.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (editingPersonId === person.id) {
      setEditingPersonId(null)
      setPersonForm(EMPTY_PERSON_FORM)
    }
    loadList()
    setMessage({ type: 'success', text: '已刪除人員。' })
  }

  const cancelEditWorkLog = () => {
    setEditingWorkLogId(null)
    setEditWorkLogArrival('')
    setEditWorkLogDeparture('')
  }

  const cancelApplyOvertime = () => {
    setApplyingOvertimeId(null)
    setApplyOvertimeHours('')
  }

  const startEditWorkLog = (row) => {
    cancelApplyOvertime()
    setEditingWorkLogId(row.id)
    setEditWorkLogArrival(row.arrivalTime || '')
    setEditWorkLogDeparture(row.departureTime || '')
  }

  const startApplyOvertime = (row) => {
    cancelEditWorkLog()
    setApplyingOvertimeId(row.id)
    setApplyOvertimeHours('')
  }

  const handleSaveWorkLogTimes = (id) => {
    if (!isWorkReportTimeFilled(editWorkLogArrival) && !isWorkReportTimeFilled(editWorkLogDeparture)) {
      setMessage({ type: 'error', text: '請至少填寫進廠或離廠時間' })
      return
    }
    const res = updateContractorWorkLog(id, {
      arrivalTime: editWorkLogArrival,
      departureTime: editWorkLogDeparture
    })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '更新失敗' })
      return
    }
    cancelEditWorkLog()
    setWorkLogRevision((r) => r + 1)
    setMessage({ type: 'success', text: '已更新進離廠時間。' })
  }

  const handleSubmitOvertimeRequest = (row) => {
    const hrs = Number(applyOvertimeHours)
    if (!Number.isFinite(hrs) || hrs <= 0) {
      setMessage({ type: 'error', text: '請選擇申請加班時數' })
      return
    }
    const res = requestContractorOvertime(row.id, hrs)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '申請失敗' })
      return
    }
    const hc = Math.max(1, Math.floor(Number(row?.headcount) || 1))
    const total = Math.round(hrs * hc * 10) / 10
    cancelApplyOvertime()
    setWorkLogRevision((r) => r + 1)
    setMessage({
      type: 'success',
      text:
        hc > 1
          ? `已送出加班申請：每人 ${formatWorkReportHours(hrs)} 小時，合計 ${formatWorkReportHours(total)} 小時（${hc}人），待核准。`
          : `已送出加班申請 ${formatWorkReportHours(hrs)} 小時，待核准。`
    })
  }

  const handleDeleteWorkLog = (row) => {
    if (!window.confirm(`確定要刪除「${row.personName}」${row.date ? `（${String(row.date).replace(/-/g, '/')}）` : ''}的出工紀錄嗎？`)) return
    const res = deleteContractorWorkLog(row.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (editingWorkLogId === row.id) cancelEditWorkLog()
    if (applyingOvertimeId === row.id) cancelApplyOvertime()
    setWorkLogRevision((r) => r + 1)
    setMessage({ type: 'success', text: '已刪除出工紀錄。' })
  }

  const handleApproveOvertime = (row) => {
    const hrs = Number(row?.overtimeRequestHours) || 0
    const hc = Math.max(1, Math.floor(Number(row?.headcount) || 1))
    const total = Math.round(hrs * hc * 10) / 10
    const label =
      hc > 1
        ? `每人 ${formatWorkReportHours(hrs)} 小時、合計 ${formatWorkReportHours(total)} 小時（${hc}人）`
        : `${formatWorkReportHours(hrs)} 小時`
    if (!window.confirm(`核准「${row.personName}」加班申請 ${label}？`)) return
    const res = reviewContractorOvertime(row.id, { action: 'approve', approvedHours: hrs })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '核准失敗' })
      return
    }
    setWorkLogRevision((r) => r + 1)
    setMessage({ type: 'success', text: `已核准加班 ${label}。` })
  }

  const handleRejectOvertime = (row) => {
    const hrs = Number(row?.overtimeRequestHours) || 0
    const hc = Math.max(1, Math.floor(Number(row?.headcount) || 1))
    const total = Math.round(hrs * hc * 10) / 10
    const label =
      hc > 1
        ? `每人 ${formatWorkReportHours(hrs)} 小時、合計 ${formatWorkReportHours(total)} 小時（${hc}人）`
        : `${formatWorkReportHours(hrs)} 小時`
    if (!window.confirm(`駁回「${row.personName}」加班申請 ${label}？`)) return
    const res = reviewContractorOvertime(row.id, { action: 'reject' })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '駁回失敗' })
      return
    }
    setWorkLogRevision((r) => r + 1)
    setMessage({ type: 'success', text: '已駁回加班申請。' })
  }

  if (userRole !== 'admin') {
    return <Navigate to="/home" replace />
  }

  const activePersonnelCount = (rec) => (rec.personnel || []).filter((p) => p?.active !== false).length

  return (
    <div className="max-w-4xl mx-auto w-full text-white px-1 sm:px-0">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">承攬商資料登記</h2>
          <p className="text-gray-400 text-sm mt-1">
            管理承攬商基本資料與旗下人員名單，供承攬包簽到系統使用；公司名稱會同步至入廠申請選單。
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 min-h-[44px] px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm"
        >
          新增承攬商
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-600'
              : 'bg-red-900/50 text-red-300 border border-red-600'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋承攬商、聯絡人、人員姓名…"
          className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-yellow-400"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">尚無承攬商資料，請按「新增承攬商」建立。</p>
        ) : (
          filtered.map((rec) => (
            <div key={rec.id} className="bg-gray-800 border border-gray-600 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="text-lg font-semibold text-yellow-300">{m(rec.name)}</div>
                  {rec.checkInCode && (
                    <div className="text-violet-300/90 text-sm">出工登記代碼：{mCode(rec.checkInCode)}</div>
                  )}
                  <div className="text-amber-200/90 text-sm">
                    出工登記方式：{rec.attendanceMode === 'headcount' ? '人數登記' : '實名登記'}
                  </div>
                  {rec.contactPerson && <div className="text-gray-300">聯絡人：{m(rec.contactPerson)}</div>}
                  {rec.phone && <div className="text-gray-300">電話：{mPhone(rec.phone)}</div>}
                  {rec.taxId && <div className="text-gray-300">統一編號：{mPhone(rec.taxId)}</div>}
                  {rec.address && <div className="text-gray-300">地址：{m(rec.address)}</div>}
                  {rec.notes && <div className="text-gray-500">備註：{rec.notes}</div>}
                  <div className="text-teal-300/90 text-xs pt-1">
                    人員名單：{activePersonnelCount(rec)} 人
                    {(rec.personnel || []).length > activePersonnelCount(rec) && (
                      <span className="text-gray-500">（含停用 {(rec.personnel || []).length - activePersonnelCount(rec)} 人）</span>
                    )}
                  </div>
                  {(rec.personnel || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(rec.personnel || []).slice(0, 8).map((p) => (
                        <span
                          key={p.id}
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            p.active === false
                              ? 'border-gray-600 text-gray-500 bg-gray-900/50'
                              : 'border-teal-700/50 text-teal-100 bg-teal-950/40'
                          }`}
                        >
                          {m(p.name)}
                        </span>
                      ))}
                      {(rec.personnel || []).length > 8 && (
                        <span className="text-[11px] text-gray-500">+{(rec.personnel || []).length - 8}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openAttendance(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm"
                  >
                    出勤紀錄
                  </button>
                  <button
                    type="button"
                    onClick={() => openPersonnel(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm"
                  >
                    人員名單
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-yellow-400 mb-4">
              {editingId ? '編輯承攬商' : '新增承攬商'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">承攬商名稱 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">
                  出工登記代碼 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.checkInCode}
                  onChange={(e) => setForm((f) => ({ ...f, checkInCode: e.target.value }))}
                  placeholder="承攬商出工登記時輸入此代碼"
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">請提供給承攬商，代碼對應此公司名稱（不可與其他承攬商重複）</p>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1.5">出工登記方式 <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, attendanceMode: 'named' }))}
                    className={`min-h-[64px] rounded-lg border px-3 py-2 text-left transition-colors ${
                      form.attendanceMode !== 'headcount'
                        ? 'border-teal-500 bg-teal-950/40 text-teal-200'
                        : 'border-gray-600 bg-gray-900/40 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-semibold">實名登記</span>
                    <span className="block text-xs opacity-80 mt-0.5">逐人進離廠</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, attendanceMode: 'headcount' }))}
                    className={`min-h-[64px] rounded-lg border px-3 py-2 text-left transition-colors ${
                      form.attendanceMode === 'headcount'
                        ? 'border-amber-500 bg-amber-950/40 text-amber-200'
                        : 'border-gray-600 bg-gray-900/40 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <span className="block text-sm font-semibold">人數登記</span>
                    <span className="block text-xs opacity-80 mt-0.5">填人數進離廠</span>
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-1">廠商登記入口將依此設定顯示，廠商無法自行切換。</p>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">聯絡人</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">電話</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">統一編號</label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">備註</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400 resize-y"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm"
                >
                  儲存
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold text-sm"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {personnelCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-teal-600/50 rounded-xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-teal-300">人員名單</h3>
                <p className="text-gray-400 text-sm mt-0.5">{m(personnelCompany.name)}</p>
              </div>
              <button
                type="button"
                onClick={closePersonnel}
                className="text-gray-400 hover:text-white text-sm shrink-0"
              >
                關閉
              </button>
            </div>

            <form onSubmit={handlePersonSubmit} className="mb-4 p-3 rounded-lg bg-gray-900/60 border border-gray-600 space-y-3">
              <p className="text-yellow-400 text-sm font-medium">{editingPersonId ? '編輯人員' : '新增人員'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-xs mb-1">姓名 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={personForm.name}
                    onChange={(e) => setPersonForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white text-sm focus:outline-none focus:border-yellow-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-xs mb-1">編號（簽到用，選填）</label>
                  <input
                    type="text"
                    value={personForm.employeeNo}
                    onChange={(e) => setPersonForm((f) => ({ ...f, employeeNo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-xs mb-1">電話</label>
                  <input
                    type="tel"
                    value={personForm.phone}
                    onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={personForm.active !== false}
                      onChange={(e) => setPersonForm((f) => ({ ...f, active: e.target.checked }))}
                      className="rounded border-gray-500 bg-gray-700 text-yellow-400"
                    />
                    啟用（可簽到）
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-gray-300 text-xs mb-1">備註</label>
                <input
                  type="text"
                  value={personForm.notes}
                  onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm"
                >
                  {editingPersonId ? '儲存變更' : '加入名單'}
                </button>
                {editingPersonId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPersonId(null)
                      setPersonForm(EMPTY_PERSON_FORM)
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
                  >
                    取消編輯
                  </button>
                )}
              </div>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(personnelCompany.personnel || []).length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">尚無人員，請於上方新增。</p>
              ) : (
                [...(personnelCompany.personnel || [])]
                  .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
                  .map((person) => (
                    <div
                      key={person.id}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border ${
                        person.active === false ? 'border-gray-700 bg-gray-900/40' : 'border-gray-600 bg-gray-900/70'
                      }`}
                    >
                      <div className="text-sm min-w-0">
                        <div className={`font-medium ${person.active === false ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {m(person.name)}
                          {person.active === false && <span className="ml-2 text-xs text-gray-500 no-underline">（已停用）</span>}
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5 space-x-2">
                          {person.employeeNo && <span>編號：{person.employeeNo}</span>}
                          {person.phone && <span>電話：{mPhone(person.phone)}</span>}
                          {person.notes && <span>備註：{person.notes}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditPerson(person)}
                          className="px-2.5 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-xs"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePerson(person)}
                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {attendanceCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-violet-600/50 rounded-xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-violet-300">出勤紀錄</h3>
                <p className="text-white font-medium mt-1">{m(attendanceCompany.name)}</p>
                <p className="text-gray-400 text-xs mt-1">同步承攬商出工登記系統之進離廠資料；可編輯進離廠時間</p>
              </div>
              <button
                type="button"
                onClick={closeAttendance}
                className="text-gray-400 hover:text-white shrink-0 self-end sm:self-start p-1"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 mb-3 p-3 rounded-lg bg-gray-900/60 border border-gray-600">
              <button
                type="button"
                onClick={() => shiftAttendanceMonth(-1)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
              >
                上月
              </button>
              <div className="text-center">
                <p className="text-yellow-400 font-semibold tabular-nums">
                  {attendanceMonth.year} 年 {attendanceMonth.month} 月
                </p>
                <p className="text-gray-400 text-xs mt-0.5 tabular-nums">
                  本月合計 <span className="text-amber-200 font-medium">{attendanceMonthStats.fullDayCount}</span> 工
                  <span className="mx-2">緊急入場 <span className="text-red-400 font-medium">{formatWorkReportHours(attendanceMonthStats.overtimeHours)}</span> 小時</span>
                  遲到次數 <span className="text-rose-300 font-medium">{attendanceMonthStats.lateCount}</span> 次
                  {attendanceMonthStats.pendingOvertimeCount > 0 && (
                    <span className="ml-2 text-amber-300">
                      · 待審加班 <span className="font-semibold">{attendanceMonthStats.pendingOvertimeCount}</span> 筆
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => shiftAttendanceMonth(1)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
              >
                下月
              </button>
            </div>

            {attendanceSiteMonthStats.length > 0 && (
              <div className="mb-4 rounded-lg border border-teal-800/50 bg-teal-950/20 overflow-hidden">
                <p className="px-3 py-2 text-teal-300 text-xs font-medium border-b border-teal-800/40 bg-teal-950/30">
                  各案場本月合計
                </p>
                <ul className="divide-y divide-teal-900/40">
                  {attendanceSiteMonthStats.map((site) => (
                    <li
                      key={site.siteName}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
                    >
                      <span className="text-teal-200 text-sm font-medium">{site.siteName}</span>
                      <div className="text-right text-xs tabular-nums text-gray-400 space-y-0.5">
                        <div>
                          出工 <span className="text-amber-200 font-medium">{site.fullDayCount}</span> 工
                          <span className="mx-1.5 text-gray-600">·</span>
                          緊急入場{' '}
                          <span className="text-red-400 font-medium">
                            {formatWorkReportHours(site.overtimeHours)}
                          </span>{' '}
                          小時
                        </div>
                        <div>
                          遲到 <span className="text-rose-300 font-medium">{site.lateCount}</span> 次
                          {site.pendingOvertimeCount > 0 && (
                            <span className="ml-2 text-amber-300">
                              · 待審加班 {site.pendingOvertimeCount} 筆
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {attendanceDays.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">本月尚無進廠紀錄。</p>
            ) : (
              <div className="space-y-4">
                {attendanceDays.map((day) => (
                  <div key={day.date} className="rounded-lg border border-gray-600 bg-gray-900/50 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-900/80 border-b border-gray-700">
                      <span className="text-white font-medium tabular-nums">{day.date.replace(/-/g, '/')}</span>
                      <div className="text-right">
                        <span className="text-violet-300 text-sm">
                          出工 <strong className="text-amber-200">{day.totalHeadcount}</strong> 人
                        </span>
                        <ContractorWorkHoursSummaryLine
                          summary={aggregateContractorWorkLogsSummary(day.sites.flatMap((s) => s.rows))}
                          className="mt-0.5"
                        />
                      </div>
                    </div>
                    <div className="divide-y divide-gray-700/60">
                      {day.sites.map((site) => (
                        <div key={`${day.date}-${site.siteName}`} className="p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                            <p className="text-teal-300 text-sm">
                              案場：{site.siteName}
                              <span className="text-gray-400 ml-2">（{site.headcount} 人）</span>
                            </p>
                            <ContractorWorkHoursSummaryLine
                              summary={aggregateContractorWorkLogsSummary(site.rows)}
                              className="text-right shrink-0"
                            />
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 text-xs">
                                <th className="pb-1 pr-2 font-medium">姓名</th>
                                <th className="pb-1 pr-2 font-medium">工時明細</th>
                                <th className="pb-1 font-medium text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {site.rows.map((row) => {
                                const isEditing = editingWorkLogId === row.id
                                const isApplyingOt = applyingOvertimeId === row.id
                                const canSave =
                                  isWorkReportTimeFilled(editWorkLogArrival) ||
                                  isWorkReportTimeFilled(editWorkLogDeparture)
                                const otStatus = String(row?.overtimeStatus || 'none').trim()
                                const pendingOvertime = otStatus === 'pending'
                                const canRequestOvertime =
                                  !!String(row?.arrivalTime || '').trim() &&
                                  !!String(row?.departureTime || '').trim() &&
                                  otStatus !== 'pending' &&
                                  otStatus !== 'approved'
                                return (
                                  <tr key={row.id} className="border-t border-gray-700/40 align-top">
                                    <td className="py-2 pr-2 text-white">{m(row.personName)}</td>
                                    <td className="py-2 pr-2">
                                      {isEditing ? (
                                        <div className="space-y-2">
                                          <TimeInput24 label="進廠" value={editWorkLogArrival} onChange={setEditWorkLogArrival} compact />
                                          <TimeInput24 label="離廠" value={editWorkLogDeparture} onChange={setEditWorkLogDeparture} compact />
                                        </div>
                                      ) : isApplyingOt ? (
                                        <div className="space-y-2">
                                          <ContractorWorkHoursDetail log={row} />
                                          <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-2">
                                            <p className="text-amber-200 text-xs mb-2">申請緊急入場時數（每人）</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                              {CONTRACTOR_OVERTIME_HOUR_OPTIONS.map((h) => (
                                                <button
                                                  key={h}
                                                  type="button"
                                                  onClick={() => setApplyOvertimeHours(String(h))}
                                                  className={`min-h-[36px] px-1.5 py-1 rounded-lg text-xs font-medium border tabular-nums ${
                                                    Number(applyOvertimeHours) === h
                                                      ? 'bg-amber-700 border-amber-500 text-white'
                                                      : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                                                  }`}
                                                >
                                                  {formatWorkReportHours(h)} 小時
                                                </button>
                                              ))}
                                            </div>
                                            {Number(applyOvertimeHours) > 0 &&
                                              Math.max(1, Math.floor(Number(row?.headcount) || 1)) > 1 && (
                                                <p className="text-amber-300/80 text-[11px] mt-1.5">
                                                  合計{' '}
                                                  {formatWorkReportHours(
                                                    Math.round(
                                                      Number(applyOvertimeHours) *
                                                        Math.max(1, Math.floor(Number(row?.headcount) || 1)) *
                                                        10
                                                    ) / 10
                                                  )}{' '}
                                                  小時（{Math.max(1, Math.floor(Number(row?.headcount) || 1))}人×
                                                  {formatWorkReportHours(Number(applyOvertimeHours))}）
                                                </p>
                                              )}
                                          </div>
                                        </div>
                                      ) : (
                                        <ContractorWorkHoursDetail log={row} />
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      <div className="flex flex-col gap-1 items-end">
                                        {pendingOvertime && !isEditing && !isApplyingOt && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleApproveOvertime({ ...row, date: day.date })}
                                              className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-800/60"
                                            >
                                              核准加班
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRejectOvertime({ ...row, date: day.date })}
                                              className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
                                            >
                                              駁回
                                            </button>
                                          </>
                                        )}
                                        {isEditing ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveWorkLogTimes(row.id)}
                                              disabled={!canSave}
                                              className="text-xs px-2 py-0.5 rounded bg-yellow-700/60 text-yellow-200 border border-yellow-600/50 hover:bg-yellow-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              儲存
                                            </button>
                                            <button
                                              type="button"
                                              onClick={cancelEditWorkLog}
                                              className="text-xs px-2 py-0.5 rounded text-gray-400 hover:text-gray-200"
                                            >
                                              取消
                                            </button>
                                          </>
                                        ) : isApplyingOt ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleSubmitOvertimeRequest(row)}
                                              disabled={!Number(applyOvertimeHours) || Number(applyOvertimeHours) <= 0}
                                              className="text-xs px-2 py-0.5 rounded bg-amber-700/70 text-amber-100 border border-amber-600/50 hover:bg-amber-600/70 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              送出申請
                                            </button>
                                            <button
                                              type="button"
                                              onClick={cancelApplyOvertime}
                                              className="text-xs px-2 py-0.5 rounded text-gray-400 hover:text-gray-200"
                                            >
                                              取消
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            {canRequestOvertime && (
                                              <button
                                                type="button"
                                                onClick={() => startApplyOvertime(row)}
                                                className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-200 border border-amber-700/50 hover:bg-amber-800/60"
                                              >
                                                申請加班
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => startEditWorkLog(row)}
                                              className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600"
                                            >
                                              編輯
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteWorkLog({ ...row, date: day.date })}
                                              className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700/50 hover:bg-red-800/60"
                                            >
                                              刪除
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeAttendance}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContractorRegistration
