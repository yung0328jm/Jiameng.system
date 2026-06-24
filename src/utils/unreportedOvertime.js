/**
 * 本人「應申報但未申報」的緊急入場（進廠管制表：有緊急入場時數、尚無 pending/approved 申報）
 */
import { getDisplayNamesForAccount } from './dropdownStorage'
import { getOvertimeApplicationsByWorkReportRowId } from './overtimeApplicationStorage'
import {
  getWorkReports,
  getWorkReportRowShiftSummary,
  parseWorkReportBaseName,
  formatWorkReportHours
} from './workReportStorage'

const DEFAULT_REMIND_DAYS = 14

function rowHasSubmittedApplication(rowId) {
  const id = String(rowId || '').trim()
  if (!id) return false
  const apps = getOvertimeApplicationsByWorkReportRowId(id)
  return apps.some((a) => {
    const s = String(a?.status || 'pending').trim()
    return s === 'pending' || s === 'approved'
  })
}

function rowBelongsToUser(row, account, nameSet) {
  const accLower = String(account || '').trim().toLowerCase()
  const submitter = String(row?.submittedBy || '').trim().toLowerCase()
  if (submitter && submitter === accLower) return true

  const person = String(row?.personName || '').trim()
  const base = parseWorkReportBaseName(person)
  for (const n of nameSet) {
    const t = String(n || '').trim()
    if (!t) continue
    if (person === t || base === t) return true
  }
  return false
}

/**
 * @param {string} account
 * @param {{ days?: number }} [opts]
 * @returns {Array<{ rowId: string, date: string, siteName: string, personName: string, overtimeHours: number }>}
 */
export function getUnreportedOvertimeItems(account, opts = {}) {
  const acc = String(account || '').trim()
  if (!acc) return []

  const days = Number(opts.days) > 0 ? Number(opts.days) : DEFAULT_REMIND_DAYS
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const aliases = (getDisplayNamesForAccount(acc) || []).map((x) => String(x || '').trim()).filter(Boolean)
  const nameSet = new Set([acc, ...aliases])

  const items = []
  const seen = new Set()

  for (const row of getWorkReports()) {
    const date = String(row?.date || '').slice(0, 10)
    if (!date || date < cutoffStr) continue
    if (!rowBelongsToUser(row, acc, nameSet)) continue

    const rowId = String(row?.id || '').trim()
    if (!rowId || seen.has(rowId)) continue

    const summary = getWorkReportRowShiftSummary(row)
    const ot = Number(summary?.totalOvertimeHours ?? summary?.perPersonOvertimeHours ?? 0)
    if (!summary?.hasOvertime || ot <= 0) continue
    if (rowHasSubmittedApplication(rowId)) continue

    seen.add(rowId)
    items.push({
      rowId,
      date,
      siteName: String(row?.siteName || '').trim(),
      personName: String(row?.personName || '').trim(),
      overtimeHours: ot
    })
  }

  return items.sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return a.siteName.localeCompare(b.siteName, 'zh-Hant')
  })
}

export function getUnreportedOvertimeCount(account, opts) {
  return getUnreportedOvertimeItems(account, opts).length
}

export function formatUnreportedOvertimeLabel(item) {
  if (!item) return ''
  const h = formatWorkReportHours(item.overtimeHours)
  return `${item.date} ${item.siteName} · ${item.personName} · ${h} 小時`
}
