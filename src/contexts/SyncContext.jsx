import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { isSupabaseEnabled } from '../utils/supabaseSync'
import { subscribeRealtime, REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { getSupabaseClient } from '../utils/supabaseClient'

const SyncContext = createContext({ revision: 0 })

export function SyncProvider({ children, syncReady = false }) {
  const [revision, setRevision] = useState(0)
  const unsubRef = useRef(null)
  const pollRef = useRef(null)
  const lastLbUpdatedAtRef = useRef('')

  useEffect(() => {
    if (!syncReady || !isSupabaseEnabled()) return
    unsubRef.current = subscribeRealtime(() => setRevision((r) => r + 1))

    // 備援：有些環境可能收不到 app_data 的 Realtime（RLS/網路/裝置省電等）
    // 針對「排行榜面板」做輕量輪詢，避免需要重新登入才能看到新卡片
    const sb = getSupabaseClient()
    if (sb) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await sb
            .from('app_data')
            .select('data, updated_at')
            .eq('key', 'jiameng_leaderboard_items')
            .maybeSingle()
          const updatedAt = String(data?.updated_at || '')
          if (!updatedAt || updatedAt === lastLbUpdatedAtRef.current) return
          lastLbUpdatedAtRef.current = updatedAt
          const val = typeof data?.data === 'string' ? data.data : JSON.stringify(data?.data ?? [])
          localStorage.setItem('jiameng_leaderboard_items', val)
          window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key: 'jiameng_leaderboard_items' } }))
          setRevision((r) => r + 1)
        } catch (_) {}
      }, 8000)
    }

    return () => {
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
      if (k && keysRef.current.includes(k) && typeof refetchRef.current === 'function') {
        refetchRef.current()
      }
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, fn)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, fn)
  }, [])
}
