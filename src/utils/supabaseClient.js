// Supabase 客戶端：單例，避免多個 GoTrueClient 導致下拉選單等行為異常
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let clientInstance = null

export const getSupabaseClient = () => {
  if (!url || !anonKey) return null
  if (!clientInstance) {
    clientInstance = createClient(url, anonKey)
  }
  return clientInstance
}

/** 是否已啟用 Supabase 同步 */
export const isSupabaseEnabled = () => Boolean(url && anonKey)
