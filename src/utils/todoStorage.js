// 待辦事項存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const TODO_STORAGE_KEY = 'jiameng_todos'

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

// 保存待辦事項：先寫本地並立即回傳，雲端背景同步（與交流區相同）
export function saveTodos(todos) {
  try {
    const val = JSON.stringify(todos)
    localStorage.setItem(TODO_STORAGE_KEY, val)
    try {
      localStorage.setItem(TODO_LAST_WRITE_KEY, String(Date.now()))
    } catch (_) {}
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
