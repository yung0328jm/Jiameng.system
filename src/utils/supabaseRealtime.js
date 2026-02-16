// 即時同步：訂閱 Supabase Realtime，有人改資料時更新本地並通知 UI 重讀
import { getSupabaseClient } from './supabaseClient'

const SCHEDULE_KEY = 'jiameng_engineering_schedules'
const LEAVE_KEY = 'jiameng_leave_applications'
const QUOTA_KEY = 'jiameng_special_leave_quota'
const DANMU_KEY = 'jiameng_danmus'
const TRIP_REPORT_KEY = 'jiameng_trip_reports'
const MESSAGE_KEY = 'jiameng_messages'
const AWARD_CLAIMS_KEY = 'jiameng_leaderboard_award_claims_v1'
const DELETED_LEADERBOARDS_KEY = 'jiameng_deleted_leaderboards'
const LEADERBOARD_ITEMS_KEY = 'jiameng_leaderboard_items'
const ITEMS_KEY = 'jiameng_items'
const MEMOS_KEY = 'jiameng_memos'
const PROJECT_RECORD_PREFIX_LEGACY = 'jiameng_project_records:'
const PROJECT_RECORD_PREFIX = 'jiameng_project_records__'

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

  // 排行榜面板合併去重（避免多裝置/多分頁同時寫入造成「新增面板被覆蓋消失」）
  function lbUpdatedAt(x) {
    const t0 = Date.parse(x?.updatedAt || '') || 0
    const t1 = Date.parse(x?.createdAt || '') || 0
    return Math.max(t0, t1)
  }
  function mergeLeaderboardItems(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((it) => {
      const id = String(it?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, it)
        return
      }
      const ta = lbUpdatedAt(prev)
      const tb = lbUpdatedAt(it)
      byId.set(id, tb >= ta ? { ...prev, ...it } : { ...it, ...prev })
    })
    // 保留面板順序：不要用 updatedAt 排序（會造成面板左右互換跳動）
    const order = []
    const seen = new Set()
    a.forEach((it) => {
      const id = String(it?.id || '').trim()
      if (!id || seen.has(id)) return
      seen.add(id)
      order.push(id)
    })
    b.forEach((it) => {
      const id = String(it?.id || '').trim()
      if (!id || seen.has(id)) return
      seen.add(id)
      order.push(id)
    })
    return order.map((id) => byId.get(id)).filter(Boolean)
  }

  // 道具清單合併去重：避免多裝置覆蓋造成「背包有 itemId 但道具定義不在 → 未知道具」
  function itemUpdatedAt(x) {
    const t0 = Date.parse(x?.updatedAt || '') || 0
    const t1 = Date.parse(x?.createdAt || '') || 0
    return Math.max(t0, t1)
  }
  function mergeItems(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((it) => {
      const id = String(it?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) { byId.set(id, it); return }
      const ta = itemUpdatedAt(prev)
      const tb = itemUpdatedAt(it)
      byId.set(id, tb >= ta ? { ...prev, ...it } : { ...it, ...prev })
    })
    // 保留順序（先本機再雲端新增），避免 UI 列表跳動
    const order = []
    const seen = new Set()
    a.forEach((it) => { const id = String(it?.id || '').trim(); if (!id || seen.has(id)) return; seen.add(id); order.push(id) })
    b.forEach((it) => { const id = String(it?.id || '').trim(); if (!id || seen.has(id)) return; seen.add(id); order.push(id) })
    return order.map((id) => byId.get(id)).filter(Boolean)
  }

  function mergeObjectMap(existingObj, incomingObj, pickNewestAt = 'at') {
    const a = existingObj && typeof existingObj === 'object' ? existingObj : {}
    const b = incomingObj && typeof incomingObj === 'object' ? incomingObj : {}
    const out = { ...a }
    Object.keys(b).forEach((k) => {
      const prev = out[k]
      const next = b[k]
      const ta = Date.parse(prev?.[pickNewestAt] || prev?.deletedAt || '') || 0
      const tb = Date.parse(next?.[pickNewestAt] || next?.deletedAt || '') || 0
      out[k] = tb >= ta ? next : prev
    })
    return out
  }

  // 專案缺失表（project_records）合併去重：避免多裝置同時更新狀態/進度造成互相覆蓋
  function prUpdatedAt(r) {
    const t0 = Date.parse(r?.updatedAt || '') || 0
    const t1 = Date.parse(r?.createdAt || '') || 0
    return Math.max(t0, t1)
  }
  function mergeRecordArray(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((r) => {
      const id = String(r?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) { byId.set(id, r); return }
      const ta = prUpdatedAt(prev)
      const tb = prUpdatedAt(r)
      // 用較新的當 base，但保留舊的欄位避免缺欄
      const base = tb >= ta ? r : prev
      const other = tb >= ta ? prev : r
      byId.set(id, { ...other, ...base })
    })
    // 缺失表顯示順序以 rowNumber 為主
    return Array.from(byId.values()).sort((x, y) => (Number(x?.rowNumber) || 0) - (Number(y?.rowNumber) || 0))
  }
  function mergeProjectRecords(existingObj, incomingObj) {
    const a = existingObj && typeof existingObj === 'object' ? existingObj : {}
    const b = incomingObj && typeof incomingObj === 'object' ? incomingObj : {}
    const out = { ...a }
    Object.keys(b).forEach((projectId) => {
      out[projectId] = mergeRecordArray(a?.[projectId], b?.[projectId])
    })
    return out
  }

  // 站內信合併去重（避免多裝置/多人同時寫入覆蓋導致「訊息消失」或「要重登才看得到」）
  let lastMsgHealAt = 0
  let lastMsgHealSig = ''
  function msgUpdatedAt(m) {
    const t0 = Date.parse(m?.createdAt || '') || 0
    const t1 = Date.parse(m?.readAt || '') || 0
    const t2 = Date.parse(m?.resolvedAt || '') || 0
    const replies = Array.isArray(m?.replies) ? m.replies : []
    const t3 = replies.reduce((mx, r) => Math.max(mx, Date.parse(r?.createdAt || '') || 0), 0)
    return Math.max(t0, t1, t2, t3)
  }
  function mergeReplies(a, b) {
    const ra = Array.isArray(a) ? a : []
    const rb = Array.isArray(b) ? b : []
    const byId = new Map()
    ;[...ra, ...rb].forEach((r) => {
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
    return Array.from(byId.values()).sort((x, y) => (Date.parse(x?.createdAt || '') || 0) - (Date.parse(y?.createdAt || '') || 0))
  }
  function mergeMessages(existingArr, incomingArr) {
    const a = Array.isArray(existingArr) ? existingArr : []
    const b = Array.isArray(incomingArr) ? incomingArr : []
    const byId = new Map()
    ;[...a, ...b].forEach((m) => {
      const id = String(m?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, m)
        return
      }
      const ta = msgUpdatedAt(prev)
      const tb = msgUpdatedAt(m)
      const base = tb >= ta ? m : prev
      const other = tb >= ta ? prev : m
      const replies = mergeReplies(base?.replies, other?.replies)
      byId.set(id, { ...other, ...base, replies })
    })
    // 依 createdAt 排序，避免順序亂跳；防爆最多保留 5000 筆
    return Array.from(byId.values())
      .sort((x, y) => (Date.parse(x?.createdAt || '') || 0) - (Date.parse(y?.createdAt || '') || 0))
      .slice(-5000)
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
            if (key === MESSAGE_KEY) {
              try {
                const incoming = Array.isArray(payload.new.data)
                  ? payload.new.data
                  : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                const existing = (() => {
                  try { return JSON.parse(localStorage.getItem(MESSAGE_KEY) || '[]') } catch (_) { return [] }
                })()
                const merged = mergeMessages(existing, incoming)
                const val = JSON.stringify(merged)
                localStorage.setItem(MESSAGE_KEY, val)
                notifyKey(MESSAGE_KEY)

                // 若 incoming 少於本機合併後（可能是覆蓋丟失），且含近期變更，嘗試回寫一次修復雲端
                const now = Date.now()
                const sig = `${merged.length}|${merged.slice(-5).map((d) => d?.id).join('|')}`
                if (merged.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastMsgHealAt > 8000 && sig !== lastMsgHealSig) {
                  const hasRecent = merged.slice(-20).some((m) => (now - msgUpdatedAt(m)) < 2 * 60 * 60 * 1000) // 2h 內有變更
                  if (hasRecent) {
                    lastMsgHealAt = now
                    lastMsgHealSig = sig
                    sb.from('app_data').upsert({ key: MESSAGE_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                  }
                }
              } catch (_) {
                const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
                localStorage.setItem(MESSAGE_KEY, val)
                notifyKey(MESSAGE_KEY)
              }
            } else if (key === AWARD_CLAIMS_KEY || key === DELETED_LEADERBOARDS_KEY) {
              try {
                const incoming = (payload.new.data && typeof payload.new.data === 'object' && !Array.isArray(payload.new.data))
                  ? payload.new.data
                  : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '{}') : {})
                const existing = (() => {
                  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch (_) { return {} }
                })()
                const merged = mergeObjectMap(existing, incoming, key === AWARD_CLAIMS_KEY ? 'at' : 'deletedAt')
                const val = JSON.stringify(merged)
                localStorage.setItem(key, val)
                notifyKey(key)

                // 若 incoming 少於合併後（可能被覆蓋丟失），嘗試回寫一次修復雲端
                const now = Date.now()
                const aLen = Object.keys(existing || {}).length
                const bLen = Object.keys(incoming || {}).length
                const mLen = Object.keys(merged || {}).length
                if (mLen > bLen && now - lastMsgHealAt > 5000) {
                  sb.from('app_data').upsert({ key, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                }
              } catch (_) {
                const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? {})
                localStorage.setItem(key, val)
                notifyKey(key)
              }
            } else if (key === MEMOS_KEY) {
              // 交流區：合併本機與雲端話題／訊息，避免覆蓋導致「只看到自己的訊息」或「訊息消失」
              try {
                const incoming = Array.isArray(payload.new.data)
                  ? payload.new.data
                  : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                const existing = (() => {
                  try { return JSON.parse(localStorage.getItem(MEMOS_KEY) || '[]') } catch (_) { return [] }
                })()
                const byTopicId = new Map()
                function mergeTopicMessages(a, b) {
                  const arrA = Array.isArray(a) ? a : []
                  const arrB = Array.isArray(b) ? b : []
                  const byId = new Map()
                  ;[...arrA, ...arrB].forEach((m) => {
                    const id = String(m?.id || '').trim()
                    if (!id) return
                    const prev = byId.get(id)
                    if (!prev) { byId.set(id, m); return }
                    const ta = Date.parse(prev?.createdAt || '') || 0
                    const tb = Date.parse(m?.createdAt || '') || 0
                    byId.set(id, tb >= ta ? m : prev)
                  })
                  return Array.from(byId.values()).sort((x, y) => (Date.parse(x?.createdAt || '') || 0) - (Date.parse(y?.createdAt || '') || 0))
                }
                ;[...existing, ...incoming].forEach((t) => {
                  const tid = String(t?.id ?? '').trim()
                  if (!tid) return
                  const prev = byTopicId.get(tid)
                  const incomingEmpty = tid === 'global' && Array.isArray(t?.messages) && t.messages.length === 0
                  if (!prev) {
                    byTopicId.set(tid, { ...t, messages: incomingEmpty ? [] : mergeTopicMessages(t?.messages, []) })
                    return
                  }
                  byTopicId.set(tid, {
                    ...prev,
                    ...t,
                    messages: incomingEmpty ? [] : mergeTopicMessages(prev?.messages, t?.messages)
                  })
                })
                const merged = Array.from(byTopicId.values())
                const val = JSON.stringify(merged)
                localStorage.setItem(MEMOS_KEY, val)
                notifyKey(MEMOS_KEY)

                const globalIncoming = incoming.find((x) => x?.id === 'global')
                const globalMerged = merged.find((x) => x?.id === 'global')
                const incLen = Array.isArray(globalIncoming?.messages) ? globalIncoming.messages.length : 0
                const merLen = Array.isArray(globalMerged?.messages) ? globalMerged.messages.length : 0
                if (merLen > incLen && merLen > 0) {
                  sb.from('app_data').upsert({ key: MEMOS_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                }
              } catch (_) {
                // 合併失敗時不要用空或無效 payload 覆寫，否則會導致「發送後訊息消失」
                const incomingRaw = payload.new?.data
                const incomingArr = Array.isArray(incomingRaw)
                  ? incomingRaw
                  : (typeof incomingRaw === 'string' ? (() => { try { return JSON.parse(incomingRaw || '[]') } catch (_) { return null } })() : null)
                if (Array.isArray(incomingArr) && incomingArr.length > 0) {
                  const val = typeof incomingRaw === 'string' ? incomingRaw : JSON.stringify(incomingArr)
                  localStorage.setItem(MEMOS_KEY, val)
                  notifyKey(MEMOS_KEY)
                }
                // 否則保留本機現有資料，不覆寫
              }
            } else {
              if (key === LEADERBOARD_ITEMS_KEY) {
                try {
                  const incoming = Array.isArray(payload.new.data)
                    ? payload.new.data
                    : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                  const existing = (() => {
                    try { return JSON.parse(localStorage.getItem(LEADERBOARD_ITEMS_KEY) || '[]') } catch (_) { return [] }
                  })()
                  const merged = mergeLeaderboardItems(existing, incoming)
                  const val = JSON.stringify(merged)
                  localStorage.setItem(LEADERBOARD_ITEMS_KEY, val)
                  notifyKey(LEADERBOARD_ITEMS_KEY)

                  // 若 incoming 少於合併後（可能被覆蓋丟失），嘗試回寫一次修復雲端
                  const now = Date.now()
                  const sig = `${merged.length}|${merged.slice(-5).map((d) => d?.id).join('|')}`
                  if (merged.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastMsgHealAt > 5000) {
                    sb.from('app_data').upsert({ key: LEADERBOARD_ITEMS_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                  }
                } catch (_) {
                  const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
                  localStorage.setItem(LEADERBOARD_ITEMS_KEY, val)
                  notifyKey(LEADERBOARD_ITEMS_KEY)
                }
              } else if (key === ITEMS_KEY) {
                try {
                  const incoming = Array.isArray(payload.new.data)
                    ? payload.new.data
                    : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                  const existing = (() => {
                    try { return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]') } catch (_) { return [] }
                  })()
                  const merged = mergeItems(existing, incoming)
                  const val = JSON.stringify(merged)
                  localStorage.setItem(ITEMS_KEY, val)
                  notifyKey(ITEMS_KEY)

                  // 若 incoming 少於合併後（可能被覆蓋丟失），嘗試回寫一次修復雲端
                  const now = Date.now()
                  if (merged.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastMsgHealAt > 5000) {
                    sb.from('app_data').upsert({ key: ITEMS_KEY, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                  }
                } catch (_) {
                  const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
                  localStorage.setItem(ITEMS_KEY, val)
                  notifyKey(ITEMS_KEY)
                }
              } else if (key && String(key).startsWith(PROJECT_RECORD_PREFIX)) {
                // 新格式：每專案一份，payload.new.data 應為 array
                try {
                  const pid = decodeURIComponent(String(key).slice(PROJECT_RECORD_PREFIX.length).trim())
                  const incoming = Array.isArray(payload.new.data)
                    ? payload.new.data
                    : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                  const localKey = `${PROJECT_RECORD_PREFIX_LEGACY}${pid}`
                  const existing = (() => {
                    try { return JSON.parse(localStorage.getItem(localKey) || '[]') } catch (_) { return [] }
                  })()
                  const mergedArr = mergeRecordArray(existing, incoming)
                  localStorage.setItem(localKey, JSON.stringify(mergedArr))

                  notifyKey(key)
                  notifyKey(localKey)

                  // healing：雲端比本機少時回寫（避免覆蓋丟失）
                  const now = Date.now()
                  if (mergedArr.length > (Array.isArray(incoming) ? incoming.length : 0) && now - lastMsgHealAt > 5000) {
                    sb.from('app_data').upsert({ key, data: mergedArr, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                  }
                } catch (_) {
                  const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
                  const pid = decodeURIComponent(String(key).slice(PROJECT_RECORD_PREFIX.length).trim())
                  const localKey = `${PROJECT_RECORD_PREFIX_LEGACY}${pid}`
                  localStorage.setItem(localKey, val)
                  notifyKey(key)
                  notifyKey(localKey)
                }
              } else if (key && String(key).startsWith(PROJECT_RECORD_PREFIX_LEGACY)) {
                // 舊格式：key 內含 ':'，仍支援讀取與搬運到新 key
                try {
                  const pid = String(key).slice(PROJECT_RECORD_PREFIX_LEGACY.length).trim()
                  const incoming = Array.isArray(payload.new.data)
                    ? payload.new.data
                    : (typeof payload.new.data === 'string' ? JSON.parse(payload.new.data || '[]') : [])
                  const existing = (() => {
                    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch (_) { return [] }
                  })()
                  const mergedArr = mergeRecordArray(existing, incoming)
                  localStorage.setItem(key, JSON.stringify(mergedArr))

                  notifyKey(key)

                  // migration：嘗試寫到新安全 key（讓之後都走同一路徑）
                  try {
                    const safeKey = `${PROJECT_RECORD_PREFIX}${encodeURIComponent(pid)}`
                    sb.from('app_data').upsert({ key: safeKey, data: mergedArr, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                  } catch (_) {}
                } catch (_) {
                  const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? [])
                  localStorage.setItem(key, val)
                  notifyKey(key)
                }
              } else if (key === 'jiameng_todos') {
                // 待辦：內容相同則跳過；若雲端筆數比本機多，且本機剛寫入（3 秒內）才不覆寫，避免刪除被蓋回、又不擋另一台新增
                const incoming = Array.isArray(payload.new.data) ? payload.new.data : (typeof payload.new.data === 'string' ? (() => { try { return JSON.parse(payload.new.data || '[]') } catch (_) { return [] } })() : [])
                const val = JSON.stringify(incoming)
                try {
                  const currentRaw = localStorage.getItem(key)
                  const current = (() => { try { return currentRaw ? JSON.parse(currentRaw) : [] } catch (_) { return [] } })()
                  if (currentRaw === val) return
                  if (Array.isArray(current) && incoming.length > current.length) {
                    const lastWrite = parseInt(localStorage.getItem('jiameng_todos_last_write') || '', 10)
                    if (lastWrite && (Date.now() - lastWrite < 3000)) return
                  }
                  try { localStorage.removeItem('jiameng_todos_last_write') } catch (_) {}
                } catch (_) {}
                localStorage.setItem(key, val)
                notifyKey(key)
              } else {
                const val = typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data ?? {})
                localStorage.setItem(key, val)
                notifyKey(key)
              }
            }
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
