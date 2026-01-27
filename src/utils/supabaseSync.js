// 從 Supabase 拉一輪資料寫入 localStorage，供排程／請假／特休同步使用
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'

const SCHEDULE_KEY = 'jiameng_engineering_schedules'
const LEAVE_KEY = 'jiameng_leave_applications'
const QUOTA_KEY = 'jiameng_special_leave_quota'

/** 從雲端同步到本地（覆寫 localStorage），登入後呼叫一次 */
export async function syncFromSupabase() {
  const sb = getSupabaseClient()
  if (!sb) return

  try {
    const [schedRes, leaveRes, quotaRes] = await Promise.all([
      sb.from('engineering_schedules').select('id, data, created_at').order('created_at', { ascending: true }),
      sb.from('leave_applications').select('*').order('created_at', { ascending: true }),
      sb.from('special_leave_quota').select('account, days')
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
  } catch (e) {
    console.warn('syncFromSupabase failed:', e)
  }
}

export { isSupabaseEnabled }
