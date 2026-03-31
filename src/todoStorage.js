// 待辦事項存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const TODO_STORAGE_KEY = 'jiameng_todos'
const DAILY_TODO_MANAGER_KEY = 'jiameng_daily_todo_manager_account'

// 獲取所有待辦事項
export const getTodos = () => {
  try {
    const todos = localStorage.getItem(TODO_STORAGE_KEY)
    return todos ? JSON.parse(todos) : []
  } catch (error) {
    console.error('Error getting todos:', error)
    return []
  }
}

const TODO_LAST_WRITE_KEY = 'jiameng_todos_last_write'

// 保存待辦事項：先寫本地並立即回傳，雲端背景同步（與交流區對話框相同）
export function saveTodos(todos) {
  try {
    const val = JSON.stringify(todos)
    localStorage.setItem(TODO_STORAGE_KEY, val)
    try { localStorage.setItem(TODO_LAST_WRITE_KEY, String(Date.now())) } catch (_) {}
    syncKeyToSupabase(TODO_STORAGE_KEY, val).catch((err) => {
      console.warn('Todo sync to cloud failed, will retry via outbox:', err)
    })
    return { success: true }
  } catch (error) {
    console.error('Error saving todos:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 新增待辦事項
export function addTodo(todo) {
  try {
    const todos = getTodos()
    const newTodo = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      text: todo.text || '',
      completed: false,
      createdAt: new Date().toISOString(),
      createdBy: todo.createdBy || '',
      ...todo
    }
    todos.push(newTodo)
    const r = saveTodos(todos)
    return r.success ? { success: true, todo: newTodo } : r
  } catch (error) {
    console.error('Error adding todo:', error)
    return { success: false, message: '新增失敗' }
  }
}

// 更新待辦事項
export function updateTodo(id, updates) {
  try {
    const todos = getTodos()
    const index = todos.findIndex(t => t.id === id)
    if (index === -1) {
      return { success: false, message: '找不到待辦事項' }
    }
    todos[index] = { ...todos[index], ...updates }
    return saveTodos(todos)
  } catch (error) {
    console.error('Error updating todo:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 刪除待辦事項
export function deleteTodo(id) {
  try {
    const todos = getTodos()
    const filtered = todos.filter(t => t.id !== id)
    return saveTodos(filtered)
  } catch (error) {
    console.error('Error deleting todo:', error)
    return { success: false, message: '刪除失敗' }
  }
}

// 切換完成狀態
export function toggleTodo(id) {
  try {
    const todos = getTodos()
    const index = todos.findIndex(t => t.id === id)
    if (index === -1) {
      return { success: false, message: '找不到待辦事項' }
    }
    todos[index].completed = !todos[index].completed
    if (todos[index].completed) {
      todos[index].completedAt = new Date().toISOString()
    } else {
      delete todos[index].completedAt
    }
    return saveTodos(todos)
  } catch (error) {
    console.error('Error toggling todo:', error)
    return { success: false, message: '更新失敗' }
  }
}

// ===== 每日代辦（新功能） =====

const DAILY_BOARD_KIND = 'daily_board'
const DAILY_BOARD_DELETED_KIND = 'daily_board_deleted'

function parseStoredString(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  if (!s) return ''
  try {
    const p = JSON.parse(s)
    if (typeof p === 'string') return p.trim()
  } catch (_) {}
  return s.replace(/^["']|["']$/g, '').trim()
}

function accountsEqual(a, b) {
  const x = String(a || '').trim().toLowerCase()
  const y = String(b || '').trim().toLowerCase()
  return x !== '' && y !== '' && x === y
}

export function getDailyTodoManagerAccount() {
  try {
    return parseStoredString(localStorage.getItem(DAILY_TODO_MANAGER_KEY))
  } catch (_) {
    return ''
  }
}

export function setDailyTodoManagerAccount(account) {
  try {
    const v = String(account || '').trim()
    const val = JSON.stringify(v)
    localStorage.setItem(DAILY_TODO_MANAGER_KEY, val)
    syncKeyToSupabase(DAILY_TODO_MANAGER_KEY, val).catch(() => {})
    return { success: true, account: v }
  } catch (e) {
    console.error('setDailyTodoManagerAccount failed', e)
    return { success: false, message: '設定代辦管理者失敗' }
  }
}

export function canManageDailyTodo(account, role = null) {
  const r = String(role || '').trim().toLowerCase()
  if (r === 'admin') return true
  const manager = getDailyTodoManagerAccount()
  return accountsEqual(account, manager)
}

function nowIso() {
  return new Date().toISOString()
}

function uniqAccounts(list) {
  return Array.from(new Set((Array.isArray(list) ? list : []).map((x) => String(x || '').trim()).filter(Boolean)))
}

function randomSalt() {
  try {
    const arr = new Uint8Array(16)
    window.crypto.getRandomValues(arr)
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (_) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

async function sha256Hex(input) {
  const text = String(input || '')
  if (window?.crypto?.subtle) {
    const enc = new TextEncoder().encode(text)
    const digest = await window.crypto.subtle.digest('SHA-256', enc)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return `fallback_${Math.abs(hash)}`
}

export function getDailyTodoBoards() {
  const todos = Array.isArray(getTodos()) ? getTodos() : []
  const deletedMap = new Map() // boardId -> deletedAt
  todos.forEach((x) => {
    if (String(x?.kind || '') !== DAILY_BOARD_DELETED_KIND) return
    const boardId = String(x?.boardId || '').trim()
    if (!boardId) return
    const t = Date.parse(x?.deletedAt || x?.createdAt || '') || 0
    const prev = deletedMap.get(boardId) || 0
    if (t >= prev) deletedMap.set(boardId, t)
  })
  return todos
    .filter((x) => x?.kind === DAILY_BOARD_KIND)
    .filter((x) => {
      const boardId = String(x?.id || '').trim()
      const deletedAt = deletedMap.get(boardId) || 0
      if (!deletedAt) return true
      const boardTs = Date.parse(x?.updatedAt || x?.createdAt || '') || 0
      return boardTs > deletedAt
    })
    .sort((a, b) => (Date.parse(b?.updatedAt || b?.createdAt || '') || 0) - (Date.parse(a?.updatedAt || a?.createdAt || '') || 0))
}

export function canUserSeeDailyBoard(board, account) {
  const acc = String(account || '').trim()
  if (!acc || !board) return false
  if (String(board?.createdBy || '').trim() === acc) return true
  const viewers = uniqAccounts(board?.viewerAccounts)
  const writers = uniqAccounts(board?.writerAccounts)
  return viewers.includes(acc) || writers.includes(acc)
}

export function canUserWriteDailyBoard(board, account) {
  const acc = String(account || '').trim()
  if (!acc || !board) return false
  if (String(board?.createdBy || '').trim() === acc) return true
  return uniqAccounts(board?.writerAccounts).includes(acc)
}

export function getVisibleDailyTodoBoards(account) {
  return getDailyTodoBoards().filter((b) => canUserSeeDailyBoard(b, account))
}

export async function createDailyTodoBoard(payload) {
  try {
    const todos = getTodos()
    const createdBy = String(payload?.createdBy || '').trim()
    const writerAccounts = uniqAccounts(payload?.writerAccounts)
    const viewerAccounts = uniqAccounts([...(payload?.viewerAccounts || []), ...writerAccounts])
    const date = String(payload?.date || nowIso().slice(0, 10)).slice(0, 10)
    const password = String(payload?.password || '')

    let passwordSalt = ''
    let passwordHash = ''
    if (password) {
      passwordSalt = randomSalt()
      passwordHash = await sha256Hex(`${passwordSalt}:${password}`)
    }

    const board = {
      id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 10),
      kind: DAILY_BOARD_KIND,
      title: String(payload?.title || `${date} 每日代辦`).trim() || `${date} 每日代辦`,
      date,
      createdBy,
      writerAccounts,
      viewerAccounts,
      passwordSalt,
      passwordHash,
      hasPassword: !!passwordHash,
      items: [],
      readBy: {},
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    todos.push(board)
    const r = saveTodos(todos)
    return r.success ? { success: true, board } : r
  } catch (error) {
    console.error('Error creating daily todo board:', error)
    return { success: false, message: '建立每日代辦失敗' }
  }
}

export async function verifyDailyTodoBoardPassword(board, password) {
  try {
    if (!board?.hasPassword) return true
    const salt = String(board?.passwordSalt || '')
    const hash = String(board?.passwordHash || '')
    if (!salt || !hash) return false
    const actual = await sha256Hex(`${salt}:${String(password || '')}`)
    return actual === hash
  } catch (e) {
    console.error('verifyDailyTodoBoardPassword failed', e)
    return false
  }
}

export function markDailyTodoBoardRead(boardId, account) {
  try {
    const todos = getTodos()
    const idx = todos.findIndex((x) => x?.id === boardId && x?.kind === DAILY_BOARD_KIND)
    if (idx < 0) return { success: false, message: '找不到代辦看板' }
    const acc = String(account || '').trim()
    if (!acc) return { success: false, message: '無效用戶' }
    const board = { ...todos[idx] }
    board.readBy = { ...(board.readBy || {}), [acc]: nowIso() }
    todos[idx] = board
    return saveTodos(todos)
  } catch (e) {
    console.error('markDailyTodoBoardRead failed', e)
    return { success: false, message: '標記已讀失敗' }
  }
}

export function getDailyTodoUnreadCount(account) {
  const acc = String(account || '').trim()
  if (!acc) return 0
  return getVisibleDailyTodoBoards(acc).filter((b) => {
    const updated = Date.parse(b?.updatedAt || b?.createdAt || '') || 0
    const seen = Date.parse(b?.readBy?.[acc] || '') || 0
    if (String(b?.createdBy || '').trim() === acc && seen === 0) return false
    return updated > seen
  }).length
}

function normalizeItemLines(input) {
  if (Array.isArray(input)) return input.map((x) => String(x || '').trim()).filter(Boolean)
  return String(input || '')
    .split(/\r?\n/)
    .map((x) => x.trim().replace(/^\d+\.\s*/, ''))
    .filter(Boolean)
}

export function addDailyTodoItems(boardId, account, lines, options = {}) {
  try {
    const todos = getTodos()
    const idx = todos.findIndex((x) => x?.id === boardId && x?.kind === DAILY_BOARD_KIND)
    if (idx < 0) return { success: false, message: '找不到代辦看板' }
    const board = { ...todos[idx] }
    const allowManager = !!options?.allowManager
    if (!canUserWriteDailyBoard(board, account) && !allowManager) return { success: false, message: '你沒有填寫權限' }
    const parsed = normalizeItemLines(lines)
    if (parsed.length === 0) return { success: false, message: '請輸入至少一項代辦內容' }
    const prev = Array.isArray(board.items) ? board.items : []
    let no = prev.length
    const createdAt = nowIso()
    const nextItems = [...prev]
    parsed.forEach((content) => {
      no += 1
      nextItems.push({
        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        no,
        content,
        createdBy: String(account || '').trim(),
        createdAt,
        replies: []
      })
    })
    board.items = nextItems
    board.updatedAt = nowIso()
    board.readBy = { ...(board.readBy || {}), [String(account || '').trim()]: nowIso() }
    todos[idx] = board
    return saveTodos(todos)
  } catch (e) {
    console.error('addDailyTodoItems failed', e)
    return { success: false, message: '新增代辦失敗' }
  }
}

export function addDailyTodoReply(boardId, itemId, account, text, options = {}) {
  try {
    const todos = getTodos()
    const idx = todos.findIndex((x) => x?.id === boardId && x?.kind === DAILY_BOARD_KIND)
    if (idx < 0) return { success: false, message: '找不到代辦看板' }
    const board = { ...todos[idx] }
    const allowManager = !!options?.allowManager
    if (!canUserSeeDailyBoard(board, account) && !allowManager) return { success: false, message: '你沒有查看權限' }
    const content = String(text || '').trim()
    if (!content) return { success: false, message: '回覆內容不可為空' }
    const items = Array.isArray(board.items) ? [...board.items] : []
    const itemIdx = items.findIndex((x) => x?.id === itemId)
    if (itemIdx < 0) return { success: false, message: '找不到代辦項目' }
    const item = { ...items[itemIdx] }
    const replies = Array.isArray(item.replies) ? [...item.replies] : []
    replies.push({
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: content,
      author: String(account || '').trim(),
      createdAt: nowIso()
    })
    item.replies = replies
    items[itemIdx] = item
    board.items = items
    board.updatedAt = nowIso()
    board.readBy = { ...(board.readBy || {}), [String(account || '').trim()]: nowIso() }
    todos[idx] = board
    return saveTodos(todos)
  } catch (e) {
    console.error('addDailyTodoReply failed', e)
    return { success: false, message: '新增回覆失敗' }
  }
}

export function deleteDailyTodoItem(boardId, itemId, account, options = {}) {
  try {
    const todos = getTodos()
    const idx = todos.findIndex((x) => x?.id === boardId && x?.kind === DAILY_BOARD_KIND)
    if (idx < 0) return { success: false, message: '找不到代辦看板' }
    const board = { ...todos[idx] }
    const acc = String(account || '').trim()
    const allowManager = !!options?.allowManager
    if (!allowManager) return { success: false, message: '僅代辦管理者可刪除' }
    const items = Array.isArray(board.items) ? [...board.items] : []
    const target = items.find((x) => x?.id === itemId)
    if (!target) return { success: false, message: '找不到代辦項目' }
    const filtered = items.filter((x) => x?.id !== itemId).map((x, i) => ({ ...x, no: i + 1 }))
    board.items = filtered
    board.deletedItemIds = { ...(board.deletedItemIds || {}), [String(itemId)]: nowIso() }
    board.updatedAt = nowIso()
    board.readBy = { ...(board.readBy || {}), [acc]: nowIso() }
    todos[idx] = board
    return saveTodos(todos)
  } catch (e) {
    console.error('deleteDailyTodoItem failed', e)
    return { success: false, message: '刪除代辦項目失敗' }
  }
}

export function deleteDailyTodoBoard(boardId, account, options = {}) {
  try {
    const todos = getTodos()
    const idx = todos.findIndex((x) => x?.id === boardId && x?.kind === DAILY_BOARD_KIND)
    if (idx < 0) return { success: false, message: '找不到代辦看板' }
    const board = todos[idx]
    const acc = String(account || '').trim()
    const allowManager = !!options?.allowManager
    if (!allowManager) return { success: false, message: '僅代辦管理者可刪除整張提醒' }
    const filtered = todos.filter((x) => x?.id !== boardId)
    const tombstoneId = `deleted:${boardId}`
    const deletedAt = nowIso()
    const tombstone = {
      id: tombstoneId,
      kind: DAILY_BOARD_DELETED_KIND,
      boardId,
      deletedBy: acc,
      deletedAt,
      createdAt: deletedAt,
      updatedAt: deletedAt
    }
    const tombIdx = filtered.findIndex((x) => x?.id === tombstoneId)
    if (tombIdx >= 0) filtered[tombIdx] = tombstone
    else filtered.push(tombstone)
    return saveTodos(filtered)
  } catch (e) {
    console.error('deleteDailyTodoBoard failed', e)
    return { success: false, message: '刪除代辦看板失敗' }
  }
}
