import { useState, useEffect, useMemo } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDropdownOptionsByCategory } from '../utils/dropdownStorage'
import {
  getUsers,
  getAllAdvances,
  getAdvancesByAccount,
  getPendingAdvances,
  addAdvance,
  addManualAdvance,
  rejectAdvance,
  markTransferred,
  getTotalTransferredByAccount,
  getMonthlyTransferredByAccount,
  getAdvanceRepaymentStats,
  setAdvanceRepayment,
  getAdvanceApplicationPreview
} from '../utils/storage'
import { useRealtimeKeys } from '../contexts/SyncContext'

const STATUS_LABEL = {
  pending: '審核中',
  transferred: '已匯款',
  rejected: '已駁回'
}

const PAYMENT_LABEL = { cash: '已付現', transfer: '已匯款' }

/** 取得所有成員：參與人員 + 負責人選單（去重）+ 登入帳號中尚未出現在選單者 */
function getAllMembers() {
  const seen = new Set()
  const list = []
  const add = (account, displayName) => {
    const key = String(account || '').trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    list.push({ account: key, displayName: displayName || key })
  }
  const participants = getDropdownOptionsByCategory('participants') || []
  const responsible = getDropdownOptionsByCategory('responsible_persons') || []
  ;[...participants, ...responsible].forEach((opt) => {
    const name = (opt.value || '').trim()
    if (!name) return
    if (opt.boundAccount) add(opt.boundAccount.trim(), name)
    else add('name:' + name, name)
  })
  ;(getUsers() || []).forEach((u) => {
    const acc = (u?.account || '').trim()
    if (acc) add(acc, getDisplayNameForAccount(acc) || acc)
  })
  return list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
}

function getMemberDisplayName(account) {
  if (!account) return ''
  const s = String(account).trim()
  if (s.startsWith('name:')) return s.slice(5)
  return getDisplayNameForAccount(s) || s
}

