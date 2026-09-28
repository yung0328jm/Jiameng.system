// 將 FCM 推播 token 寫入 Supabase push_tokens 表（供後端 send-push 使用）
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient'
import { isGuestCloudWriteBlocked } from './guestAuth'

const PLATFORM = 'android'

export function isPushBackendEnabled() {
  return isSupabaseEnabled()
}

/** 將目前裝置的 FCM token 與帳號綁定並寫入 Supabase */
export async function savePushToken(account, token) {
  const acc = String(account || '').trim()
  const t = String(token || '').trim()
  if (!acc || !t) return { ok: false, error: 'account and token required' }

  if (isGuestCloudWriteBlocked()) return { ok: false, error: 'guest' }

  const sb = getSupabaseClient()
  if (!sb) return { ok: false, error: 'Supabase not configured' }

  const { error } = await sb
    .from('push_tokens')
    .upsert(
      { account: acc, token: t, platform: PLATFORM, updated_at: new Date().toISOString() },
      { onConflict: 'account,platform' }
    )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
