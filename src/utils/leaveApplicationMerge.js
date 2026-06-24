// 異動申請雲端／本機合併（獨立模組，避免 supabaseSync / supabaseRealtime 循環依賴）

export const LEAVE_APPLICATION_KEY = 'jiameng_leave_applications'

export const rowToLeaveRecord = (r) => ({
  id: r.id,
  userId: r.user_id ?? '',
  userName: r.user_name ?? '',
  startDate: r.start_date ?? '',
  endDate: r.end_date ?? '',
  reason: r.reason ?? '',
  status: r.status ?? 'pending',
  createdAt: r.created_at ? (typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString()) : '',
  approvedBy: r.approved_by ?? '',
  approvedAt: r.approved_at ?? undefined,
  submittedBy: r.submitted_by ?? ''
})

const recordTimestamp = (r) => {
  const statusRank = { pending: 0, rejected: 1, approved: 2 }
  const status = statusRank[r?.status] ?? 0
  const approvedAt = Date.parse(r?.approvedAt || '') || 0
  const createdAt = Date.parse(r?.createdAt || '') || 0
  return status * 1e15 + Math.max(approvedAt, createdAt)
}

/** 合併雲端與本機請假清單，避免雲端 refetch 蓋掉尚未上傳成功的本機申請 */
export const mergeLeaveApplicationLists = (cloudList, localList) => {
  const byId = new Map()
  const all = [
    ...(Array.isArray(cloudList) ? cloudList : []),
    ...(Array.isArray(localList) ? localList : [])
  ]
  all.forEach((r) => {
    const id = String(r?.id || '').trim()
    if (!id) return
    const prev = byId.get(id)
    if (!prev || recordTimestamp(r) >= recordTimestamp(prev)) {
      byId.set(id, { ...prev, ...r, id })
    }
  })
  return Array.from(byId.values())
}

export const applyLeaveApplicationsFromCloud = (cloudList) => {
  let localList = []
  try {
    const raw = localStorage.getItem(LEAVE_APPLICATION_KEY)
    localList = raw ? JSON.parse(raw) : []
  } catch (_) {
    localList = []
  }
  const merged = mergeLeaveApplicationLists(cloudList, localList)
  localStorage.setItem(LEAVE_APPLICATION_KEY, JSON.stringify(merged))
  return merged
}
