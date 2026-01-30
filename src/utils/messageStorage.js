// 站內信（用戶 → 管理員 / 管理員回覆）存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { getDisplayNameForAccount } from './displayName'

const STORAGE_KEY = 'jiameng_messages'

function safeParseArray(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function persist(list) {
  const val = JSON.stringify(Array.isArray(list) ? list : [])
  localStorage.setItem(STORAGE_KEY, val)
  syncKeyToSupabase(STORAGE_KEY, val)
}

function newId(prefix = 'msg') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getMessages() {
  return safeParseArray(localStorage.getItem(STORAGE_KEY))
}

export function getUserMessages(account) {
  const acc = String(account || '').trim()
  if (!acc) return []
  return getMessages()
    .filter((m) => String(m?.from || '').trim() === acc)
    .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
}

export function getAdminInbox() {
  return getMessages()
    .slice()
    .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
}

export function getAdminUnreadCount() {
  return getMessages().filter((m) => (m?.status || 'unread') === 'unread' && !m?.resolved).length
}

export function addUserMessage({ from, subject, body }) {
  const acc = String(from || '').trim()
  if (!acc) return { success: false, message: '未登入' }
  const s = String(subject || '').trim()
  const b = String(body || '').trim()
  if (!b) return { success: false, message: '請輸入內容' }

  const list = getMessages()
  const msg = {
    id: newId('msg'),
    from: acc,
    fromName: getDisplayNameForAccount(acc),
    toRole: 'admin',
    subject: s,
    body: b,
    createdAt: new Date().toISOString(),
    status: 'unread', // admin unread/read
    readAt: null,
    resolved: false,
    resolvedAt: null,
    replies: [] // [{ id, fromRole:'admin', from, body, createdAt }]
  }
  list.push(msg)
  persist(list)
  return { success: true, message: '已送出', item: msg }
}

export function setAdminRead(messageId, isRead = true) {
  const id = String(messageId || '').trim()
  if (!id) return { success: false, message: '訊息不存在' }
  const list = getMessages()
  const idx = list.findIndex((m) => m?.id === id)
  if (idx === -1) return { success: false, message: '訊息不存在' }
  list[idx] = {
    ...list[idx],
    status: isRead ? 'read' : 'unread',
    readAt: isRead ? (list[idx]?.readAt || new Date().toISOString()) : null
  }
  persist(list)
  return { success: true }
}

export function setAdminResolved(messageId, resolved = true) {
  const id = String(messageId || '').trim()
  if (!id) return { success: false, message: '訊息不存在' }
  const list = getMessages()
  const idx = list.findIndex((m) => m?.id === id)
  if (idx === -1) return { success: false, message: '訊息不存在' }
  list[idx] = {
    ...list[idx],
    resolved: !!resolved,
    resolvedAt: resolved ? (list[idx]?.resolvedAt || new Date().toISOString()) : null
  }
  persist(list)
  return { success: true }
}

export function addAdminReply(messageId, { fromAdminAccount, body }) {
  const id = String(messageId || '').trim()
  const adminAcc = String(fromAdminAccount || '').trim()
  const b = String(body || '').trim()
  if (!id) return { success: false, message: '訊息不存在' }
  if (!adminAcc) return { success: false, message: '未登入' }
  if (!b) return { success: false, message: '請輸入回覆內容' }

  const list = getMessages()
  const idx = list.findIndex((m) => m?.id === id)
  if (idx === -1) return { success: false, message: '訊息不存在' }

  const replies = Array.isArray(list[idx]?.replies) ? list[idx].replies : []
  replies.push({
    id: newId('reply'),
    fromRole: 'admin',
    from: adminAcc,
    fromName: getDisplayNameForAccount(adminAcc),
    body: b,
    createdAt: new Date().toISOString()
  })

  list[idx] = {
    ...list[idx],
    replies,
    status: 'read',
    readAt: list[idx]?.readAt || new Date().toISOString(),
    resolved: false,
    resolvedAt: null
  }
  persist(list)
  return { success: true }
}

