/** 錄影模式：僅存本機，刻意不列入 Supabase app_data 同步 */

export const RECORDING_MODE_STORAGE_KEY = 'jiameng_recording_mode_local_v1'
export const RECORDING_MODE_CHANGE_EVENT = 'jiameng_recording_mode_change'

export const isRecordingModeEnabled = () => {
  try {
    return localStorage.getItem(RECORDING_MODE_STORAGE_KEY) === '1'
  } catch (_) {
    return false
  }
}

export const setRecordingModeEnabled = (enabled) => {
  try {
    localStorage.setItem(RECORDING_MODE_STORAGE_KEY, enabled ? '1' : '0')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RECORDING_MODE_CHANGE_EVENT))
    }
  } catch (_) {}
}

export const toggleRecordingMode = () => {
  setRecordingModeEnabled(!isRecordingModeEnabled())
}
