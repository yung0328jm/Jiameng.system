import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  getWorkReportsForMonth,
  getWorkReportRowShiftSummary,
  getWorkReportStatsPersonKey,
  formatWorkReportHours,
  isWorkReportContractorName
} from '../utils/workReportStorage'
import {
  getPayRate,
  setPayRate,
  getBonus,
  setBonus,
  calcPayAmount,
  getAllPayRates,
  getAllBonuses,
  DEFAULT_PAY_RATE,
  NIGHT_MEAL_OT_THRESHOLD_HOURS
} from '../utils/paySlipStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  getDropdownOptionsByCategory,
  getDisplayNamesForAccount,
  findBoundAccountForDisplayName
} from '../utils/dropdownStorage'
import { getUsers } from '../utils/storage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { getOvertimeApplications } from '../utils/overtimeApplicationStorage'

const round1 = (x) => Math.round(Number(x) * 10) / 10

function formatMoney(n) {
  const x = Number(n) || 0
  return x.toLocaleString('zh-Hant-TW', { maximumFractionDigits: 2 })
}

/** 取得所有在職成員顯示名（participants + responsible_persons，排除 resigned） */
function getActiveMemberNames() {
  const users = getUsers() || []
  const resignedAccounts = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.account || '').trim()).filter(Boolean)
  )
  const resignedNames = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.name || '').trim()).filter(Boolean)
  )
  resignedAccounts.forEach((acc) => {
    ;(getDisplayNamesForAccount(acc) || []).forEach((n) => {
      const t = String(n || '').trim()
      if (t) resignedNames.add(t)
    })
  })

  const isResigned = (name) => {
    const t = String(name || '').trim()
    if (!t) return true
    if (resignedNames.has(t) || resignedAccounts.has(t)) return true
    const bound = findBoundAccountForDisplayName(t)
    if (bound && resignedAccounts.has(bound)) return true
    return false
  }

  const seen = new Set()
  const out = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t) || isResigned(t)) return
    seen.add(t)
    out.push(t)
  }
  ;(getDropdownOptionsByCategory('participants') || []).forEach((opt) => add(opt?.value))
  ;(getDropdownOptionsByCategory('responsible_persons') || []).forEach((opt) => add(opt?.value))
  out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return out
}

function buildApprovedWorkReportOvertimeMap() {
  const map = new Map()
  ;(getOvertimeApplications() || []).forEach((app) => {
    if (String(app?.status || '').trim() !== 'approved') return
    const rowId = String(app?.workReportRowId || '').trim()
    if (!rowId) return
    const hours = Number(app?.hours) || 0
    if (hours <= 0) return
    map.set(rowId, (map.get(rowId) || 0) + hours)
  })
  return map
}

/** 將月份內所有出工紀錄依「統計人名」彙整成每人 { fullDays, overtimeHours, underHours, rows } */
function buildPersonStatsMap(monthRecords) {
  const map = new Map()
  const approvedOvertimeByRowId = buildApprovedWorkReportOvertimeMap()
  monthRecords.forEach((row) => {
    const person = getWorkReportStatsPersonKey(row?.personName)
    if (!person) return
    const shift = getWorkReportRowShiftSummary(row)
    if (!shift) return
    const approvedOvertimeHours = round1(approvedOvertimeByRowId.get(String(row?.id || '').trim()) || 0)
    const prev = map.get(person) || {
      personName: person,
      isContractor: isWorkReportContractorName(row?.personName),
      fullDays: 0,
      overtimeHours: 0,
      underHours: 0,
      otHoursByDate: new Map(),
      rows: []
    }
    prev.fullDays += shift.fullDayHeadcount || 0
    prev.overtimeHours += approvedOvertimeHours
    prev.underHours += shift.underActualHours || 0
    const dateStr = String(row?.date || '').slice(0, 10)
    if (dateStr && approvedOvertimeHours > 0) {
      prev.otHoursByDate.set(
        dateStr,
        round1((prev.otHoursByDate.get(dateStr) || 0) + approvedOvertimeHours)
      )
    }
    prev.rows.push({ row, shift, approvedOvertimeHours })
    map.set(person, prev)
  })
  // 四捨五入＋未滿時數累計補日（每滿 8 小時 → 出工 +1 天）
  map.forEach((v) => {
    v.overtimeHours = round1(v.overtimeHours)
    let nightMealQualifyingDays = 0
    ;(v.otHoursByDate || new Map()).forEach((hrs) => {
      if (hrs >= NIGHT_MEAL_OT_THRESHOLD_HOURS) nightMealQualifyingDays += 1
    })
    v.nightMealQualifyingDays = nightMealQualifyingDays
    delete v.otHoursByDate
    const totalUnder = round1(v.underHours)
    const carryDays = Math.floor((totalUnder + 1e-9) / 8)
    const remain = round1(Math.max(0, totalUnder - carryDays * 8))
    v.baseDays = v.fullDays
    v.carryDays = carryDays
    v.fullDays = v.fullDays + carryDays
    v.underHours = remain
    v.rawUnderHours = totalUnder
  })
  return map
}

