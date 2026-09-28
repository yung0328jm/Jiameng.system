import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  isRecordingModeEnabled,
  setRecordingModeEnabled,
  RECORDING_MODE_CHANGE_EVENT
} from '../utils/recordingModeStorage'
import { invalidateRecordingMaskCache, maskForRecording } from '../utils/recordingModeMask'
import { isGuestSession } from '../utils/guestAuth'

const RecordingModeContext = createContext({
  enabled: false,
  setEnabled: () => {},
  mask: (t) => t
})

export const useRecordingMode = () => useContext(RecordingModeContext)

export function RecordingModeProvider({ children }) {
  const [enabled, setEnabledState] = useState(() => isRecordingModeEnabled())
  const [guest, setGuest] = useState(() => isGuestSession())

  useEffect(() => {
    const onChange = () => {
      setEnabledState(isRecordingModeEnabled())
      setGuest(isGuestSession())
    }
    window.addEventListener(RECORDING_MODE_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(RECORDING_MODE_CHANGE_EVENT, onChange)
  }, [])

  const setEnabled = useCallback((next) => {
    if (isGuestSession() && !next) return
    invalidateRecordingMaskCache()
    setRecordingModeEnabled(!!next)
    setEnabledState(isRecordingModeEnabled())
    setGuest(isGuestSession())
  }, [])

  const mask = useCallback((text) => maskForRecording(text), [enabled])

  return (
    <RecordingModeContext.Provider value={{ enabled, setEnabled, mask }}>
      {enabled && (
        <div
          className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none flex justify-center px-2 pt-[env(safe-area-inset-top,0px)]"
          aria-hidden
        >
          <div className="mt-[52px] sm:mt-[48px] bg-rose-950/90 border border-rose-400/50 text-rose-100 text-[11px] sm:text-xs px-3 py-1 rounded-full shadow-lg backdrop-blur-sm font-medium tracking-wide">
            {guest
              ? '訪客示範模式 · 人員與金額為範例（真實資料未變更）'
              : '錄影模式 · 畫面已遮罩（資料未變更）'}
          </div>
        </div>
      )}
      {children}
    </RecordingModeContext.Provider>
  )
}
