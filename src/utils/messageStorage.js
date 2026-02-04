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

/** 使用者看到的訊息：自己發給管理員的對話 + 管理員發給自己或全體的訊息 + 用戶對用戶的收發 */
export function getUserMessages(account) {
  const acc = String(account || '').trim()
  if (!acc) return []
  const list = getMessages()
  const fromMeToAdmin = list.filter((m) => !m?.type && String(m?.from || '').trim() === acc)
  const toMeFromAdmin = list.filter((m) => m?.type === 'admin_to_user' && (String(m?.to || '').trim() === acc || String(m?.to || '').trim() === '__all__'))
  const userToUserSent = list.filter((m) => m?.type === 'user_to_user' && String(m?.from || '').trim() === acc)
  const userToUserReceived = list.filter((m) => m?.type === 'user_to_user' && String(m?.to || '').trim() === acc)
  return [...fromMeToAdmin, ...toMeFromAdmin, ...userToUserSent, ...userToUserReceived].sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
}

export function getAdminInbox() {
  return getMessages()
    .filter((m) => {
      if (m?.type === 'admin_to_user' || m?.type === 'user_to_user') return false
      return true
    })
    .slice()
    .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
}

export function getAdminUnreadCount() {
  return getMessages().filter((m) => !m?.type && (m?.status || 'unread') === 'unread' && !m?.resolved).length
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

/** 管理員發送給指定用戶或全體（to = 帳號 或 '__all__'） */
export function addAdminToUserMessage({ fromAdminAccount, to, subject, body }) {
  const adminAcc = String(fromAdminAccount || '').trim()
  const toVal = String(to || '').trim()
  const b = String(body || '').trim()
  if (!adminAcc) return { success: false, message: '未登入' }
  if (!toVal) return { success: false, message: '請選擇發送對象' }
  if (!b) return { success: false, message: '請輸入內容' }

  const list = getMessages()
  const msg = {
    id: newId('msg'),
    type: 'admin_to_user',
    from: adminAcc,
    fromName: getDisplayNameForAccount(adminAcc),
    to: toVal,
    subject: String(subject || '').trim(),
    body: b,
    createdAt: new Date().toISOString()
  }
  list.push(msg)
  persist(list)
  return { success: true, message: '已送出', item: msg }
}

/** 用戶發送給指定用戶 */
export function addUserToUserMessage({ from, to, subject, body }) {
  const fromAcc = String(from || '').trim()
  const toAcc = String(to || '').trim()
  const b = String(body || '').trim()
  if (!fromAcc) return { success: false, message: '未登入' }
  if (!toAcc) return { success: false, message: '請選擇收件人' }
  if (fromAcc === toAcc) return { success: false, message: '無法發送給自己' }
  if (!b) return { success: false, message: '請輸入內容' }

  const list = getMessages()
  const msg = {
    id: newId('msg'),
    type: 'user_to_user',
    from: fromAcc,
    fromName: getDisplayNameForAccount(fromAcc),
    to: toAcc,
    toName: getDisplayNameForAccount(toAcc),
    subject: String(subject || '').trim(),
    body: b,
    createdAt: new Date().toISOString()
  }
  list.push(msg)
  persist(list)
  return { success: true, message: '已送出', item: msg }
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

