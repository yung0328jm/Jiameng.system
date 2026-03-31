import { useEffect, useMemo, useState } from 'react'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getPublicProfiles, isSupabaseEnabled as isAuthSupabase } from '../utils/authSupabase'
import {
  addDailyTodoItems,
  addDailyTodoReply,
  canManageDailyTodo,
  canUserSeeDailyBoard,
  canUserWriteDailyBoard,
  createDailyTodoBoard,
  deleteDailyTodoBoard,
  deleteDailyTodoItem,
  getDailyTodoManagerAccount,
  getVisibleDailyTodoBoards,
  markDailyTodoBoardRead,
  setDailyTodoManagerAccount,
  verifyDailyTodoBoardPassword
} from '../utils/todoStorage'

function DailyTodo() {
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [users, setUsers] = useState([])
  const [boards, setBoards] = useState([])
  const [selectedBoardId, setSelectedBoardId] = useState('')
  const [unlockedBoardIds, setUnlockedBoardIds] = useState([])
  const [passwordInputs, setPasswordInputs] = useState({})
  const [replyInputs, setReplyInputs] = useState({})
  const [newItemsInput, setNewItemsInput] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [dailyTodoManagerAccount, setDailyTodoManagerAccountState] = useState('')
  const [managerPicker, setManagerPicker] = useState('')

  const [createForm, setCreateForm] = useState(() => {
    const d = new Date()
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      date: ymd,
      title: `${ymd} 每日代辦`,
      writerAccounts: [],
      viewerAccounts: [],
      password: ''
    }
  })

  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) || null,
    [boards, selectedBoardId]
  )

  const isBoardUnlocked = (board) => {
    if (!board?.hasPassword) return true
    return unlockedBoardIds.includes(board.id)
  }

  const loadUsers = async () => {
    try {
      if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
        const profiles = await getPublicProfiles()
        if (Array.isArray(profiles) && profiles.length > 0) {
          const mapped = profiles.map((p) => ({
            account: p.account,
            name: p.display_name || p.account,
            role: p.is_admin ? 'admin' : 'user'
          }))
          setUsers(mapped)
          return
        }
      }
    } catch (e) {
      console.warn('DailyTodo loadUsers via profiles failed', e)
    }
    setUsers(getUsers() || [])
  }

  const loadBase = async () => {
    const me = String(getCurrentUser() || '').trim()
    const role = getCurrentUserRole()
    setCurrentUser(me)
    setUserRole(role)
    await loadUsers()
    const managerAcc = getDailyTodoManagerAccount()
    setDailyTodoManagerAccountState(managerAcc)
    setManagerPicker(managerAcc)
    const visible = getVisibleDailyTodoBoards(me)
    setBoards(visible)
    if (!selectedBoardId && visible.length > 0) setSelectedBoardId(visible[0].id)
    if (selectedBoardId && !visible.some((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(visible[0]?.id || '')
    }
  }

  useEffect(() => {
    loadBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useRealtimeKeys(['jiameng_todos', 'jiameng_users', 'jiameng_daily_todo_manager_account'], () => setRefreshKey((x) => x + 1))

  useEffect(() => {
    if (!selectedBoard || !currentUser) return
    if (selectedBoard.hasPassword && !isBoardUnlocked(selectedBoard)) return
    markDailyTodoBoardRead(selectedBoard.id, currentUser)
  }, [selectedBoard, currentUser, unlockedBoardIds])

  const allNormalAccounts = Array.from(new Set(
    (users || [])
      .filter((u) => {
        const acc = String(u?.account || '').trim()
        if (!acc) return false
        if (acc === 'jiameng.system') return false
        return true
      })
      .map((u) => String(u.account).trim())
      .concat(currentUser ? [String(currentUser).trim()] : [])
      .filter(Boolean)
  ))

  const getUserLabel = (account) => {
    const acc = String(account || '').trim()
    if (!acc) return '—'
    const u = (users || []).find((x) => String(x?.account || '').trim() === acc)
    return String(u?.name || acc)
  }
  const isDailyTodoManager = canManageDailyTodo(currentUser, userRole)

  const handleMultiSelectChange = (field, e) => {
    const values = Array.from(e.target.selectedOptions || []).map((x) => x.value)
    setCreateForm((prev) => ({ ...prev, [field]: values }))
  }

  const handleCreateBoard = async () => {
    if (!isDailyTodoManager) return
    const writerAccounts = (createForm.writerAccounts || []).length === 0
      ? [String(currentUser || '').trim()].filter(Boolean)
      : createForm.writerAccounts
    if (writerAccounts.length !== 1) {
      alert('填寫人員需指定 1 位（未選時會預設管理員自己）')
      return
    }
    if ((createForm.viewerAccounts || []).length === 0) {
      alert('請至少指定 1 位可查看對象')
      return
    }
    const result = await createDailyTodoBoard({
      createdBy: currentUser,
      date: createForm.date,
      title: createForm.title,
      writerAccounts,
      viewerAccounts: createForm.viewerAccounts,
      password: createForm.password
    })
    if (!result.success) {
      alert(result.message || '建立失敗')
      return
    }
    alert('每日代辦建立成功')
    setCreateForm((prev) => ({ ...prev, writerAccounts: [], viewerAccounts: [], password: '' }))
    setRefreshKey((x) => x + 1)
  }

  const handleUnlock = async (board) => {
    const pwd = String(passwordInputs[board.id] || '')
    if (!pwd) {
      alert('請輸入密碼')
      return
    }
    const ok = await verifyDailyTodoBoardPassword(board, pwd)
    if (!ok) {
      alert('密碼錯誤')
      return
    }
    setUnlockedBoardIds((prev) => Array.from(new Set([...prev, board.id])))
    setPasswordInputs((prev) => ({ ...prev, [board.id]: '' }))
    markDailyTodoBoardRead(board.id, currentUser)
    setRefreshKey((x) => x + 1)
  }

  const handleAddItems = () => {
    if (!selectedBoard) return
    const result = addDailyTodoItems(selectedBoard.id, currentUser, newItemsInput, { allowManager: isDailyTodoManager })
    if (!result.success) {
      alert(result.message || '新增代辦失敗')
      return
    }
    setNewItemsInput('')
    setRefreshKey((x) => x + 1)
  }

  const handleReply = (itemId) => {
    if (!selectedBoard) return
    const text = String(replyInputs[itemId] || '').trim()
    if (!text) return
    const result = addDailyTodoReply(selectedBoard.id, itemId, currentUser, text, { allowManager: isDailyTodoManager })
    if (!result.success) {
      alert(result.message || '回覆失敗')
      return
    }
    setReplyInputs((prev) => ({ ...prev, [itemId]: '' }))
    setRefreshKey((x) => x + 1)
  }

  const handleDeleteItem = (item) => {
    if (!selectedBoard) return
    if (!window.confirm(`確定刪除第 ${item.no} 點代辦嗎？`)) return
    const result = deleteDailyTodoItem(selectedBoard.id, item.id, currentUser, { allowManager: isDailyTodoManager })
    if (!result.success) {
      alert(result.message || '刪除失敗')
      return
    }
    setRefreshKey((x) => x + 1)
  }

  const handleDeleteBoard = () => {
    if (!selectedBoard) return
    if (!window.confirm('確定要刪除整張每日代辦嗎？此動作無法復原。')) return
    const result = deleteDailyTodoBoard(selectedBoard.id, currentUser, { allowManager: isDailyTodoManager })
    if (!result.success) {
      alert(result.message || '刪除失敗')
      return
    }
    setSelectedBoardId('')
    setRefreshKey((x) => x + 1)
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen text-white">
      <h2 className="text-xl font-bold text-yellow-400 mb-4">每日代辦事項</h2>

      {isDailyTodoManager && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-5">
          <h3 className="text-yellow-400 font-semibold mb-3">建立每日代辦（管理者）</h3>
          {userRole === 'admin' && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">指定代辦管理者（全域 1 位）</label>
              <div className="flex gap-2">
                <select
                  value={managerPicker}
                  onChange={(e) => setManagerPicker(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-sm"
                >
                  <option value="">未指定</option>
                  {allNormalAccounts.map((acc) => (
                    <option key={`m_${acc}`} value={acc}>{getUserLabel(acc)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const r = setDailyTodoManagerAccount(managerPicker)
                    if (!r.success) {
                      alert(r.message || '設定失敗')
                      return
                    }
                    setDailyTodoManagerAccountState(managerPicker)
                    alert('已更新代辦管理者')
                    setRefreshKey((x) => x + 1)
                  }}
                  className="bg-blue-500 hover:bg-blue-400 px-3 py-2 rounded text-sm"
                >
                  套用
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">目前代辦管理者：{dailyTodoManagerAccount ? getUserLabel(dailyTodoManagerAccount) : '未指定'}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">日期</label>
              <input
                type="date"
                value={createForm.date}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">標題</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="例如：2026-03-30 每日代辦"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">指定填寫人員（限 1 位）</label>
              <select
                value={(createForm.writerAccounts || [])[0] || ''}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, writerAccounts: e.target.value ? [e.target.value] : [] }))}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm"
              >
                <option value="">請選擇填寫人員</option>
                {allNormalAccounts.map((acc) => (
                  <option key={`w_${acc}`} value={acc}>{getUserLabel(acc)}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">此欄位僅可指定 1 位填寫者</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">指定可查看對象（可多選）</label>
              <select
                multiple
                size={6}
                value={createForm.viewerAccounts || []}
                onChange={(e) => handleMultiSelectChange('viewerAccounts', e)}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm min-h-[140px]"
              >
                {allNormalAccounts.map((acc) => (
                  <option key={`v_${acc}`} value={acc}>{getUserLabel(acc)}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">按住 Ctrl 可多選（手機可連續點選）</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">閱讀密碼（可留空）</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="若輸入則此代辦需密碼才能閱讀"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateBoard}
            className="mt-3 bg-yellow-400 text-black font-semibold px-4 py-2 rounded hover:bg-yellow-300"
          >
            建立每日代辦
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <h3 className="text-yellow-400 font-semibold mb-2">我的每日代辦</h3>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto">
            {boards.length === 0 && <p className="text-gray-400 text-sm">目前沒有可查看的代辦</p>}
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBoardId(b.id)}
                className={`w-full text-left rounded border px-3 py-2 ${
                  selectedBoardId === b.id
                    ? 'border-yellow-400 bg-gray-700'
                    : 'border-gray-600 bg-gray-900 hover:bg-gray-700'
                }`}
              >
                <div className="text-sm font-semibold">{b.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {b.date} | 填寫: {(b.writerAccounts || []).map((acc) => getUserLabel(acc)).join(', ') || '—'}
                </div>
                {b.hasPassword && <div className="text-xs text-purple-300 mt-1">密碼保護</div>}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-lg p-4">
          {!selectedBoard && <p className="text-gray-400">請先選擇一筆每日代辦</p>}
          {selectedBoard && (
            <>
              <div className="mb-3">
                <h3 className="text-lg font-bold text-yellow-400">{selectedBoard.title}</h3>
                {userRole === 'admin' ? (
                  <p className="text-xs text-gray-400 mt-1">
                    日期: {selectedBoard.date} / 指定填寫: {(selectedBoard.writerAccounts || []).map((acc) => getUserLabel(acc)).join(', ') || '—'} / 指定查看: {(selectedBoard.viewerAccounts || []).map((acc) => getUserLabel(acc)).join(', ') || '—'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">日期: {selectedBoard.date}</p>
                )}
                {(String(selectedBoard?.createdBy || '').trim() === String(currentUser || '').trim() || isDailyTodoManager) && (
                  <button
                    type="button"
                    onClick={handleDeleteBoard}
                    className="mt-2 text-xs text-red-300 hover:text-red-200 border border-red-500/50 rounded px-2 py-1"
                  >
                    刪除此每日代辦
                  </button>
                )}
              </div>

              {selectedBoard.hasPassword && !isBoardUnlocked(selectedBoard) ? (
                <div className="bg-gray-900 border border-purple-600 rounded-lg p-4">
                  <p className="text-sm text-purple-300 mb-2">此代辦已加密，需輸入密碼閱讀</p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={passwordInputs[selectedBoard.id] || ''}
                      onChange={(e) => setPasswordInputs((prev) => ({ ...prev, [selectedBoard.id]: e.target.value }))}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2"
                      placeholder="輸入閱讀密碼"
                    />
                    <button
                      type="button"
                      onClick={() => handleUnlock(selectedBoard)}
                      className="bg-purple-500 px-4 py-2 rounded hover:bg-purple-400"
                    >
                      解鎖
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {(canUserWriteDailyBoard(selectedBoard, currentUser) || isDailyTodoManager) && (
                    <div className="mb-4 bg-gray-900 border border-gray-700 rounded-lg p-3">
                      <label className="block text-sm text-gray-300 mb-2">新增代辦（每行一項，會自動顯示 1. 2. 3.）</label>
                      <textarea
                        value={newItemsInput}
                        onChange={(e) => setNewItemsInput(e.target.value)}
                        placeholder={'例如：\n1. 先場勘\n2. 回報進度\n3. 上傳照片'}
                        className="w-full min-h-[110px] bg-gray-700 border border-gray-600 rounded px-3 py-2"
                      />
                      <button
                        type="button"
                        onClick={handleAddItems}
                        className="mt-2 bg-yellow-400 text-black font-semibold px-4 py-2 rounded hover:bg-yellow-300"
                      >
                        新增代辦項目
                      </button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {(selectedBoard.items || []).length === 0 && (
                      <p className="text-gray-400 text-sm">尚未有代辦項目</p>
                    )}
                    {(selectedBoard.items || []).map((item) => (
                      <div key={item.id} className="bg-gray-900 border border-gray-700 rounded p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-white">{item.no}. {item.content}</div>
                          {(String(item?.createdBy || '').trim() === String(currentUser || '').trim() || String(selectedBoard?.createdBy || '').trim() === String(currentUser || '').trim() || isDailyTodoManager) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item)}
                              className="text-xs text-red-300 hover:text-red-200 border border-red-500/40 rounded px-2 py-0.5 shrink-0"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          建立者: {getUserLabel(item.createdBy)} / {new Date(item.createdAt).toLocaleString('zh-TW')}
                        </div>
                        <div className="mt-2 space-y-1">
                          {(item.replies || []).map((r) => (
                            <div key={r.id} className="text-sm text-gray-200 bg-gray-800 rounded px-2 py-1">
                              <span className="text-yellow-300">{getUserLabel(r.author)}</span>: {r.text}
                            </div>
                          ))}
                        </div>
                        {(canUserSeeDailyBoard(selectedBoard, currentUser) || isDailyTodoManager) && (
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={replyInputs[item.id] || ''}
                              onChange={(e) => setReplyInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder={`回覆第 ${item.no} 點`}
                              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleReply(item.id)}
                              className="bg-blue-500 px-3 py-1.5 rounded text-sm hover:bg-blue-400"
                            >
                              回覆
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default DailyTodo
