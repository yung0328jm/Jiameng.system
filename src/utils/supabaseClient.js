// Supabase 客戶端：有設定時回傳 client，否則回傳 null（維持僅本地模式）
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const getSupabaseClient = () => {
  if (url && anonKey) {
    return createClient(url, anonKey)
  }
  return null
}

/** 是否已啟用 Supabase 同步 */
export const isSupabaseEnabled = () => Boolean(url && anonKey)
