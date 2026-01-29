// 本地存储工具函数
import { syncKeyToSupabase } from './supabaseSync'
const STORAGE_KEY = 'jiameng_users'

/** 寫入本地並同步到 Supabase；回傳 sync 的 Promise，呼叫方可 await 以確保刷新前已寫入雲端 */
const setUsersAndSync = (users) => {
  const val = JSON.stringify(users)
  localStorage.setItem(STORAGE_KEY, val)
  return syncKeyToSupabase(STORAGE_KEY, val)
}

export const getUsers = () => {
  try {
    const users = localStorage.getItem(STORAGE_KEY)
    const parsed = users ? JSON.parse(users) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting users:', error)
    return []
  }
}

// 初始化默认管理者账户
export const initializeAdminUser = () => {
  try {
    const users = getUsers()
    
    // 检查是否已有管理者账户
    const hasAdmin = users.some(u => u.role === 'admin')
    
    if (!hasAdmin) {
      // 创建默认管理者账户
      const defaultAdmin = {
        id: 'admin-' + Date.now(),
        name: '系統管理者',
        account: 'admin',
        password: 'admin123',
        role: 'admin',
        createdAt: new Date().toISOString()
      }
      users.push(defaultAdmin)
      setUsersAndSync(users)
      return { success: true, message: '已創建默認管理者賬戶' }
    }
    
    return { success: false, message: '已存在管理者賬戶' }
  } catch (error) {
    console.error('Error initializing admin user:', error)
    return { success: false, message: '初始化失敗' }
  }
}

/** 註冊新用戶；會先寫入 localStorage，並等待 Supabase 同步完成再回傳，避免刷新後用戶消失 */
export const saveUser = async (user) => {
  try {
    const users = getUsers()
    if (users.some(u => u.account === user.account)) {
      return { success: false, message: '該帳號已存在' }
    }
    users.push({
      ...user,
      role: user.role || 'user',
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    })
    await setUsersAndSync(users)
    return { success: true, message: '註冊成功' }
  } catch (error) {
    console.error('Error saving user:', error)
    return { success: false, message: '註冊失敗，請稍後再試' }
  }
}

// 获取用户角色
export const getUserRole = (account) => {
  try {
    const users = getUsers()
    const user = users.find(u => u.account === account)
    return user ? (user.role || 'user') : null
  } catch (error) {
    console.error('Error getting user role:', error)
    return null
  }
}

// 更新用户角色（仅管理者可用）
export const updateUserRole = (account, newRole) => {
  try {
    const users = getUsers()
    const userIndex = users.findIndex(u => u.account === account)
    if (userIndex === -1) {
      return { success: false, message: '用戶不存在' }
    }
    users[userIndex].role = newRole
    setUsersAndSync(users)
    return { success: true }
  } catch (error) {
    console.error('Error updating user role:', error)
    return { success: false, message: '更新失敗' }
  }
}

// 删除用户（仅管理者可用）
export const deleteUser = (account) => {
  try {
    const users = getUsers()
    const userIndex = users.findIndex(u => u.account === account)
    if (userIndex === -1) {
      return { success: false, message: '用戶不存在' }
    }
    
    // 检查是否是最后一个管理者
    const adminCount = users.filter(u => u.role === 'admin').length
    if (users[userIndex].role === 'admin' && adminCount <= 1) {
      return { success: false, message: '無法刪除最後一個管理者賬戶' }
    }
    
    users.splice(userIndex, 1)
    setUsersAndSync(users)
    return { success: true }
  } catch (error) {
    console.error('Error deleting user:', error)
    return { success: false, message: '刪除失敗' }
  }
}

export const clearAllData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return { success: true, message: '所有數據已清理' }
  } catch (error) {
    console.error('Error clearing data:', error)
    return { success: false, message: '清理失敗' }
  }
}

export const verifyUser = (account, password) => {
  try {
    const users = getUsers()
    const user = users.find(u => u.account === account && u.password === password)
    return user ? { success: true, user } : { success: false, message: '帳號或密碼錯誤' }
  } catch (error) {
    console.error('Error verifying user:', error)
    return { success: false, message: '登錄失敗，請稍後再試' }
  }
}
