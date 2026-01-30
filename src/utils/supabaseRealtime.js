// 即時同步：訂閱 Supabase Realtime，有人改資料時更新本地並通知 UI 重讀
import { getSupabaseClient } from './supabaseClient'

const SCHEDULE_KEY = 'jiameng_engineering_schedules'
const LEAVE_KEY = 'jiameng_leave_applications'
const QUOTA_KEY = 'jiameng_special_leave_quota'
const DANMU_KEY = 'jiameng_danmus'
const TRIP_REPORT_KEY = 'jiameng_trip_reports'

const evt = 'supabase-realtime-update'

function notify(key) {
  try {
    window.dispatchEvent(new CustomEvent(evt, { detail: { key } }))
  } catch (_) {}
}

/** 訂閱 Realtime，有人改表時更新 localStorage 並觸發 onUpdate(key)。回傳 unsubscribe 函式。 */
export function subscribeRealtime(onUpdate) {
  const sb = getSupabaseClient()
  if (!sb || typeof onUpdate !== 'function') return () => {}

  const channels = []

  function notifyKey(key) {
    notify(key)
    onUpdate(key)
  }

  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const logStatus = (name, status, err) => {
    if (status === 'SUBSCRIBED' && isDev) console.log('[Realtime]', name, '已連線')
    // 錯誤在開發與部署環境都輸出，方便排查「只有排程同步、其它沒同步」
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[Realtime]', name, status, err?.message || err || '')
    }
  }

  // 彈幕合併去重（避免多人同時發送時 jiameng_danmus 被最後寫入者覆蓋，導致別人的彈幕「被刷掉」）
  let lastDanmuHealAt = 0
  let lastDanmuHealSig = ''
  function mergeDanmus(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((d) => {
      const id = String(d?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, d)
        return
      }
      const ta = Date.parse(prev?.createdAt || '') || 0
      const tb = Date.parse(d?.createdAt || '') || 0
      byId.set(id, tb >= ta ? d : prev)
    })
    const merged = Array.from(byId.values()).sort((x, y) => (Date.parse(x?.createdAt || '') || 0) - (Date.parse(y?.createdAt || '') || 0))
    return merged.slice(-500)
  }

  // 行程回報合併去重（避免多人/多裝置寫入造成被覆蓋而「狀態回復」）
  let lastTripHealAt = 0
  let lastTripHealSig = ''
  function mergeTripReports(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((r) => {
      const id = String(r?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, r)
        return
      }
      const ta = Date.parse(prev?.createdAt || '') || 0
      const tb = Date.parse(r?.createdAt || '') || 0
      byId.set(id, tb >= ta ? r : prev)
    })
    const merged = Array.from(byId.values()).sort((x, y) => (Date.parse(x?.createdAt || '') || 0) - (Date.parse(y?.createdAt || '') || 0))
    // 防爆：最多保留 5000 筆
    return merged.slice(-5000)
  }

  // app_data：payload.new / payload.old 含 key, data
  const appDataCh = sb
    .channel('app_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload) => {
        if (payload.new && payload.new.key != null) {
          const key = payload.new.key
          // 彈幕：收到雲端更新時做合併去重，降低覆蓋丟失
          if (key === DANMU_KEY) {
            try {
              const incoming = Array.isArray(payload.new.data) ? payload.new.data : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
              // 清除彈幕：雲端寫入空陣列時，必須「覆蓋」而不是合併，否則會把舊彈幕又合併回來
              if (Array.isArray(incoming) && incoming.length === 0) {
                localStorage.setItem(DANMU_KEY, '[]')
                notifyKey(DANMU_KEY)
                return
              }
              const existing = (() => {
                try { return JSON.parse(localStorage.getItem(DANMU_KEY) || '[]') } catch (_) { return [] }
              })()
              const merged = mergeDanmus(existing, incoming)
              const val = JSON.stringify(merged)
              localStorage.setItem(DANMU_KEY, val)
              notifyKey(DANMU_KEY)

              // 若偵測到 incoming 少於本機（可能是覆蓋丟失），且缺的多為近期資料，嘗試回寫一次修復雲端
              const now = Date.now()
              const sig = `${merged.length}|${merged.slice(-5).map((d) => d?.id).join('|')}`
              if (merged.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastDanmuHealAt > 5000 && sig !== lastDanmuHealSig) {
                const hasRecent = merged.slice(-10).some((d) => (now - (Date.parse(d?.createdAt || '') || 0)) < 2 * 60 * 1000)
                if (hasRecent) {
                  lastDanmuHealAt = now
                  lastDanmuHealSig = sig
                  sb.from('app_data').upsert({ key: DANMU_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                }
              }
            } catch (_) {
              // fallback：直接覆蓋
              const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? {})
              localStorage.setItem(DANMU_KEY, val)
              notifyKey(DANMU_KEY)
            }
          } else if (key === TRIP_REPORT_KEY) {
            try {
              const incoming = Array.isArray(payload.new.data)
                ? payload.new.data
                : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
              const existing = (() => {
                try { return JSON.parse(localStorage.getItem(TRIP_REPORT_KEY) || '[]') } catch (_) { return [] }
              })()
              const merged = mergeTripReports(existing, incoming)
              const val = JSON.stringify(merged)
              localStorage.setItem(TRIP_REPORT_KEY, val)
              notifyKey(TRIP_REPORT_KEY)

              // 若偵測到 incoming 少於本機（可能是覆蓋丟失），嘗試回寫一次修復雲端
              const now = Date.now()
              const sig = `${merged.length}|${merged.slice(-5).map((d) => d?.id).join('|')}`
              if (merged.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastTripHealAt > 8000 && sig !== lastTripHealSig) {
                // 最近 24h 內有資料才回寫，避免把舊資料硬推上去
                const hasRecent = merged.slice(-20).some((d) => (now - (Date.parse(d?.createdAt || '') || 0)) < 24 * 60 * 60 * 1000)
                if (hasRecent) {
                  lastTripHealAt = now
                  lastTripHealSig = sig
                  sb.from('app_data').upsert({ key: TRIP_REPORT_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                }
              }
            } catch (_) {
              const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
              localStorage.setItem(TRIP_REPORT_KEY, val)
              notifyKey(TRIP_REPORT_KEY)
            }
          } else {
            const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? {})
            localStorage.setItem(key, val)
            notifyKey(key)
          }
        } else if (payload.old && payload.old.key != null) {
          localStorage.removeItem(payload.old.key)
          notifyKey(payload.old.key)
        }
      }
    )
    .subscribe((status, err) => logStatus('app_data', status, err))
  channels.push(appDataCh)

  async function refetchSchedules() {
    try {
      const { data } = await sb.from('engineering_schedules').select('id, data, created_at').order('created_at', { ascending: true })
      const schedules = (data || []).map((r) => ({ ...(r.data || {}), id: r.id, createdAt: r.created_at }))
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules))
      notifyKey(SCHEDULE_KEY)
    } catch (_) {}
  }
  async function refetchLeave() {
    try {
      const { data } = await sb.from('leave_applications').select('*').order('created_at', { ascending: true })
      const list = (data || []).map((r) => ({
        id: r.id,
        userId: r.user_id ?? '',
        userName: r.user_name ?? '',
        startDate: r.start_date ?? '',
        endDate: r.end_date ?? '',
        reason: r.reason ?? '',
        status: r.status ?? 'pending',
        createdAt: r.created_at ? (typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString()) : '',
        approvedBy: r.approved_by ?? '',
        approvedAt: r.approved_at ?? undefined
      }))
      localStorage.setItem(LEAVE_KEY, JSON.stringify(list))
      notifyKey(LEAVE_KEY)
    } catch (_) {}
  }
  async function refetchQuota() {
    try {
      const { data } = await sb.from('special_leave_quota').select('account, days')
      const map = {}
      ;(data || []).forEach((r) => { map[r.account] = Number(r.days) || 0 })
      localStorage.setItem(QUOTA_KEY, JSON.stringify(map))
      notifyKey(QUOTA_KEY)
    } catch (_) {}
  }

  const schedCh = sb
    .channel('engineering_schedules_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'engineering_schedules' }, () => refetchSchedules())
    .subscribe((status, err) => logStatus('engineering_schedules', status, err))
  channels.push(schedCh)

  const leaveCh = sb
    .channel('leave_applications_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_applications' }, () => refetchLeave())
    .subscribe((status, err) => logStatus('leave_applications', status, err))
  channels.push(leaveCh)

  const quotaCh = sb
    .channel('special_leave_quota_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'special_leave_quota' }, () => refetchQuota())
    .subscribe((status, err) => logStatus('special_leave_quota', status, err))
  channels.push(quotaCh)

  return () => {
    channels.forEach((ch) => { if (ch && ch.unsubscribe) ch.unsubscribe() })
  }
}

/** 供元件監聽即時更新用的事件名 */
export const REALTIME_UPDATE_EVENT = evt
