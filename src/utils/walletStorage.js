// 佳盟幣錢包系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
const WALLET_STORAGE_KEY = 'jiameng_wallets'

// 獲取用戶錢包餘額
export const getWalletBalance = (username) => {
  try {
    const data = localStorage.getItem(WALLET_STORAGE_KEY)
    const wallets = data ? JSON.parse(data) : {}
    return wallets[username] || 0
  } catch (error) {
    console.error('Error getting wallet balance:', error)
    return 0
  }
}

// 設置用戶錢包餘額
export const setWalletBalance = (username, balance) => {
  try {
    const data = localStorage.getItem(WALLET_STORAGE_KEY)
    const wallets = data ? JSON.parse(data) : {}
    wallets[username] = Math.max(0, balance) // 確保餘額不為負數
    const val = JSON.stringify(wallets)
    localStorage.setItem(WALLET_STORAGE_KEY, val)
    syncKeyToSupabase(WALLET_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error setting wallet balance:', error)
    return { success: false, message: '設置餘額失敗' }
  }
}

// 增加用戶錢包餘額
export const addWalletBalance = (username, amount) => {
  try {
    if (amount < 0) {
      return { success: false, message: '金額必須為正數' }
    }
    const currentBalance = getWalletBalance(username)
    return setWalletBalance(username, currentBalance + amount)
  } catch (error) {
    console.error('Error adding wallet balance:', error)
    return { success: false, message: '增加餘額失敗' }
  }
}

// 減少用戶錢包餘額
export const subtractWalletBalance = (username, amount) => {
  try {
    if (amount < 0) {
      return { success: false, message: '金額必須為正數' }
    }
    const currentBalance = getWalletBalance(username)
    if (currentBalance < amount) {
      return { success: false, message: '餘額不足' }
    }
    return setWalletBalance(username, currentBalance - amount)
  } catch (error) {
    console.error('Error subtracting wallet balance:', error)
    return { success: false, message: '減少餘額失敗' }
  }
}

// 獲取所有用戶的錢包餘額（管理員功能）
export const getAllWallets = () => {
  try {
    const data = localStorage.getItem(WALLET_STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch (error) {
    console.error('Error getting all wallets:', error)
    return {}
  }
}

// 轉賬記錄存儲
const TRANSACTION_STORAGE_KEY = 'jiameng_transactions'

// 添加轉賬記錄
export const addTransaction = (transaction) => {
  try {
    const data = localStorage.getItem(TRANSACTION_STORAGE_KEY)
    const transactions = data ? JSON.parse(data) : []
    const newTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...transaction,
      createdAt: new Date().toISOString()
    }
    transactions.push(newTransaction)
    // 只保留最近1000筆記錄
    const recentTransactions = transactions.slice(-1000)
    const val = JSON.stringify(recentTransactions)
    localStorage.setItem(TRANSACTION_STORAGE_KEY, val)
    syncKeyToSupabase(TRANSACTION_STORAGE_KEY, val)
    return { success: true, transaction: newTransaction }
  } catch (error) {
    console.error('Error adding transaction:', error)
    return { success: false, message: '記錄轉賬失敗' }
  }
}

// 獲取用戶的轉賬記錄
export const getUserTransactions = (username) => {
  try {
    const data = localStorage.getItem(TRANSACTION_STORAGE_KEY)
    const transactions = data ? JSON.parse(data) : []
    return transactions
      .filter(t => t.from === username || t.to === username)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (error) {
    console.error('Error getting user transactions:', error)
    return []
  }
}

// 獲取所有轉賬記錄（管理員功能）
export const getAllTransactions = () => {
  try {
    const data = localStorage.getItem(TRANSACTION_STORAGE_KEY)
    const transactions = data ? JSON.parse(data) : []
    return transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (error) {
    console.error('Error getting all transactions:', error)
    return []
  }
}