function formatYmZh(ym) {
  if (!ym || ym.length < 7) return ym || ''
  const y = ym.slice(0, 4)
  const m = parseInt(ym.slice(5, 7), 10)
  if (Number.isNaN(m)) return ym
  return `${y}年${m}月`
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
  const [manualAccount, setManualAccount] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [manualPaymentMethod, setManualPaymentMethod] = useState('transfer')
  const [manualMessage, setManualMessage] = useState(null)
  const [filterByAccount, setFilterByAccount] = useState(null)
  const [repayAccount, setRepayAccount] = useState('')
  const [repayYearMonth, setRepayYearMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [repayAmount, setRepayAmount] = useState('')
  const [repayLastMonth, setRepayLastMonth] = useState('')
  const [openingEdited, setOpeningEdited] = useState(false)
  const [repayMessage, setRepayMessage] = useState(null)

  const advanceApplyPreview = useMemo(() => {
    if (!currentUser) return null
    return getAdvanceApplicationPreview(currentUser, amount)
  }, [currentUser, amount])

  const loadData = () => {
    if (currentUser) {
      setMyList(getAdvancesByAccount(currentUser))
    }
    if (userRole === 'admin') {
      setPendingList(getPendingAdvances())
      setAllList(getAllAdvances())
    }
  }

  useRealtimeKeys(['jiameng_advances', 'jiameng_advance_repayments'], loadData)

  useEffect(() => {
    if (repayAccount && repayYearMonth) {
      const stats = getAdvanceRepaymentStats(repayAccount, repayYearMonth)
      setRepayAmount(String(stats.actualRepayment))
      setRepayLastMonth(String(stats.lastMonthUnpaid))
      setOpeningEdited(false)
    }
  }, [repayAccount, repayYearMonth])

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

  const handleRepaymentSubmit = (e) => {
    e.preventDefault()
    setRepayMessage(null)
    const account = String(repayAccount || '').trim()
    if (!account) {
      setRepayMessage({ type: 'error', text: '請選擇成員' })
      return
    }
    const ym = String(repayYearMonth || '').trim()
    if (!ym) {
      setRepayMessage({ type: 'error', text: '請選擇年月' })
      return
    }
    const payload = { actual: repayAmount }
    if (openingEdited) {
      payload.correctOpening = true
      payload.lastMonthUnpaid = repayLastMonth
    }
    const result = setAdvanceRepayment(account, ym, payload)
    if (result.success) {
      setRepayMessage({ type: 'success', text: '已儲存還款' })
      setOpeningEdited(false)
      const stats = getAdvanceRepaymentStats(account, ym)
      setRepayLastMonth(String(stats.lastMonthUnpaid))
      loadData()
    } else {
      setRepayMessage({ type: 'error', text: result.message || '儲存失敗' })
    }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    setManualMessage(null)
    const account = String(manualAccount || '').trim()
    if (!account) {
      setManualMessage({ type: 'error', text: '請選擇成員' })
      return
    }
    const amt = Math.max(0, Number(manualAmount) || 0)
    if (amt <= 0) {
      setManualMessage({ type: 'error', text: '請輸入有效借支金額' })
      return
    }
    const reason = String(manualReason || '').trim()
    if (!reason) {
      setManualMessage({ type: 'error', text: '請填寫事由' })
      return
    }
    const result = addManualAdvance({
      account,
      amount: amt,
      reason,
      paymentMethod: manualPaymentMethod
    })
    if (result.success) {
      setManualAccount('')
      setManualAmount('')
      setManualReason('')
      setManualPaymentMethod('transfer')
      setManualMessage({ type: 'success', text: '已新增預支紀錄' })
      loadData()
    } else {
      setManualMessage({ type: 'error', text: result.message || '新增失敗' })
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
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 max-w-4xl mx-auto" suppressHydrationWarning>
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">工程款借貸</h2>

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
              <p className="text-gray-500 text-xs mt-1">
                試算之預估總欠款含：本月初尚欠、本月已撥借支、審核中申請與本次輸入金額（若核准並計入當月）。
              </p>
            </div>
            {advanceApplyPreview && (
              <div className="rounded-lg border border-gray-600 bg-gray-800/90 p-3 sm:p-4 text-sm space-y-2 max-w-lg">
                <div className="text-gray-400 text-xs leading-relaxed">
                  試算：若本次申請核准並計入{formatYmZh(advanceApplyPreview.yearMonth)}，下列供評估（實際還款以管理員登記為準）。
                </div>
                <div className="flex justify-between gap-2 text-white">
                  <span className="text-gray-300 shrink-0">預估總欠款</span>
                  <span className="font-semibold tabular-nums text-right text-yellow-300">
                    {advanceApplyPreview.projectedDebtTotal.toLocaleString()} 元
                  </span>
                </div>
              </div>
            )}
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium"
              >
                送出申請
              </button>
              <span className="text-amber-300 text-base sm:text-lg font-medium animate-advance-notice-blink">
                謹慎理財 小心投資
              </span>
            </div>
          </form>
        </section>
      )}

      {/* 使用者：我的申請紀錄 + 借支總額與每月統計 */}
      {currentUser && userRole !== 'admin' && (() => {
            const now = new Date()
            const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const stats = getAdvanceRepaymentStats(currentUser, currentYm)
            return (
        <>
          <section className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">借支總額與每月統計</h3>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
              <div className="text-gray-400 text-sm">累計已匯款借支總額</div>
              <div className="text-yellow-400 text-2xl font-bold">
                {Number(totalTransferred).toLocaleString()} 元
              </div>
            </div>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
              <div className="text-gray-400 text-sm mb-3">還款總覽（{formatYmZh(currentYm)}）</div>
              <ul className="space-y-2.5 text-white text-sm sm:text-base">
                {stats.prevYearMonth ? (
                  <>
                    <li className="flex justify-between gap-2">
                      <span className="text-gray-300 shrink-0">{formatYmZh(stats.prevYearMonth)} 已還款</span>
                      <span className="text-green-400 font-medium text-right">{Number(stats.prevMonthRepayment || 0).toLocaleString()} 元</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-gray-300 shrink-0">{formatYmZh(stats.prevYearMonth)} 結算後尚欠</span>
                      <span className="text-amber-200 font-medium text-right">{Number(stats.prevMonthRemaining || 0).toLocaleString()} 元</span>
                    </li>
                  </>
                ) : null}
                <li className="flex justify-between gap-2">
                  <span className="text-gray-300 shrink-0">本月初尚欠（上月結轉）</span>
                  <span className="text-yellow-400 font-medium text-right">{Number(stats.lastMonthUnpaid).toLocaleString()} 元</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-gray-300 shrink-0">本月新借支</span>
                  <span className="text-yellow-400 font-medium text-right">{Number(stats.monthAdded).toLocaleString()} 元</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-gray-300 shrink-0">本月已還款（登記）</span>
                  <span className="text-green-400 font-medium text-right">{Number(stats.actualRepayment).toLocaleString()} 元</span>
                </li>
                <li className="flex justify-between gap-2 border-t border-gray-600 pt-2 mt-1">
                  <span className="text-white font-medium shrink-0">本月結算後尚欠</span>
                  <span className="text-amber-300 font-bold text-right">{Number(stats.monthRemaining).toLocaleString()} 元</span>
                </li>
              </ul>
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
                      {r.status === 'transferred'
                        ? (PAYMENT_LABEL[r.paymentMethod] || '已匯款')
                        : (STATUS_LABEL[r.status] || r.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
            )
          })()}

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
                  const name = getMemberDisplayName(r.account)
                  return (
                    <li
                      key={r.id}
                      className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-white font-medium">{name}{!String(r.account || '').startsWith('name:') ? `（${r.account}）` : ''}</div>
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
          <section className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">設定還款與未清償</h3>
            <p className="text-gray-400 text-sm mb-4 max-w-xl">
              先選成員與月份，上方為<strong className="text-gray-300">只讀總覽</strong>（對帳用）；下方僅填寫本月還款與必要時調整「本月初尚欠」。
            </p>
            <form onSubmit={handleRepaymentSubmit} className="space-y-4 max-w-lg">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-gray-300 text-sm mb-1">選擇成員</label>
                  <select
                    value={repayAccount}
                    onChange={(e) => setRepayAccount(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                  >
                    <option value="">請選擇成員</option>
                    {getAllMembers().map((m) => (
                      <option key={m.account} value={m.account}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:w-44 shrink-0">
                  <label className="block text-gray-300 text-sm mb-1">年月</label>
                  <input
                    type="month"
                    value={repayYearMonth}
                    onChange={(e) => setRepayYearMonth(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>
              {repayAccount && repayYearMonth && (() => {
                const stats = getAdvanceRepaymentStats(repayAccount, repayYearMonth)
                const previewOpening = openingEdited
                  ? Math.max(0, Number(repayLastMonth) || 0)
                  : (Number(stats.lastMonthUnpaid) || 0)
                const previewAdded = Number(stats.monthAdded) || 0
                const previewPaid = Math.max(0, Number(repayAmount) || 0)
                const previewRemaining = Math.max(0, previewOpening + previewAdded - previewPaid)
                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-600 bg-gray-900/80 p-4 sm:p-5">
                      <div className="text-yellow-400 font-semibold mb-3 text-base">
                        {getMemberDisplayName(repayAccount)} · {formatYmZh(repayYearMonth)}
                      </div>
                      <p className="text-gray-500 text-xs mb-3">以下數字由系統依預支與還款紀錄計算，無需逐欄猜測。</p>
                      <dl className="space-y-3 text-sm sm:text-base">
                        {stats.prevYearMonth ? (
                          <>
                            <div className="flex justify-between gap-3 py-2 border-b border-gray-700/80">
                              <dt className="text-gray-400">{formatYmZh(stats.prevYearMonth)} 實際還款</dt>
                              <dd className="text-green-400 font-semibold tabular-nums">{Number(stats.prevMonthRepayment || 0).toLocaleString()} 元</dd>
                            </div>
                            <div className="flex justify-between gap-3 py-2 border-b border-gray-700/80">
                              <dt className="text-gray-400">{formatYmZh(stats.prevYearMonth)} 結算後尚欠</dt>
                              <dd className="text-amber-200 font-semibold tabular-nums">{Number(stats.prevMonthRemaining || 0).toLocaleString()} 元</dd>
                            </div>
                          </>
                        ) : null}
                        <div className="flex justify-between gap-3 py-2 border-b border-gray-700/80">
                          <dt className="text-gray-400">本月初尚欠（上月結轉）</dt>
                          <dd className="text-yellow-300 font-semibold tabular-nums">{previewOpening.toLocaleString()} 元</dd>
                        </div>
                        <div className="flex justify-between gap-3 py-2 border-b border-gray-700/80">
                          <dt className="text-gray-400">本月新借支（已匯款）</dt>
                          <dd className="text-white font-medium tabular-nums">{Number(stats.monthAdded).toLocaleString()} 元</dd>
                        </div>
                        <div className="flex justify-between gap-3 py-2 border-b border-gray-700/80">
                          <dt className="text-gray-400">本月實際還款（登記）</dt>
                          <dd className="text-green-400 font-semibold tabular-nums">{previewPaid.toLocaleString()} 元</dd>
                        </div>
                        <div className="flex justify-between gap-3 pt-1">
                          <dt className="text-white font-medium">預覽 · 本月結算後尚欠</dt>
                          <dd className="text-amber-300 font-bold text-lg tabular-nums">{previewRemaining.toLocaleString()} 元</dd>
                        </div>
                      </dl>
                      <p className="text-gray-500 text-xs mt-3">
                        上月結算後尚欠會自動帶入本月初尚欠。預覽 = 本月初尚欠 + 本月新借支 − 本月實際還款。一般存檔不會改動上月數字。
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-600 bg-gray-800/90 p-4 space-y-4">
                      <div className="text-gray-300 text-sm font-medium">管理者填寫</div>
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">本月實際還款（由薪資／匯款登記）</label>
                        <input
                          type="number"
                          min={0}
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white text-lg"
                        />
                      </div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-400 select-none">進階：校正「本月初尚欠」</summary>
                        <p className="text-gray-500 text-xs mt-2 mb-2">僅在與實際帳務不符時調整；修改後儲存才會覆寫上月結轉。</p>
                        <input
                          type="number"
                          min={0}
                          value={repayLastMonth}
                          onChange={(e) => {
                            setRepayLastMonth(e.target.value)
                            setOpeningEdited(true)
                          }}
                          className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                        />
                      </details>
                    </div>
                  </div>
                )
              })()}
              {repayMessage && (
                <p className={repayMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>{repayMessage.text}</p>
              )}
              <button
                type="submit"
                disabled={!repayAccount || !repayYearMonth}
                className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
              >
                儲存還款
              </button>
            </form>
          </section>
          <section className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">手動新增預支紀錄</h3>
            <p className="text-gray-400 text-sm mb-3">用於記錄非 APP 申請的預支（例如現場拿現金），可選擇付款方式。</p>
            <form onSubmit={handleManualSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-gray-300 text-sm mb-1">選擇成員</label>
                <select
                  value={manualAccount}
                  onChange={(e) => setManualAccount(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                >
                  <option value="">請選擇成員</option>
                  {getAllMembers().map((m) => (
                    <option key={m.account} value={m.account}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">借支金額</label>
                <input
                  type="number"
                  min={1}
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                  placeholder="請輸入金額"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">事由</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                  placeholder="請填寫事由"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">付款方式</label>
                <select
                  value={manualPaymentMethod}
                  onChange={(e) => setManualPaymentMethod(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white"
                >
                  <option value="transfer">匯款</option>
                  <option value="cash">現金</option>
                </select>
              </div>
              {manualMessage && (
                <p className={manualMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>{manualMessage.text}</p>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium"
              >
                新增預支紀錄
              </button>
            </form>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-white mb-3">全部預支紀錄</h3>
            {filterByAccount && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-gray-400 text-sm">
                  正在顯示：<span className="text-yellow-400 font-medium">{getMemberDisplayName(filterByAccount)}</span> 的預支紀錄
                </span>
                <button
                  type="button"
                  onClick={() => setFilterByAccount(null)}
                  className="px-2 py-1 text-sm rounded bg-gray-600 hover:bg-gray-500 text-white"
                >
                  顯示全部
                </button>
              </div>
            )}
            {allList.length === 0 ? (
              <p className="text-gray-400">尚無預支紀錄</p>
            ) : (
              <ul className="space-y-2">
                {[...allList]
                  .filter((r) => !filterByAccount || String(r.account || '').trim() === String(filterByAccount).trim())
                  .sort((a, b) => (new Date(b.createdAt || 0)).getTime() - (new Date(a.createdAt || 0)).getTime())
                  .map((r) => {
                  const name = getMemberDisplayName(r.account)
                  return (
                    <li
                      key={r.id}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-white">
                          <button
                            type="button"
                            onClick={() => setFilterByAccount(r.account)}
                            className="hover:text-yellow-400 hover:underline focus:outline-none focus:underline text-inherit"
                          >
                            {name}
                          </button>
                          <span> · {Number(r.amount || 0).toLocaleString()} 元</span>
                        </span>
                        <span className="text-gray-400 text-sm">{formatDate(r.createdAt)}</span>
                        {r.reason && <span className="text-gray-300 text-sm">原因：{r.reason}</span>}
                      </div>
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded shrink-0 ${
                          r.status === 'pending' ? 'bg-yellow-600' : r.status === 'transferred' ? 'bg-green-600' : 'bg-gray-600'
                        } text-white`}
                      >
                        {r.status === 'transferred'
                          ? (PAYMENT_LABEL[r.paymentMethod] || '已匯款')
                          : (STATUS_LABEL[r.status] || r.status)}
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
