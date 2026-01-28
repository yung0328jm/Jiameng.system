// 註冊密碼：由管理員設置，註冊時必須輸入正確密碼才能註冊
import { syncKeyToSupabase } from './supabaseSync'
const REGISTRATION_PASSWORD_KEY = 'jiameng_registration_password'

export const getRegistrationPassword = () => {
  try {
    return localStorage.getItem(REGISTRATION_PASSWORD_KEY) || ''
  } catch (e) {
    console.error('getRegistrationPassword', e)
    return ''
  }
}

export const setRegistrationPassword = (password) => {
  try {
    localStorage.setItem(REGISTRATION_PASSWORD_KEY, password || '')
    syncKeyToSupabase(REGISTRATION_PASSWORD_KEY, password || '')
    return { success: true }
  } catch (e) {
    console.error('setRegistrationPassword', e)
    return { success: false, message: '設定失敗' }
  }
}

export const checkRegistrationPassword = (input) => {
  const saved = getRegistrationPassword()
  if (!saved) return { success: true } // 未設置時允許註冊（相容舊版）
  return input === saved ? { success: true } : { success: false, message: '註冊密碼錯誤' }
}
