import { useMemo, useState, useCallback } from 'react'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { getOvertimeApplications } from '../utils/overtimeApplicationStorage'
import { getSchedules } from '../utils/scheduleStorage'
import {
  OVERTIME_COMPENSATION_CHOICE_KEY,
  getOvertimeCompensationMode,
  setOvertimeCompensationMode,
  clearOvertimeCompensationMode
} from '../utils/overtimeCompensationChoiceStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function normalizeYmd(d) {
  return String(d || '').trim().replace(/\//g, '-')
}

function todayYmd() {
  const n = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

/** 與個人績效「加班明細」一致：是否為該用戶相關之加班單，並回傳用於儲存選擇的 personLabel */
function resolvePersonLabelForUser(oa, namesToMatch) {
  const personnelList = (Array.isArray(oa.overtimePersonnel) ? oa.overtimePersonnel : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (personnelList.length > 0) {
    const hit = personnelList.find((p) => namesToMatch.some((n) => p === n))
    return hit || ''
  }
  const applicant = String(oa.applicant || '').trim()
  if (applicant && namesToMatch.some((n) => applicant === n)) return applicant
  return ''
}

export default function CompensatoryLeave() {
  const [onlyDay, setOnlyDay] = useState(true)
  const [filterDay, setFilterDay] = useState(todayYmd)
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => setTick((t) => t + 1), [])
  useRealtimeKeys(['jiameng_overtime_applications', OVERTIME_COMPENSATION_CHOICE_KEY], bump)

  const rows = useMemo(() => {
    void tick
    const account = String(getCurrentUser() || '').trim()
    if (!account) return []
    const primary = getDisplayNameForAccount(account)
    const aliases = getDisplayNamesForAccount(account) || []
    const namesToMatch = Array.from(new Set([account, primary, ...aliases].map((s) => String(s || '').trim()).filter(Boolean)))

    const schedules = getSchedules() || []
    const byId = new Map(schedules.map((s) => [String(s?.id || ''), s]))

    const list = (getOvertimeApplications() || []).filter((oa) => String(oa?.status || '').trim() === 'approved')
    const out = []

    list.forEach((oa) => {
      const personLabel = resolvePersonLabelForUser(oa, namesToMatch)
      if (!personLabel) return
      const dateStr = normalizeYmd(oa.date)
      if (!dateStr) return
      const sid = String(oa.scheduleId || '').trim()
      const schedule = byId.get(sid)
      if (!schedule) return
      const siteName = schedule?.siteName || schedule?.segments?.[0]?.siteName || '—'
      const hours = oa.hours != null && oa.hours !== '' ? Number(oa.hours) : null
      out.push({
        id: oa.id,
        dateStr,
        siteName,
        startTime: String(oa.startTime || '').trim() || '—',
        endTime: String(oa.endTime || '').trim() || '—',
        hours,
        applicant: String(oa.applicant || '').trim() || '—',
        personLabel
      })
    })

    out.sort((a, b) => {
      const c = (b.dateStr || '').localeCompare(a.dateStr || '')
      if (c !== 0) return c
      return String(b.id).localeCompare(String(a.id))
    })

    if (onlyDay) {
      const f = normalizeYmd(filterDay)
      return out.filter((r) => r.dateStr === f)
    }
    return out
  }, [tick, onlyDay, filterDay])

  const stats = useMemo(() => {
    void tick
    let compHours = 0
    let payCount = 0
    let unset = 0
    rows.forEach((r) => {
      const mode = getOvertimeCompensationMode(r.id, r.personLabel)
      if (mode === 'comp_leave') {
        if (r.hours != null && !Number.isNaN(r.hours)) compHours += r.hours
      } else if (mode === 'pay') {
        payCount += 1
      } else {
        unset += 1
      }
    })
    return { compHours, payCount, unset }
  }, [rows, tick])

  const onPick = (row, mode) => {
    const cur = getOvertimeCompensationMode(row.id, row.personLabel)
    if (cur === mode) {
      clearOvertimeCompensationMode(row.id, row.personLabel)
    } else {
      setOvertimeCompensationMode(row.id, row.personLabel, mode)
    }
    bump()
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment">
      <div className="rounded-xl border border-cn-gold/30 bg-black/25 p-4 sm:p-5 mb-4">
        <h2 className="text-lg font-bold text-cn-gold font-serif tracking-wide mb-1">補休／加班費登記</h2>
        <p className="text-cn-mist text-sm leading-relaxed">
          此處列出與您相關且<strong className="text-cn-parchment/90">已核准</strong>的加班申請（與行事曆同步）。請逐筆選擇要<strong className="text-amber-200/95">領加班費</strong>或<strong className="text-emerald-200/95">轉為補休時數</strong>；再次點選可取消、改回未選。
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm text-cn-mist">
          <span>日期</span>
          <input
            type="date"
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value || todayYmd())}
            className="bg-black/35 border border-cn-gold/30 rounded-lg px-3 py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-amber-700/50 min-h-[44px]"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-cn-parchment cursor-pointer select-none min-h-[44px]">
          <input
            type="checkbox"
            checked={onlyDay}
            onChange={(e) => setOnlyDay(e.target.checked)}
            className="w-4 h-4 rounded border-cn-gold/40"
          />
          僅顯示此日期
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5 text-sm">
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/25 px-3 py-2">
          <div className="text-cn-mist text-xs">已選補休（合計時數）</div>
          <div className="text-emerald-200 font-semibold tabular-nums">{stats.compHours.toFixed(1)} 小時</div>
        </div>
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2">
          <div className="text-cn-mist text-xs">已選領加班費（筆數）</div>
          <div className="text-amber-200 font-semibold tabular-nums">{stats.payCount} 筆</div>
        </div>
        <div className="rounded-lg border border-cn-gold/25 bg-black/20 px-3 py-2">
          <div className="text-cn-mist text-xs">尚未選擇</div>
          <div className="text-cn-parchment font-semibold tabular-nums">{stats.unset} 筆</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-cn-gold/20 bg-black/20 px-4 py-10 text-center text-cn-mist">
          {onlyDay ? '此日期沒有與您相關的已核准加班紀錄。' : '目前沒有與您相關的已核准加班紀錄（或對應排程已刪除）。'}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const mode = getOvertimeCompensationMode(r.id, r.personLabel)
            const hText = r.hours != null && !Number.isNaN(r.hours) ? `${r.hours} 小時` : '—'
            return (
              <li
                key={`${r.id}-${r.personLabel}`}
                className="rounded-xl border border-cn-gold/25 bg-gradient-to-br from-black/30 to-cn-lacquer/40 px-4 py-3 sm:px-5 sm:py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                  <span className="text-cn-gold font-semibold font-mono tabular-nums">{r.dateStr}</span>
                  <span className="text-cn-parchment font-medium">{r.siteName}</span>
                </div>
                <div className="text-sm text-cn-mist space-y-0.5 mb-3">
                  <div>
                    時間：{r.startTime} ～ {r.endTime}（{hText}）
                  </div>
                  <div>申請人：{r.applicant}</div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={mode === 'pay'}
                      onChange={() => onPick(r, 'pay')}
                      className="w-5 h-5 rounded border-cn-gold/40 shrink-0"
                    />
                    <span className="text-amber-100/95">領加班費</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={mode === 'comp_leave'}
                      onChange={() => onPick(r, 'comp_leave')}
                      className="w-5 h-5 rounded border-cn-gold/40 shrink-0"
                    />
                    <span className="text-emerald-100/95">紀錄補休時數</span>
                  </label>
                </div>
                {mode === 'comp_leave' && r.hours != null && !Number.isNaN(r.hours) && (
                  <p className="mt-2 text-xs text-emerald-300/90">此筆將計入補休 <span className="font-semibold tabular-nums">{r.hours}</span> 小時（與加班單時數一致）。</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
