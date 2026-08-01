import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, Navigate } from 'react-router-dom'
import {
  findContractorByCheckInCode,
  getContractorById,
  getContractorAttendanceMode,
  getContractorRegistrations
} from '../utils/contractorRegistrationStorage'
import { getContractorCheckInSiteNames } from '../utils/dropdownStorage'
import {
  pullPublicContractorData,
  getWorkLogsForDate,
  findWorkLog,
  findHeadcountWorkLog,
  registerContractorArrival,
  registerContractorDeparture,
  registerHeadcountArrival,
  registerHeadcountDeparture,
  getTodayDateStr,
  nowTimeStr,
  CONTRACTOR_STANDARD_DEPARTURE,
  CONTRACTOR_HALF_DAY_DEPARTURE,
  CONTRACTOR_ON_TIME_CUTOFF,
  CONTRACTOR_OVERTIME_HOUR_OPTIONS,
  CONTRACTOR_WORK_LOG_KEY
} from '../utils/contractorWorkCheckInStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { getCurrentUser } from '../utils/authStorage'
import {
  getEnabledFoodMerchants,
  getCompanyMealOrdersForDate,
  getNamedMealOrdersForDate,
  saveCompanyMealOrders,
  saveNamedMealOrders,
  clearCompanyMealOrders,
  clearNamedMealOrders,
  FOOD_ORDER_MERCHANTS_KEY,
  FOOD_ORDER_RECORDS_KEY
} from '../utils/foodOrderStorage'
import { formatWorkReportHours } from '../utils/workReportStorage'

const CHECKIN_SESSION_KEY = 'jiameng_contractor_checkin_auth'
const MEAL_MODE_SESSION_PREFIX = 'jiameng_contractor_meal_mode_'

const newMealRow = (id) => ({ id, mealKey: '', quantity: '1' })

function isValidDateStr(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '').trim())
}

