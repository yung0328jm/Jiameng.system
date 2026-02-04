import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import {
  getAllAdvances,
  getAdvancesByAccount,
  getPendingAdvances,
  addAdvance,
  rejectAdvance,
  markTransferred,
  getTotalTransferredByAccount,
  getPendingCountByAccount,
  getTransferredCountByAccount,
  getMonthlyTransferredByAccount
} from '../utils/advanceStorage.js'
import { useRealtimeKeys } from '../contexts/SyncContext'

const STATUS_LABEL = {
  pending: '審核中',
  transferred: '已匯款',
  rejected: '已駁回'
}

function Advance() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || '')
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState(null)
  const [myList, setMyList] = useState([])
  const [pendingList, setPendingList] = useState([])
  const [allList, setAllList] = useState([])

  const loadData = () => {
    if (currentUser) {
      setMyList(getAdvancesByAccount(currentUser))
    }
    if (userRole === 'admin') {
      setPendingList(getPendingAdvances())
      setAllList(getAllAdvances())
    }
  }

  useRealtimeKeys(['jiameng_advances'], loadData)

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    loadData()
  }, [])

  useEffect(() => {
    loadData()
  }, [currentUser, userRole])

  const handleSubmit = (e) => {
    e.preventDefault()
    setMessage(null)
    const amt = Math.max(0, Number(amount) || 0)
    if (amt <= 0) {
      setMessage({ type: 'error', text: '請輸入有效借支金額' })
      return
    }
    const r = String(reason || '').trim()
    if (!r) {
      setMessage({ type: 'error', text: '請填寫事由' })
      return
    }
    const result = addAdvance({ account: currentUser, amount: amt, reason: r })
    if (result.success) {
      setAmount('')
      setReason('')
      setMessage({ type: 'success', text: '預支申請已送出' })
      loadData()
    } else {
      setMessage({ type: 'error', text: result.message || '送出失敗' })
    }
  }

  const handleReject = (id) => {
    if (!window.confirm('確定駁回此預支申請？')) return
    const result = rejectAdvance(id, currentUser)
    if (result.success) {
      loadData()
    } else {
      alert(result.message || '操作失敗')
    }
  }

  const handleMarkTransferred = (id) => {
    if (!window.confirm('確定標記為已匯款？')) return
    const result = markTransferred(id, currentUser)
    if (result.success) {
      loadData()
    } else {
      alert(result.message || '操作失敗')
    }
  }

  const formatDate = (str) => {
    if (!str) return '-'
    const d = new Date(str)
    return d.toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
  }

  // 使用者：申請表單 + 我的申請紀錄 + 借支總額與每月統計
  const totalTransferred = currentUser ? getTotalTransferredByAccount(currentUser) : 0
  const monthlyData = currentUser ? getMonthlyTransferredByAccount(currentUser) : {}
  const monthlyEntries = Object.entries(monthlyData).sort(([a], [b]) => b.localeCompare(a))

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">預支申請</h2>

      {/* 使用者：申請表單 */}
      {currentUser && userRole !== 'admin' && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-3">提出預支申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm mb-1">借支金額</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full max-w-xs bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                placeholder="請輸入金額"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1">事由</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                placeholder="請填寫申請事由"
              />
            </div>
            {message && (
              <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</p>
            )}
            <button
              type="submit"
              className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium"
            >
              送出申請
            </button>
          </form>
        </section>
      )}

      {/* 使用者：我的申請紀錄 + 借支總額與每月統計 */}
      {currentUser && userRole !== 'admin' && (
        <>
          <section className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">借支總額與每月統計</h3>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
              <div className="text-gray-400 text-sm">累計已匯款借支總額</div>
              <div className="text-yellow-400 text-2xl font-bold">
                {Number(totalTransferred).toLocaleString()} 元
              </div>
            </div>
            {monthlyEntries.length > 0 && (
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">按月份統計（已匯款）</div>
                <ul className="space-y-1 text-white">
                  {monthlyEntries.map(([ym, amt]) => (
                    <li key={ym} className="flex justify-between">
                      <span>{ym}</span>
                      <span className="text-yellow-400 font-medium">{Number(amt).toLocaleString()} 元</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">我的申請紀錄</h3>
            {myList.length === 0 ? (
              <p className="text-gray-400">尚無申請紀錄</p>
            ) : (
              <ul className="space-y-3">
                {myList.map((r) => (
                  <li
                    key={r.id}
                    className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-white font-medium">{Number(r.amount || 0).toLocaleString()} 元</div>
                      <div className="text-gray-400 text-sm">{r.reason || '-'}</div>
                      <div className="text-gray-500 text-xs mt-1">
                        申請時間：{formatDate(r.createdAt)}
                        {(r.reviewedAt || r.transferredAt) && (
                          <> · 審核／匯款：{formatDate(r.transferredAt || r.reviewedAt)}</>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        r.status === 'pending'
                          ? 'bg-yellow-600 text-white'
                          : r.status === 'transferred'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 管理員：待審清單 + 全部紀錄 */}
      {userRole === 'admin' && (
        <>
          <section className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">待審核預支申請</h3>
            {pendingList.length === 0 ? (
              <p className="text-gray-400">目前無待審核申請</p>
            ) : (
              <ul className="space-y-3">
                {pendingList.map((r) => {
                  const name = getDisplayNameForAccount(r.account) || r.account
                  return (
                    <li
                      key={r.id}
                      className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-white font-medium">{name}（{r.account}）</div>
                        <div className="text-yellow-400">{Number(r.amount || 0).toLocaleString()} 元</div>
                        <div className="text-gray-400 text-sm">{r.reason || '-'}</div>
                        <div className="text-gray-500 text-xs mt-1">申請時間：{formatDate(r.createdAt)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleMarkTransferred(r.id)}
                          className="px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
                        >
                          已匯款
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(r.id)}
                          className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm"
                        >
                          駁回
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-lg font-semibold text-white mb-3">全部預支紀錄</h3>
            {allList.length === 0 ? (
              <p className="text-gray-400">尚無預支紀錄</p>
            ) : (
              <ul className="space-y-2">
                {[...allList].sort((a, b) => (new Date(b.createdAt || 0)).getTime() - (new Date(a.createdAt || 0)).getTime()).map((r) => {
                  const name = getDisplayNameForAccount(r.account) || r.account
                  return (
                    <li
                      key={r.id}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-white">{name} · {Number(r.amount || 0).toLocaleString()} 元</span>
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          r.status === 'pending' ? 'bg-yellow-600' : r.status === 'transferred' ? 'bg-green-600' : 'bg-gray-600'
                        } text-white`}
                      >
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default Advance
