import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import {
  SPOT_WORK_STORAGE_KEY,
  SPOT_WORK_GROUPS_KEY,
  getSpotWorkLogs,
  getSpotWorkLogByDate,
  upsertSpotWorkLog,
  deleteSpotWorkLog,
  getSpotWorkPeople,
  addSpotWorkPerson,
  deleteSpotWorkPerson,
  getSpotWorkGroups,
  addSpotWorkGroup,
  deleteSpotWorkGroup,
  getSpotWorkMonthStats
} from '../utils/spotWorkStorage'

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatHours(n) {
  const x = Number(n) || 0
  if (x <= 0) return '0'
  const r = Math.round(x * 10) / 10
  return Number.isInteger(r) ? String(r) : String(r)
}

export default function SpotWorkLog() {
  const { enabled: recording } = useRecordingMode()
  const [groups, setGroups] = useState(() => getSpotWorkGroups())
  const [groupId, setGroupId] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [date, setDate] = useState(todayDateStr)
  const [yearMonth, setYearMonth] = useState(currentYearMonth)
  const [entriesByName, setEntriesByName] = useState({})
  const [count, setCount] = useState('')
  const [defaultStart, setDefaultStart] = useState('08:00')
  const [note, setNote] = useState('')
  const [customName, setCustomName] = useState('')
  const [logs, setLogs] = useState(() => getSpotWorkLogs())
  const [message, setMessage] = useState(null)
  const [roster, setRoster] = useState([])

  const group = groups.find((g) => g.id === groupId) || null

  const loadDate = useCallback((gid, d) => {
    const rec = getSpotWorkLogByDate(gid, d)
    setDate(d)
    const map = {}
    ;(rec?.entries || []).forEach((e) => {
      if (!e?.name) return
      map[e.name] = {
        startTime: e.startTime || '',
        overtimeHours: e.overtimeHours > 0 ? String(e.overtimeHours) : '',
        overtime: (Number(e.overtimeHours) || 0) > 0
      }
    })
    setEntriesByName(map)
    setCount(rec ? String(rec.count ?? '') : '')
    setNote(rec?.note || '')
  }, [])

  const refetch = useCallback(() => {
    const gs = getSpotWorkGroups()
    setGroups(gs)
    setLogs(getSpotWorkLogs())
    if (groupId) {
      setRoster(getSpotWorkPeople(groupId))
      loadDate(groupId, date)
    }
  }, [groupId, date, loadDate])

  useRealtimeKeys([SPOT_WORK_STORAGE_KEY, SPOT_WORK_GROUPS_KEY], refetch)

  useEffect(() => {
    if (!groupId) {
      setRoster([])
      return
    }
    setRoster(getSpotWorkPeople(groupId))
    loadDate(groupId, date)
  }, [groupId, date, loadDate])

  const selectedNames = useMemo(() => Object.keys(entriesByName), [entriesByName])

  const toggleName = (name) => {
    const t = String(name || '').trim()
    if (!t) return
    setEntriesByName((prev) => {
      if (prev[t]) {
        const next = { ...prev }
        delete next[t]
        return next
      }
      return {
        ...prev,
        [t]: { startTime: defaultStart, overtime: false, overtimeHours: '' }
      }
    })
    setCount((c) => {
      const n = Math.floor(Number(c) || 0)
      const nextLen = entriesByName[t] ? selectedNames.length - 1 : selectedNames.length + 1
      if (!entriesByName[t] && n < nextLen) return String(nextLen)
      return c
    })
  }

  const patchEntry = (name, patch) => {
    setEntriesByName((prev) => {
      if (!prev[name]) return prev
      return { ...prev, [name]: { ...prev[name], ...patch } }
    })
  }

  const addGroup = () => {
    const result = addSpotWorkGroup(newGroupName)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '新增失敗' })
      return
    }
    setGroups(getSpotWorkGroups())
    setNewGroupName('')
    setGroupId(result.group.id)
    setMessage({ type: 'success', text: `已新增群組 ${result.group.name}` })
  }

  const removeGroup = (id, name) => {
    if (!window.confirm(`確定刪除群組「${name}」？該群人員與出工紀錄都會刪除。`)) return
    const result = deleteSpotWorkGroup(id)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '刪除失敗' })
      return
    }
    if (groupId === id) setGroupId('')
    setGroups(getSpotWorkGroups())
    setLogs(getSpotWorkLogs())
    setMessage({ type: 'success', text: `已刪除 ${name}` })
  }

  const addPerson = () => {
    const t = customName.trim()
    const result = addSpotWorkPerson(groupId, t)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '新增失敗' })
      return
    }
    setRoster(result.names)
    toggleName(t)
    setCustomName('')
    setMessage({ type: 'success', text: `已新增 ${t}` })
  }

  const removePerson = (name) => {
    if (!window.confirm(`從「${group?.name || ''}」名單刪除「${name}」？`)) return
    const result = deleteSpotWorkPerson(groupId, name)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '刪除失敗' })
      return
    }
    setRoster(result.names)
    setEntriesByName((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setMessage({ type: 'success', text: `已刪除 ${name}` })
  }

  const save = () => {
    const entries = selectedNames.map((name) => {
      const e = entriesByName[name] || {}
      return {
        name,
        startTime: e.startTime || '',
        overtimeHours: e.overtime ? Number(e.overtimeHours) || 0 : 0
      }
    })
    const result = upsertSpotWorkLog({
      groupId,
      date,
      entries,
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
    if (!getSpotWorkLogByDate(groupId, date)) return
    if (!window.confirm(`確定刪除 ${group?.name || ''} ${date} 的點工紀錄？`)) return
    const result = deleteSpotWorkLog(groupId, date)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '刪除失敗' })
      return
    }
    setEntriesByName({})
    setCount('')
    setNote('')
    setLogs(getSpotWorkLogs())
    setMessage({ type: 'success', text: `已刪除 ${date}` })
  }

  const groupLogs = useMemo(
    () => logs.filter((r) => String(r.groupId) === groupId).slice(0, 40),
    [logs, groupId]
  )

  const stats = useMemo(
    () => (groupId ? getSpotWorkMonthStats(groupId, yearMonth) : null),
    [groupId, yearMonth, logs]
  )

  const flash = message && (
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
  )

  if (!group) {
    return (
      <div className="max-w-3xl mx-auto text-cn-parchment">
        <h1 className="text-xl sm:text-2xl font-bold text-cn-gold font-serif mb-1">點工紀錄系統</h1>
        <p className="text-cn-mist text-sm mb-4">先選公司／群組，進去後再新增人員與當日出工。</p>
        {flash}
        <div className="rounded-xl border border-cn-gold/35 bg-cn-panel/40 p-4 sm:p-5 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup())}
              placeholder="例如：A公司"
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
            <button
              type="button"
              onClick={addGroup}
              className="shrink-0 px-3 py-2 rounded bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold text-sm"
            >
              新增群組
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-gray-500 text-sm py-3">還沒有群組</p>
          ) : (
            <ul className="space-y-1.5">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupId(g.id)}
                    className="flex-1 text-left rounded-lg border border-gray-600 bg-gray-900/50 px-3 py-2.5 hover:border-amber-500/50"
                  >
                    <span className="text-amber-100 font-medium">{m(g.name)}</span>
                    <span className="text-gray-500 text-xs ml-2">{(g.people || []).length} 人</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGroup(g.id, g.name)}
                    className="shrink-0 text-xs text-rose-300 px-2 py-2"
                  >
                    刪除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-cn-gold font-serif">{m(group.name)}</h1>
          <p className="text-cn-mist text-sm">點工紀錄 · 上班時間與加班</p>
        </div>
        <button
          type="button"
          onClick={() => setGroupId('')}
          className="shrink-0 text-sm text-cn-gold hover:text-amber-200"
        >
          回群組
        </button>
      </div>
      {flash}

      {stats && (
        <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-cn-gold">整月統計</h2>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value || currentYearMonth())}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="rounded bg-gray-900/50 px-2 py-2">
              <div className="text-[11px] text-gray-400">總工</div>
              <div className="text-amber-200 font-semibold tabular-nums">{stats.totalWork} 工</div>
            </div>
            <div className="rounded bg-gray-900/50 px-2 py-2">
              <div className="text-[11px] text-gray-400">總加班</div>
              <div className="text-red-300 font-semibold tabular-nums">{formatHours(stats.overtimeHours)} 小時</div>
            </div>
            <div className="rounded bg-gray-900/50 px-2 py-2">
              <div className="text-[11px] text-gray-400">出工日</div>
              <div className="text-gray-200 font-semibold tabular-nums">{stats.dayCount} 天</div>
            </div>
          </div>
          {stats.people.length === 0 ? (
            <p className="text-gray-500 text-xs">本月尚無具名出工</p>
          ) : (
            <ul className="space-y-1">
              {stats.people.map((p) => (
                <li key={p.name} className="flex justify-between gap-2 text-sm border-b border-gray-800/80 pb-1">
                  <span className="text-gray-200 truncate">{recording ? m(p.name) : p.name}</span>
                  <span className="shrink-0 tabular-nums text-gray-300">
                    {p.days} 天
                    {p.overtimeHours > 0 ? (
                      <span className="text-red-300 ml-2">加班 {formatHours(p.overtimeHours)} 小時</span>
                    ) : (
                      <span className="text-gray-500 ml-2">無加班</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
        <label className="block">
          <span className="text-cn-mist text-xs">預設上班時間（勾選人員時帶入）</span>
          <input
            type="time"
            value={defaultStart}
            onChange={(e) => setDefaultStart(e.target.value)}
            className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
          />
        </label>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-cn-mist text-xs">出工有誰</span>
            <span className="text-amber-200 text-xs tabular-nums">已選 {selectedNames.length} 人</span>
          </div>
          <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/40 p-2 space-y-2">
            {roster.map((n) => {
              const on = !!entriesByName[n]
              const e = entriesByName[n]
              return (
                <div
                  key={n}
                  className={`rounded px-2 py-2 ${on ? 'bg-amber-900/30' : 'bg-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer text-sm">
                      <input type="checkbox" checked={on} onChange={() => toggleName(n)} className="accent-amber-500" />
                      <span className={`truncate ${on ? 'text-amber-100' : 'text-gray-300'}`}>
                        {recording ? m(n) : n}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removePerson(n)}
                      className="shrink-0 text-xs text-rose-300/90 hover:text-rose-200"
                    >
                      刪除
                    </button>
                  </div>
                  {on && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                      <label className="block">
                        <span className="text-[10px] text-gray-400">上班時間</span>
                        <input
                          type="time"
                          value={e.startTime || ''}
                          onChange={(ev) => patchEntry(n, { startTime: ev.target.value })}
                          className="w-full mt-0.5 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-gray-400">加班</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <input
                            type="checkbox"
                            checked={!!e.overtime}
                            onChange={(ev) =>
                              patchEntry(n, {
                                overtime: ev.target.checked,
                                overtimeHours: ev.target.checked ? e.overtimeHours || '' : ''
                              })
                            }
                            className="accent-red-400"
                          />
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            disabled={!e.overtime}
                            value={e.overtimeHours || ''}
                            onChange={(ev) => patchEntry(n, { overtimeHours: ev.target.value, overtime: true })}
                            placeholder="小時"
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs tabular-nums disabled:opacity-40"
                          />
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
            {roster.length === 0 && (
              <p className="text-gray-500 text-sm px-2 py-3">尚無名單，請在下方新增人員</p>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPerson())}
              placeholder="輸入姓名後新增到此群組"
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
            <button
              type="button"
              onClick={addPerson}
              className="shrink-0 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white"
            >
              新增人員
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
        {groupLogs.length === 0 ? (
          <p className="text-gray-500 text-sm">還沒有點工紀錄</p>
        ) : (
          <ul className="space-y-1">
            {groupLogs.map((r) => {
              const ot = (r.entries || []).reduce((s, e) => s + (Number(e.overtimeHours) || 0), 0)
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => loadDate(groupId, r.date)}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-gray-800/80 ${
                      r.date === date ? 'bg-amber-950/40 border border-amber-700/40' : ''
                    }`}
                  >
                    <span className="text-amber-200 tabular-nums">{r.date}</span>
                    <span className="text-white font-medium ml-2">{r.count} 人</span>
                    {ot > 0 && (
                      <span className="text-red-300 ml-2">加班 {formatHours(ot)}h</span>
                    )}
                    {r.names?.length > 0 && (
                      <span className="text-gray-400 ml-2 truncate">
                        {(recording ? r.names.map((n) => m(n)) : r.names).join('、')}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
