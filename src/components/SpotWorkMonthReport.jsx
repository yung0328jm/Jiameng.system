import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { getSpotWorkSettleMap, setSpotWorkSiteSettled } from '../utils/spotWorkStorage'

function formatSiteStatNumber(n) {
  const x = Number(n) || 0
  if (!Number.isFinite(x)) return '0'
  const r = Math.round(x * 1000) / 1000
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r))
  return String(Math.round(r * 100) / 100).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function formatMd(dateStr) {
  const s = String(dateStr || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return s || '—'
  return `${Number(m[2])}/${Number(m[3])}`
}

function formatOvertimePlusHours(n) {
  const x = Number(n) || 0
  if (!Number.isFinite(x) || x <= 0) return ''
  const r = Math.round(x * 10) / 10
  if (Math.abs(r - Math.round(r)) < 1e-6) return `+${Math.round(r)}`
  const s = String(r)
  return s.endsWith('.0') ? `+${Math.round(r)}` : `+${s}`
}

export default function SpotWorkMonthReport({
  store,
  settleKey,
  year,
  month,
  title = '點工整月報表',
  hint = '',
  emptyText = '此月份尚無點工登記。',
  showMonthPicker = false,
  yearMonthValue = '',
  onYearMonthChange,
  defaultOpen = false,
  className = ''
}) {
  useRecordingMode()
  const [open, setOpen] = useState(() => !!defaultOpen)
  const [expanded, setExpanded] = useState(() => new Set())
  const [tick, setTick] = useState(0)

  const y = Number(year)
  const mo = Number(month)

  useRealtimeKeys([...(store?.syncKeys || []), settleKey].filter(Boolean), () => setTick((t) => t + 1))

  useEffect(() => {
    setExpanded(new Set())
  }, [y, mo])

  const report = useMemo(() => {
    void tick
    return store.getMonthReport(y, mo)
  }, [store, y, mo, tick])

  const settleMap = useMemo(() => {
    void tick
    return getSpotWorkSettleMap(y, mo, settleKey)
  }, [y, mo, settleKey, tick])

  const togglePerson = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className={`rounded-lg border border-fuchsia-700/45 bg-fuchsia-950/15 p-3 sm:p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
          aria-expanded={open}
        >
          <span className="text-fuchsia-400/90 text-xs tabular-nums w-3 shrink-0" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <h2 className="text-sm sm:text-base font-semibold text-fuchsia-300">{title}</h2>
          {!open && report.logCount > 0 && (
            <span className="text-[11px] text-fuchsia-200/80 font-mono tabular-nums truncate">
              {formatSiteStatNumber(report.totalWork)} 工
              {report.overtimeHours > 0 ? ` · 加班 ${formatSiteStatNumber(report.overtimeHours)}h` : ''}
            </span>
          )}
        </button>
        {showMonthPicker && (
          <input
            type="month"
            value={yearMonthValue}
            onChange={(e) => onYearMonthChange?.(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        )}
      </div>
      {open && hint ? <p className="text-gray-400 text-[11px] sm:text-xs mt-1 mb-3">{hint}</p> : null}
      {open && (report.logCount === 0 ? (
        <p className="text-gray-500 text-sm">{emptyText}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] sm:text-sm">
            <div className="rounded border border-fuchsia-800/50 bg-gray-900/50 px-3 py-2">
              <span className="text-gray-400">總工 </span>
              <span className="font-mono font-semibold text-fuchsia-200 tabular-nums">
                {formatSiteStatNumber(report.totalWork)} 工
              </span>
            </div>
            <div className="rounded border border-fuchsia-800/50 bg-gray-900/50 px-3 py-2">
              <span className="text-gray-400">加班 </span>
              <span className="font-mono font-semibold text-red-400 tabular-nums">
                {formatSiteStatNumber(report.overtimeHours)} 小時
              </span>
            </div>
            <div className="rounded border border-fuchsia-800/50 bg-gray-900/50 px-3 py-2">
              <span className="text-gray-400">登記筆數 </span>
              <span className="font-mono font-semibold text-gray-200 tabular-nums">{report.logCount}</span>
            </div>
            {report.unnamedDays > 0 && (
              <div className="rounded border border-fuchsia-800/50 bg-gray-900/50 px-3 py-2">
                <span className="text-gray-400">未具名 </span>
                <span className="font-mono font-semibold text-amber-200 tabular-nums">
                  {formatSiteStatNumber(report.unnamedDays)} 工
                </span>
              </div>
            )}
          </div>

          <h3 className="text-xs sm:text-sm font-medium text-fuchsia-200/90 mb-2">案場合計</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] sm:text-sm mb-4">
            {report.sites.map((s) => (
              <div
                key={s.siteName}
                className="flex justify-between gap-2 rounded border border-fuchsia-800/40 bg-gray-900/50 px-2 py-1.5"
                title={(s.people || []).map((p) => `${p.groupName} · ${p.name} ${p.days}工`).join('\n')}
              >
                <span className="text-yellow-400 truncate min-w-0">{m(s.siteName)}</span>
                <span className="shrink-0 flex flex-col items-end font-mono tabular-nums leading-tight">
                  <span className="text-fuchsia-200">{formatSiteStatNumber(s.workDays)} 工</span>
                  {s.overtimeHours > 0 && (
                    <span className="text-red-400 text-[10px] font-medium">
                      {formatOvertimePlusHours(s.overtimeHours)}h
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {report.groups.map((g) => (
            <div key={g.groupId} className="mb-4 last:mb-0 rounded border border-gray-700 bg-gray-900/40 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-gray-700 bg-gray-900/60">
                <span className="text-fuchsia-100 font-medium text-sm">{m(g.groupName)}</span>
                <span className="text-xs font-mono tabular-nums text-gray-300">
                  {formatSiteStatNumber(g.workDays)} 工
                  {g.overtimeHours > 0 ? (
                    <span className="text-red-400 ml-2">加班 {formatSiteStatNumber(g.overtimeHours)} 小時</span>
                  ) : null}
                </span>
              </div>
              <div className="px-1 pb-1">
                <div className="flex text-[11px] sm:text-xs text-gray-500 px-2 pt-1.5 pb-1">
                  <span className="flex-1">姓名</span>
                  <span className="w-16 text-right shrink-0">工</span>
                  <span className="w-20 text-right shrink-0">加班</span>
                </div>
                {g.people.map((p) => {
                  const personKey = `${g.groupId}\0${p.name}`
                  const open = expanded.has(personKey)
                  const sites = Array.isArray(p.sites) ? p.sites : []
                  return (
                    <div key={p.name} className="border-t border-gray-800/80">
                      <button
                        type="button"
                        onClick={() => togglePerson(personKey)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-800/60"
                        aria-expanded={open}
                      >
                        <span className="flex-1 min-w-0 text-white text-[11px] sm:text-sm truncate">{m(p.name)}</span>
                        <span className="w-16 text-right shrink-0 font-mono tabular-nums text-fuchsia-200 text-[11px] sm:text-sm">
                          {formatSiteStatNumber(p.days)}
                        </span>
                        <span className="w-20 text-right shrink-0 font-mono tabular-nums text-red-400 text-[11px] sm:text-sm">
                          {p.overtimeHours > 0 ? `${formatSiteStatNumber(p.overtimeHours)} 小時` : '—'}
                        </span>
                      </button>
                      {open && (
                        <ul className="list-none m-0 px-2 pb-2 space-y-1">
                          {sites.length === 0 ? (
                            <li className="text-gray-500 text-[11px] sm:text-sm py-1">無案場明細</li>
                          ) : (
                            sites.map((st) => {
                              const dateStr = String(st.date || '').slice(0, 10)
                              const settleCell = `${g.groupId}|${p.name}|${st.siteName}|${dateStr}`
                              const settled = settleMap[settleCell] === 'settled'
                              return (
                                <li
                                  key={`${st.siteName}|${dateStr}`}
                                  className="flex items-center justify-between gap-2 text-[11px] sm:text-sm border-b border-gray-800/60 last:border-0 pb-1 last:pb-0"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="shrink-0 font-mono tabular-nums text-gray-400 w-10 sm:w-12">
                                      {formatMd(dateStr)}
                                    </span>
                                    <span className="truncate text-yellow-400">{m(st.siteName)}</span>
                                    <select
                                      value={settled ? 'settled' : 'open'}
                                      onChange={(e) => {
                                        const res = setSpotWorkSiteSettled(
                                          y,
                                          mo,
                                          g.groupId,
                                          p.name,
                                          st.siteName,
                                          e.target.value === 'settled',
                                          settleKey,
                                          dateStr
                                        )
                                        if (!res.success) {
                                          alert(res.message || '儲存失敗')
                                          return
                                        }
                                        setTick((t) => t + 1)
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] sm:text-xs ${
                                        settled
                                          ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300'
                                          : 'border-amber-700/60 bg-amber-950/40 text-amber-200'
                                      }`}
                                      aria-label={`${m(st.siteName)} ${formatMd(dateStr)} 結算狀態`}
                                    >
                                      <option value="open">未結</option>
                                      <option value="settled">已結</option>
                                    </select>
                                  </span>
                                  <span className="shrink-0 font-mono tabular-nums text-right">
                                    <span className="text-fuchsia-200/90">{formatSiteStatNumber(st.days)} 天</span>
                                    {st.overtimeHours > 0 && (
                                      <span className="text-red-400 font-medium ml-1.5">
                                        {formatOvertimePlusHours(st.overtimeHours)}h
                                      </span>
                                    )}
                                  </span>
                                </li>
                              )
                            })
                          )}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      ))}
    </div>
  )
}
