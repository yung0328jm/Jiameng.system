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
  suggestRatesFromDaily,
  calcPayAmount,
  getAllPayRates
} from '../utils/paySlipStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

const round1 = (x) => Math.round(Number(x) * 10) / 10
const round2 = (x) => Math.round(Number(x) * 100) / 100

function formatMoney(n) {
  const x = Number(n) || 0
  return x.toLocaleString('zh-Hant-TW', { maximumFractionDigits: 2 })
}

function buildPersonStats(monthRecords, personNameFilter = null) {
  const map = new Map()
  monthRecords.forEach((row) => {
    const person = getWorkReportStatsPersonKey(row?.personName)
    if (!person) return
    if (personNameFilter && person !== personNameFilter) return
    const shift = getWorkReportRowShiftSummary(row)
    if (!shift) return
    const prev = map.get(person) || {
      personName: person,
      isContractor: isWorkReportContractorName(row?.personName),
      fullDays: 0,
      overtimeHours: 0,
      underHours: 0,
      rows: []
    }
    prev.fullDays += shift.fullDayHeadcount || 0
    prev.overtimeHours += shift.totalOvertimeHours || 0
    prev.underHours += shift.underActualHours || 0
    prev.rows.push({ row, shift })
    map.set(person, prev)
  })
  const list = [...map.values()].map((agg) => {
    const totalUnder = round1(agg.underHours)
    const carryDays = Math.floor((totalUnder + 1e-9) / 8)
    const remainUnder = round1(Math.max(0, totalUnder - carryDays * 8))
    return {
      ...agg,
      fullDays: agg.fullDays + carryDays,
      baseDays: agg.fullDays,
      carryDays,
      overtimeHours: round1(agg.overtimeHours),
      underHours: remainUnder,
      rawUnderHours: totalUnder
    }
  })
  list.sort(
    (a, b) =>
      b.fullDays - a.fullDays ||
      b.overtimeHours - a.overtimeHours ||
      a.personName.localeCompare(b.personName, 'zh-Hant')
  )
  return list
}

