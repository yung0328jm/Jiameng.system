import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { isSupabaseEnabled, flushSyncOutbox } from '../utils/supabaseSync'
import { subscribeRealtime, REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { getSupabaseClient } from '../utils/supabaseClient'

const SyncContext = createContext({ revision: 0 })

export function SyncProvider({ children, syncReady = false }) {
  const [revision, setRevision] = useState(0)
  const unsubRef = useRef(null)
  const pollRef = useRef(null)
  const lastLbUpdatedAtRef = useRef('')
  const lastAnnouncementsUpdatedAtRef = useRef('')
  const resumeRefreshInFlightRef = useRef(false)

  const refreshAppDataKey = async (sb, key, lastUpdatedAtRef, defaultValue) => {
    if (key === 'jiameng_announcements') {
      const lastWrite = parseInt(typeof localStorage !== 'undefined' && localStorage.getItem('jiameng_announcements_last_write') || '', 10)
      if (lastWrite && (Date.now() - lastWrite < 5000)) return false
    }
    const { data } = await sb
      .from('app_data')
      .select('data, updated_at')
      .eq('key', key)
      .maybeSingle()
    const updatedAt = String(data?.updated_at || '')
    if (!updatedAt || updatedAt === lastUpdatedAtRef.current) return false
    lastUpdatedAtRef.current = updatedAt
    const val = typeof data?.data === 'string' ? data.data : JSON.stringify(data?.data ?? defaultValue)
    localStorage.setItem(key, val)
    window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key } }))
    setRevision((r) => r + 1)
    return true
  }

  useEffect(() => {
    if (!syncReady || !isSupabaseEnabled()) return
    unsubRef.current = subscribeRealtime(() => setRevision((r) => r + 1))

    // 備援：有些環境可能收不到 app_data 的 Realtime（RLS/網路/裝置省電等）
    // 全站層級只保留輕量輪詢（排行榜/待辦）；缺失表改由頁面針對「當前專案」用 per-project key 輪詢。
    const sb = getSupabaseClient()
    if (sb) {
      pollRef.current = setInterval(async () => {
        try {
          await flushSyncOutbox()
          await refreshAppDataKey(sb, 'jiameng_leaderboard_items', lastLbUpdatedAtRef, [])
          await refreshAppDataKey(sb, 'jiameng_announcements', lastAnnouncementsUpdatedAtRef, [])
        } catch (_) {}
      }, 8000)
    }

    // 背景->前景：setInterval 可能被瀏覽器降頻/暫停，回來時主動補拉一次（避免要重新登入）
    const onResume = async () => {
      if (!isSupabaseEnabled()) return
      if (document.visibilityState && document.visibilityState !== 'visible') return
      if (resumeRefreshInFlightRef.current) return
      resumeRefreshInFlightRef.current = true
      try {
        await flushSyncOutbox()
      } catch (_) {
      } finally {
        resumeRefreshInFlightRef.current = false
      }
    }
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)

    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
      if (unsubRef.current) {
        try { unsubRef.current() } catch (_) {}
        unsubRef.current = null
      }
      if (pollRef.current) {
        try { clearInterval(pollRef.current) } catch (_) {}
        pollRef.current = null
      }
    }
  }, [syncReady])

  return (
    <SyncContext.Provider value={{ revision }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncRevision() {
  return useContext(SyncContext).revision ?? 0
}

/** 當指定的 localStorage key 被即時更新時，執行 refetch（例如交流區、待辦、使用者列表） */
export function useRealtimeKeys(keys, refetch) {
  const keysRef = useRef(keys)
  const refetchRef = useRef(refetch)
  keysRef.current = keys
  refetchRef.current = refetch
  useEffect(() => {
    const fn = (e) => {
      const k = e.detail?.key
      const wants = Array.isArray(keysRef.current) ? keysRef.current : []
      const hit = !!k && wants.some((want) => {
        if (!want) return false
        if (want === k) return true
        if (typeof want !== 'string') return false
        // prefix match：允許用 'foo:*' 或 'foo:' 來監聽一整類 key（例如 per-project keys）
        if (want.endsWith('*')) return String(k).startsWith(want.slice(0, -1))
        if (want.endsWith(':')) return String(k).startsWith(want)
        return false
      })
      if (hit && typeof refetchRef.current === 'function') {
        refetchRef.current()
      }
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, fn)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, fn)
  }, [])
}
