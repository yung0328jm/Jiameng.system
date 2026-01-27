// 工程排程存储工具
import { getSupabaseClient } from './supabaseClient'

const SCHEDULE_STORAGE_KEY = 'jiameng_engineering_schedules'

const syncScheduleToSupabase = async (schedule) => {
  const sb = getSupabaseClient()
  if (!sb || !schedule?.id) return
  try {
    await sb.from('engineering_schedules').upsert({
      id: schedule.id,
      data: schedule,
      created_at: schedule.createdAt || new Date().toISOString()
    }, { onConflict: 'id' })
  } catch (e) {
    console.warn('syncScheduleToSupabase:', e)
  }
}

const deleteScheduleFromSupabase = async (scheduleId) => {
  const sb = getSupabaseClient()
  if (!sb) return
  try {
    await sb.from('engineering_schedules').delete().eq('id', scheduleId)
  } catch (e) {
    console.warn('deleteScheduleFromSupabase:', e)
  }
}

export const getSchedules = () => {
  try {
    const schedules = localStorage.getItem(SCHEDULE_STORAGE_KEY)
    return schedules ? JSON.parse(schedules) : []
  } catch (error) {
    console.error('Error getting schedules:', error)
    return []
  }
}

export const saveSchedule = (schedule) => {
  try {
    const schedules = getSchedules()
    const newSchedule = {
      ...schedule,
      id: schedule.id || Date.now().toString(),
      createdAt: schedule.createdAt || new Date().toISOString()
    }
    schedules.push(newSchedule)
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
    syncScheduleToSupabase(newSchedule)
    return { success: true }
  } catch (error) {
    console.error('Error saving schedule:', error)
    return { success: false, message: '保存失敗' }
  }
}

export const updateSchedule = (scheduleId, updates) => {
  try {
    const schedules = getSchedules()
    const index = schedules.findIndex(s => s.id === scheduleId)
    if (index !== -1) {
      schedules[index] = { ...schedules[index], ...updates }
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules))
      syncScheduleToSupabase(schedules[index])
      return { success: true }
    }
    return { success: false, message: '排程不存在' }
  } catch (error) {
    console.error('Error updating schedule:', error)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteSchedule = (scheduleId) => {
  try {
    const schedules = getSchedules()
    const filtered = schedules.filter(s => s.id !== scheduleId)
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(filtered))
    deleteScheduleFromSupabase(scheduleId)
    return { success: true }
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return { success: false, message: '刪除失敗' }
  }
}
