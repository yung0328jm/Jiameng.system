import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../utils/authStorage'
import { getDropdownOptionsByCategory } from '../utils/dropdownStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import {
  SPOT_WORK_STORAGE_KEY,
  getSpotWorkLogs,
  getSpotWorkLogByDate,
  upsertSpotWorkLog,
  deleteSpotWorkLog
} from '../utils/spotWorkStorage'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rosterNames() {
  const seen = new Set()
  const out = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  ;(getDropdownOptionsByCategory('participants') || []).forEach((o) => add(o?.value))
  ;(getDropdownOptionsByCategory('responsible_persons') || []).forEach((o) => add(o?.value))
  out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return out
}

export default function SpotWorkLog() {
  const { enabled: recording } = useRecordingMode()
  const [date, setDate] = useState(todayDateStr)
  const [names, setNames] = useState([])
  const [count, setCount] = useState('')
  const [note, setNote] = useState('')
  const [customName, setCustomName] = useState('')
  const [logs, setLogs] = useState(() => getSpotWorkLogs())
  const [message, setMessage] = useState(null)
  const [roster, setRoster] = useState(() => rosterNames())

  const loadDate = useCallback((d) => {
    const rec = getSpotWorkLogByDate(d)
    setDate(d)
    setNames(rec?.names ? [...rec.names] : [])
    setCount(rec ? String(rec.count ?? '') : '')
    setNote(rec?.note || '')
  }, [])

  const refetch = useCallback(() => {
    setLogs(getSpotWorkLogs())
    setRoster(rosterNames())
    loadDate(date)
  }, [date, loadDate])

  useRealtimeKeys([SPOT_WORK_STORAGE_KEY, 'jiameng_dropdown_options'], refetch)

  useEffect(() => {
    loadDate(date)
  }, [date, loadDate])

  const extraNames = useMemo(
    () => names.filter((n) => !roster.includes(n)),
    [names, roster]
  )

  const toggleName = (name) => {
    const t = String(name || '').trim()
    if (!t) return
    setNames((prev) => {
      const has = prev.includes(t)
      const next = has ? prev.filter((x) => x !== t) : [...prev, t]
      setCount((c) => {
        const n = Math.floor(Number(c) || 0)
        if (!has && n < next.length) return String(next.length)
        return c
      })
      return next
    })
  }

  const addCustom = () => {
    const t = customName.trim()
    if (!t) return
    toggleName(t)
    setCustomName('')
  }

  const save = () => {
    const result = upsertSpotWorkLog({
      date,
      names,
      count,
      note,
      createdBy: getCurrentUser() || ''
    })
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '儲存失敗' })
      return
    }
    setLogs(getSpotWorkLogs())
    setCount(String(result.record.count))
    setMessage({ type: 'success', text: `已記錄 ${date}：${result.record.count} 人` })
  }

  const removeDay = () => {
    if (!getSpotWorkLogByDate(date)) return
    if (!window.confirm(`確定刪除 ${date} 的點工紀錄？`)) return
    const result = deleteSpotWorkLog(date)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '刪除失敗' })
      return
    }
    setNames([])
    setCount('')
    setNote('')
    setLogs(getSpotWorkLogs())
    setMessage({ type: 'success', text: `已刪除 ${date}` })
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment">
      <h1 className="text-xl sm:text-2xl font-bold text-cn-gold font-serif mb-1">點工紀錄系統</h1>
      <p className="text-cn-mist text-sm mb-4">記錄當天出工有誰、幾個人。不在導覽列，由窗花連點進入。</p>

      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-200'
              : 'border-red-600/50 bg-red-950/30 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span>{message.text}</span>
            <button type="button" className="text-xs text-gray-400" onClick={() => setMessage(null)}>
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-cn-gold/35 bg-cn-panel/40 p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-cn-mist text-xs">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayDateStr())}
              className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </label>
          <label className="block">
            <span className="text-cn-mist text-xs">出工人數</span>
            <input
              type="number"
              min={0}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="幾個人"
              className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white tabular-nums"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-cn-mist text-xs">出工有誰（可勾選）</span>
            <span className="text-amber-200 text-xs tabular-nums">已選 {names.length} 人</span>
          </div>
          {names.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {names.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleName(n)}
                  className="text-xs px-2 py-1 rounded-full bg-amber-900/40 border border-amber-600/50 text-amber-100"
                >
                  {recording ? m(n) : n} ×
                </button>
              ))}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/40 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {roster.map((n) => {
              const on = names.includes(n)
              return (
                <label
                  key={n}
                  className={`flex items-center gap-1.5 text-sm px-2 py-1.5 rounded cursor-pointer ${
                    on ? 'bg-amber-900/35 text-amber-100' : 'text-gray-300 hover:bg-gray-800/80'
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggleName(n)} className="accent-amber-500" />
                  <span className="truncate">{recording ? m(n) : n}</span>
                </label>
              )
            })}
            {roster.length === 0 && (
              <p className="col-span-full text-gray-500 text-sm px-2 py-3">尚無名單，可在下方自行輸入</p>
            )}
          </div>
          {extraNames.map((n) => (
            <p key={n} className="text-[11px] text-gray-500 mt-1">
              名單外：{recording ? m(n) : n}
            </p>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
              placeholder="輸入姓名後新增"
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
            <button
              type="button"
              onClick={addCustom}
              className="shrink-0 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white"
            >
              新增
            </button>
          </div>
        </div>

        <label className="block">
          <span className="text-cn-mist text-xs">備註（可空）</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            className="px-4 py-2 rounded-md bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold text-sm"
          >
            儲存當天紀錄
          </button>
          <button
            type="button"
            onClick={removeDay}
            className="px-4 py-2 rounded-md border border-rose-800/60 text-rose-300 text-sm hover:bg-rose-950/30"
          >
            刪除這天
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-gray-700 bg-gray-900/30 p-4">
        <h2 className="text-sm font-semibold text-cn-gold mb-2">近期紀錄</h2>
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm">還沒有點工紀錄</p>
        ) : (
          <ul className="space-y-1">
            {logs.slice(0, 31).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => loadDate(r.date)}
                  className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-gray-800/80 ${
                    r.date === date ? 'bg-amber-950/40 border border-amber-700/40' : ''
                  }`}
                >
                  <span className="text-amber-200 tabular-nums">{r.date}</span>
                  <span className="text-white font-medium ml-2">{r.count} 人</span>
                  {r.names?.length > 0 && (
                    <span className="text-gray-400 ml-2 truncate">
                      {(recording ? r.names.map((n) => m(n)) : r.names).join('、')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