function NumberField({ label, value, onChange, suffix, step = 1, hint }) {
  return (
    <label className="block">
      <span className="text-gray-400 text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white tabular-nums"
        />
        {suffix && <span className="text-gray-500 text-xs whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <div className="text-gray-500 text-[10px] mt-0.5">{hint}</div>}
    </label>
  )
}

function PaySlip() {
  useRecordingMode()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthRecords, setMonthRecords] = useState([])
  const [memberNames, setMemberNames] = useState([])
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  const [openIds, setOpenIds] = useState({})
  const [editingRate, setEditingRate] = useState({})
  const [editingBonus, setEditingBonus] = useState({})
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState(null)
  const [showZero, setShowZero] = useState(true)

  const refetch = useCallback(() => {
    setUserRole(getCurrentUserRole())
    setCurrentUser(getCurrentUser() || '')
    setMonthRecords(getWorkReportsForMonth(year, month))
    setMemberNames(getActiveMemberNames())
    setRevision((v) => v + 1)
  }, [year, month])

  useRealtimeKeys(
    [
      'jiameng_work_reports',
      'jiameng_overtime_applications',
      'jiameng_pay_rates',
      'jiameng_pay_bonuses',
      'jiameng_dropdown_options',
      'jiameng_users'
    ],
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

  const isAdmin = userRole === 'admin'
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  const selfDisplayNames = useMemo(() => {
    if (!currentUser) return []
    try {
      return (getDisplayNamesForAccount(currentUser) || []).filter(Boolean)
    } catch {
      return [currentUser]
    }
  }, [currentUser])

  const statsMap = useMemo(() => buildPersonStatsMap(monthRecords), [monthRecords])

  /** 完整人員清單：在職成員 ∪ 本月有紀錄的人（包含包商） */
  const fullPersonList = useMemo(() => {
    const set = new Set(memberNames)
    statsMap.forEach((v) => set.add(v.personName))
    return [...set]
  }, [memberNames, statsMap])

  /** 套用權限：admin 全部；user 只看自己 */
  const visiblePersons = useMemo(() => {
    const list = fullPersonList.filter((name) => {
      if (isAdmin) return true
      return selfDisplayNames.includes(name)
    })
    list.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    return list
  }, [fullPersonList, isAdmin, selfDisplayNames])

  /** 依顯示條件過濾（顯示無資料的成員與否） */
  const personRows = useMemo(() => {
    void revision
    return visiblePersons
      .map((name) => {
        const s = statsMap.get(name)
        const stats = s
          ? {
              fullDays: s.fullDays,
              overtimeHours: s.overtimeHours,
              underHours: s.underHours,
              nightMealQualifyingDays: s.nightMealQualifyingDays || 0,
              rows: s.rows,
              isContractor: s.isContractor
            }
          : {
              fullDays: 0,
              overtimeHours: 0,
              underHours: 0,
              nightMealQualifyingDays: 0,
              rows: [],
              isContractor: false
            }
        const rate = getPayRate(name)
        const bonus = getBonus(name, yearMonth)
        const amounts = calcPayAmount(stats, rate, bonus)
        return { personName: name, stats, rate, bonus, amounts }
      })
      .filter((p) => showZero || p.stats.fullDays || p.stats.overtimeHours || p.stats.underHours || p.amounts.total)
      .sort((a, b) => {
        const bd = (b.stats.fullDays || 0) - (a.stats.fullDays || 0)
        if (bd !== 0) return bd
        return a.personName.localeCompare(b.personName, 'zh-Hant')
      })
  }, [visiblePersons, statsMap, yearMonth, showZero, revision])

  const grandTotal = useMemo(() => {
    let day = 0
    let under = 0
    let ot = 0
    let meal = 0
    let nightMeal = 0
    let insur = 0
    let bonus = 0
    personRows.forEach((p) => {
      day += p.amounts.dayAmount
      under += p.amounts.underAmount
      ot += p.amounts.overtimeAmount
      meal += p.amounts.mealAmount
      nightMeal += p.amounts.nightMealAmount
      insur += p.amounts.insuranceAmount
      bonus += p.amounts.bonusAmount
    })
    const total = day + under + ot + meal + nightMeal + insur + bonus
    return { day, under, ot, meal, nightMeal, insur, bonus, total }
  }, [personRows])

  const startEditRate = (name) => {
    const r = getPayRate(name)
    setEditingRate((prev) => ({
      ...prev,
      [name]: {
        dailyRate: String(r.dailyRate || ''),
        overtimeMultiplier: String(r.overtimeMultiplier ?? DEFAULT_PAY_RATE.overtimeMultiplier),
        mealAllowancePerDay: String(r.mealAllowancePerDay ?? DEFAULT_PAY_RATE.mealAllowancePerDay),
        nightMealAllowancePerDay: String(
          r.nightMealAllowancePerDay ?? DEFAULT_PAY_RATE.nightMealAllowancePerDay
        ),
        insuranceSubsidyPerDay: String(r.insuranceSubsidyPerDay ?? DEFAULT_PAY_RATE.insuranceSubsidyPerDay)
      }
    }))
  }

  const cancelEditRate = (name) => {
    setEditingRate((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const saveEditRate = (name) => {
    const d = editingRate[name] || {}
    const result = setPayRate(name, {
      dailyRate: Number(d.dailyRate) || 0,
      overtimeMultiplier: Number(d.overtimeMultiplier) || 0,
      mealAllowancePerDay: Number(d.mealAllowancePerDay) || 0,
      nightMealAllowancePerDay: Number(d.nightMealAllowancePerDay) || 0,
      insuranceSubsidyPerDay: Number(d.insuranceSubsidyPerDay) || 0
    })
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '儲存失敗' })
      return
    }
    cancelEditRate(name)
    setRevision((v) => v + 1)
    setMessage({ type: 'success', text: `已儲存 ${name} 的費用參數` })
  }

  const startEditBonus = (name) => {
    const v = getBonus(name, yearMonth)
    setEditingBonus((prev) => ({ ...prev, [name]: String(v || '') }))
  }
  const cancelEditBonus = (name) => {
    setEditingBonus((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }
  const saveEditBonus = (name) => {
    const v = Number(editingBonus[name]) || 0
    const result = setBonus(name, yearMonth, v)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '儲存失敗' })
      return
    }
    cancelEditBonus(name)
    setRevision((v) => v + 1)
    setMessage({ type: 'success', text: `已儲存 ${name} 的 ${yearMonth} 品質獎勵金` })
  }

  const toggleOpen = (name) => setOpenIds((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <div className="max-w-6xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">勞務報酬單</h1>
        <p className="text-gray-400 text-sm mt-1">
          依出工回報統計＋每人費用參數計算月度勞務報酬。夜間誤餐雜支費：當日已核准緊急入場達{' '}
          {NIGHT_MEAL_OT_THRESHOLD_HOURS} 小時以上計 1 日。所有數字可由管理員自行設定。
          {!isAdmin && '（一般使用者僅顯示自己的紀錄）'}
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
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6 space-y-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-gray-400 text-xs mb-1">年</label>
              <input
                type="number"
                min={2020}
                max={2035}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
                className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">月</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                  <option key={mo} value={mo}>{mo} 月</option>
                ))}
              </select>
            </div>
            <div className="text-gray-400 text-xs ml-2">
              月份：<span className="text-white tabular-nums">{yearMonth}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <label className="flex items-center gap-1 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={(e) => setShowZero(e.target.checked)}
                />
                顯示無出工成員
              </label>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
            >
              列印 / 匯出 PDF
            </button>
          </div>
        </div>

        {isAdmin && personRows.length > 0 && (
          <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 px-3 py-3">
            <h3 className="text-sm font-medium text-cyan-300 mb-2">{yearMonth} 全部人員合計</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 tabular-nums">
              <div>
                <div className="text-gray-400 text-xs">出勤基本工程款</div>
                <div className="text-amber-200 font-semibold">${formatMoney(grandTotal.day)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">未滿時段工程款</div>
                <div className="text-orange-300 font-semibold">${formatMoney(grandTotal.under)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">緊急追加服務費</div>
                <div className="text-red-300 font-semibold">${formatMoney(grandTotal.ot)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">誤餐雜支費</div>
                <div className="text-amber-200 font-semibold">${formatMoney(grandTotal.meal)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">夜間誤餐雜支費</div>
                <div className="text-violet-300 font-semibold">${formatMoney(grandTotal.nightMeal)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">風險管理補貼</div>
                <div className="text-amber-200 font-semibold">${formatMoney(grandTotal.insur)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">完工品質獎勵金</div>
                <div className="text-cyan-300 font-semibold">${formatMoney(grandTotal.bonus)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">總計</div>
                <div className="text-emerald-300 text-lg font-bold">${formatMoney(grandTotal.total)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {personRows.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-8 text-center text-gray-400">
          {isAdmin ? '無人員資料' : `${yearMonth} 尚無屬於您的紀錄`}
        </div>
      ) : (
        <div className="space-y-4">
          {personRows.map((p) => {
            const { personName, stats, rate, bonus, amounts } = p
            const isOpen = !!openIds[personName]
            const isEditingRate = !!editingRate[personName]
            const isEditingBonus = personName in editingBonus
            const rateMissing = !rate.dailyRate
            const hourly = rate.dailyRate ? rate.dailyRate / 8 : 0
            return (
              <div
                key={personName}
                className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6"
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-white">{m(personName)}</h2>
                    {stats.isContractor && (
                      <span className="text-teal-300 text-xs bg-teal-900/40 border border-teal-700/50 px-1.5 py-0.5 rounded">
                        包商
                      </span>
                    )}
                    {rateMissing && (
                      <span className="text-orange-300 text-xs bg-orange-900/30 border border-orange-700/50 px-1.5 py-0.5 rounded">
                        未設費用參數
                      </span>
                    )}
                    {stats.fullDays === 0 && stats.underHours === 0 && stats.overtimeHours === 0 && (
                      <span className="text-gray-400 text-xs bg-gray-700/40 border border-gray-600 px-1.5 py-0.5 rounded">
                        本月無出工
                      </span>
                    )}
                  </div>
                  <div className="text-emerald-300 text-xl font-bold tabular-nums">
                    ${formatMoney(amounts.total)}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 左：出工統計 + 計算明細 */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">出工天</div>
                        <div className="text-amber-200 font-semibold">{stats.fullDays} 天</div>
                      </div>
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">緊急入場時數</div>
                        <div className="text-red-300 font-semibold">
                          {formatWorkReportHours(stats.overtimeHours)} 小時
                        </div>
                      </div>
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">未滿時數</div>
                        <div className="text-orange-300 font-semibold">
                          {formatWorkReportHours(stats.underHours)} 小時
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-3 space-y-1.5 tabular-nums text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-300">案場出勤基本工程款</span>
                        <span className="text-amber-200">
                          {stats.fullDays} × ${formatMoney(rate.dailyRate)} =
                          <span className="ml-1 font-semibold">${formatMoney(amounts.dayAmount)}</span>
                        </span>
                      </div>
                      {stats.underHours > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-300">未滿時段工程款</span>
                          <span className="text-orange-300">
                            {formatWorkReportHours(stats.underHours)} × ${formatMoney(hourly)} =
                            <span className="ml-1 font-semibold">${formatMoney(amounts.underAmount)}</span>
                          </span>
                        </div>
                      )}
                      {stats.overtimeHours > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-300">緊急追加服務費</span>
                          <span className="text-red-300">
                            {formatWorkReportHours(stats.overtimeHours)} × ${formatMoney(hourly)} × {rate.overtimeMultiplier} =
                            <span className="ml-1 font-semibold">${formatMoney(amounts.overtimeAmount)}</span>
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-300">案場誤餐雜支費</span>
                        <span className="text-amber-200">
                          滿日 {stats.fullDays} × ${formatMoney(rate.mealAllowancePerDay)}
                          {stats.underHours > 0 && (
                            <> ＋未滿 {formatWorkReportHours(stats.underHours)} × ${formatMoney(rate.mealAllowancePerDay / 8)}</>
                          )} =
                          <span className="ml-1 font-semibold">${formatMoney(amounts.mealAmount)}</span>
                        </span>
                      </div>
                      {(stats.nightMealQualifyingDays > 0 || amounts.nightMealAmount > 0) && (
                        <div className="flex justify-between">
                          <span className="text-gray-300">夜間誤餐雜支費</span>
                          <span className="text-violet-200">
                            {stats.nightMealQualifyingDays} 日（當日核准緊急入場 ≥
                            {NIGHT_MEAL_OT_THRESHOLD_HOURS}h）× ${formatMoney(rate.nightMealAllowancePerDay)} =
                            <span className="ml-1 font-semibold">${formatMoney(amounts.nightMealAmount)}</span>
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-300">外包商風險管理補貼</span>
                        <span className="text-amber-200">
                          滿日 {stats.fullDays} × ${formatMoney(rate.insuranceSubsidyPerDay)}
                          {stats.underHours > 0 && (
                            <> ＋未滿 {formatWorkReportHours(stats.underHours)} × ${formatMoney(rate.insuranceSubsidyPerDay / 8)}</>
                          )} =
                          <span className="ml-1 font-semibold">${formatMoney(amounts.insuranceAmount)}</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">案場完工品質獎勵金</span>
                        <span className="text-cyan-300 font-semibold">${formatMoney(amounts.bonusAmount)}</span>
                      </div>
                      <div className="border-t border-emerald-700/40 pt-1 flex justify-between">
                        <span className="text-gray-200">合計</span>
                        <span className="text-emerald-300 font-bold">${formatMoney(amounts.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 右：費用參數 + 獎勵金（admin 可編） */}
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">費用參數</div>
                        {isAdmin && !isEditingRate && (
                          <button
                            type="button"
                            onClick={() => startEditRate(personName)}
                            className="text-cyan-300 hover:text-cyan-200 text-xs"
                          >
                            {rateMissing ? '＋ 設定' : '編輯'}
                          </button>
                        )}
                      </div>
                      {isAdmin && isEditingRate ? (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <NumberField
                            label="出勤基本工程款（日）"
                            suffix="元"
                            value={editingRate[personName]?.dailyRate || ''}
                            onChange={(v) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [personName]: { ...prev[personName], dailyRate: v }
                              }))
                            }
                          />
                          <NumberField
                            label="緊急追加服務倍率"
                            step={0.05}
                            value={editingRate[personName]?.overtimeMultiplier || ''}
                            onChange={(v) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [personName]: { ...prev[personName], overtimeMultiplier: v }
                              }))
                            }
                            hint="緊急追加服務費 = 出勤基本工程款 / 8 × 倍率 × 緊急入場小時"
                          />
                          <NumberField
                            label="誤餐雜支費（滿日）"
                            suffix="元/天"
                            value={editingRate[personName]?.mealAllowancePerDay || ''}
                            onChange={(v) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [personName]: { ...prev[personName], mealAllowancePerDay: v }
                              }))
                            }
                            hint="未滿日按比例 X/8 × 時數"
                          />
                          <NumberField
                            label="夜間誤餐雜支費"
                            suffix="元/日"
                            value={editingRate[personName]?.nightMealAllowancePerDay || ''}
                            onChange={(v) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [personName]: { ...prev[personName], nightMealAllowancePerDay: v }
                              }))
                            }
                            hint={`當日已核准緊急入場 ≥ ${NIGHT_MEAL_OT_THRESHOLD_HOURS} 小時計 1 日`}
                          />
                          <NumberField
                            label="風險管理補貼（滿日）"
                            suffix="元/天"
                            value={editingRate[personName]?.insuranceSubsidyPerDay || ''}
                            onChange={(v) =>
                              setEditingRate((prev) => ({
                                ...prev,
                                [personName]: { ...prev[personName], insuranceSubsidyPerDay: v }
                              }))
                            }
                            hint="未滿日按比例，當日最高 X 元"
                          />
                          <div className="col-span-2 flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => saveEditRate(personName)}
                              className="text-xs px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                            >
                              儲存
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelEditRate(personName)}
                              className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                          <div>
                            <div className="text-gray-400">出勤基本工程款</div>
                            <div className="text-white">${formatMoney(rate.dailyRate)} / 日</div>
                          </div>
                          <div>
                            <div className="text-gray-400">追加服務倍率</div>
                            <div className="text-white">×{rate.overtimeMultiplier}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">誤餐雜支（滿日）</div>
                            <div className="text-white">${formatMoney(rate.mealAllowancePerDay)} / 天</div>
                          </div>
                          <div>
                            <div className="text-gray-400">夜間誤餐雜支</div>
                            <div className="text-white">${formatMoney(rate.nightMealAllowancePerDay)} / 日</div>
                            <div className="text-gray-500 text-[10px] mt-0.5">
                              當日核准緊急入場 ≥ {NIGHT_MEAL_OT_THRESHOLD_HOURS}h
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400">風險管理（滿日）</div>
                            <div className="text-white">${formatMoney(rate.insuranceSubsidyPerDay)} / 天</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">本月案場完工品質獎勵金（{yearMonth}）</div>
                        {isAdmin && !isEditingBonus && (
                          <button
                            type="button"
                            onClick={() => startEditBonus(personName)}
                            className="text-cyan-300 hover:text-cyan-200 text-xs"
                          >
                            {bonus > 0 ? '編輯' : '＋ 設定'}
                          </button>
                        )}
                      </div>
                      {isAdmin && isEditingBonus ? (
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <NumberField
                              label="品質獎勵金"
                              suffix="元"
                              value={editingBonus[personName] ?? ''}
                              onChange={(v) =>
                                setEditingBonus((prev) => ({ ...prev, [personName]: v }))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => saveEditBonus(personName)}
                            className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                          >
                            儲存
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEditBonus(personName)}
                            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="text-cyan-300 text-base font-semibold tabular-nums">
                          ${formatMoney(bonus)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {stats.rows.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => toggleOpen(personName)}
                      className="text-cyan-300 hover:text-cyan-200 text-xs"
                    >
                      {isOpen ? '收合明細 ▲' : `查看 ${stats.rows.length} 筆出工明細 ▼`}
                    </button>
                  </div>
                )}

                {isOpen && stats.rows.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm border-collapse min-w-[520px]">
                      <thead>
                        <tr className="border-b border-gray-600 text-left text-gray-400">
                          <th className="py-2 pr-3 font-medium">日期</th>
                          <th className="py-2 pr-3 font-medium">案場</th>
                          <th className="py-2 pr-3 font-medium">時間</th>
                          <th className="py-2 pr-3 font-medium text-right">當日狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.rows
                          .slice()
                          .sort((a, b) =>
                            String(a.row?.date || '').localeCompare(String(b.row?.date || ''))
                          )
                          .map(({ row, shift, approvedOvertimeHours }) => {
                            const isFull = (shift?.fullDayHeadcount || 0) > 0
                            const ot = approvedOvertimeHours || 0
                            const under = shift?.underActualHours || 0
                            const headcount = shift?.headcount || 1
                            return (
                              <tr key={row.id} className="border-b border-gray-700/60">
                                <td className="py-1.5 pr-3 text-gray-300 tabular-nums">
                                  {String(row?.date || '').slice(0, 10)}
                                </td>
                                <td className="py-1.5 pr-3 text-gray-200">{m(row?.siteName) || '—'}</td>
                                <td className="py-1.5 pr-3 text-cyan-200 tabular-nums text-xs">
                                  {row?.arrivalTime || ''}–{row?.departureTime || ''}
                                  {headcount > 1 && (
                                    <span className="ml-1 text-teal-300/80">×{headcount}</span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-right tabular-nums">
                                  {isFull && (
                                    <span className="text-amber-200">
                                      滿 8 小時{headcount > 1 ? `（${headcount} 人）` : ''}
                                    </span>
                                  )}
                                  {ot > 0 && (
                                    <span className="text-red-300 ml-1">
                                      ＋緊急入場時數 {formatWorkReportHours(ot)} 小時
                                    </span>
                                  )}
                                  {!isFull && under > 0 && (
                                    <span className="text-orange-300">
                                      {formatWorkReportHours(
                                        shift.underPerPersonHours || under
                                      )}{' '}
                                      小時{headcount > 1 ? `（${headcount} 人）` : ''}
                                    </span>
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
            )
          })}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3 text-gray-300 text-xs leading-relaxed">
        <span className="text-gray-400">備註：</span>
        本明細為雙方共同確認之承攬勞務報酬及追加工程款核銷記錄，雙方無雇傭關係，各項款項依約案件／按日結算。
      </div>
    </div>
  )
}

export default PaySlip
