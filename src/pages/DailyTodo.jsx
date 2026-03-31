import { useEffect, useMemo, useState } from 'react'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import {
  addDailyTodoItems,
  addDailyTodoReply,
  canUserSeeDailyBoard,
  canUserWriteDailyBoard,
  createDailyTodoBoard,
  getVisibleDailyTodoBoards,
  markDailyTodoBoardRead,
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

  const loadBase = () => {
    const me = String(getCurrentUser() || '').trim()
    const role = getCurrentUserRole()
    setCurrentUser(me)
    setUserRole(role)
    setUsers(getUsers() || [])
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

  useRealtimeKeys(['jiameng_todos', 'jiameng_users'], () => setRefreshKey((x) => x + 1))

  useEffect(() => {
    if (!selectedBoard || !currentUser) return
    if (selectedBoard.hasPassword && !isBoardUnlocked(selectedBoard)) return
    markDailyTodoBoardRead(selectedBoard.id, currentUser)
  }, [selectedBoard, currentUser, unlockedBoardIds])

  const allNormalAccounts = (users || [])
    .filter((u) => {
      const acc = String(u?.account || '').trim()
      if (!acc) return false
      if (acc === 'admin' || acc === 'jiameng.system') return false
      return true
    })
    .map((u) => String(u.account).trim())

  const handleToggleMulti = (field, account) => {
    setCreateForm((prev) => {
      const set = new Set(prev[field] || [])
      if (set.has(account)) set.delete(account)
      else set.add(account)
      return { ...prev, [field]: Array.from(set) }
    })
  }

  const handleCreateBoard = async () => {
    if (userRole !== 'admin') return
    if ((createForm.writerAccounts || []).length === 0) {
      alert('請至少指定 1 位填寫人員')
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
      writerAccounts: createForm.writerAccounts,
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
    const result = addDailyTodoItems(selectedBoard.id, currentUser, newItemsInput)
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
    const result = addDailyTodoReply(selectedBoard.id, itemId, currentUser, text)
    if (!result.success) {
      alert(result.message || '回覆失敗')
      return
    }
    setReplyInputs((prev) => ({ ...prev, [itemId]: '' }))
    setRefreshKey((x) => x + 1)
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen text-white">
      <h2 className="text-xl font-bold text-yellow-400 mb-4">每日代辦事項</h2>

      {userRole === 'admin' && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-5">
          <h3 className="text-yellow-400 font-semibold mb-3">建立每日代辦（管理者）</h3>
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
              <label className="block text-xs text-gray-400 mb-1">指定填寫人員（可多選）</label>
              <div className="max-h-28 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-2 space-y-1">
                {allNormalAccounts.map((acc) => (
                  <label key={`w_${acc}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(createForm.writerAccounts || []).includes(acc)}
                      onChange={() => handleToggleMulti('writerAccounts', acc)}
                    />
                    <span>{acc}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">指定可查看對象（可多選）</label>
              <div className="max-h-28 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-2 space-y-1">
                {allNormalAccounts.map((acc) => (
                  <label key={`v_${acc}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(createForm.viewerAccounts || []).includes(acc)}
                      onChange={() => handleToggleMulti('viewerAccounts', acc)}
                    />
                    <span>{acc}</span>
                  </label>
                ))}
              </div>
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
                  {b.date} | 填寫: {(b.writerAccounts || []).join(', ') || '—'}
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
                <p className="text-xs text-gray-400 mt-1">
                  日期: {selectedBoard.date} / 指定填寫: {(selectedBoard.writerAccounts || []).join(', ') || '—'} / 指定查看: {(selectedBoard.viewerAccounts || []).join(', ') || '—'}
                </p>
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
                  {canUserWriteDailyBoard(selectedBoard, currentUser) && (
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
                        <div className="font-semibold text-white">{item.no}. {item.content}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          建立者: {item.createdBy || '—'} / {new Date(item.createdAt).toLocaleString('zh-TW')}
                        </div>
                        <div className="mt-2 space-y-1">
                          {(item.replies || []).map((r) => (
                            <div key={r.id} className="text-sm text-gray-200 bg-gray-800 rounded px-2 py-1">
                              <span className="text-yellow-300">{r.author}</span>: {r.text}
                            </div>
                          ))}
                        </div>
                        {canUserSeeDailyBoard(selectedBoard, currentUser) && (
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
