import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  getRewardConfig,
  setRewardConfig,
  getCheckInRecords,
  hasCheckedIn,
  performCheckIn
} from '../utils/checkInStorage'
import { addWalletBalance, addTransaction } from '../utils/walletStorage'
import { addItemToInventory } from '../utils/inventoryStorage'
import { getItems } from '../utils/itemStorage'

function CheckIn() {
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [rewardConfig, setRewardConfigState] = useState(() => getRewardConfig())
  const [records, setRecords] = useState({})
  const [yearMonth, setYearMonth] = useState(() => {
    const t = new Date()
    return { year: t.getFullYear(), month: t.getMonth() + 1 }
  })
  const [showRewardModal, setShowRewardModal] = useState(false)
  const [editingDay, setEditingDay] = useState(null)
  const [editForm, setEditForm] = useState({ rewardType: 'jiameng_coin', rewardAmount: 10, rewardItemId: '', rewardDescription: '' })
  const [message, setMessage] = useState(null)
  const items = getItems()

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    if (user) {
      setRecords(getCheckInRecords(user))
    }
    setRewardConfigState(getRewardConfig())
  }, [])

  const dateStr = (y, m, d) => {
    const ms = String(m).padStart(2, '0')
    const ds = String(d).padStart(2, '0')
    return `${y}-${ms}-${ds}`
  }

  const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate()

  const handleCellClick = (day) => {
    if (!currentUser) {
      setMessage({ type: 'error', text: '請先登入' })
      return
    }
    const y = yearMonth.year
    const m = yearMonth.month
    const maxDay = getDaysInMonth(y, m)
    if (day < 1 || day > maxDay) return
    const ds = dateStr(y, m, day)
    if (hasCheckedIn(currentUser, ds)) {
      setMessage({ type: 'info', text: '該日已簽到' })
      return
    }
    // 僅允許簽到「今天」
    if (y !== currentYear || m !== currentMonth || day !== currentDay) {
      setMessage({ type: 'info', text: '僅可簽到當日' })
      return
    }
    const result = performCheckIn(currentUser, ds)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '簽到失敗' })
      return
    }
    const { reward } = result
    if (reward.rewardType === 'jiameng_coin' && reward.rewardAmount > 0) {
      addWalletBalance(currentUser, reward.rewardAmount)
      addTransaction({
        type: 'checkin',
        from: 'system',
        to: currentUser,
        amount: reward.rewardAmount,
        description: `每日簽到（第 ${day} 日）`
      })
    } else if (reward.rewardType === 'item' && reward.rewardItemId && reward.rewardAmount > 0) {
      const addResult = addItemToInventory(currentUser, reward.rewardItemId, reward.rewardAmount)
      if (!addResult.success) {
        setMessage({ type: 'error', text: addResult.message || '發放道具失敗' })
        return
      }
      addTransaction({
        type: 'checkin_item',
        from: 'system',
        to: currentUser,
        amount: 0,
        description: `每日簽到（第 ${day} 日）領取道具`
      })
    }
    setRecords(getCheckInRecords(currentUser))
    setMessage({ type: 'success', text: `簽到成功！獲得：${reward.rewardDescription || `${reward.rewardAmount} 佳盟幣`}` })
  }

  const handleOpenEdit = (day) => {
    const r = rewardConfig.days[day] || { rewardType: 'jiameng_coin', rewardAmount: 10, rewardDescription: '' }
    setEditingDay(day)
    setEditForm({
      rewardType: r.rewardType || 'jiameng_coin',
      rewardAmount: r.rewardAmount ?? 10,
      rewardItemId: r.rewardItemId || '',
      rewardDescription: r.rewardDescription || ''
    })
    setShowRewardModal(true)
  }

  const handleSaveReward = () => {
    if (editingDay == null) return
    const next = { ...rewardConfig, days: { ...rewardConfig.days } }
    const desc = editForm.rewardType === 'jiameng_coin'
      ? `${editForm.rewardAmount} 佳盟幣`
      : editForm.rewardType === 'item' && editForm.rewardItemId
        ? (items.find(i => i.id === editForm.rewardItemId)?.name || '道具') + ' x' + (editForm.rewardAmount || 1)
        : editForm.rewardDescription || ''
    next.days[editingDay] = {
      rewardType: editForm.rewardType,
      rewardAmount: editForm.rewardAmount || 0,
      rewardItemId: editForm.rewardItemId || undefined,
      rewardDescription: desc
    }
    const saveResult = setRewardConfig(next)
    if (saveResult.success) setRewardConfigState(getRewardConfig())
    setShowRewardModal(false)
    setEditingDay(null)
    setMessage({ type: 'success', text: '獎勵已更新' })
  }

  const maxDay = getDaysInMonth(yearMonth.year, yearMonth.month)
  const isThisMonth = yearMonth.year === currentYear && yearMonth.month === currentMonth

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400 mb-1">每日簽到</h1>
            <p className="text-gray-400">點擊當日格子即可簽到並領取獎勵</p>
          </div>
          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => { setEditingDay(0); setEditForm({ rewardType: 'jiameng_coin', rewardAmount: 10, rewardItemId: '', rewardDescription: '' }); setShowRewardModal(true); }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              獎勵設定說明
            </button>
          )}
        </div>

        {message && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-600' :
              message.type === 'error' ? 'bg-red-900/50 text-red-300 border border-red-600' :
              'bg-blue-900/50 text-blue-300 border border-blue-600'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                let { year, month } = yearMonth
                if (month <= 1) { year--; month = 12 } else { month-- }
                setYearMonth({ year, month })
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg"
              aria-label="上一個月"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-gray-100 font-medium min-w-[120px] text-center">
              {yearMonth.year} 年 {yearMonth.month} 月（{maxDay} 天）
            </span>
            <button
              type="button"
              onClick={() => {
                let { year, month } = yearMonth
                if (month >= 12) { year++; month = 1 } else { month++ }
                setYearMonth({ year, month })
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg"
              aria-label="下一個月"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-px sm:gap-1">
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => {
            const ds = dateStr(yearMonth.year, yearMonth.month, day)
            const signed = currentUser ? hasCheckedIn(currentUser, ds) : false
            const reward = rewardConfig.days[day] || { rewardDescription: `${10 + Math.min(day, 40)} 佳盟幣` }
            const isToday = isThisMonth && day === currentDay
            const canClick = currentUser && isToday && !signed
            const isPast = isThisMonth && day < currentDay

            return (
              <div
                key={day}
                className={`
                  relative rounded border p-0.5 sm:p-1 min-h-[80px] sm:min-h-[100px] flex flex-col items-center justify-center overflow-hidden min-w-0
                  ${signed ? 'bg-green-900/30 border-green-500' :
                    isToday ? 'bg-yellow-900/30 border-yellow-500 hover:bg-yellow-800/40' :
                      isPast ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-800 border-gray-600'}
                  ${canClick ? 'cursor-pointer' : (userRole === 'admin' ? 'cursor-pointer' : 'cursor-default')}
                `}
                onClick={() => {
                  if (userRole === 'admin') handleOpenEdit(day)
                  else if (canClick) handleCellClick(day)
                }}
                role={(userRole === 'admin') || canClick ? 'button' : undefined}
              >
                <div className="text-[10px] sm:text-xs font-bold text-yellow-400/90 mb-0.5">{day}</div>
                <div className="text-[9px] sm:text-[10px] text-gray-400 text-center line-clamp-2 min-w-0 w-full px-0.5">{reward.rewardDescription || ''}</div>
                {signed && <div className="absolute top-0.5 right-1 text-green-400 text-[10px]">✓</div>}
                {userRole === 'admin' && (
                  <div className="absolute bottom-0.5 right-1 text-gray-500 text-[9px]">編輯</div>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-gray-500 text-sm">
          簽到表依各月份實際天數顯示（28～31 格）；每個自然日可簽到一次，僅可簽到「今天」；管理員可點擊各格設定該日獎勵。
        </p>
      </div>

      {showRewardModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-yellow-500 w-full max-w-md shadow-xl">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-yellow-400">
                {editingDay > 0 ? `第 ${editingDay} 日獎勵` : '獎勵說明'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowRewardModal(false); setEditingDay(null); }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {editingDay > 0 && (
                <>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">獎勵類型</label>
                    <select
                      value={editForm.rewardType}
                      onChange={(e) => setEditForm({ ...editForm, rewardType: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="jiameng_coin">佳盟幣</option>
                      <option value="item">道具</option>
                    </select>
                  </div>
                  {editForm.rewardType === 'jiameng_coin' && (
                    <div>
                      <label className="block text-gray-300 text-sm mb-1">佳盟幣數量</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.rewardAmount}
                        onChange={(e) => setEditForm({ ...editForm, rewardAmount: Number(e.target.value) || 0 })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>
                  )}
                  {editForm.rewardType === 'item' && (
                    <>
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">道具</label>
                        <select
                          value={editForm.rewardItemId}
                          onChange={(e) => setEditForm({ ...editForm, rewardItemId: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        >
                          <option value="">請選擇</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>{it.icon} {it.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">數量</label>
                        <input
                          type="number"
                          min="1"
                          value={editForm.rewardAmount}
                          onChange={(e) => setEditForm({ ...editForm, rewardAmount: Number(e.target.value) || 1 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">顯示說明（選填）</label>
                    <input
                      type="text"
                      value={editForm.rewardDescription}
                      onChange={(e) => setEditForm({ ...editForm, rewardDescription: e.target.value })}
                      placeholder="例如：10 佳盟幣"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                </>
              )}
              {editingDay === 0 && (
                <p className="text-gray-400">
                  請回到上方，點擊要設定的「第 N 日」格子，即可編輯該日獎勵（佳盟幣或道具）。
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowRewardModal(false); setEditingDay(null); }}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-500"
              >
                取消
              </button>
              {editingDay > 0 && (
                <button
                  type="button"
                  onClick={handleSaveReward}
                  className="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400"
                >
                  儲存
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CheckIn
