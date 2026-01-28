/**
 * 帳號管理邏輯：Supabase Auth + profiles 表
 * - 登入：支援 email 或 account（用 account 時查 profiles 取得 email 再驗證）
 * - 用戶資料：profiles 表存 account、display_name、is_admin
 * - 管理員：profiles.is_admin，在資料庫手動設定
 */
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'
import { saveCurrentUser, clearAuthStatus, saveAuthStatus } from './authStorage'

/** 用 email 或 account + 密碼登入；account 時會查 profiles 取得對應 email 再驗證 */
export async function loginWithAccountOrEmail(accountOrEmail, password) {
  const sb = getSupabaseClient()
  if (!sb) return { success: false, message: '未設定 Supabase' }

  try {
    let email = accountOrEmail
    if (!accountOrEmail.includes('@')) {
      const { data: emailData, error: rpcError } = await sb.rpc('get_email_by_account', {
        acc: accountOrEmail
      })
      if (rpcError || !emailData) {
        return { success: false, message: '帳號或密碼錯誤' }
      }
      email = emailData
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      return { success: false, message: error.message || '帳號或密碼錯誤' }
    }

    const profile = await fetchProfileByUserId(data.user.id)
    if (profile) {
      saveCurrentUser(profile.account, profile.is_admin ? 'admin' : 'user')
    } else {
      saveCurrentUser(data.user.email?.split('@')[0] || accountOrEmail, 'user')
    }
    saveAuthStatus(true)
    return { success: true, user: data.user, profile }
  } catch (e) {
    console.warn('loginWithAccountOrEmail', e)
    return { success: false, message: e.message || '登入失敗' }
  }
}

/** 取得當前使用者的 profile（account, display_name, is_admin） */
export async function getProfile() {
  const sb = getSupabaseClient()
  if (!sb) return null
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user?.id) return null
  return fetchProfileByUserId(session.user.id)
}

async function fetchProfileByUserId(userId) {
  const sb = getSupabaseClient()
  if (!sb || !userId) return null
  const { data, error } = await sb.from('profiles').select('id, account, display_name, is_admin, email').eq('id', userId).single()
  if (error || !data) return null
  return data
}

/** 取得當前 session（要登入的路由用） */
export async function getSession() {
  const sb = getSupabaseClient()
  if (!sb) return null
  const { data: { session } } = await sb.auth.getSession()
  return session
}

/** 註冊：建立 Auth 用戶並寫入 profiles，確保用戶資料正確儲存 */
export async function signUpWithProfile({ email, password, account, display_name }) {
  const sb = getSupabaseClient()
  if (!sb) return { success: false, message: '未設定 Supabase' }

  try {
    const { data: authData, error: signUpError } = await sb.auth.signUp({
      email: email || `${account}@jiameng.local`,
      password,
      options: { emailRedirectTo: undefined }
    })
    if (signUpError) {
      return { success: false, message: signUpError.message || '註冊失敗' }
    }
    if (!authData.user?.id) {
      return { success: false, message: '註冊失敗，未取得使用者 id' }
    }

    const { error: insertError } = await sb.from('profiles').insert({
      id: authData.user.id,
      account,
      display_name: display_name || account,
      is_admin: false,
      email: authData.user.email || email || `${account}@jiameng.local`
    })
    if (insertError) {
      console.error('profiles insert error', insertError)
      return { success: false, message: '建立用戶資料失敗：' + (insertError.message || '') }
    }

    const profile = await fetchProfileByUserId(authData.user.id)
    if (authData.session && profile) {
      saveCurrentUser(profile.account, profile.is_admin ? 'admin' : 'user')
      saveAuthStatus(true)
    }
    return { success: true, user: authData.user, profile }
  } catch (e) {
    console.warn('signUpWithProfile', e)
    return { success: false, message: e.message || '註冊失敗' }
  }
}

/** 登出 */
export async function logout() {
  const sb = getSupabaseClient()
  if (sb) await sb.auth.signOut()
  clearAuthStatus()
}

/** 取得所有 profiles（僅管理員可呼叫；用戶管理頁用） */
export async function getAllProfiles() {
  const sb = getSupabaseClient()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_all_profiles')
  if (error) {
    console.warn('getAllProfiles', error)
    return []
  }
  return Array.isArray(data) ? data : []
}

/** 設定某帳號的 is_admin（僅管理員可呼叫） */
export async function setProfileAdmin(account, isAdmin) {
  const sb = getSupabaseClient()
  if (!sb) return { success: false, message: '未設定 Supabase' }
  const { error } = await sb.rpc('set_profile_admin', { acc: account, new_is_admin: !!isAdmin })
  if (error) return { success: false, message: error.message || '更新失敗' }
  return { success: true }
}

/** 訂閱 Auth 狀態：登出時清除本地 session 顯示 */
export function subscribeAuthStateChange(callback) {
  const sb = getSupabaseClient()
  if (!sb) return () => {}
  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') clearAuthStatus()
    if (callback) callback(event, session)
  })
  return () => subscription?.unsubscribe?.()
}

export { isSupabaseEnabled }
