import { useEffect, useMemo, useState } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { touchLastSeen } from '../utils/lastSeenStorage'
import {
  addUserMessage,
  addAdminReply,
  addAdminToUserMessage,
  addUserToUserMessage,
  getAdminInbox,
  getAdminUnreadCount,
  getUserMessages,
  setAdminRead,
  setAdminResolved
} from '../utils/messageStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getPublicProfiles } from '../utils/authSupabase'

function formatTime(iso) {
  try { return new Date(iso).toLocaleString('zh-TW') } catch (_) { return iso || '' }
}

function Messages() {
  const [role, setRole] = useState(null)
  const [me, setMe] = useState('')
  const [revision, setRevision] = useState(0)

  const [compose, setCompose] = useState({ subject: '', body: '' })
  const [adminFilter, setAdminFilter] = useState({ q: '', status: 'all', showResolved: false })
  const [replyDrafts, setReplyDrafts] = useState({}) // { [msgId]: string }
  const [adminSend, setAdminSend] = useState({ to: '__all__', targetAccount: '', subject: '', body: '' })
  const [recipients, setRecipients] = useState([]) // { account, name }[]
  const [userRecipients, setUserRecipients] = useState([]) // 用戶可發送的對象（排除自己）
  const [userCompose, setUserCompose] = useState({ to: '', subject: '', body: '' }) // 發送給用戶

  const refetch = () => setRevision((r) => r + 1)
  useRealtimeKeys(['jiameng_messages'], refetch)

  useEffect(() => {
    setRole(getCurrentUserRole())
    setMe(getCurrentUser() || '')
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    let mounted = true
    const load = async () => {
      if (isAuthSupabase()) {
        try {
          const profiles = await getPublicProfiles()
          if (mounted && Array.isArray(profiles)) {
            setRecipients(profiles.filter((p) => !p?.is_admin).map((p) => ({ account: p?.account || '', name: p?.display_name || p?.account || '' })))
          }
        } catch (_) {}
      } else {
        const users = (getUsers() || []).filter((u) => u?.role !== 'admin')
        setRecipients(users.map((u) => ({ account: u?.account || '', name: u?.name || u?.account || '' })))
      }
    }
    load()
    return () => { mounted = false }
  }, [role])

  // 一般用戶：可發送對象（排除自己與管理員）
  useEffect(() => {
    if (role === 'admin' || !me) return
    let mounted = true
    const load = async () => {
      if (isAuthSupabase()) {
        try {
          const profiles = await getPublicProfiles()
          if (mounted && Array.isArray(profiles)) {
            setUserRecipients(profiles.filter((p) => !p?.is_admin && (p?.account || '') !== me).map((p) => ({ account: p?.account || '', name: p?.display_name || p?.account || '' })))
          }
        } catch (_) {}
      } else {
        const users = (getUsers() || []).filter((u) => u?.role !== 'admin' && (u?.account || '') !== me)
        setUserRecipients(users.map((u) => ({ account: u?.account || '', name: u?.name || u?.account || '' })))
      }
    }
    load()
    return () => { mounted = false }
  }, [role, me])

  // 使用者端：進入站內信就視為「已查看回覆」
  useEffect(() => {
    if (!me) return
    if (role === 'admin') return
    touchLastSeen(me, 'messages')
  }, [me, role])

  const myName = useMemo(() => getDisplayNameForAccount(me), [me])

  const userList = useMemo(() => getUserMessages(me), [me, revision])
  const adminListRaw = useMemo(() => getAdminInbox(), [revision])
  const adminUnread = useMemo(() => getAdminUnreadCount(), [revision])

  const adminList = useMemo(() => {
    const q = String(adminFilter.q || '').trim().toLowerCase()
    const status = adminFilter.status
    const showResolved = !!adminFilter.showResolved
    return adminListRaw.filter((m) => {
      if (!showResolved && m?.resolved) return false
      if (status !== 'all' && (m?.status || 'unread') !== status) return false
      if (!q) return true
      const hay = `${m?.from || ''} ${m?.fromName || ''} ${m?.subject || ''} ${m?.body || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [adminListRaw, adminFilter])

  if (!me) {
    return (
      <div className="bg-charcoal rounded-lg p-6">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">站內信</h2>
        <p className="text-gray-400">請先登入後使用。</p>
      </div>
    )
  }

  const isAdmin = role === 'admin'

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">站內信</h2>
          <p className="text-gray-400 text-sm mt-1">
            {isAdmin ? `管理員收件匣（未讀 ${adminUnread}）` : `發送訊息給管理員（${myName}）`}
          </p>
        </div>
      </div>

      {!isAdmin && (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
            <h3 className="text-white font-semibold mb-3">發送給管理員</h3>
            <div className="grid gap-3">
              <input
                value={compose.subject}
                onChange={(e) => setCompose((p) => ({ ...p, subject: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                placeholder="主旨（可選）"
              />
              <textarea
                value={compose.body}
                onChange={(e) => setCompose((p) => ({ ...p, body: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 min-h-[120px]"
                placeholder="內容（例如：需要協助、陳情、建議…）"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const r = addUserMessage({ from: me, subject: compose.subject, body: compose.body })
                    if (!r?.success) return alert(r?.message || '送出失敗')
                    setCompose({ subject: '', body: '' })
                    refetch()
                    alert('已送出')
                  }}
                  className="bg-yellow-400 text-gray-900 px-4 py-2 rounded font-semibold hover:bg-yellow-500"
                >
                  送出
                </button>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">發送給用戶</h3>
            <div className="grid gap-3">
              <select
                value={userCompose.to}
                onChange={(e) => setUserCompose((p) => ({ ...p, to: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              >
                <option value="">請選擇收件人</option>
                {userRecipients.map((r) => (
                  <option key={r.account} value={r.account}>{r.name}（{r.account}）</option>
                ))}
              </select>
              <input
                value={userCompose.subject}
                onChange={(e) => setUserCompose((p) => ({ ...p, subject: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                placeholder="主旨（可選）"
              />
              <textarea
                value={userCompose.body}
                onChange={(e) => setUserCompose((p) => ({ ...p, body: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 min-h-[100px]"
                placeholder="內容"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const r = addUserToUserMessage({ from: me, to: userCompose.to, subject: userCompose.subject, body: userCompose.body })
                    if (!r?.success) return alert(r?.message || '送出失敗')
                    setUserCompose({ to: '', subject: '', body: '' })
                    refetch()
                    alert('已送出')
                  }}
                  className="bg-yellow-400 text-gray-900 px-4 py-2 rounded font-semibold hover:bg-yellow-500"
                >
                  送出
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {isAdmin ? (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">發送訊息給用戶</h3>
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-4 items-center">
                <label className="text-gray-300 text-sm">發送給</label>
                <label className="text-gray-300 text-sm flex items-center gap-2">
                  <input
                    type="radio"
                    name="adminSendTo"
                    checked={adminSend.to === '__all__'}
                    onChange={() => setAdminSend((p) => ({ ...p, to: '__all__', targetAccount: '' }))}
                  />
                  全體用戶
                </label>
                <label className="text-gray-300 text-sm flex items-center gap-2">
                  <input
                    type="radio"
                    name="adminSendTo"
                    checked={adminSend.to === 'user'}
                    onChange={() => setAdminSend((p) => ({ ...p, to: 'user' }))}
                  />
                  指定用戶
                </label>
                {adminSend.to === 'user' && (
                  <select
                    value={adminSend.targetAccount}
                    onChange={(e) => setAdminSend((p) => ({ ...p, targetAccount: e.target.value }))}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">請選擇用戶</option>
                    {recipients.map((r) => (
                      <option key={r.account} value={r.account}>{r.name}（{r.account}）</option>
                    ))}
                  </select>
                )}
              </div>
              <input
                value={adminSend.subject}
                onChange={(e) => setAdminSend((p) => ({ ...p, subject: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                placeholder="主旨（可選）"
              />
              <textarea
                value={adminSend.body}
                onChange={(e) => setAdminSend((p) => ({ ...p, body: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 min-h-[100px]"
                placeholder="內容"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const toVal = adminSend.to === '__all__' ? '__all__' : (adminSend.targetAccount || '').trim()
                    if (adminSend.to === 'user' && !toVal) return alert('請選擇指定用戶')
                    const r = addAdminToUserMessage({
                      fromAdminAccount: me,
                      to: toVal,
                      subject: adminSend.subject,
                      body: adminSend.body
                    })
                    if (!r?.success) return alert(r?.message || '送出失敗')
                    setAdminSend((p) => ({ ...p, subject: '', body: '', targetAccount: '' }))
                    refetch()
                    alert('已送出')
                  }}
                  className="bg-yellow-400 text-gray-900 px-4 py-2 rounded font-semibold hover:bg-yellow-500"
                >
                  送出
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <h3 className="text-white font-semibold">收件匣</h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={adminFilter.q}
                onChange={(e) => setAdminFilter((p) => ({ ...p, q: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                placeholder="搜尋帳號/姓名/主旨/內容"
              />
              <select
                value={adminFilter.status}
                onChange={(e) => setAdminFilter((p) => ({ ...p, status: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              >
                <option value="all">全部</option>
                <option value="unread">未讀</option>
                <option value="read">已讀</option>
              </select>
              <label className="text-gray-300 text-sm flex items-center gap-2 px-2 py-2">
                <input
                  type="checkbox"
                  checked={adminFilter.showResolved}
                  onChange={(e) => setAdminFilter((p) => ({ ...p, showResolved: e.target.checked }))}
                />
                顯示已結案
              </label>
            </div>
          </div>

          {adminList.length === 0 ? (
            <div className="text-gray-400 text-center py-10">目前沒有訊息</div>
          ) : (
            <div className="space-y-3">
              {adminList.map((m) => {
                const id = m?.id
                const status = m?.status || 'unread'
                const resolved = !!m?.resolved
                const replies = Array.isArray(m?.replies) ? m.replies : []
                return (
                  <div key={id} className={`rounded-lg border p-4 ${status === 'unread' ? 'border-yellow-400/60 bg-gray-900' : 'border-gray-700 bg-gray-900/40'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">
                          {(m?.subject || '（無主旨）')} {resolved ? <span className="text-xs text-green-300">（已結案）</span> : null}
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          來自：{m?.fromName || m?.from || '未知'}（{m?.from || '未知帳號'}）｜{formatTime(m?.createdAt)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { setAdminRead(id, status !== 'read'); refetch() }}
                          className="px-3 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white"
                        >
                          {status === 'read' ? '標記未讀' : '標記已讀'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAdminResolved(id, !resolved); refetch() }}
                          className={`px-3 py-2 text-sm rounded ${resolved ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
                        >
                          {resolved ? '取消結案' : '結案'}
                        </button>
                      </div>
                    </div>

                    <div className="text-gray-200 text-sm mt-3 whitespace-pre-wrap">{m?.body || ''}</div>

                    {replies.length > 0 && (
                      <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
                        <div className="text-gray-300 text-sm font-semibold">回覆</div>
                        {replies.map((r) => (
                          <div key={r.id} className="bg-gray-800 border border-gray-700 rounded p-3">
                            <div className="text-gray-400 text-xs">
                              {r?.fromName || r?.from || '管理員'}｜{formatTime(r?.createdAt)}
                            </div>
                            <div className="text-gray-200 text-sm mt-1 whitespace-pre-wrap">{r?.body || ''}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 border-t border-gray-700 pt-3">
                      <div className="text-gray-300 text-sm font-semibold mb-2">新增回覆</div>
                      <textarea
                        value={replyDrafts[id] || ''}
                        onChange={(e) => setReplyDrafts((p) => ({ ...p, [id]: e.target.value }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 min-h-[90px]"
                        placeholder="輸入回覆內容…"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const r = addAdminReply(id, { fromAdminAccount: me, body: replyDrafts[id] || '' })
                            if (!r?.success) return alert(r?.message || '回覆失敗')
                            setReplyDrafts((p) => ({ ...p, [id]: '' }))
                            refetch()
                            alert('已回覆')
                          }}
                          className="bg-yellow-400 text-gray-900 px-4 py-2 rounded font-semibold hover:bg-yellow-500"
                        >
                          送出回覆
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-4">我的訊息</h3>
          {userList.length === 0 ? (
            <div className="text-gray-400 text-center py-10">尚無訊息</div>
          ) : (
            <div className="space-y-3">
              {userList.map((m) => {
                if (m?.type === 'admin_to_user') {
                  return (
                    <div key={m.id} className="rounded-lg border border-yellow-400/50 bg-gray-900/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-yellow-300 text-xs font-medium">管理員發送</div>
                          <div className="text-white font-semibold truncate mt-1">{m.subject || '（無主旨）'}</div>
                          <div className="text-gray-400 text-xs mt-1">
                            {m?.fromName || m?.from || '管理員'}｜發送給：{m?.to === '__all__' ? '全體用戶' : (m?.to || '')}｜{formatTime(m?.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="text-gray-200 text-sm mt-3 whitespace-pre-wrap">{m?.body || ''}</div>
                    </div>
                  )
                }
                if (m?.type === 'user_to_user') {
                  const isSent = String(m?.from || '').trim() === me
                  return (
                    <div key={m.id} className={`rounded-lg border p-4 ${isSent ? 'border-gray-600 bg-gray-900/40' : 'border-blue-400/40 bg-gray-900/60'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-xs font-medium ${isSent ? 'text-gray-400' : 'text-blue-300'}`}>
                            {isSent ? `發送給 ${m?.toName || m?.to || '用戶'}` : `來自 ${m?.fromName || m?.from || '用戶'}`}
                          </div>
                          <div className="text-white font-semibold truncate mt-1">{m.subject || '（無主旨）'}</div>
                          <div className="text-gray-400 text-xs mt-1">{formatTime(m?.createdAt)}</div>
                        </div>
                      </div>
                      <div className="text-gray-200 text-sm mt-3 whitespace-pre-wrap">{m?.body || ''}</div>
                    </div>
                  )
                }
                const replies = Array.isArray(m?.replies) ? m.replies : []
                return (
                  <div key={m.id} className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{m.subject || '（無主旨）'}</div>
                        <div className="text-gray-400 text-xs mt-1">
                          {formatTime(m.createdAt)}｜管理員狀態：{(m.status || 'unread') === 'read' ? '已讀' : '未讀'}{m.resolved ? '｜已結案' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-200 text-sm mt-3 whitespace-pre-wrap">{m.body || ''}</div>

                    {replies.length > 0 && (
                      <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
                        <div className="text-gray-300 text-sm font-semibold">管理員回覆</div>
                        {replies.map((r) => (
                          <div key={r.id} className="bg-gray-800 border border-gray-700 rounded p-3">
                            <div className="text-gray-400 text-xs">{formatTime(r.createdAt)}</div>
                            <div className="text-gray-200 text-sm mt-1 whitespace-pre-wrap">{r.body || ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Messages

