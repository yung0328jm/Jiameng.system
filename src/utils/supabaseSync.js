// 從 Supabase 拉一輪資料寫入 localStorage；全站同步（排程／請假／特休＋其餘經 app_data）
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'

const SCHEDULE_KEY = 'jiameng_engineering_schedules'
const LEAVE_KEY = 'jiameng_leave_applications'
const QUOTA_KEY = 'jiameng_special_leave_quota'
// 專案缺失表：雲端 key 使用安全命名（避免 ':'）
const PROJECT_RECORD_PREFIX = 'jiameng_project_records__'
// 兼容舊雲端資料（曾使用 ':'）
const PROJECT_RECORD_PREFIX_LEGACY = 'jiameng_project_records:'
const PROJECT_RECORDS_KEY = 'jiameng_project_records' // legacy：整包（可能過大，不再寫回雲端）

function rememberSyncError(key, err) {
  try {
    const msg = err?.message || err?.details || String(err || '')
    localStorage.setItem('jiameng_last_sync_error', JSON.stringify({ key: String(key || ''), message: msg, at: new Date().toISOString() }))
  } catch (_) {}
}

const OUTBOX_KEY = 'jiameng_sync_outbox_v1'
// 重要：避免瀏覽器連線/資源耗盡（net::ERR_INSUFFICIENT_RESOURCES）
// 全站所有 app_data 寫入採「單線序列化」，避免同時大量 fetch 打爆瀏覽器與 Supabase
let _globalWriteChain = Promise.resolve()
const runWriteExclusive = (fn) => {
  const prev = _globalWriteChain
  let release
  _globalWriteChain = new Promise((r) => { release = r })
  return prev
    .catch(() => {})
    .then(async () => {
      try { return await fn() } finally { try { release?.() } catch (_) {} }
    })
}

function loadOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch (_) {
    return {}
  }
}
function saveOutbox(obj) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(obj || {})) } catch (_) {}
}
function queueOutbox(key, value, err) {
  try {
    const out = loadOutbox()
    const prev = out[String(key)]
    const attempts = Math.max(0, Number(prev?.attempts) || 0) + 1
    const backoffMs = Math.min(60000, Math.max(2000, 1000 * (2 ** Math.min(attempts, 6)))) // 2s..60s
    out[String(key)] = {
      key: String(key),
      value: typeof value === 'string' ? value : JSON.stringify(value ?? {}),
      lastError: err?.message || err?.details || String(err || ''),
      attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
      updatedAt: new Date().toISOString()
    }
    saveOutbox(out)
  } catch (_) {}
}

export async function flushSyncOutbox() {
  const sb = getSupabaseClient()
  if (!sb) return { ok: 0, fail: 0 }
  const out = loadOutbox()
  const keys = Object.keys(out || {})
  if (keys.length === 0) return { ok: 0, fail: 0 }

  let ok = 0
  let fail = 0
  const now = Date.now()
  // 每次 flush 最多送 2 個，且只送「到期」的，避免造成 request storm
  const priorityOf = (k) => {
    const key = String(k || '')
    // 缺失表：最高優先（避免被其他 noisy key 擋住）
    if (key.startsWith('jiameng_project_records__') || key.startsWith('jiameng_project_records:')) return 0
    // 專案清單：很容易因為 payload 較大/網路被中斷而失敗，放最後
    if (key === 'jiameng_projects') return 9
    return 5
  }
  const due = keys
    .map((k) => out[k])
    .filter((it) => it?.key)
    .filter((it) => {
      const t = Date.parse(it?.nextAttemptAt || '') || 0
      return !t || t <= now
    })
    .sort((a, b) => {
      const pa = priorityOf(a?.key)
      const pb = priorityOf(b?.key)
      if (pa !== pb) return pa - pb
      return (Date.parse(a?.nextAttemptAt || '') || 0) - (Date.parse(b?.nextAttemptAt || '') || 0)
    })
    .slice(0, 2)

  for (const item of due) {
    const k = String(item.key)
    try {
      await runWriteExclusive(() => _doUpsert(sb, item.key, item.value))
      delete out[k]
      ok += 1
    } catch (e) {
      rememberSyncError(item.key, e)
      queueOutbox(item.key, item.value, e)
      fail += 1
    }
  }
  saveOutbox(out)
  return { ok, fail }
}

