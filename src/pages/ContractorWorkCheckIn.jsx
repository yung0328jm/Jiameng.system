import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  findContractorByCheckInCode,
  getContractorById
} from '../utils/contractorRegistrationStorage'
import { getContractorCheckInSiteNames } from '../utils/dropdownStorage'
import {
  pullPublicContractorData,
  getWorkLogsForDate,
  findWorkLog,
  registerContractorArrival,
  registerContractorDeparture,
  getTodayDateStr,
  nowTimeStr,
  CONTRACTOR_STANDARD_DEPARTURE,
  CONTRACTOR_OVERTIME_HOUR_OPTIONS,
  CONTRACTOR_WORK_LOG_KEY
} from '../utils/contractorWorkCheckInStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import {
  getEnabledFoodMerchants,
  getFoodOrdersForDate,
  findFoodOrder,
  upsertFoodOrder,
  clearFoodOrder,
  FOOD_ORDER_MERCHANTS_KEY,
  FOOD_ORDER_RECORDS_KEY
} from '../utils/foodOrderStorage'
import { formatWorkReportHours } from '../utils/workReportStorage'

const CHECKIN_SESSION_KEY = 'jiameng_contractor_checkin_auth'

function ContractorWorkCheckIn() {
  useRecordingMode()
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(getTodayDateStr)
  const [siteName, setSiteName] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [authenticatedCompanyId, setAuthenticatedCompanyId] = useState(() => {
    try {
      return sessionStorage.getItem(CHECKIN_SESSION_KEY) || ''
    } catch (_) {
      return ''
    }
  })
  const [message, setMessage] = useState(null)
  const [activeView, setActiveView] = useState('menu') // menu | attendance | meal
  const [revision, setRevision] = useState(0)
  const [timeModal, setTimeModal] = useState(null) // { person, mode: 'in'|'out' }
  const [mealDrafts, setMealDrafts] = useState({}) // personId -> mealKey (merchantId|itemId)
  const [mealQty, setMealQty] = useState({}) // personId -> quantity

  const refresh = async () => {
    setLoading(true)
    setDate(getTodayDateStr())
    await pullPublicContractorData()
    setRevision((r) => r + 1)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const onRt = (e) => {
      const k = e.detail?.key
      if (k === CONTRACTOR_WORK_LOG_KEY || k === 'jiameng_contractor_registrations' || k === 'jiameng_dropdown_options' || k === FOOD_ORDER_MERCHANTS_KEY || k === FOOD_ORDER_RECORDS_KEY) {
        setRevision((r) => r + 1)
      }
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
  }, [])

  const authenticatedCompany = useMemo(() => {
    void revision
    if (!authenticatedCompanyId) return null
    return getContractorById(authenticatedCompanyId)
  }, [authenticatedCompanyId, revision])

  useEffect(() => {
    if (!authenticatedCompanyId) return
    const company = getContractorById(authenticatedCompanyId)
    if (!company?.checkInCode) {
      setAuthenticatedCompanyId('')
      try {
        sessionStorage.removeItem(CHECKIN_SESSION_KEY)
      } catch (_) {}
    }
  }, [revision, authenticatedCompanyId])

  const siteOptions = useMemo(() => {
    void revision
    return getContractorCheckInSiteNames()
  }, [revision])

  useEffect(() => {
    if (siteName && !siteOptions.includes(siteName)) setSiteName('')
  }, [siteOptions, siteName])

  const mealMerchants = useMemo(() => {
    void revision
    if (!siteName) return []
    return getEnabledFoodMerchants(siteName)
  }, [revision, siteName])

  const mealOptions = useMemo(() => {
    const opts = []
    mealMerchants.forEach((merchant) => {
      ;(merchant.menuItems || []).forEach((item) => {
        opts.push({
          key: `${merchant.id}|${item.id}`,
          merchantId: merchant.id,
          merchantName: merchant.name,
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          label: `${merchant.name} - ${item.name}（$${item.price}）`
        })
      })
    })
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  }, [mealMerchants])

  const todayFoodOrders = useMemo(() => {
    void revision
    if (!authenticatedCompanyId || !siteName) return []
    return getFoodOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
  }, [revision, date, authenticatedCompanyId, siteName])

  const todayFoodOrderMap = useMemo(() => {
    const map = new Map()
    todayFoodOrders.forEach((o) => map.set(o.personId, o))
    return map
  }, [todayFoodOrders])

  const activePersonnel = useMemo(() => {
    if (!authenticatedCompany) return []
    return (authenticatedCompany.personnel || [])
      .filter((p) => p?.active !== false && String(p?.name || '').trim())
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
  }, [authenticatedCompany])

  useEffect(() => {
    if (!siteName || !authenticatedCompanyId) {
      setMealDrafts({})
      setMealQty({})
      return
    }
    const drafts = {}
    const qtys = {}
    activePersonnel.forEach((person) => {
      const order = findFoodOrder({ date, siteName, companyId: authenticatedCompanyId, personId: person.id })
      if (order?.merchantId && order?.menuItemId) {
        drafts[person.id] = `${order.merchantId}|${order.menuItemId}`
        qtys[person.id] = String(order.quantity || 1)
      }
    })
    setMealDrafts(drafts)
    setMealQty(qtys)
  }, [siteName, authenticatedCompanyId, date, activePersonnel, revision])

  const todayLogs = useMemo(() => {
    void revision
    if (!authenticatedCompanyId || !siteName) return []
    return getWorkLogsForDate(date, { companyId: authenticatedCompanyId, siteName })
      .sort((a, b) => String(a?.personName || '').localeCompare(String(b?.personName || ''), 'zh-Hant'))
  }, [revision, date, authenticatedCompanyId, siteName])

  const getPersonStatus = (person) => {
    if (!siteName || !authenticatedCompanyId) return null
    const log = findWorkLog({ date, siteName, companyId: authenticatedCompanyId, personId: person.id })
    if (!log?.arrivalTime) return { label: '未進廠', tone: 'pending' }
    if (!log?.departureTime) return { label: `進廠 ${log.arrivalTime}`, tone: 'in' }
    return { label: `${log.arrivalTime}～${log.departureTime}`, tone: 'done' }
  }

  const submitCode = (e) => {
    e.preventDefault()
    setCodeError('')
    setMessage(null)
    const company = findContractorByCheckInCode(codeInput)
    if (!company) {
      setCodeError('代碼錯誤，請確認後再試或聯絡管理員')
      return
    }
    const hasActive = (company.personnel || []).some((p) => p?.active !== false && String(p?.name || '').trim())
    if (!hasActive) {
      setCodeError('此承攬商尚無可登記人員，請聯絡管理員')
      return
    }
    setAuthenticatedCompanyId(company.id)
    try {
      sessionStorage.setItem(CHECKIN_SESSION_KEY, company.id)
    } catch (_) {}
    setCodeInput('')
    setActiveView('menu')
    setMessage({ type: 'success', text: `已驗證承攬商：${m(company.name)}` })
  }

  const logoutCode = () => {
    setAuthenticatedCompanyId('')
    setSiteName('')
    setActiveView('menu')
    setCodeInput('')
    setCodeError('')
    setMessage(null)
    try {
      sessionStorage.removeItem(CHECKIN_SESSION_KEY)
    } catch (_) {}
  }

  const openTimeModal = (person, mode) => {
    if (!siteName) {
      setMessage({ type: 'error', text: '請先選擇案場' })
      return
    }
    if (!authenticatedCompany) {
      setMessage({ type: 'error', text: '請先輸入承攬商代碼' })
      return
    }
    setTimeModal({
      person,
      mode,
      leaveMode: 'none',
      overtimeHours: ''
    })
    setMessage(null)
  }

  const submitTimeModal = () => {
    if (!timeModal || !authenticatedCompany) return
    const { person, mode, leaveMode, overtimeHours } = timeModal
    const recordTime = nowTimeStr()
    let res
    if (mode === 'in') {
      res = registerContractorArrival({
        date,
        siteName,
        companyId: authenticatedCompany.id,
        companyName: authenticatedCompany.name,
        personId: person.id,
        personName: person.name,
        employeeNo: person.employeeNo,
        arrivalTime: recordTime
      })
    } else {
      const otHours = leaveMode === 'overtime' ? Number(overtimeHours) : 0
      if (leaveMode === 'overtime' && (!Number.isFinite(otHours) || otHours <= 0)) {
        setMessage({ type: 'error', text: '請填寫申請加班時數' })
        return
      }
      res = registerContractorDeparture({
        date,
        siteName,
        companyId: authenticatedCompany.id,
        personId: person.id,
        departureTime: CONTRACTOR_STANDARD_DEPARTURE,
        overtimeRequestHours: otHours,
        overtimeStatus: otHours > 0 ? 'pending' : 'none'
      })
    }
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '登記失敗' })
      return
    }
    setTimeModal(null)
    setRevision((r) => r + 1)
    if (mode === 'in') {
      setMessage({ type: 'success', text: `已登記進廠：${m(person.name)} ${recordTime}` })
      return
    }
    const otHours = leaveMode === 'overtime' ? Number(overtimeHours) : 0
    setMessage({
      type: 'success',
      text: otHours > 0
        ? `已登記離廠：${m(person.name)} ${CONTRACTOR_STANDARD_DEPARTURE}，加班申請 ${formatWorkReportHours(otHours)} 小時待審核`
        : `已登記離廠：${m(person.name)} ${CONTRACTOR_STANDARD_DEPARTURE}`
    })
  }

  const setLeaveMode = (mode) => {
    setTimeModal((prev) => (prev ? { ...prev, leaveMode: mode } : prev))
  }

  const setOvertimeHours = (value) => {
    setTimeModal((prev) => (prev ? { ...prev, overtimeHours: value } : prev))
  }

  const getMealSelection = (personId) => mealOptions.find((o) => o.key === mealDrafts[personId]) || null

  const saveMealOrder = (person) => {
    if (!authenticatedCompany || !siteName) return
    const sel = getMealSelection(person.id)
    if (!sel) {
      setMessage({ type: 'error', text: `請為「${person.name}」選擇餐點` })
      return
    }
    const qty = Math.max(1, Math.floor(Number(mealQty[person.id]) || 1))
    const res = upsertFoodOrder({
      date,
      siteName,
      companyId: authenticatedCompany.id,
      companyName: authenticatedCompany.name,
      personId: person.id,
      personName: person.name,
      merchantId: sel.merchantId,
      merchantName: sel.merchantName,
      menuItemId: sel.menuItemId,
      menuItemName: sel.menuItemName,
      unitPrice: sel.unitPrice,
      quantity: qty
    })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '訂餐失敗' })
      return
    }
    setRevision((r) => r + 1)
    setMessage({ type: 'success', text: `已儲存「${m(person.name)}」訂餐：${sel.menuItemName} × ${qty}（$${sel.unitPrice * qty}）` })
  }

  const cancelMealOrder = (person) => {
    if (!authenticatedCompany || !siteName) return
    if (!todayFoodOrderMap.has(person.id) && !mealDrafts[person.id]) return
    if (!window.confirm(`確定取消「${person.name}」的訂餐？`)) return
    const res = clearFoodOrder({ date, siteName, companyId: authenticatedCompany.id, personId: person.id })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '取消失敗' })
      return
    }
    setMealDrafts((prev) => {
      const next = { ...prev }
      delete next[person.id]
      return next
    })
    setMealQty((prev) => {
      const next = { ...prev }
      delete next[person.id]
      return next
    })
    setRevision((r) => r + 1)
    setMessage({ type: 'success', text: `已取消「${m(person.name)}」訂餐。` })
  }

  const saveAllMealOrders = () => {
    if (!authenticatedCompany || !siteName) return
    const pending = activePersonnel.filter((p) => mealDrafts[p.id])
    if (pending.length === 0) {
      setMessage({ type: 'error', text: '請至少為一位人員選擇餐點' })
      return
    }
    let ok = 0
    pending.forEach((person) => {
      const sel = getMealSelection(person.id)
      if (!sel) return
      const qty = Math.max(1, Math.floor(Number(mealQty[person.id]) || 1))
      const res = upsertFoodOrder({
        date,
        siteName,
        companyId: authenticatedCompany.id,
        companyName: authenticatedCompany.name,
        personId: person.id,
        personName: person.name,
        merchantId: sel.merchantId,
        merchantName: sel.merchantName,
        menuItemId: sel.menuItemId,
        menuItemName: sel.menuItemName,
        unitPrice: sel.unitPrice,
        quantity: qty
      })
      if (res.success) ok += 1
    })
    setRevision((r) => r + 1)
    setMessage({ type: 'success', text: `已儲存 ${ok} 筆訂餐。` })
  }

  if (!authenticatedCompanyId || !authenticatedCompany) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-cn-ink via-cn-lacquer to-cn-ink text-cn-parchment p-4 flex items-center justify-center"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-sm w-full">
          <div className="flex items-center justify-between gap-2 mb-6">
            <h1 className="text-xl font-bold text-teal-300 font-serif">廠商登記入口</h1>
            <Link to="/login" className="text-cn-gold text-sm hover:text-amber-200 shrink-0 font-serif">
              回登入
            </Link>
          </div>
          <div className="bg-gradient-to-b from-cn-panel/95 to-cn-lacquer rounded-xl border border-cn-gold/40 p-5 shadow-xl">
            <p className="text-cn-mist text-sm mb-4">請輸入管理員提供的承攬商代碼</p>
            <form onSubmit={submitCode} className="space-y-4">
              <div>
                <label className="block text-cn-mist text-sm mb-1.5">承攬商代碼</label>
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value)
                    setCodeError('')
                  }}
                  placeholder="請輸入代碼"
                  autoComplete="off"
                  className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-3 text-cn-parchment text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  disabled={loading}
                />
                {codeError && <p className="text-red-400 text-sm mt-2">{codeError}</p>}
              </div>
              <button
                type="submit"
                disabled={loading || !codeInput.trim()}
                className="w-full min-h-[48px] rounded-md bg-gradient-to-r from-cn-gold to-amber-500 text-cn-ink font-semibold disabled:opacity-50"
              >
                {loading ? '同步中…' : '確認進入'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-cn-ink via-cn-lacquer to-cn-ink text-cn-parchment p-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-teal-300 font-serif">廠商登記入口</h1>
            <p className="text-cn-mist text-xs sm:text-sm mt-0.5">
              {activeView === 'menu' ? '請選擇要辦理的事項' : activeView === 'attendance' ? '人員進離廠登記' : '人員訂餐'}
            </p>
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

          <div className="p-3 rounded-lg bg-teal-950/40 border border-teal-700/50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-teal-300/80 text-xs">承攬商</p>
              <p className="text-white font-semibold text-lg">{m(authenticatedCompany.name)}</p>
            </div>
            <button
              type="button"
              onClick={logoutCode}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-500 text-gray-300 hover:bg-black/30"
            >
              重新輸入代碼
            </button>
          </div>

          {activeView === 'menu' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setActiveView('attendance'); setMessage(null) }}
                className="min-h-[120px] rounded-xl border border-teal-600/60 bg-teal-950/50 hover:bg-teal-900/50 p-4 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="text-2xl">🚪</span>
                <span className="text-teal-200 font-semibold text-base">登記出入廠</span>
                <span className="text-teal-400/70 text-xs text-center">人員進廠／離廠</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveView('meal'); setMessage(null) }}
                className="min-h-[120px] rounded-xl border border-orange-600/60 bg-orange-950/40 hover:bg-orange-900/40 p-4 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="text-2xl">🍱</span>
                <span className="text-orange-200 font-semibold text-base">登記點餐</span>
                <span className="text-orange-400/70 text-xs text-center">選擇餐點與數量</span>
              </button>
            </div>
          )}

          {activeView !== 'menu' && (
            <button
              type="button"
              onClick={() => { setActiveView('menu'); setMessage(null) }}
              className="text-sm text-cn-gold hover:text-amber-200 flex items-center gap-1"
            >
              ← 返回選單
            </button>
          )}

          {activeView !== 'menu' && (
            <>
          <div>
            <p className="block text-cn-mist text-sm mb-1.5">日期</p>
            <p className="w-full bg-black/20 border border-cn-gold/25 rounded-md px-3 py-2.5 text-cn-parchment tabular-nums">
              {date.replace(/-/g, '/')}
            </p>
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
                <option key={s} value={s}>{m(s)}</option>
              ))}
            </select>
            {siteOptions.length === 0 && !loading && (
              <p className="text-gray-500 text-xs mt-1">尚無案場，請至入廠申請「常用清單」勾選要開放給承攬商登記的案場。</p>
            )}
          </div>
            </>
          )}

          {activeView === 'attendance' && activePersonnel.length > 0 && (
            <div>
              <p className="text-teal-300 text-sm font-medium mb-2">人員登記</p>
              <div className="space-y-2">
                {activePersonnel.map((person) => {
                  const status = getPersonStatus(person)
                  const log = siteName && authenticatedCompanyId
                    ? findWorkLog({ date, siteName, companyId: authenticatedCompanyId, personId: person.id })
                    : null
                  const canIn = !log?.arrivalTime
                  const canOut = !!log?.arrivalTime && !log?.departureTime
                  return (
                    <div
                      key={person.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-black/25 border border-gray-600/60"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">{m(person.name)}</div>
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

          {activeView === 'attendance' && activePersonnel.length === 0 && !loading && (
            <p className="text-gray-500 text-sm">尚無可登記人員，請聯絡管理員建立人員名單。</p>
          )}

          {activeView === 'meal' && siteName && activePersonnel.length > 0 && (
            <div className="pt-2 border-t border-gray-700/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-orange-300 text-sm font-medium">今日訂餐 · {m(siteName)}</p>
                {mealOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={saveAllMealOrders}
                    className="text-xs px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-600 text-white"
                  >
                    儲存全部訂餐
                  </button>
                )}
              </div>
              {mealOptions.length === 0 ? (
                <p className="text-gray-500 text-sm">此案場尚無可訂餐的商家，請至點餐系統設定。</p>
              ) : (
                <div className="space-y-2">
                  {activePersonnel.map((person) => {
                    const sel = getMealSelection(person.id)
                    const qty = Math.max(1, Math.floor(Number(mealQty[person.id]) || 1))
                    const amount = sel ? sel.unitPrice * qty : 0
                    const saved = todayFoodOrderMap.get(person.id)
                    return (
                      <div key={`meal-${person.id}`} className="p-3 rounded-lg bg-black/25 border border-orange-800/40 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-white">{m(person.name)}</span>
                          {saved && (
                            <span className="text-xs text-green-400">已訂：{saved.menuItemName} ${saved.totalAmount}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_auto] gap-2 items-end">
                          <div>
                            <label className="block text-gray-400 text-xs mb-1">選擇餐點</label>
                            <select
                              value={mealDrafts[person.id] || ''}
                              onChange={(e) => setMealDrafts((prev) => ({ ...prev, [person.id]: e.target.value }))}
                              className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm"
                            >
                              <option value="">— 不訂餐 —</option>
                              {mealOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-gray-400 text-xs mb-1">數量</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={mealQty[person.id] || '1'}
                              onChange={(e) => setMealQty((prev) => ({ ...prev, [person.id]: e.target.value }))}
                              disabled={!mealDrafts[person.id]}
                              className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm tabular-nums disabled:opacity-40"
                            />
                          </div>
                          <div className="text-right sm:text-center">
                            <p className="text-gray-400 text-xs mb-1">金額</p>
                            <p className="text-amber-300 font-semibold tabular-nums">${amount || '—'}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            disabled={!mealDrafts[person.id]}
                            onClick={() => saveMealOrder(person)}
                            className="text-xs px-3 py-1.5 rounded bg-orange-700 hover:bg-orange-600 text-white disabled:opacity-40"
                          >
                            儲存
                          </button>
                          {(saved || mealDrafts[person.id]) && (
                            <button
                              type="button"
                              onClick={() => cancelMealOrder(person)}
                              className="text-xs px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-black/30"
                            >
                              取消
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeView === 'meal' && !siteName && activePersonnel.length > 0 && (
            <p className="text-gray-500 text-sm">請先選擇案場以進行訂餐。</p>
          )}

          {activeView === 'meal' && activePersonnel.length === 0 && !loading && (
            <p className="text-gray-500 text-sm">尚無可訂餐人員，請聯絡管理員建立人員名單。</p>
          )}

          {activeView === 'attendance' && todayLogs.length > 0 && (
            <div className="pt-2 border-t border-gray-700/60">
              <p className="text-cn-mist text-sm mb-2">今日登記紀錄</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-sm">
                {todayLogs.map((log) => (
                  <div key={log.id} className="flex justify-between gap-2 text-gray-300 bg-black/20 rounded px-2 py-1.5">
                    <span>{m(log.personName)}</span>
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
            <p className="text-gray-400 text-sm mb-4">{m(timeModal.person?.name)}</p>
            {timeModal.mode === 'in' ? (
              <p className="text-amber-200 text-sm leading-relaxed mb-4 px-1">
                離場時請務必記得點擊離場按鈕
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveMode('none')}
                    className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium border ${
                      timeModal.leaveMode === 'none'
                        ? 'bg-teal-800 border-teal-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    無加班
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveMode('overtime')}
                    className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium border ${
                      timeModal.leaveMode === 'overtime'
                        ? 'bg-amber-800 border-amber-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    加班申請
                  </button>
                </div>
                <div className="rounded-lg bg-gray-900/60 border border-gray-600 px-3 py-2">
                  <p className="text-gray-400 text-xs">離廠時間</p>
                  <p className="text-white font-semibold tabular-nums mt-0.5">{CONTRACTOR_STANDARD_DEPARTURE}（固定）</p>
                </div>
                {timeModal.leaveMode === 'overtime' && (
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">申請緊急入場時數</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CONTRACTOR_OVERTIME_HOUR_OPTIONS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setOvertimeHours(String(h))}
                          className={`min-h-[40px] px-2 py-2 rounded-lg text-sm font-medium border tabular-nums ${
                            Number(timeModal.overtimeHours) === h
                              ? 'bg-amber-700 border-amber-500 text-white'
                              : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                          }`}
                        >
                          {formatWorkReportHours(h)} 小時
                        </button>
                      ))}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">送出後由管理員於出勤紀錄審核</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitTimeModal}
                disabled={
                  timeModal.mode === 'out' &&
                  timeModal.leaveMode === 'overtime' &&
                  (!Number(timeModal.overtimeHours) || Number(timeModal.overtimeHours) <= 0)
                }
                className="flex-1 min-h-[44px] rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
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
