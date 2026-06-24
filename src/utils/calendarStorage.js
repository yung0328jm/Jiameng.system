// 日历事件存储工具
import { syncKeyToSupabase } from './supabaseSync'
const CALENDAR_STORAGE_KEY = 'jiameng_calendar_events'

export const getEvents = () => {
  try {
    const events = localStorage.getItem(CALENDAR_STORAGE_KEY)
    return events ? JSON.parse(events) : []
  } catch (error) {
    console.error('Error getting events:', error)
    return []
  }
}

export const saveEvent = (event) => {
  try {
    const events = getEvents()
    const newEvent = {
      ...event,
      id: event.id || Date.now().toString()
    }
    events.push(newEvent)
    const val = JSON.stringify(events)
    localStorage.setItem(CALENDAR_STORAGE_KEY, val)
    syncKeyToSupabase(CALENDAR_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error saving event:', error)
    return { success: false, message: '保存失敗' }
  }
}

export const updateEvent = (eventId, updates) => {
  try {
    const events = getEvents()
    const index = events.findIndex(e => e.id === eventId)
    if (index !== -1) {
      events[index] = { ...events[index], ...updates }
      const val = JSON.stringify(events)
      localStorage.setItem(CALENDAR_STORAGE_KEY, val)
      syncKeyToSupabase(CALENDAR_STORAGE_KEY, val)
      return { success: true }
    }
    return { success: false, message: '事件不存在' }
  } catch (error) {
    console.error('Error updating event:', error)
    return { success: false, message: '更新失敗' }
  }
}

export const deleteEvent = (eventId) => {
  try {
    const events = getEvents()
    const filtered = events.filter(e => e.id !== eventId)
    const val = JSON.stringify(filtered)
    localStorage.setItem(CALENDAR_STORAGE_KEY, val)
    syncKeyToSupabase(CALENDAR_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error deleting event:', error)
    return { success: false, message: '刪除失敗' }
  }
}

export const getEventsByDate = (year, month, day) => {
  const events = getEvents()
  return events.filter(event => {
    const eventDate = new Date(event.date)
    return eventDate.getFullYear() === year &&
           eventDate.getMonth() === month &&
           eventDate.getDate() === day
  })
}