/** 需從 app_data 同步的 localStorage key（不含排程／請假／特休，不含登入狀態） */
export const APP_DATA_KEYS = [
  'jiameng_todos', 'jiameng_users', 'jiameng_wallets', 'jiameng_transactions',
  'jiameng_inventories', 'jiameng_items', 'jiameng_trip_reports', 'jiameng_checkin_rewards',
  'jiameng_checkin_records', 'jiameng_effect_display_config', 'jiameng_danmus',
  'jiameng_leaderboard_types', 'jiameng_equipped_effects', 'jiameng_title_config',
  'jiameng_exchange_requests', 'jiameng_leaderboard_items', 'jiameng_leaderboard_ui',
  'jiameng_manual_rankings', 'jiameng_trades', 'jiameng_memos', 'jiameng_announcements',
  'jiameng_messages',
  'jiameng_late_performance_config', 'jiameng_attendance_device_config', 'jiameng_dropdown_options',
  'jiameng_completion_rate_config', 'jiameng_personal_performance', 'jiameng_activity_filter_tags',
  'jiameng_company_activities', 'jiameng_leaderboard_test_records', 'jiameng_project_deficiencies',
  // 專案缺失表：改為每專案一份 key（jiameng_project_records:<projectId>），避免整包太大導致不同步
  // legacy 'jiameng_project_records' 不再納入初始同步清單（仍可能存在於雲端，避免拉回超大 payload）
  'jiameng_projects', 'jiameng_calendar_events', 'jiameng_engineering_records',
  'jiameng_registration_password',
  // 排行榜：刪除黑名單 + 獎勵去重記錄（避免多裝置同步造成復活/重複發放）
  'jiameng_deleted_leaderboards',
  'jiameng_leaderboard_award_claims_v1',
  // 道具保護：避免「本機只有預設彈幕」時覆蓋雲端，可用備份救援
  'jiameng_items_backup',
  // 交流區關鍵字獎勵（規則 + 冷卻/領取記錄）
  'jiameng_keyword_reward_rules',
  'jiameng_keyword_reward_claims'
]

/** 寫入某 key 的資料到 Supabase app_data（供各 storage 在 setItem 後呼叫） */
export async function syncKeyToSupabase(key, value) {
  const sb = getSupabaseClient()
  if (!sb || !key) return

  // 頻繁寫入（例如缺失表狀態下拉）容易造成並發覆蓋/掉包，改成「同 key 排隊 + 去抖」只送最後一次
  const isProjectRecordKey = String(key).startsWith(PROJECT_RECORD_PREFIX) || String(key).startsWith(PROJECT_RECORD_PREFIX_LEGACY)
  // 彙整輸入/大量新增：盡量立即送出，避免使用者馬上重新整理造成雲端尚未寫入而「消失」
  let preferImmediate = false
  if (isProjectRecordKey) {
    try {
      const raw = typeof value === 'string' ? value : JSON.stringify(value ?? [])
      const arr = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? (() => { try { return JSON.parse(value || '[]') } catch (_) { return [] } })() : [])
      if ((arr?.length || 0) >= 5) preferImmediate = true
      if (raw && raw.length >= 8000) preferImmediate = true
    } catch (_) {}
  }
  const debounceMs = isProjectRecordKey && !preferImmediate ? 150 : 0

  // eslint-disable-next-line no-use-before-define
  return scheduleUpsert(sb, key, value, debounceMs)
}

// -----------------------------
// internal: per-key upsert queue
// -----------------------------
const _pending = new Map() // key -> { data, queuedAt }
const _timer = new Map() // key -> timeoutId
const _inFlight = new Set() // key
const _waiters = new Map() // key -> Array<{resolve,reject}>

