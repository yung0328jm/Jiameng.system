// 认证状态存储工具
const AUTH_STORAGE_KEY = 'jiameng_auth_status'
const CURRENT_USER_KEY = 'jiameng_current_user'

export const saveAuthStatus = (isAuthenticated) => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(isAuthenticated))
  } catch (error) {
    console.error('Error saving auth status:', error)
  }
}

export const getAuthStatus = () => {
  try {
    const status = localStorage.getItem(AUTH_STORAGE_KEY)
    return status ? JSON.parse(status) : false
  } catch (error) {
    console.error('Error getting auth status:', error)
    return false
  }
}

export const clearAuthStatus = () => {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(CURRENT_USER_KEY)
  } catch (error) {
    console.error('Error clearing auth status:', error)
  }
}

// 保存当前登录用户（包括用户名和角色）
export const saveCurrentUser = (username, role = null) => {
  try {
    const userInfo = { username, role }
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo))
  } catch (error) {
    console.error('Error saving current user:', error)
  }
}

// 保存当前用户角色
export const saveCurrentUserRole = (role) => {
  try {
    const userInfo = getCurrentUserInfo()
    if (userInfo) {
      userInfo.role = role
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo))
    }
  } catch (error) {
    console.error('Error saving current user role:', error)
  }
}

// 获取当前用户信息（包括用户名和角色）
export const getCurrentUserInfo = () => {
  try {
    const user = localStorage.getItem(CURRENT_USER_KEY)
    return user ? JSON.parse(user) : null
  } catch (error) {
    console.error('Error getting current user info:', error)
    return null
  }
}

// 获取当前登录用户（兼容旧代码）
export const getCurrentUser = () => {
  try {
    const userInfo = getCurrentUserInfo()
    return userInfo ? userInfo.username : null
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// 获取当前用户角色
export const getCurrentUserRole = () => {
  try {
    const userInfo = getCurrentUserInfo()
    return userInfo ? (userInfo.role || 'user') : null
  } catch (error) {
    console.error('Error getting current user role:', error)
    return null
  }
}
