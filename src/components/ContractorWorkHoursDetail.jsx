import { formatWorkReportHours } from '../utils/workReportStorage'
import {
  getContractorEmergencyHours,
  isContractorLate,
  isContractorEarlyDeparture,
  getContractorEarlyDepartureCount,
  getContractorWorkDaysFromLog
} from '../utils/contractorWorkCheckInStorage'

/** 承攬商出工：滿日 1 工、提早離場每人 0.5 工；超過 08:00 進廠標示遲到；緊急入場僅採加班申請時數 */
export function ContractorWorkHoursDetail({ log, className = '' }) {
  const arr = String(log?.arrivalTime || '').trim()
  const dep = String(log?.departureTime || '').trim()
  const otStatus = String(log?.overtimeStatus || 'none').trim()
  const otReq = Number(log?.overtimeRequestHours) || 0
  const otApproved = Number(log?.approvedOvertimeHours) || 0
  const emergencyHours = getContractorEmergencyHours(log)
  const late = isContractorLate(arr)
  const early = isContractorEarlyDeparture(log)
  const earlyCount = getContractorEarlyDepartureCount(log)
  const headcount = Math.max(1, Number(log?.headcount) || 1)
  const workDays = getContractorWorkDaysFromLog(log)
  const fullCount = Math.max(0, headcount - earlyCount)

  if (!arr) {
    return <span className={`text-gray-500 text-xs ${className}`}>—</span>
  }
  if (!dep) {
    return (
      <div className={`text-xs space-y-1 ${className}`}>
        <span className="text-amber-300">待離廠，尚無法計算工時</span>
        {late && <div className="text-rose-300 font-semibold">遲到（進廠 {arr}）</div>}
      </div>
    )
  }

  return (
    <div className={`text-xs space-y-1 tabular-nums ${className}`}>
      {log?.registrationMode === 'headcount' && (
        <div className="text-violet-300 font-medium">人數登記 {headcount} 人</div>
      )}
      <div className="text-gray-400">進離廠 {arr}～{dep}</div>
      {late && <div className="text-rose-300 font-semibold">遲到（超過 08:00 進廠）</div>}
      {early && (
        <div className="text-orange-300 font-medium">
          提早離場 {earlyCount} 人（0.5 工）
          {fullCount > 0 ? `、滿日 ${fullCount} 人` : ''}
        </div>
      )}
      <div className="text-amber-200 font-semibold">出工 → {workDays} 工</div>
      {emergencyHours > 0 && (
        <div className="text-red-400 font-semibold">
          緊急入場 {formatWorkReportHours(emergencyHours)} 小時
        </div>
      )}
      {otStatus === 'pending' && otReq > 0 && (
        <div className="text-amber-300 font-semibold">
          加班申請 {formatWorkReportHours(otReq)} 小時（待審核）
        </div>
      )}
      {otStatus === 'approved' && otApproved > 0 && (
        <div className="text-emerald-300">
          已核准加班 {formatWorkReportHours(otApproved)} 小時
        </div>
      )}
      {otStatus === 'rejected' && otReq > 0 && (
        <div className="text-gray-500">加班申請 {formatWorkReportHours(otReq)} 小時（已駁回）</div>
      )}
    </div>
  )
}

export function ContractorWorkHoursSummaryLine({ summary, className = '' }) {
  if (!summary || !summary.totalHeadcount) {
    return <span className={`text-gray-500 text-xs ${className}`}>—</span>
  }
  const full = summary.fullDayHeadcount || 0
  const ot = summary.totalOvertimeHours || 0
  const late = summary.lateHeadcount || 0

  return (
    <div className={`text-xs space-y-0.5 tabular-nums ${className}`}>
      {full > 0 && (
        <div className="text-amber-200">
          出工合計 <strong className="font-semibold">{full}</strong> 工
        </div>
      )}
      {late > 0 && (
        <div className="text-rose-300">
          遲到 <strong>{late}</strong> 人
        </div>
      )}
      {summary.hasOvertime && (
        <div className="text-red-400 font-medium">
          緊急入場合計 {formatWorkReportHours(ot)} 小時
        </div>
      )}
      {full > 0 && !summary.hasOvertime && late === 0 && (
        <div className="text-gray-500">無緊急入場</div>
      )}
    </div>
  )
}
