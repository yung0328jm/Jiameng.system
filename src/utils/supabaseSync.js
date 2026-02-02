// 從 Supabase 拉一輪資料寫入 localStorage；全站同步（排程／請假／特休＋其餘經 app_data）
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'

const SCHEDULE_KEY = 'jiameng_engineering_schedules'
const LEAVE_KEY = 'jiameng_leave_applications'
const QUOTA_KEY = 'jiameng_special_leave_quota'

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
  const shouldDebounce = String(key).startsWith('jiameng_project_records:')
  const debounceMs = shouldDebounce ? 150 : 0

  // eslint-disable-next-line no-use-before-define
  return scheduleUpsert(sb, key, value, debounceMs)
}

// -----------------------------
// internal: per-key upsert queue
// -----------------------------
const _pending = new Map() // key -> { data, queuedAt }
const _timer = new Map() // key -> timeoutId
const _inFlight = new Set() // key

async function _doUpsert(sb, key, value) {
  const data = typeof value === 'string' ? (value ? JSON.parse(value) : {}) : (value ?? {})

  // 道具防呆：避免任何裝置把 jiameng_items 覆蓋成只剩彈幕
  if (key === 'jiameng_items') {
    const incoming = Array.isArray(data) ? data : []
    // 如果本次要寫入的道具清單過少，先讀雲端現況比對；雲端較多則拒絕覆蓋
    if (incoming.length <= 1) {
      try {
        const { data: cloudRow } = await sb.from('app_data').select('data').eq('key', 'jiameng_items').maybeSingle()
        const cloud = Array.isArray(cloudRow?.data) ? cloudRow.data : []
        if (cloud.length > incoming.length) {
          console.warn('[Sync] Blocked overwrite jiameng_items (incoming too small)', { incoming: incoming.length, cloud: cloud.length })
          return
        }
      } catch (_) {}
    }
    // 寫入前：先備份雲端舊資料（若有）
    try {
      const { data: cloudRow } = await sb.from('app_data').select('data').eq('key', 'jiameng_items').maybeSingle()
      const cloud = cloudRow?.data
      if (cloud) {
        await sb.from('app_data').upsert({ key: 'jiameng_items_backup', data: cloud, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      }
    } catch (_) {}
  }

  await sb.from('app_data').upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

async function scheduleUpsert(sb, key, value, debounceMs) {
  try {
    if (!debounceMs) {
      await _doUpsert(sb, key, value)
      return
    }

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
      try {
        await _doUpsert(sb, key, payload.value)
      } catch (e) {
        console.warn('syncKeyToSupabase failed:', key, e)
      } finally {
        _inFlight.delete(key)
        // 若寫入期間又有新值，立即補送一次
        if (_pending.has(key)) {
          scheduleUpsert(sb, key, _pending.get(key)?.value, debounceMs)
        }
      }
    }, debounceMs)
    _timer.set(key, id)
  } catch (e) {
    console.warn('syncKeyToSupabase failed:', key, e)
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
    const [schedRes, leaveRes, quotaRes, appRes, prRes, legacyPrRes] = await Promise.all([
      sb.from('engineering_schedules').select('id, data, created_at').order('created_at', { ascending: true }),
      sb.from('leave_applications').select('*').order('created_at', { ascending: true }),
      sb.from('special_leave_quota').select('account, days'),
      sb.from('app_data').select('key, data').in('key', APP_DATA_KEYS),
      // 專案缺失表：抓取所有 per-project keys
      sb.from('app_data').select('key, data').like('key', 'jiameng_project_records:%'),
      // legacy：若雲端還只有整包（舊版），則拉回一次供本機展示（不再寫回雲端）
      sb.from('app_data').select('data').eq('key', 'jiameng_project_records').maybeSingle()
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
      const rows = Array.isArray(prRes?.data) ? prRes.data : []
      const map = {}
      rows.forEach((r) => {
        const key = String(r?.key || '')
        if (!key.startsWith('jiameng_project_records:')) return
        const pid = key.split(':')[1] || ''
        const data = r?.data
        const arr = Array.isArray(data) ? data : (typeof data === 'string' ? (() => { try { return JSON.parse(data || '[]') } catch (_) { return [] } })() : [])
        localStorage.setItem(key, JSON.stringify(arr))
        if (pid) map[pid] = arr
      })
      // legacy map：不寫回雲端，只做本機快取
      localStorage.setItem('jiameng_project_records', JSON.stringify(map))

      // 若雲端尚未產生任何 per-project keys，則回退讀 legacy 整包，避免新裝置看不到舊資料
      if (rows.length === 0) {
        const legacy = legacyPrRes?.data?.data
        const obj =
          legacy && typeof legacy === 'object' && !Array.isArray(legacy)
            ? legacy
            : (typeof legacy === 'string' ? (() => { try { return JSON.parse(legacy || '{}') } catch (_) { return {} } })() : {})
        if (obj && typeof obj === 'object') {
          localStorage.setItem('jiameng_project_records', JSON.stringify(obj))
          Object.keys(obj).forEach((pid) => {
            const arr = Array.isArray(obj?.[pid]) ? obj[pid] : []
            localStorage.setItem(`jiameng_project_records:${pid}`, JSON.stringify(arr))
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