async function _doUpsert(sb, key, value) {
  let data = typeof value === 'string' ? (value ? JSON.parse(value) : {}) : (value ?? {})

  const updatedAtOf = (r) => {
    const t0 = Date.parse(r?.updatedAt || '') || 0
    const t1 = Date.parse(r?.createdAt || '') || 0
    return Math.max(t0, t1)
  }
  const mergeArr = (a0, b0) => {
    const a = Array.isArray(a0) ? a0 : []
    const b = Array.isArray(b0) ? b0 : []
    const byId = new Map()
    ;[...a, ...b].forEach((r) => {
      const id = String(r?.id || '').trim()
      if (!id) return
      const prev = byId.get(id)
      if (!prev) { byId.set(id, r); return }
      const ta = updatedAtOf(prev)
      const tb = updatedAtOf(r)
      const base = tb >= ta ? r : prev
      const other = tb >= ta ? prev : r
      byId.set(id, { ...other, ...base })
    })
    const merged = Array.from(byId.values())
    merged.sort((x, y) => {
      const ax = Number(x?.rowNumber) || 0
      const ay = Number(y?.rowNumber) || 0
      if (ax !== ay) return ax - ay
      return updatedAtOf(y) - updatedAtOf(x)
    })
    return merged
  }

  // 專案缺失表（per-project）：多裝置同時更新狀態/進度時，若直接整包覆蓋會互相打架。
  // 這裡改成「先抓雲端現況 → 逐筆以 updatedAt 合併 → 再寫回」來避免覆蓋丟失。
  if (key && (String(key).startsWith(PROJECT_RECORD_PREFIX) || String(key).startsWith(PROJECT_RECORD_PREFIX_LEGACY))) {
    try {
      const incoming = Array.isArray(data) ? data : []
      const { data: cloudRow, error: cloudErr } = await sb.from('app_data').select('data').eq('key', key).maybeSingle()
      if (cloudErr) throw cloudErr
      const cloudRaw = cloudRow?.data
      const cloud = Array.isArray(cloudRaw)
        ? cloudRaw
        : (typeof cloudRaw === 'string' ? (() => { try { return JSON.parse(cloudRaw || '[]') } catch (_) { return [] } })() : [])
      data = mergeArr(cloud, incoming)
    } catch (_) {
      // 若雲端讀取失敗，仍然照原本資料寫入
    }
  }

  // 道具防呆：避免任何裝置把 jiameng_items 覆蓋成只剩彈幕
  if (key === 'jiameng_items') {
    const incoming = Array.isArray(data) ? data : []
    // 如果本次要寫入的道具清單過少，先讀雲端現況比對；雲端較多則拒絕覆蓋
    if (incoming.length <= 1) {
      try {
        const { data: cloudRow, error: cloudErr } = await sb.from('app_data').select('data').eq('key', 'jiameng_items').maybeSingle()
        if (cloudErr) throw cloudErr
        const cloud = Array.isArray(cloudRow?.data) ? cloudRow.data : []
        if (cloud.length > incoming.length) {
          console.warn('[Sync] Blocked overwrite jiameng_items (incoming too small)', { incoming: incoming.length, cloud: cloud.length })
          return
        }
      } catch (_) {}
    }
    // 寫入前：先備份雲端舊資料（若有）
    try {
      const { data: cloudRow, error: cloudErr } = await sb.from('app_data').select('data').eq('key', 'jiameng_items').maybeSingle()
      if (cloudErr) throw cloudErr
      const cloud = cloudRow?.data
      if (cloud) {
        const { error: bErr } = await sb.from('app_data').upsert({ key: 'jiameng_items_backup', data: cloud, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (bErr) throw bErr
      }
    } catch (_) {}
  }

  const { error } = await sb.from('app_data').upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

async function scheduleUpsert(sb, key, value, debounceMs) {
  try {
    if (!debounceMs) {
      try {
        await runWriteExclusive(() => _doUpsert(sb, key, value))
      } catch (e) {
        rememberSyncError(key, e)
        queueOutbox(key, value, e)
        throw e
      }
      return
    }

    // 讓呼叫方可 await：同 key 的多次呼叫會一起等到「最後一次」實際送出結果
    const waitPromise = new Promise((resolve, reject) => {
      const list = _waiters.get(key) || []
      list.push({ resolve, reject })
      _waiters.set(key, list)
    })

    // coalesce latest
    _pending.set(key, { value, queuedAt: Date.now() })
    const prev = _timer.get(key)
    if (prev) {
      try { clearTimeout(prev) } catch (_) {}
    }
    const id = setTimeout(async () => {
      _timer.delete(key)
      // 若同 key 正在寫入，等下一輪
      if (_inFlight.has(key)) {
        // 再排一次（保持最新）
        scheduleUpsert(sb, key, _pending.get(key)?.value, debounceMs)
        return
      }
      const payload = _pending.get(key)
      if (!payload) return
      _pending.delete(key)
      _inFlight.add(key)
      const done = (err) => {
        const list = _waiters.get(key) || []
        _waiters.delete(key)
        list.forEach((w) => {
          try {
            if (err) w.reject(err)
            else w.resolve(true)
          } catch (_) {}
        })
      }
      try {
        await runWriteExclusive(() => _doUpsert(sb, key, payload.value))
        done(null)
      } catch (e) {
        rememberSyncError(key, e)
        queueOutbox(key, payload.value, e)
        console.warn('syncKeyToSupabase failed:', key, e)
        done(e)
      } finally {
        _inFlight.delete(key)
        // 若寫入期間又有新值，立即補送一次
        if (_pending.has(key)) {
          scheduleUpsert(sb, key, _pending.get(key)?.value, debounceMs)
        }
      }
    }, debounceMs)
    _timer.set(key, id)
    return await waitPromise
  } catch (e) {
    rememberSyncError(key, e)
    queueOutbox(key, value, e)
    console.warn('syncKeyToSupabase failed:', key, e)
    throw e
  }
}

/** 從雲端同步到本地（覆寫 localStorage），登入後呼叫一次 */
export async function syncFromSupabase() {
  const sb = getSupabaseClient()
  if (!sb) {
    if (typeof console !== 'undefined' && console.info) console.info('[Sync] 未設定 Supabase，僅使用本機資料')
    return
  }

  try {
    const [schedRes, leaveRes, quotaRes, appRes, prResNew, prResLegacy, legacyPrRes] = await Promise.all([
      sb.from('engineering_schedules').select('id, data, created_at').order('created_at', { ascending: true }),
      sb.from('leave_applications').select('*').order('created_at', { ascending: true }),
      sb.from('special_leave_quota').select('account, days'),
      sb.from('app_data').select('key, data').in('key', APP_DATA_KEYS),
      // 專案缺失表：抓取所有 per-project keys
      sb.from('app_data').select('key, data').like('key', `${PROJECT_RECORD_PREFIX}%`),
      // 兼容舊版 key（含 ':'）
      sb.from('app_data').select('key, data').like('key', `${PROJECT_RECORD_PREFIX_LEGACY}%`),
      // legacy：若雲端還只有整包（舊版），則拉回一次供本機展示（不再寫回雲端）
      sb.from('app_data').select('data').eq('key', PROJECT_RECORDS_KEY).maybeSingle()
    ])

    const schedules = (schedRes.data || []).map((r) => ({ ...(r.data || {}), id: r.id, createdAt: r.created_at }))
    const leaveList = (leaveRes.data || []).map((r) => ({
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
    const quotaMap = {}
    ;(quotaRes.data || []).forEach((r) => { quotaMap[r.account] = Number(r.days) || 0 })

    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules))
    localStorage.setItem(LEAVE_KEY, JSON.stringify(leaveList))
    localStorage.setItem(QUOTA_KEY, JSON.stringify(quotaMap))

    ;(appRes.data || []).forEach((r) => {
      try {
        localStorage.setItem(r.key, typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {}))
      } catch (_) {}
    })

    // 專案缺失表：寫入每專案 key（同時整理一份 legacy map 供舊讀取/快速查找）
    try {
      const rowsNew = Array.isArray(prResNew?.data) ? prResNew.data : []
      const rowsLegacy = Array.isArray(prResLegacy?.data) ? prResLegacy.data : []
      const rows = [...rowsNew, ...rowsLegacy]
      // 重要：不要用雲端資料覆蓋掉本機缺失（會造成「刷新後新增消失」）
      // 先以本機 legacy map 為底，再把雲端合併進來；最後再把本機 per-project key 補進 map
      let map = {}
      try {
        const rawExisting = localStorage.getItem(PROJECT_RECORDS_KEY)
        const existing = rawExisting ? JSON.parse(rawExisting) : {}
        map = existing && typeof existing === 'object' ? { ...existing } : {}
      } catch (_) {
        map = {}
      }
      const seen = new Set()
      rows.forEach((r) => {
        const key = String(r?.key || '')
        let pid = ''
        if (key.startsWith(PROJECT_RECORD_PREFIX)) {
          pid = decodeURIComponent(String(key).slice(PROJECT_RECORD_PREFIX.length).trim())
        } else if (key.startsWith(PROJECT_RECORD_PREFIX_LEGACY)) {
          pid = String(key).slice(PROJECT_RECORD_PREFIX_LEGACY.length).trim()
        } else {
          return
        }
        const data = r?.data
        const arr = Array.isArray(data) ? data : (typeof data === 'string' ? (() => { try { return JSON.parse(data || '[]') } catch (_) { return [] } })() : [])
        seen.add(String(pid || ''))

        // 重要：刷新/登入時不要用雲端覆蓋掉本機較新的資料（會造成「重新整理就消失」）
        let localArr = []
        try {
          const rawLocal = localStorage.getItem(`${PROJECT_RECORD_PREFIX_LEGACY}${pid}`)
          localArr = rawLocal ? JSON.parse(rawLocal) : []
        } catch (_) {
          localArr = []
        }
        const merged = mergeArr(localArr, arr)
        // 一律寫入本機 ':' key（全 app 讀取都走這個）
        const mergedStr = JSON.stringify(merged)
        localStorage.setItem(`${PROJECT_RECORD_PREFIX_LEGACY}${pid}`, mergedStr)
        // 本機備份：防刷新/同步覆蓋造成消失
        try { localStorage.setItem(`jiameng_project_records_local_backup__${pid}`, mergedStr) } catch (_) {}
        if (pid) map[pid] = merged

        // healing：若本機有較新/較多資料，補回雲端（避免雲端漏寫造成下一次刷新消失）
        try {
          if ((merged?.length || 0) > (arr?.length || 0)) {
            // 補寫回「新 key」（安全命名）
            syncKeyToSupabase(`${PROJECT_RECORD_PREFIX}${encodeURIComponent(pid)}`, JSON.stringify(merged))
          }
        } catch (_) {}
      })
      // 把本機 per-project key 補進 map（即使雲端還沒有，也不能在刷新時被清掉）
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i)
          if (!k || !String(k).startsWith(PROJECT_RECORD_PREFIX_LEGACY)) continue
          const pid = String(k).slice(PROJECT_RECORD_PREFIX_LEGACY.length).trim()
          if (!pid) continue
          if (Array.isArray(map?.[pid]) && map[pid].length > 0) continue
          try {
            const raw = localStorage.getItem(k) || '[]'
            const arr = raw ? JSON.parse(raw) : []
            if (Array.isArray(arr) && arr.length > 0) map[pid] = arr
          } catch (_) {}
        }
      } catch (_) {}

      // legacy map：不寫回雲端，只做本機快取（但不能覆蓋清空）
      localStorage.setItem(PROJECT_RECORDS_KEY, JSON.stringify(map))

      // 雲端沒有的專案 key：如果本機 legacy 有資料，補寫回雲端
      try {
        if (map && typeof map === 'object') {
          Object.keys(map).forEach((pid) => {
            if (!pid) return
            if (seen.has(String(pid))) return
            const key = `${PROJECT_RECORD_PREFIX}${encodeURIComponent(pid)}`
            const arr = Array.isArray(map?.[pid]) ? map[pid] : []
            if (!Array.isArray(arr) || arr.length === 0) return
            try { localStorage.setItem(`${PROJECT_RECORD_PREFIX_LEGACY}${pid}`, JSON.stringify(arr)) } catch (_) {}
            syncKeyToSupabase(key, JSON.stringify(arr))
          })
        }
      } catch (_) {}

      // 若雲端尚未產生任何 per-project keys，則回退讀 legacy 整包，避免新裝置看不到舊資料
      if (rows.length === 0) {
        const legacy = legacyPrRes?.data?.data
        const obj =
          legacy && typeof legacy === 'object' && !Array.isArray(legacy)
            ? legacy
            : (typeof legacy === 'string' ? (() => { try { return JSON.parse(legacy || '{}') } catch (_) { return {} } })() : {})
        if (obj && typeof obj === 'object') {
          localStorage.setItem(PROJECT_RECORDS_KEY, JSON.stringify(obj))
          Object.keys(obj).forEach((pid) => {
            const arr = Array.isArray(obj?.[pid]) ? obj[pid] : []
            const perKeyLocal = `${PROJECT_RECORD_PREFIX_LEGACY}${pid}`
            const perKeyCloud = `${PROJECT_RECORD_PREFIX}${encodeURIComponent(pid)}`
            localStorage.setItem(perKeyLocal, JSON.stringify(arr))
            // migration：把 legacy 拆成 per-project keys 寫回雲端（之後都用小包同步）
            try {
              if (Array.isArray(arr) && arr.length > 0) syncKeyToSupabase(perKeyCloud, JSON.stringify(arr))
            } catch (_) {}
          })
        }
      }
    } catch (_) {}
    if (typeof console !== 'undefined' && console.info) {
      console.info('[Sync] 已從雲端載入', { 排程: (schedRes.data || []).length, 請假: (leaveRes.data || []).length, app_data: (appRes.data || []).length })
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[Sync] 從雲端載入失敗', e)
  }
}

export { isSupabaseEnabled }
