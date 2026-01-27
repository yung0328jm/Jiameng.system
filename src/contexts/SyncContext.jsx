import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { isSupabaseEnabled } from '../utils/supabaseSync'
import { subscribeRealtime, REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'

const SyncContext = createContext({ revision: 0 })

export function SyncProvider({ children, syncReady = false }) {
  const [revision, setRevision] = useState(0)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!syncReady || !isSupabaseEnabled()) return
    unsubRef.current = subscribeRealtime(() => setRevision((r) => r + 1))
    return () => {
      if (unsubRef.current) {
        try { unsubRef.current() } catch (_) {}
        unsubRef.current = null
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
