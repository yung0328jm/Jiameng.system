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
  'jiameng_late_performance_config', 'jiameng_attendance_device_config', 'jiameng_dropdown_options',
  'jiameng_completion_rate_config', 'jiameng_personal_performance', 'jiameng_activity_filter_tags',
  'jiameng_company_activities', 'jiameng_leaderboard_test_records', 'jiameng_project_deficiencies',
  'jiameng_project_records', 'jiameng_projects', 'jiameng_calendar_events', 'jiameng_engineering_records',
  'jiameng_registration_password',
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
  try {
    const data = typeof value === 'string' ? (value ? JSON.parse(value) : {}) : (value ?? {})
    await sb.from('app_data').upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
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
    const [schedRes, leaveRes, quotaRes, appRes] = await Promise.all([
      sb.from('engineering_schedules').select('id, data, created_at').order('created_at', { ascending: true }),
      sb.from('leave_applications').select('*').order('created_at', { ascending: true }),
      sb.from('special_leave_quota').select('account, days'),
      sb.from('app_data').select('key, data').in('key', APP_DATA_KEYS)
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
    if (typeof console !== 'undefined' && console.info) {
      console.info('[Sync] 已從雲端載入', { 排程: (schedRes.data || []).length, 請假: (leaveRes.data || []).length, app_data: (appRes.data || []).length })
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[Sync] 從雲端載入失敗', e)
  }
}

export { isSupabaseEnabled }
