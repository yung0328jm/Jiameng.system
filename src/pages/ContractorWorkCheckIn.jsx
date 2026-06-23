import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getContractorRegistrations } from '../utils/contractorRegistrationStorage'
import { getDropdownOptionsByCategory } from '../utils/dropdownStorage'
import {
  pullPublicContractorData,
  getWorkLogsForDate,
  findWorkLog,
  registerContractorArrival,
  registerContractorDeparture,
  getTodayDateStr,
  nowTimeStr,
  CONTRACTOR_WORK_LOG_KEY
} from '../utils/contractorWorkCheckInStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'

const SITE_CATEGORY = 'work_report_sites'

function ContractorWorkCheckIn() {
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(getTodayDateStr)
  const [siteName, setSiteName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [message, setMessage] = useState(null)
  const [revision, setRevision] = useState(0)
  const [timeModal, setTimeModal] = useState(null) // { person, mode: 'in'|'out' }

  const refresh = async () => {
    setLoading(true)
    await pullPublicContractorData()
    setRevision((r) => r + 1)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const onRt = (e) => {
      const k = e.detail?.key
      if (k === CONTRACTOR_WORK_LOG_KEY || k === 'jiameng_contractor_registrations' || k === 'jiameng_dropdown_options') {
        setRevision((r) => r + 1)
      }
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
  }, [])

  const companies = useMemo(() => {
    void revision
    return getContractorRegistrations()
      .filter((c) => (c.personnel || []).some((p) => p?.active !== false))
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
  }, [revision])

  const siteOptions = useMemo(() => {
    void revision
    const seen = new Set()
    const out = []
    ;(getDropdownOptionsByCategory(SITE_CATEGORY) || []).forEach((o) => {
      const v = String(o?.value || '').trim()
      if (v && !seen.has(v)) { seen.add(v); out.push(v) }
    })
    return out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [revision])

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId]
  )

  const activePersonnel = useMemo(() => {
    if (!selectedCompany) return []
    return (selectedCompany.personnel || [])
      .filter((p) => p?.active !== false && String(p?.name || '').trim())
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
  }, [selectedCompany])

  const todayLogs = useMemo(() => {
    void revision
    if (!companyId || !siteName) return []
    return getWorkLogsForDate(date, { companyId, siteName })
      .sort((a, b) => String(a?.personName || '').localeCompare(String(b?.personName || ''), 'zh-Hant'))
  }, [revision, date, companyId, siteName])

  const getPersonStatus = (person) => {
    if (!siteName || !companyId) return null
    const log = findWorkLog({ date, siteName, companyId, personId: person.id })
    if (!log?.arrivalTime) return { label: '未進廠', tone: 'pending' }
    if (!log?.departureTime) return { label: `進廠 ${log.arrivalTime}`, tone: 'in' }
    return { label: `${log.arrivalTime}～${log.departureTime}`, tone: 'done' }
  }

  const openTimeModal = (person, mode) => {
    if (!siteName) {
      setMessage({ type: 'error', text: '請先選擇案場' })
      return
    }
    if (!companyId) {
      setMessage({ type: 'error', text: '請先選擇承攬商' })
      return
    }
    setTimeModal({
      person,
      mode,
      time: nowTimeStr()
    })
    setMessage(null)
  }

  const submitTimeModal = () => {
    if (!timeModal || !selectedCompany) return
    const { person, mode, time } = timeModal
    const res = mode === 'in'
      ? registerContractorArrival({
          date,
          siteName,
          companyId: selectedCompany.id,
          companyName: selectedCompany.name,
          personId: person.id,
          personName: person.name,
          employeeNo: person.employeeNo,
          arrivalTime: time
        })
      : registerContractorDeparture({
          date,
          siteName,
          companyId: selectedCompany.id,
          personId: person.id,
          departureTime: time
        })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '登記失敗' })
      return
    }
    setTimeModal(null)
    setRevision((r) => r + 1)
    setMessage({
      type: 'success',
      text: mode === 'in'
        ? `已登記進廠：${person.name} ${time}`
        : `已登記離廠：${person.name} ${time}`
    })
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-cn-ink via-cn-lacquer to-cn-ink text-cn-parchment p-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-teal-300 font-serif">承攬商出工登記</h1>
            <p className="text-cn-mist text-xs sm:text-sm mt-0.5">免登入 · 選擇案場與人員登記進離廠</p>
          </div>
          <Link to="/login" className="text-cn-gold text-sm hover:text-amber-200 shrink-0 font-serif">
            回登入
          </Link>
        </div>

        {message && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-900/40 text-green-300 border border-green-700/50'
                : 'bg-red-900/40 text-red-300 border border-red-700/50'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-gradient-to-b from-cn-panel/95 to-cn-lacquer rounded-xl border border-cn-gold/40 p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-cn-mist text-sm">{loading ? '同步中…' : '資料已就緒'}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-md bg-black/30 border border-cn-gold/30 text-cn-gold hover:bg-black/40 disabled:opacity-50"
            >
              重新整理
            </button>
          </div>

          <div>
            <label className="block text-cn-mist text-sm mb-1.5">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-2.5 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>

          <div>
            <label className="block text-cn-mist text-sm mb-1.5">案場 <span className="text-red-400">*</span></label>
            <select
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-2.5 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              <option value="">— 請選擇案場 —</option>
              {siteOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-cn-mist text-sm mb-1.5">承攬商 <span className="text-red-400">*</span></label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-2.5 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            >
              <option value="">— 請選擇承攬商 —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {companies.length === 0 && !loading && (
              <p className="text-gray-500 text-xs mt-1">尚無可登記的承攬商或人員，請聯絡管理員建立名單。</p>
            )}
          </div>

          {selectedCompany && activePersonnel.length > 0 && (
            <div>
              <p className="text-teal-300 text-sm font-medium mb-2">人員登記</p>
              <div className="space-y-2">
                {activePersonnel.map((person) => {
                  const status = getPersonStatus(person)
                  const log = siteName && companyId
                    ? findWorkLog({ date, siteName, companyId, personId: person.id })
                    : null
                  const canIn = !log?.arrivalTime
                  const canOut = !!log?.arrivalTime && !log?.departureTime
                  return (
                    <div
                      key={person.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-black/25 border border-gray-600/60"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">{person.name}</div>
                        {person.employeeNo && <div className="text-xs text-gray-400">編號 {person.employeeNo}</div>}
                        {status && (
                          <div className={`text-xs mt-0.5 ${
                            status.tone === 'done' ? 'text-green-400' : status.tone === 'in' ? 'text-amber-300' : 'text-gray-500'
                          }`}>
                            {status.label}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={!canIn}
                          onClick={() => openTimeModal(person, 'in')}
                          className="flex-1 sm:flex-none min-h-[40px] px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          進廠
                        </button>
                        <button
                          type="button"
                          disabled={!canOut}
                          onClick={() => openTimeModal(person, 'out')}
                          className="flex-1 sm:flex-none min-h-[40px] px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          離廠
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {todayLogs.length > 0 && (
            <div className="pt-2 border-t border-gray-700/60">
              <p className="text-cn-mist text-sm mb-2">今日登記紀錄</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-sm">
                {todayLogs.map((log) => (
                  <div key={log.id} className="flex justify-between gap-2 text-gray-300 bg-black/20 rounded px-2 py-1.5">
                    <span>{log.personName}</span>
                    <span className="text-teal-300 tabular-nums shrink-0">
                      {log.arrivalTime || '—'}{log.departureTime ? `～${log.departureTime}` : '（在廠）'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {timeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-teal-600/50 rounded-xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-teal-300 mb-1">
              {timeModal.mode === 'in' ? '進廠登記' : '離廠登記'}
            </h3>
            <p className="text-gray-400 text-sm mb-4">{timeModal.person?.name}</p>
            <label className="block text-gray-300 text-sm mb-1">時間</label>
            <input
              type="time"
              value={timeModal.time}
              onChange={(e) => setTimeModal((m) => ({ ...m, time: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitTimeModal}
                className="flex-1 min-h-[44px] rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold"
              >
                確認
              </button>
              <button
                type="button"
                onClick={() => setTimeModal(null)}
                className="flex-1 min-h-[44px] rounded-lg bg-gray-600 hover:bg-gray-500 text-white"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContractorWorkCheckIn
