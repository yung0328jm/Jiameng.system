const pad2 = (n) => String(n).padStart(2, '0')
const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i))

function parseTime24(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!m) return { hour: '', minute: '' }
  const hour = pad2(Math.min(23, Math.max(0, parseInt(m[1], 10) || 0)))
  const minute = pad2(Math.min(59, Math.max(0, parseInt(m[2], 10) || 0)))
  return { hour, minute }
}

/** 24 小時制時分選擇（避免 type=time 在中文環境顯示上午/下午） */
export default function TimeInput24({ label, value, onChange, required, compact }) {
  const { hour, minute } = parseTime24(value)
  const selectClass = compact
    ? 'w-[4.25rem] min-w-0 bg-gray-700 border border-gray-600 rounded px-1 py-1 text-white text-xs tabular-nums'
    : 'flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-2 text-white text-sm tabular-nums'

  const setPart = (nextHour, nextMinute) => {
    if (nextHour !== '' && nextMinute !== '') onChange(`${nextHour}:${nextMinute}`)
    else onChange('')
  }

  const timeRow = (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      <select
        value={hour}
        onChange={(e) => setPart(e.target.value, minute || '00')}
        className={selectClass}
        required={required}
        aria-label={`${label || '時間'} 時`}
      >
        <option value="">時</option>
        {HOUR_OPTIONS_24.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-400 font-mono">:</span>
      <select
        value={minute}
        onChange={(e) => setPart(hour || '00', e.target.value)}
        className={selectClass}
        required={required}
        aria-label={`${label || '時間'} 分`}
      >
        <option value="">分</option>
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )

  if (compact) return timeRow

  return (
    <div>
      <label className="block text-blue-300 text-sm mb-1">
        {label}
        <span className="text-gray-500 font-normal ml-1">（24小時制）</span>
      </label>
      {timeRow}
    </div>
  )
}
