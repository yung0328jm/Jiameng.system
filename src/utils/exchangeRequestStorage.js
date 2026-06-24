// 兌換請求存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const EXCHANGE_REQUEST_STORAGE_KEY = 'jiameng_exchange_requests'

// 獲取所有兌換請求
export const getExchangeRequests = () => {
  try {
    const data = localStorage.getItem(EXCHANGE_REQUEST_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Error getting exchange requests:', error)
    return []
  }
}

// 創建兌換請求
export const createExchangeRequest = (request) => {
  try {
    const requests = getExchangeRequests()
    const newRequest = {
      id: `exchange_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...request,
      status: 'pending', // pending, approved, rejected
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    requests.push(newRequest)
    const val = JSON.stringify(requests)
    localStorage.setItem(EXCHANGE_REQUEST_STORAGE_KEY, val)
    syncKeyToSupabase(EXCHANGE_REQUEST_STORAGE_KEY, val)
    return { success: true, request: newRequest }
  } catch (error) {
    console.error('Error creating exchange request:', error)
    return { success: false, message: '創建兌換請求失敗' }
  }
}

// 更新兌換請求
export const updateExchangeRequest = (requestId, updates) => {
  try {
    const requests = getExchangeRequests()
    const index = requests.findIndex(r => r.id === requestId)
    if (index === -1) {
      return { success: false, message: '請求不存在' }
    }
    requests[index] = {
      ...requests[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    const val = JSON.stringify(requests)
    localStorage.setItem(EXCHANGE_REQUEST_STORAGE_KEY, val)
    syncKeyToSupabase(EXCHANGE_REQUEST_STORAGE_KEY, val)
    return { success: true, request: requests[index] }
  } catch (error) {
    console.error('Error updating exchange request:', error)
    return { success: false, message: '更新請求失敗' }
  }
}

// 刪除兌換請求
export const deleteExchangeRequest = (requestId) => {
  try {
    const requests = getExchangeRequests()
    const filtered = requests.filter(r => r.id !== requestId)
    const val = JSON.stringify(filtered)
    localStorage.setItem(EXCHANGE_REQUEST_STORAGE_KEY, val)
    syncKeyToSupabase(EXCHANGE_REQUEST_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error deleting exchange request:', error)
    return { success: false, message: '刪除請求失敗' }
  }
}

// 獲取待處理的兌換請求（管理員用）
export const getPendingExchangeRequests = () => {
  try {
    const requests = getExchangeRequests()
    return requests.filter(r => r.status === 'pending')
  } catch (error) {
    console.error('Error getting pending exchange requests:', error)
    return []
  }
}

// 獲取用戶的兌換請求
export const getUserExchangeRequests = (username) => {
  try {
    const requests = getExchangeRequests()
    return requests.filter(r => r.username === username)
  } catch (error) {
    console.error('Error getting user exchange requests:', error)
    return []
  }
}

// 確認兌換請求（管理員）
export const approveExchangeRequest = (requestId, adminUsername) => {
  try {
    const result = updateExchangeRequest(requestId, {
      status: 'approved',
      approvedBy: adminUsername,
      approvedAt: new Date().toISOString()
    })
    return result
  } catch (error) {
    console.error('Error approving exchange request:', error)
    return { success: false, message: '確認請求失敗' }
  }
}

// 拒絕兌換請求（管理員）
export const rejectExchangeRequest = (requestId, adminUsername, reason = '') => {
  try {
    const result = updateExchangeRequest(requestId, {
      status: 'rejected',
      rejectedBy: adminUsername,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    })
    return result
  } catch (error) {
    console.error('Error rejecting exchange request:', error)
    return { success: false, message: '拒絕請求失敗' }
  }
}
