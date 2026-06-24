import {
  calcWorkReportHoursBreakdown,
  formatWorkReportHours,
  HOURS_PER_DAY
} from '../utils/workReportStorage'

/** 承攬商出工：扣午休、滿 8 小時＝1 工、超過為緊急入場 */
export function ContractorWorkHoursDetail({ log, className = '' }) {
  const arr = String(log?.arrivalTime || '').trim()
  const dep = String(log?.departureTime || '').trim()

  if (!arr) {
    return <span className={`text-gray-500 text-xs ${className}`}>—</span>
  }
  if (!dep) {
    return <span className={`text-amber-300 text-xs ${className}`}>待離廠，尚無法計算工時</span>
  }

  const bd = calcWorkReportHoursBreakdown(arr, dep)
  if (!bd) {
    return <span className={`text-gray-500 text-xs ${className}`}>時間格式無法計算</span>
  }

  const isFullDay = bd.totalHours >= HOURS_PER_DAY - 1e-6

  return (
    <div className={`text-xs space-y-1 tabular-nums ${className}`}>
      <div className="text-gray-400">
        進離廠 {arr}～{dep}
        {bd.hasLunchDeduct && (
          <span className="text-gray-500"> · 午休 −{formatWorkReportHours(bd.lunchDeductHours)}h</span>
        )}
      </div>
      <div className="text-gray-300">
        扣午休後工時{' '}
        <span className="text-white font-semibold">{formatWorkReportHours(bd.totalHours)}</span> 小時
      </div>
      {isFullDay ? (
        <div className="text-amber-200 font-semibold">滿 8 小時 → 1 工</div>
      ) : (
        <div className="text-orange-300">未滿 8 小時（{formatWorkReportHours(bd.totalHours)} 小時，不計 1 工）</div>
      )}
      {bd.hasOvertime && (
        <div className="text-red-400 font-semibold">
          緊急入場 {formatWorkReportHours(bd.overtimeHours)} 小時
        </div>
      )}
    </div>
  )
}

export function ContractorWorkHoursSummaryLine({ summary, className = '' }) {
  if (!summary || !summary.totalHeadcount) {
    return <span className={`text-gray-500 text-xs ${className}`}>—</span>
  }
  const full = summary.fullDayHeadcount || 0
  const under = summary.underHeadcount || 0
  const ot = summary.totalOvertimeHours || 0

  return (
    <div className={`text-xs space-y-0.5 tabular-nums ${className}`}>
      {full > 0 && (
        <div className="text-amber-200">
          滿 8 小時（1 工）<strong className="font-semibold"> {full}</strong> 人
        </div>
      )}
      {under > 0 && (
        <div className="text-orange-300">
          未滿 8 小時 <strong>{under}</strong> 人（共 {formatWorkReportHours(summary.underActualHours)} 小時）
        </div>
      )}
      {summary.hasOvertime && (
        <div className="text-red-400 font-medium">
          緊急入場合計 {formatWorkReportHours(ot)} 小時
        </div>
      )}
      {full > 0 && !summary.hasOvertime && under === 0 && (
        <div className="text-gray-500">無緊急入場</div>
      )}
    </div>
  )
}
