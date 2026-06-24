// 交易系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const TRADE_STORAGE_KEY = 'jiameng_trades'

const persist = (trades) => {
  const val = JSON.stringify(trades)
  localStorage.setItem(TRADE_STORAGE_KEY, val)
  syncKeyToSupabase(TRADE_STORAGE_KEY, val)
}

// 獲取所有交易
export const getTrades = () => {
  try {
    const data = localStorage.getItem(TRADE_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Error getting trades:', error)
    return []
  }
}

// 創建交易
export const createTrade = (tradeData) => {
  try {
    const trades = getTrades()
    const newTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      seller: tradeData.seller,
      itemId: tradeData.itemId,
      itemName: tradeData.itemName,
      quantity: tradeData.quantity,
      price: tradeData.price, // 價格
      currency: tradeData.currency || 'danmu_item', // 貨幣類型：'danmu_item' 或 'jiameng_coin'
      description: tradeData.description || '',
      status: 'active', // active, pending, completed, cancelled
      createdAt: new Date().toISOString(),
      completedAt: null,
      buyer: null,
      pendingBuyer: null, // 待確認的買家
      requestedAt: null // 購買請求時間
    }
    trades.push(newTrade)
    persist(trades)
    return { success: true, trade: newTrade }
  } catch (error) {
    console.error('Error creating trade:', error)
    return { success: false, message: '創建交易失敗' }
  }
}

// 請求購買（買家點擊購買）
export const requestTrade = (tradeId, buyer) => {
  try {
    const trades = getTrades()
    const tradeIndex = trades.findIndex(t => t.id === tradeId)
    if (tradeIndex === -1) {
      return { success: false, message: '交易不存在' }
    }
    
    const trade = trades[tradeIndex]
    if (trade.status !== 'active') {
      return { success: false, message: '交易已結束' }
    }
    
    if (trade.seller === buyer) {
      return { success: false, message: '不能購買自己的交易' }
    }
    
    // 設置為待確認狀態
    trades[tradeIndex] = {
      ...trade,
      status: 'pending',
      pendingBuyer: buyer,
      requestedAt: new Date().toISOString()
    }
    
    persist(trades)
    return { success: true, trade: trades[tradeIndex] }
  } catch (error) {
    console.error('Error requesting trade:', error)
    return { success: false, message: '請求購買失敗' }
  }
}

// 確認交易（賣家確認轉移物品）
export const confirmTrade = (tradeId, seller) => {
  try {
    const trades = getTrades()
    const tradeIndex = trades.findIndex(t => t.id === tradeId)
    if (tradeIndex === -1) {
      return { success: false, message: '交易不存在' }
    }
    
    const trade = trades[tradeIndex]
    if (trade.status !== 'pending') {
      return { success: false, message: '交易狀態不正確' }
    }
    
    if (trade.seller !== seller) {
      return { success: false, message: '只能確認自己的交易' }
    }
    
    if (!trade.pendingBuyer) {
      return { success: false, message: '沒有待確認的買家' }
    }
    
    // 完成交易
    trades[tradeIndex] = {
      ...trade,
      status: 'completed',
      buyer: trade.pendingBuyer,
      completedAt: new Date().toISOString(),
      pendingBuyer: null
    }
    
    persist(trades)
    return { success: true, trade: trades[tradeIndex] }
  } catch (error) {
    console.error('Error confirming trade:', error)
    return { success: false, message: '確認交易失敗' }
  }
}

// 拒絕購買請求（賣家拒絕）
export const rejectTrade = (tradeId, seller) => {
  try {
    const trades = getTrades()
    const tradeIndex = trades.findIndex(t => t.id === tradeId)
    if (tradeIndex === -1) {
      return { success: false, message: '交易不存在' }
    }
    
    const trade = trades[tradeIndex]
    if (trade.status !== 'pending') {
      return { success: false, message: '交易狀態不正確' }
    }
    
    if (trade.seller !== seller) {
      return { success: false, message: '只能拒絕自己的交易請求' }
    }
    
    // 恢復為活躍狀態
    trades[tradeIndex] = {
      ...trade,
      status: 'active',
      pendingBuyer: null,
      requestedAt: null
    }
    
    persist(trades)
    return { success: true, trade: trades[tradeIndex] }
  } catch (error) {
    console.error('Error rejecting trade:', error)
    return { success: false, message: '拒絕交易失敗' }
  }
}

// 取消購買請求（買家取消）
export const cancelBuyRequest = (tradeId, buyer) => {
  try {
    const trades = getTrades()
    const tradeIndex = trades.findIndex(t => t.id === tradeId)
    if (tradeIndex === -1) {
      return { success: false, message: '交易不存在' }
    }
    
    const trade = trades[tradeIndex]
    if (trade.status !== 'pending') {
      return { success: false, message: '交易狀態不正確' }
    }
    
    if (trade.pendingBuyer !== buyer) {
      return { success: false, message: '只能取消自己的購買請求' }
    }
    
    // 恢復為活躍狀態
    trades[tradeIndex] = {
      ...trade,
      status: 'active',
      pendingBuyer: null,
      requestedAt: null
    }
    
    persist(trades)
    return { success: true, trade: trades[tradeIndex] }
  } catch (error) {
    console.error('Error canceling buy request:', error)
    return { success: false, message: '取消購買請求失敗' }
  }
}

// 取消交易（賣家取消）
export const cancelTrade = (tradeId, username) => {
  try {
    const trades = getTrades()
    const tradeIndex = trades.findIndex(t => t.id === tradeId)
    if (tradeIndex === -1) {
      return { success: false, message: '交易不存在' }
    }
    
    const trade = trades[tradeIndex]
    if (trade.seller !== username) {
      return { success: false, message: '只能取消自己的交易' }
    }
    
    if (trade.status === 'pending') {
      return { success: false, message: '交易有待確認的購買請求，請先處理' }
    }
    
    if (trade.status !== 'active') {
      return { success: false, message: '交易已結束' }
    }
    
    trades[tradeIndex] = {
      ...trade,
      status: 'cancelled'
    }
    
    persist(trades)
    return { success: true }
  } catch (error) {
    console.error('Error cancelling trade:', error)
    return { success: false, message: '取消交易失敗' }
  }
}

// 獲取活躍交易（包括待確認的交易）
export const getActiveTrades = () => {
  try {
    const trades = getTrades()
    return trades.filter(t => t.status === 'active' || t.status === 'pending').sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  } catch (error) {
    console.error('Error getting active trades:', error)
    return []
  }
}

// 獲取待確認的交易（賣家視角）
export const getPendingTrades = (seller) => {
  try {
    const trades = getTrades()
    return trades.filter(t => 
      t.status === 'pending' && t.seller === seller
    ).sort((a, b) => 
      new Date(b.requestedAt || b.createdAt) - new Date(a.requestedAt || a.createdAt)
    )
  } catch (error) {
    console.error('Error getting pending trades:', error)
    return []
  }
}

// 獲取用戶的交易記錄
export const getUserTrades = (username) => {
  try {
    const trades = getTrades()
    return trades.filter(t => 
      t.seller === username || t.buyer === username
    ).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  } catch (error) {
    console.error('Error getting user trades:', error)
    return []
  }
}

// 刪除交易（管理員功能）
export const deleteTrade = (tradeId) => {
  try {
    const trades = getTrades()
    const filtered = trades.filter(t => t.id !== tradeId)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting trade:', error)
    return { success: false, message: '刪除交易失敗' }
  }
}