function ContractorWorkCheckIn() {
  useRecordingMode()
  const [searchParams] = useSearchParams()
  const isInternalProxy = searchParams.get('internal') === '1'
  const dateFromQuery = searchParams.get('date')
  const internalLoggedIn = isInternalProxy && !!getCurrentUser()

  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() =>
    isValidDateStr(dateFromQuery) ? String(dateFromQuery).trim() : getTodayDateStr()
  )
  const [siteName, setSiteName] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [pickCompanyId, setPickCompanyId] = useState('')
  const [authenticatedCompanyId, setAuthenticatedCompanyId] = useState(() => {
    if (isInternalProxy) return ''
    try {
      return sessionStorage.getItem(CHECKIN_SESSION_KEY) || ''
    } catch (_) {
      return ''
    }
  })
  const [message, setMessage] = useState(null)
  const [activeView, setActiveView] = useState('menu') // menu | attendance | meal
  const [headcountInput, setHeadcountInput] = useState('1')
  const [revision, setRevision] = useState(0)
  const [timeModal, setTimeModal] = useState(null) // { person, mode: 'in'|'out' }
  const [mealRows, setMealRows] = useState(() => [newMealRow('row-1')])
  const [namedMealRows, setNamedMealRows] = useState([])
  const [mealOrderMode, setMealOrderMode] = useState('headcount') // named | headcount

  const refresh = async () => {
    setLoading(true)
    // 內部補登記保留選定日期；公開入口才強制今天
    if (!isInternalProxy) setDate(getTodayDateStr())
    await pullPublicContractorData()
    setRevision((r) => r + 1)
    setLoading(false)
  }

  useEffect(() => {
    if (isInternalProxy && isValidDateStr(dateFromQuery)) {
      setDate(String(dateFromQuery).trim())
    }
  }, [isInternalProxy, dateFromQuery])

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

  const companyAttendanceMode = useMemo(
    () => getContractorAttendanceMode(authenticatedCompany),
    [authenticatedCompany]
  )

  const contractorOptions = useMemo(() => {
    void revision
    return [...getContractorRegistrations()].sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    )
  }, [revision])

  useEffect(() => {
    if (!authenticatedCompanyId) return
    const company = getContractorById(authenticatedCompanyId)
    // 公開入口仍要求有代碼；內部補登記只要公司存在即可
    if (!company || (!isInternalProxy && !company?.checkInCode)) {
      setAuthenticatedCompanyId('')
      try {
        sessionStorage.removeItem(CHECKIN_SESSION_KEY)
      } catch (_) {}
    }
  }, [revision, authenticatedCompanyId, isInternalProxy])

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

  const todayCompanyMealOrders = useMemo(() => {
    void revision
    if (!authenticatedCompanyId || !siteName) return []
    return getCompanyMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
  }, [revision, date, authenticatedCompanyId, siteName])

  const todayNamedMealOrders = useMemo(() => {
    void revision
    if (!authenticatedCompanyId || !siteName) return []
    return getNamedMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
  }, [revision, date, authenticatedCompanyId, siteName])

  const isHeadcountMealMode = mealOrderMode === 'headcount'

  const setMealOrderModeChoice = (mode) => {
    const next = mode === 'headcount' ? 'headcount' : 'named'
    setMealOrderMode(next)
    if (authenticatedCompanyId) {
      try {
        sessionStorage.setItem(`${MEAL_MODE_SESSION_PREFIX}${authenticatedCompanyId}`, next)
      } catch (_) {}
    }
  }

  useEffect(() => {
    if (!authenticatedCompanyId || !siteName) return
    const named = getNamedMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
    const company = getCompanyMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
    if (named.length > 0) {
      setMealOrderMode('named')
      return
    }
    if (company.length > 0) {
      setMealOrderMode('headcount')
      return
    }
    try {
      const saved = sessionStorage.getItem(`${MEAL_MODE_SESSION_PREFIX}${authenticatedCompanyId}`)
      if (saved === 'named' || saved === 'headcount') {
        setMealOrderMode(saved)
        return
      }
    } catch (_) {}
    setMealOrderMode(getContractorAttendanceMode(authenticatedCompany) === 'headcount' ? 'headcount' : 'named')
  }, [authenticatedCompanyId, authenticatedCompany, siteName, date])

  const activePersonnel = useMemo(() => {
    if (!authenticatedCompany) return []
    return (authenticatedCompany.personnel || [])
      .filter((p) => p?.active !== false && String(p?.name || '').trim())
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
  }, [authenticatedCompany])

  const headcountLog = useMemo(() => {
    void revision
    if (!siteName || !authenticatedCompanyId) return null
    return findHeadcountWorkLog({ date, siteName, companyId: authenticatedCompanyId })
  }, [revision, siteName, authenticatedCompanyId, date])

  useEffect(() => {
    if (!siteName || !authenticatedCompanyId) {
      setHeadcountInput('1')
      return
    }
    const log = findHeadcountWorkLog({ date, siteName, companyId: authenticatedCompanyId })
    if (log?.headcount) setHeadcountInput(String(log.headcount))
    else setHeadcountInput('1')
  }, [siteName, authenticatedCompanyId, date, revision])

  useEffect(() => {
    if (!siteName || !authenticatedCompanyId) {
      setMealRows([newMealRow('row-1')])
      return
    }
    if (!isHeadcountMealMode) return
    const orders = getCompanyMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
    if (orders.length === 0) {
      setMealRows([newMealRow(`row-${Date.now()}`)])
      return
    }
    setMealRows(
      orders.map((order, idx) => ({
        id: `saved-${order.id || idx}`,
        mealKey: `${order.merchantId}|${order.menuItemId}`,
        quantity: String(order.quantity || 1)
      }))
    )
  }, [siteName, authenticatedCompanyId, date, revision, isHeadcountMealMode])

  useEffect(() => {
    if (!siteName || !authenticatedCompanyId) {
      setNamedMealRows([])
      return
    }
    if (isHeadcountMealMode) return
    const orders = getNamedMealOrdersForDate(date, { siteName, companyId: authenticatedCompanyId })
    const orderByPerson = new Map(orders.map((o) => [String(o.personId || '').trim(), o]))
    setNamedMealRows(
      activePersonnel.map((person) => {
        const order = orderByPerson.get(String(person.id || '').trim())
        return {
          personId: person.id,
          personName: person.name,
          mealKey: order ? `${order.merchantId}|${order.menuItemId}` : ''
        }
      })
    )
  }, [siteName, authenticatedCompanyId, date, revision, isHeadcountMealMode, activePersonnel])

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
    const isHeadcount = getContractorAttendanceMode(company) === 'headcount'
    if (!isHeadcount && !hasActive) {
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

  const selectCompanyInternal = (e) => {
    e.preventDefault()
    setCodeError('')
    setMessage(null)
    const company = getContractorById(pickCompanyId)
    if (!company) {
      setCodeError('請選擇承攬商')
      return
    }
    const hasActive = (company.personnel || []).some((p) => p?.active !== false && String(p?.name || '').trim())
    const isHeadcount = getContractorAttendanceMode(company) === 'headcount'
    if (!isHeadcount && !hasActive) {
      setCodeError('此承攬商尚無可登記人員，請先至承攬商資料登記建立人員')
      return
    }
    setAuthenticatedCompanyId(company.id)
    setActiveView('menu')
    setMessage({ type: 'success', text: `已選擇承攬商：${m(company.name)}（內部補登記）` })
  }

  const logoutCode = () => {
    setAuthenticatedCompanyId('')
    setSiteName('')
    setActiveView('menu')
    setHeadcountInput('1')
    setCodeInput('')
    setPickCompanyId('')
    setCodeError('')
    setMessage(null)
    if (!isInternalProxy) {
      try {
        sessionStorage.removeItem(CHECKIN_SESSION_KEY)
      } catch (_) {}
    }
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
      headcountMode: false,
      leaveMode: 'none',
      overtimeHours: '',
      useStandardArrival: false,
      earlyDeparture: false,
      earlyDepartureCount: 1
    })
    setMessage(null)
  }

  const openHeadcountTimeModal = (mode) => {
    if (!siteName) {
      setMessage({ type: 'error', text: '請先選擇案場' })
      return
    }
    if (!authenticatedCompany) {
      setMessage({ type: 'error', text: '請先輸入承攬商代碼' })
      return
    }
    const log = findHeadcountWorkLog({ date, siteName, companyId: authenticatedCompany.id })
    const count = log?.headcount || Math.max(1, Math.floor(Number(headcountInput) || 0))
    if (mode === 'in' && count < 1) {
      setMessage({ type: 'error', text: '請填寫今日入場人數' })
      return
    }
    setTimeModal({
      person: { name: `人數登記（${count}人）` },
      mode,
      headcountMode: true,
      headcount: count,
      leaveMode: 'none',
      overtimeHours: '',
      useStandardArrival: false,
      earlyDeparture: false,
      earlyDepartureCount: 1
    })
    setMessage(null)
  }

  const submitTimeModal = () => {
    if (!timeModal || !authenticatedCompany) return
    const {
      person,
      mode,
      leaveMode,
      overtimeHours,
      headcountMode,
      headcount,
      useStandardArrival,
      earlyDeparture,
      earlyDepartureCount
    } = timeModal
    const recordTime =
      mode === 'in' && isInternalProxy && useStandardArrival
        ? CONTRACTOR_ON_TIME_CUTOFF
        : nowTimeStr()
    const hc = Math.max(1, Math.floor(Number(headcount) || 1))
    const earlyCount =
      mode === 'out' && isInternalProxy && earlyDeparture
        ? Math.min(hc, Math.max(1, Math.floor(Number(earlyDepartureCount) || 1)))
        : 0
    const isEarlyOut = earlyCount > 0
    const allEarly = isEarlyOut && earlyCount >= hc
    const departureTime = allEarly ? CONTRACTOR_HALF_DAY_DEPARTURE : CONTRACTOR_STANDARD_DEPARTURE
    const workDaysPreview = Math.round((hc - earlyCount * 0.5) * 10) / 10
    let res
    if (headcountMode) {
      if (mode === 'in') {
        res = registerHeadcountArrival({
          date,
          siteName,
          companyId: authenticatedCompany.id,
          companyName: authenticatedCompany.name,
          headcount,
          arrivalTime: recordTime
        })
      } else {
        const otHours = leaveMode === 'overtime' ? Number(overtimeHours) : 0
        if (leaveMode === 'overtime' && (!Number.isFinite(otHours) || otHours <= 0)) {
          setMessage({ type: 'error', text: '請填寫申請加班時數' })
          return
        }
        res = registerHeadcountDeparture({
          date,
          siteName,
          companyId: authenticatedCompany.id,
          departureTime,
          overtimeRequestHours: otHours,
          overtimeStatus: otHours > 0 ? 'pending' : 'none',
          earlyDeparture: isEarlyOut,
          earlyDepartureCount: earlyCount
        })
      }
    } else if (mode === 'in') {
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
        departureTime: isEarlyOut ? CONTRACTOR_HALF_DAY_DEPARTURE : CONTRACTOR_STANDARD_DEPARTURE,
        overtimeRequestHours: otHours,
        overtimeStatus: otHours > 0 ? 'pending' : 'none',
        earlyDeparture: isEarlyOut
      })
    }
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '登記失敗' })
      return
    }
    setTimeModal(null)
    setRevision((r) => r + 1)
    if (headcountMode) {
      if (mode === 'in') {
        setMessage({ type: 'success', text: `已登記進廠：${headcount} 人 ${recordTime}` })
        return
      }
      const otHours = leaveMode === 'overtime' ? Number(overtimeHours) : 0
      const earlyNote = isEarlyOut ? `（提早 ${earlyCount} 人 → ${workDaysPreview} 工）` : ''
      setMessage({
        type: 'success',
        text: otHours > 0
          ? `已登記離廠：${headcount} 人 ${departureTime}${earlyNote}，加班申請 ${formatWorkReportHours(otHours)} 小時待審核`
          : `已登記離廠：${headcount} 人 ${departureTime}${earlyNote}`
      })
      return
    }
    if (mode === 'in') {
      setMessage({ type: 'success', text: `已登記進廠：${m(person.name)} ${recordTime}` })
      return
    }
    const otHours = leaveMode === 'overtime' ? Number(overtimeHours) : 0
    const namedDep = isEarlyOut ? CONTRACTOR_HALF_DAY_DEPARTURE : CONTRACTOR_STANDARD_DEPARTURE
    setMessage({
      type: 'success',
      text: otHours > 0
        ? `已登記離廠：${m(person.name)} ${namedDep}${isEarlyOut ? '（半天 0.5 工）' : ''}，加班申請 ${formatWorkReportHours(otHours)} 小時待審核`
        : `已登記離廠：${m(person.name)} ${namedDep}${isEarlyOut ? '（半天 0.5 工）' : ''}`
    })
  }

  const setLeaveMode = (mode) => {
    setTimeModal((prev) => (prev ? { ...prev, leaveMode: mode } : prev))
  }

  const setOvertimeHours = (value) => {
    setTimeModal((prev) => (prev ? { ...prev, overtimeHours: value } : prev))
  }

  const setUseStandardArrival = (checked) => {
    setTimeModal((prev) => (prev ? { ...prev, useStandardArrival: !!checked } : prev))
  }

  const setEarlyDeparture = (checked) => {
    setTimeModal((prev) => {
      if (!prev) return prev
      const hc = Math.max(1, Math.floor(Number(prev.headcount) || 1))
      return {
        ...prev,
        earlyDeparture: !!checked,
        earlyDepartureCount: checked ? Math.min(hc, Math.max(1, Number(prev.earlyDepartureCount) || 1)) : 0
      }
    })
  }

  const setEarlyDepartureCount = (value) => {
    setTimeModal((prev) => {
      if (!prev) return prev
      const hc = Math.max(1, Math.floor(Number(prev.headcount) || 1))
      const n = Math.min(hc, Math.max(1, Math.floor(Number(value) || 1)))
      return { ...prev, earlyDepartureCount: n }
    })
  }

  const getMealSelection = (mealKey) => mealOptions.find((o) => o.key === mealKey) || null

  const updateMealRow = (rowId, patch) => {
    setMealRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  const addMealRow = () => {
    setMealRows((rows) => [...rows, newMealRow(`row-${Date.now()}`)])
  }

  const removeMealRow = (rowId) => {
    setMealRows((rows) => {
      if (rows.length <= 1) return [newMealRow(`row-${Date.now()}`)]
      return rows.filter((row) => row.id !== rowId)
    })
  }

  const updateNamedMealRow = (personId, mealKey) => {
    setNamedMealRows((rows) => rows.map((row) => (row.personId === personId ? { ...row, mealKey } : row)))
  }

  const saveMealOrders = () => {
    if (!authenticatedCompany || !siteName) return
    if (isHeadcountMealMode) {
      const lines = mealRows
        .map((row) => {
          const sel = getMealSelection(row.mealKey)
          if (!sel) return null
          return {
            merchantId: sel.merchantId,
            merchantName: sel.merchantName,
            menuItemId: sel.menuItemId,
            menuItemName: sel.menuItemName,
            unitPrice: sel.unitPrice,
            quantity: Math.max(1, Math.floor(Number(row.quantity) || 1))
          }
        })
        .filter(Boolean)
      if (lines.length === 0) {
        setMessage({ type: 'error', text: '請至少選擇一項餐點' })
        return
      }
      const res = saveCompanyMealOrders({
        date,
        siteName,
        companyId: authenticatedCompany.id,
        companyName: authenticatedCompany.name,
        lines
      })
      if (!res.success) {
        setMessage({ type: 'error', text: res.message || '訂餐失敗' })
        return
      }
      if (todayNamedMealOrders.length > 0) {
        clearNamedMealOrders({ date, siteName, companyId: authenticatedCompany.id })
      }
      setRevision((r) => r + 1)
      const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      setMessage({ type: 'success', text: `已儲存訂餐 ${lines.length} 項，合計 $${total}` })
      return
    }
    const lines = namedMealRows
      .map((row) => {
        const sel = getMealSelection(row.mealKey)
        if (!sel) return null
        return {
          personId: row.personId,
          personName: row.personName,
          merchantId: sel.merchantId,
          merchantName: sel.merchantName,
          menuItemId: sel.menuItemId,
          menuItemName: sel.menuItemName,
          unitPrice: sel.unitPrice,
          quantity: 1
        }
      })
      .filter(Boolean)
    if (lines.length === 0) {
      setMessage({ type: 'error', text: '請至少為一位人員選擇餐點' })
      return
    }
    const res = saveNamedMealOrders({
      date,
      siteName,
      companyId: authenticatedCompany.id,
      companyName: authenticatedCompany.name,
      lines
    })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '訂餐失敗' })
      return
    }
    if (todayCompanyMealOrders.length > 0) {
      clearCompanyMealOrders({ date, siteName, companyId: authenticatedCompany.id })
    }
    setRevision((r) => r + 1)
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
    setMessage({ type: 'success', text: `已儲存 ${lines.length} 人訂餐，合計 $${total}` })
  }

  const cancelMealOrders = () => {
    if (!authenticatedCompany || !siteName) return
    const hasHeadcountOrders = todayCompanyMealOrders.length > 0 || mealRows.some((row) => row.mealKey)
    const hasNamedOrders = todayNamedMealOrders.length > 0 || namedMealRows.some((row) => row.mealKey)
    if (isHeadcountMealMode ? !hasHeadcountOrders : !hasNamedOrders) return
    if (!window.confirm('確定取消今日所有訂餐？')) return
    const res = isHeadcountMealMode
      ? clearCompanyMealOrders({ date, siteName, companyId: authenticatedCompany.id })
      : clearNamedMealOrders({ date, siteName, companyId: authenticatedCompany.id })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '取消失敗' })
      return
    }
    if (isHeadcountMealMode) setMealRows([newMealRow(`row-${Date.now()}`)])
    else {
      setNamedMealRows(
        activePersonnel.map((person) => ({ personId: person.id, personName: person.name, mealKey: '' }))
      )
    }
    setRevision((r) => r + 1)
    setMessage({ type: 'success', text: '已取消今日訂餐。' })
  }

  const mealOrderTotal = useMemo(() => {
    if (isHeadcountMealMode) {
      return mealRows.reduce((sum, row) => {
        const sel = mealOptions.find((o) => o.key === row.mealKey)
        if (!sel) return sum
        const qty = Math.max(1, Math.floor(Number(row.quantity) || 1))
        return sum + sel.unitPrice * qty
      }, 0)
    }
    return namedMealRows.reduce((sum, row) => {
      const sel = mealOptions.find((o) => o.key === row.mealKey)
      if (!sel) return sum
      return sum + sel.unitPrice
    }, 0)
  }, [mealRows, namedMealRows, mealOptions, isHeadcountMealMode])

  if (isInternalProxy && !internalLoggedIn) {
    return <Navigate to="/login" replace state={{ from: `/contractor-work?${searchParams.toString()}` }} />
  }

  if (!authenticatedCompanyId || !authenticatedCompany) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-cn-ink via-cn-lacquer to-cn-ink text-cn-parchment p-4 flex items-center justify-center"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-sm w-full">
          <div className="flex items-center justify-between gap-2 mb-6">
            <h1 className="text-xl font-bold text-teal-300 font-serif">
              {isInternalProxy ? '承攬商補登記' : '廠商登記入口'}
            </h1>
            <Link
              to={isInternalProxy ? '/calendar' : '/login'}
              className="text-cn-gold text-sm hover:text-amber-200 shrink-0 font-serif"
            >
              {isInternalProxy ? '回行事曆' : '回登入'}
            </Link>
          </div>
          <div className="bg-gradient-to-b from-cn-panel/95 to-cn-lacquer rounded-xl border border-cn-gold/40 p-5 shadow-xl">
            {isInternalProxy ? (
              <>
                <p className="text-violet-300 text-sm mb-1 font-medium">內部補登記（免代碼）</p>
                <p className="text-cn-mist text-sm mb-4">直接選擇承攬商，代為登記進出廠／訂餐。</p>
                <form onSubmit={selectCompanyInternal} className="space-y-4">
                  <div>
                    <label className="block text-cn-mist text-sm mb-1.5">日期</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-3 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-cn-mist text-sm mb-1.5">承攬商</label>
                    <select
                      value={pickCompanyId}
                      onChange={(e) => {
                        setPickCompanyId(e.target.value)
                        setCodeError('')
                      }}
                      className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-3 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      disabled={loading}
                    >
                      <option value="">— 請選擇承攬商 —</option>
                      {contractorOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.id}
                        </option>
                      ))}
                    </select>
                    {contractorOptions.length === 0 && !loading && (
                      <p className="text-gray-500 text-xs mt-2">尚無承攬商，請先至「承攬商資料登記」建立。</p>
                    )}
                    {codeError && <p className="text-red-400 text-sm mt-2">{codeError}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !pickCompanyId}
                    className="w-full min-h-[48px] rounded-md bg-gradient-to-r from-violet-600 to-violet-500 text-white font-semibold disabled:opacity-50"
                  >
                    {loading ? '同步中…' : '進入登記'}
                  </button>
                </form>
              </>
            ) : (
              <>
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
              </>
            )}
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
            <h1 className="text-xl sm:text-2xl font-bold text-teal-300 font-serif">
              {isInternalProxy ? '承攬商補登記' : '廠商登記入口'}
            </h1>
            <p className="text-cn-mist text-xs sm:text-sm mt-0.5">
              {isInternalProxy
                ? '內部代為登記（免代碼）'
                : activeView === 'menu'
                  ? '請選擇要辦理的事項'
                  : activeView === 'attendance'
                    ? '人員進離廠登記'
                    : '人員訂餐'}
            </p>
          </div>
          <Link
            to={isInternalProxy ? '/calendar' : '/login'}
            className="text-cn-gold text-sm hover:text-amber-200 shrink-0 font-serif"
          >
            {isInternalProxy ? '回行事曆' : '回登入'}
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
              <p className="text-teal-300/80 text-xs">
                承攬商{isInternalProxy ? '（內部補登記）' : ''}
              </p>
              <p className="text-white font-semibold text-lg">{m(authenticatedCompany.name)}</p>
            </div>
            <button
              type="button"
              onClick={logoutCode}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-500 text-gray-300 hover:bg-black/30"
            >
              {isInternalProxy ? '切換承攬商' : '重新輸入代碼'}
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
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border-2 border-cn-gold/70 bg-gradient-to-r from-amber-950/70 to-cn-panel/80 text-cn-gold hover:text-amber-100 hover:border-amber-300 hover:from-amber-900/80 hover:to-amber-950/60 active:scale-[0.98] active:bg-amber-900/90 transition-all duration-150 flex items-center justify-center gap-2 text-sm font-semibold shadow-md shadow-black/30 touch-manipulation"
            >
              <span className="text-base leading-none">←</span>
              <span>返回選單</span>
            </button>
          )}

          {activeView !== 'menu' && (
            <>
          <div>
            <p className="block text-cn-mist text-sm mb-1.5">日期</p>
            {isInternalProxy ? (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-3 py-2.5 text-cn-parchment tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            ) : (
              <p className="w-full bg-black/20 border border-cn-gold/25 rounded-md px-3 py-2.5 text-cn-parchment tabular-nums">
                {date.replace(/-/g, '/')}
              </p>
            )}
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

          {activeView === 'attendance' && companyAttendanceMode === 'named' && activePersonnel.length > 0 && (
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

          {activeView === 'attendance' && companyAttendanceMode === 'headcount' && siteName && (
            <div>
              <p className="text-amber-300 text-sm font-medium mb-2">人數登記</p>
              <div className="p-3 rounded-lg bg-black/25 border border-amber-800/40 space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">今日入場人數</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={headcountInput}
                    onChange={(e) => setHeadcountInput(e.target.value)}
                    disabled={!!headcountLog?.arrivalTime}
                    className="w-full bg-black/30 border border-gray-600 rounded-md px-3 py-2.5 text-white text-sm tabular-nums disabled:opacity-50"
                  />
                  {headcountLog?.arrivalTime && (
                    <p className="text-gray-500 text-xs mt-1">已進廠後不可修改人數，請聯絡管理員調整。</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`text-xs ${
                    !headcountLog?.arrivalTime
                      ? 'text-gray-500'
                      : !headcountLog?.departureTime
                        ? 'text-amber-300'
                        : 'text-green-400'
                  }`}>
                    {!headcountLog?.arrivalTime
                      ? '尚未進廠'
                      : !headcountLog?.departureTime
                        ? `進廠 ${headcountLog.arrivalTime}（${headcountLog.headcount || headcountInput} 人）`
                        : `${headcountLog.arrivalTime}～${headcountLog.departureTime}（${headcountLog.headcount} 人）`}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!!headcountLog?.arrivalTime}
                      onClick={() => openHeadcountTimeModal('in')}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      進廠
                    </button>
                    <button
                      type="button"
                      disabled={!headcountLog?.arrivalTime || !!headcountLog?.departureTime}
                      onClick={() => openHeadcountTimeModal('out')}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      離廠
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'attendance' && companyAttendanceMode === 'headcount' && !siteName && (
            <p className="text-gray-500 text-sm">請先選擇案場以進行人數登記。</p>
          )}

          {activeView === 'attendance' && companyAttendanceMode === 'named' && activePersonnel.length === 0 && !loading && (
            <p className="text-gray-500 text-sm">尚無可登記人員，請聯絡管理員建立人員名單。</p>
          )}

          {activeView === 'meal' && siteName && (
            <div className="pt-2 border-t border-gray-700/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-orange-300 text-sm font-medium">今日訂餐 · {m(siteName)}</p>
                {mealOptions.length > 0 && (isHeadcountMealMode || activePersonnel.length > 0) && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveMealOrders}
                      className="text-xs px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-600 text-white"
                    >
                      儲存訂餐
                    </button>
                    {(
                      isHeadcountMealMode
                        ? todayCompanyMealOrders.length > 0 || mealRows.some((row) => row.mealKey)
                        : todayNamedMealOrders.length > 0 || namedMealRows.some((row) => row.mealKey)
                    ) && (
                      <button
                        type="button"
                        onClick={cancelMealOrders}
                        className="text-xs px-3 py-1.5 rounded-md border border-gray-600 text-gray-300 hover:bg-black/30"
                      >
                        取消全部
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMealOrderModeChoice('named')}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    !isHeadcountMealMode
                      ? 'bg-orange-800/70 border-orange-500 text-orange-100'
                      : 'bg-black/25 border-gray-600 text-gray-300 hover:bg-black/40'
                  }`}
                >
                  實名制
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">每人選一項</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMealOrderModeChoice('headcount')}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    isHeadcountMealMode
                      ? 'bg-orange-800/70 border-orange-500 text-orange-100'
                      : 'bg-black/25 border-gray-600 text-gray-300 hover:bg-black/40'
                  }`}
                >
                  數量制
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">依餐點填數量</span>
                </button>
              </div>

              {mealOptions.length === 0 ? (
                <p className="text-gray-500 text-sm">此案場尚無可訂餐的商家，請至點餐系統設定。</p>
              ) : !isHeadcountMealMode && activePersonnel.length === 0 ? (
                <p className="text-gray-500 text-sm">尚無可訂餐人員，請聯絡管理員建立人員名單。</p>
              ) : isHeadcountMealMode ? (
                <div className="space-y-2">
                  {mealRows.map((row, index) => {
                    const sel = getMealSelection(row.mealKey)
                    const qty = Math.max(1, Math.floor(Number(row.quantity) || 1))
                    const amount = sel ? sel.unitPrice * qty : 0
                    return (
                      <div key={row.id} className="p-3 rounded-lg bg-black/25 border border-orange-800/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-400 text-xs">餐點 {index + 1}</span>
                          {mealRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMealRow(row.id)}
                              className="text-xs text-gray-400 hover:text-red-300"
                            >
                              移除
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_auto] gap-2 items-end">
                          <div>
                            <label className="block text-gray-400 text-xs mb-1">選擇餐點</label>
                            <select
                              value={row.mealKey}
                              onChange={(e) => updateMealRow(row.id, { mealKey: e.target.value })}
                              className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm"
                            >
                              <option value="">— 請選擇 —</option>
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
                              value={row.quantity}
                              onChange={(e) => updateMealRow(row.id, { quantity: e.target.value })}
                              disabled={!row.mealKey}
                              className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm tabular-nums disabled:opacity-40"
                            />
                          </div>
                          <div className="text-right sm:text-center">
                            <p className="text-gray-400 text-xs mb-1">金額</p>
                            <p className="text-amber-300 font-semibold tabular-nums">${amount || '—'}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={addMealRow}
                    className="w-full py-2.5 rounded-lg border border-dashed border-orange-700/60 text-orange-300 text-sm hover:bg-orange-950/30"
                  >
                    ＋ 新增餐點
                  </button>
                  <div className="flex justify-end pt-1">
                    <p className="text-sm text-gray-300">
                      合計 <span className="text-amber-300 font-semibold tabular-nums">${mealOrderTotal || 0}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayNamedMealOrders.length > 0 && (
                    <p className="text-green-400/90 text-xs">
                      已登記：{todayNamedMealOrders.map((o) => `${m(o.personName)} ${o.menuItemName}`).join('、')}
                    </p>
                  )}
                  {namedMealRows.map((row) => {
                    const sel = getMealSelection(row.mealKey)
                    return (
                      <div key={row.personId} className="p-3 rounded-lg bg-black/25 border border-orange-800/40 space-y-2">
                        <p className="text-white text-sm font-medium">{m(row.personName)}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                          <div>
                            <label className="block text-gray-400 text-xs mb-1">選擇餐點</label>
                            <select
                              value={row.mealKey}
                              onChange={(e) => updateNamedMealRow(row.personId, e.target.value)}
                              className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm"
                            >
                              <option value="">— 不訂餐 —</option>
                              {mealOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="text-right sm:text-center">
                            <p className="text-gray-400 text-xs mb-1">金額</p>
                            <p className="text-amber-300 font-semibold tabular-nums">${sel ? sel.unitPrice : '—'}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex justify-end pt-1">
                    <p className="text-sm text-gray-300">
                      合計 <span className="text-amber-300 font-semibold tabular-nums">${mealOrderTotal || 0}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'meal' && !siteName && (
            <p className="text-gray-500 text-sm">請先選擇案場以進行訂餐。</p>
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
              <div className="space-y-3 mb-4">
                <p className="text-amber-200 text-sm leading-relaxed px-1">
                  離場時請務必記得點擊離場按鈕
                </p>
                {isInternalProxy && (
                  <label className="flex items-start gap-2.5 rounded-lg border border-violet-600/50 bg-violet-950/30 px-3 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!timeModal.useStandardArrival}
                      onChange={(e) => setUseStandardArrival(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-violet-400 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-violet-100 text-sm leading-snug">
                      用 {CONTRACTOR_ON_TIME_CUTOFF} 上班登記為入場
                      <span className="block text-violet-300/80 text-xs mt-0.5">
                        勾選後入場時間記為 {CONTRACTOR_ON_TIME_CUTOFF}（內部補登）
                      </span>
                    </span>
                  </label>
                )}
              </div>
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
                {isInternalProxy && (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-lg border border-violet-600/50 bg-violet-950/30 px-3 py-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!timeModal.earlyDeparture}
                        onChange={(e) => setEarlyDeparture(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-violet-400 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-violet-100 text-sm leading-snug">
                        有提早離場人員
                        <span className="block text-violet-300/80 text-xs mt-0.5">
                          提早離場以 0.5 工計算（例：3 人中 1 人提早＝2.5 工）
                        </span>
                      </span>
                    </label>
                    {timeModal.earlyDeparture && timeModal.headcountMode && (Number(timeModal.headcount) || 1) > 1 && (
                      <div className="rounded-lg border border-violet-700/40 bg-black/20 px-3 py-2.5">
                        <label className="block text-violet-200 text-sm mb-2">提早離場人數</label>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(
                            { length: Math.max(1, Math.floor(Number(timeModal.headcount) || 1)) },
                            (_, i) => i + 1
                          ).map((n) => {
                            const hc = Math.max(1, Math.floor(Number(timeModal.headcount) || 1))
                            const preview = Math.round((hc - n * 0.5) * 10) / 10
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setEarlyDepartureCount(n)}
                                className={`min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium border tabular-nums ${
                                  Number(timeModal.earlyDepartureCount) === n
                                    ? 'bg-violet-700 border-violet-400 text-white'
                                    : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                                }`}
                              >
                                {n} 人 → {preview} 工
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-lg bg-gray-900/60 border border-gray-600 px-3 py-2">
                  <p className="text-gray-400 text-xs">離廠時間</p>
                  <p className="text-white font-semibold tabular-nums mt-0.5">
                    {isInternalProxy &&
                    timeModal.earlyDeparture &&
                    Number(timeModal.earlyDepartureCount || 0) >= Math.max(1, Number(timeModal.headcount) || 1)
                      ? `${CONTRACTOR_HALF_DAY_DEPARTURE}（全數半天）`
                      : `${CONTRACTOR_STANDARD_DEPARTURE}（固定）`}
                  </p>
                  {isInternalProxy &&
                    timeModal.earlyDeparture &&
                    timeModal.headcountMode &&
                    Number(timeModal.earlyDepartureCount || 0) > 0 &&
                    Number(timeModal.earlyDepartureCount || 0) < Math.max(1, Number(timeModal.headcount) || 1) && (
                      <p className="text-violet-300/90 text-xs mt-1">
                        提早 {Number(timeModal.earlyDepartureCount)} 人、其餘滿日 → 合計{' '}
                        {Math.round(
                          (Math.max(1, Number(timeModal.headcount) || 1) -
                            Number(timeModal.earlyDepartureCount) * 0.5) *
                            10
                        ) / 10}{' '}
                        工
                      </p>
                    )}
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