function PaySlip() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthRecords, setMonthRecords] = useState([])
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  const [openIds, setOpenIds] = useState({})
  const [editing, setEditing] = useState({})
  const [ratesRevision, setRatesRevision] = useState(0)
  const [message, setMessage] = useState(null)

  const refetch = useCallback(() => {
    setUserRole(getCurrentUserRole())
    setCurrentUser(getCurrentUser() || '')
    setMonthRecords(getWorkReportsForMonth(year, month))
    setRatesRevision((v) => v + 1)
  }, [year, month])

  useRealtimeKeys(['jiameng_work_reports', 'jiameng_pay_rates', 'jiameng_dropdown_options', 'jiameng_users'], refetch)

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const isAdmin = userRole === 'admin'

  const selfDisplayNames = useMemo(() => {
    if (!currentUser) return []
    try {
      return (getDisplayNamesForAccount(currentUser) || []).filter(Boolean)
    } catch {
      return [currentUser]
    }
  }, [currentUser])

  const allPersonStats = useMemo(
    () => buildPersonStats(monthRecords),
    [monthRecords]
  )

  const personStats = useMemo(() => {
    if (isAdmin) return allPersonStats
    return allPersonStats.filter((p) => selfDisplayNames.includes(p.personName))
  }, [allPersonStats, isAdmin, selfDisplayNames])

  const ratesByPerson = useMemo(() => {
    const all = getAllPayRates()
    void ratesRevision
    return all
  }, [ratesRevision])

  const monthLabel = `${year}-${String(month).padStart(2, '0')}`

  const grandTotal = useMemo(() => {
    let dayAmt = 0
    let otAmt = 0
    let uhAmt = 0
    personStats.forEach((p) => {
      const rate = getPayRate(p.personName)
      const a = calcPayAmount(p, rate)
      dayAmt += a.dayAmount
      otAmt += a.overtimeAmount
      uhAmt += a.underAmount
    })
    return {
      dayAmount: round2(dayAmt),
      overtimeAmount: round2(otAmt),
      underAmount: round2(uhAmt),
      total: round2(dayAmt + otAmt + uhAmt)
    }
  }, [personStats, ratesByPerson])

  const startEdit = (personName) => {
    const r = getPayRate(personName)
    setEditing((prev) => ({
      ...prev,
      [personName]: {
        dailyRate: String(r.dailyRate || ''),
        overtimeHourRate: String(r.overtimeHourRate || ''),
        underHourRate: String(r.underHourRate || '')
      }
    }))
  }

  const cancelEdit = (personName) => {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[personName]
      return next
    })
  }

  const saveEdit = (personName) => {
    const draft = editing[personName] || {}
    const r = {
      dailyRate: Number(draft.dailyRate) || 0,
      overtimeHourRate: Number(draft.overtimeHourRate) || 0,
      underHourRate: Number(draft.underHourRate) || 0
    }
    const result = setPayRate(personName, r)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '儲存失敗' })
      return
    }
    cancelEdit(personName)
    setRatesRevision((v) => v + 1)
    setMessage({ type: 'success', text: `已儲存 ${personName} 的薪資設定` })
  }

  const autoFillFromDaily = (personName) => {
    const draft = editing[personName] || {}
    const d = Number(draft.dailyRate) || 0
    const suggested = suggestRatesFromDaily(d)
    setEditing((prev) => ({
      ...prev,
      [personName]: {
        dailyRate: String(suggested.dailyRate || ''),
        overtimeHourRate: String(suggested.overtimeHourRate || ''),
        underHourRate: String(suggested.underHourRate || '')
      }
    }))
  }

  const toggleOpen = (personName) =>
    setOpenIds((prev) => ({ ...prev, [personName]: !prev[personName] }))

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="max-w-6xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">勞務報酬單</h1>
        <p className="text-gray-400 text-sm mt-1">
          依出工回報資料計算月度勞務報酬：日薪 × 出工天 ＋ 加班時薪 × 加班時數 ＋ 未滿時薪 × 出工剩餘時數。
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
              月份：<span className="text-white tabular-nums">{monthLabel}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
            >
              列印 / 匯出 PDF
            </button>
          </div>
        </div>

        {isAdmin && personStats.length > 0 && (
          <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 px-3 py-3">
            <h3 className="text-sm font-medium text-cyan-300 mb-2">{monthLabel} 全部人員合計</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
              <div>
                <div className="text-gray-400 text-xs">出工金額</div>
                <div className="text-amber-200 text-base font-semibold">
                  ${formatMoney(grandTotal.dayAmount)}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">加班金額</div>
                <div className="text-red-300 text-base font-semibold">
                  ${formatMoney(grandTotal.overtimeAmount)}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">未滿時數金額</div>
                <div className="text-orange-300 text-base font-semibold">
                  ${formatMoney(grandTotal.underAmount)}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">總計</div>
                <div className="text-emerald-300 text-lg font-bold">
                  ${formatMoney(grandTotal.total)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {personStats.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-8 text-center text-gray-400">
          {isAdmin
            ? `${monthLabel} 尚無任何出工紀錄`
            : `${monthLabel} 尚無屬於您的出工紀錄`}
        </div>
      ) : (
        <div className="space-y-4">
          {personStats.map((p) => {
            const rate = getPayRate(p.personName)
            const amounts = calcPayAmount(p, rate)
            const isOpen = !!openIds[p.personName]
            const isEditing = !!editing[p.personName]
            const draft = editing[p.personName] || {
              dailyRate: String(rate.dailyRate || ''),
              overtimeHourRate: String(rate.overtimeHourRate || ''),
              underHourRate: String(rate.underHourRate || '')
            }
            const rateMissing =
              !rate.dailyRate && !rate.overtimeHourRate && !rate.underHourRate
            return (
              <div
                key={p.personName}
                className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-white">{p.personName}</h2>
                      {p.isContractor && (
                        <span className="text-teal-300 text-xs bg-teal-900/40 border border-teal-700/50 px-1.5 py-0.5 rounded">
                          包商
                        </span>
                      )}
                      {rateMissing && (
                        <span className="text-orange-300 text-xs bg-orange-900/30 border border-orange-700/50 px-1.5 py-0.5 rounded">
                          未設薪資
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm tabular-nums">
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">出工天</div>
                        <div className="text-amber-200 font-semibold">{p.fullDays} 天</div>
                        {p.carryDays > 0 && (
                          <div className="text-cyan-300/80 text-[10px] mt-0.5">
                            含未滿補 {p.carryDays} 天
                          </div>
                        )}
                      </div>
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">加班時數</div>
                        <div className="text-red-300 font-semibold">
                          {formatWorkReportHours(p.overtimeHours)} 小時
                        </div>
                      </div>
                      <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5">
                        <div className="text-gray-400 text-xs">出工時數</div>
                        <div className="text-orange-300 font-semibold">
                          {formatWorkReportHours(p.underHours)} 小時
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:w-72 shrink-0">
                    <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">薪資設定</div>
                        {isAdmin && !isEditing && (
                          <button
                            type="button"
                            onClick={() => startEdit(p.personName)}
                            className="text-cyan-300 hover:text-cyan-200 text-xs"
                          >
                            {rateMissing ? '＋ 設定' : '編輯'}
                          </button>
                        )}
                      </div>

                      {isAdmin && isEditing ? (
                        <div className="space-y-2 text-sm">
                          <label className="block">
                            <span className="text-gray-400 text-xs">日薪</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draft.dailyRate}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.personName]: {
                                    ...prev[p.personName],
                                    dailyRate: e.target.value
                                  }
                                }))
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white tabular-nums"
                            />
                          </label>
                          <label className="block">
                            <span className="text-gray-400 text-xs">加班時薪</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draft.overtimeHourRate}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.personName]: {
                                    ...prev[p.personName],
                                    overtimeHourRate: e.target.value
                                  }
                                }))
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white tabular-nums"
                            />
                          </label>
                          <label className="block">
                            <span className="text-gray-400 text-xs">未滿時薪</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draft.underHourRate}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.personName]: {
                                    ...prev[p.personName],
                                    underHourRate: e.target.value
                                  }
                                }))
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white tabular-nums"
                            />
                          </label>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => autoFillFromDaily(p.personName)}
                              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                              title="加班時薪 = 日薪/8×1.5；未滿時薪 = 日薪/8"
                            >
                              依日薪推算
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(p.personName)}
                              className="text-xs px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                            >
                              儲存
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelEdit(p.personName)}
                              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                          <div>
                            <div className="text-gray-400">日薪</div>
                            <div className="text-white">${formatMoney(rate.dailyRate)}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">加班時薪</div>
                            <div className="text-white">${formatMoney(rate.overtimeHourRate)}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">未滿時薪</div>
                            <div className="text-white">${formatMoney(rate.underHourRate)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
                    <div>
                      <div className="text-gray-400 text-xs">出工金額</div>
                      <div className="text-amber-200 text-sm font-semibold">
                        ${formatMoney(amounts.dayAmount)}
                        <span className="text-gray-500 text-[10px] ml-1">
                          ({p.fullDays} × ${formatMoney(rate.dailyRate)})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">加班金額</div>
                      <div className="text-red-300 text-sm font-semibold">
                        ${formatMoney(amounts.overtimeAmount)}
                        <span className="text-gray-500 text-[10px] ml-1">
                          ({formatWorkReportHours(p.overtimeHours)} × ${formatMoney(rate.overtimeHourRate)})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">未滿金額</div>
                      <div className="text-orange-300 text-sm font-semibold">
                        ${formatMoney(amounts.underAmount)}
                        <span className="text-gray-500 text-[10px] ml-1">
                          ({formatWorkReportHours(p.underHours)} × ${formatMoney(rate.underHourRate)})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">合計</div>
                      <div className="text-emerald-300 text-lg font-bold">
                        ${formatMoney(amounts.total)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toggleOpen(p.personName)}
                    className="text-cyan-300 hover:text-cyan-200 text-xs"
                  >
                    {isOpen ? '收合明細 ▲' : `查看 ${p.rows.length} 筆明細 ▼`}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 overflow-x-auto">
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
                        {p.rows
                          .slice()
                          .sort((a, b) =>
                            String(a.row?.date || '').localeCompare(String(b.row?.date || ''))
                          )
                          .map(({ row, shift }) => {
                            const isFull = (shift?.fullDayHeadcount || 0) > 0
                            const ot = shift?.totalOvertimeHours || 0
                            const under = shift?.underActualHours || 0
                            const headcount = shift?.headcount || 1
                            return (
                              <tr key={row.id} className="border-b border-gray-700/60">
                                <td className="py-1.5 pr-3 text-gray-300 tabular-nums">
                                  {String(row?.date || '').slice(0, 10)}
                                </td>
                                <td className="py-1.5 pr-3 text-gray-200">{row?.siteName || '—'}</td>
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
                                      ＋加班 {formatWorkReportHours(ot)} 小時
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
    </div>
  )
}

export default PaySlip
