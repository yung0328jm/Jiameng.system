import {
  getWorkReportRowShiftSummary,
  getWorkReportStatsPersonKey,
  isWorkReportContractorName
} from './workReportStorage'
import { NIGHT_MEAL_OT_THRESHOLD_HOURS } from './paySlipStorage'
import { getOvertimeApplications } from './overtimeApplicationStorage'

const round1 = (x) => Math.round(Number(x) * 10) / 10

export function buildApprovedWorkReportOvertimeMap() {
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
export function buildPersonStatsMap(monthRecords) {
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
