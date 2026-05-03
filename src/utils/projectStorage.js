// 專案存储工具
import { syncKeyToSupabase } from './supabaseSync'
const PROJECT_STORAGE_KEY = 'jiameng_projects'

const persist = async (projects) => {
  const val = JSON.stringify(projects)
  localStorage.setItem(PROJECT_STORAGE_KEY, val)
  await syncKeyToSupabase(PROJECT_STORAGE_KEY, val)
}

/** 本機儲存的完整專案陣列（含已軟刪除，供同步合併用；勿在 UI 直接使用） */
const getAllProjectsStored = () => {
  try {
    const projects = localStorage.getItem(PROJECT_STORAGE_KEY)
    const parsed = projects ? JSON.parse(projects) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting projects:', error)
    return []
  }
}

// 取得未刪除的專案（介面／行事曆用）
// 刪除改為軟刪除：寫入仍保留筆 + deleted，否則 sync 與雲端合併時會把雲端舊筆併回，出現「刪了又復原」
export const getProjects = () => {
  return getAllProjectsStored().filter((p) => p && !p.deleted)
}

// 保存專案
export const saveProject = (project) => {
  try {
    const projects = getAllProjectsStored()
    const newProject = {
      ...project,
      id: project.id || Date.now().toString(),
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false
    }
    const index = projects.findIndex(p => p.id === newProject.id)
    if (index !== -1) {
      projects[index] = newProject
    } else {
      projects.push(newProject)
    }
    // 新增/更新都要同步到 Supabase（否則跨裝置會看不到最新專案）
    persist(projects)
    return { success: true, project: newProject }
  } catch (error) {
    console.error('Error saving project:', error)
    return { success: false, message: '保存失敗' }
  }
}

// 更新專案
export const updateProject = (id, updates) => {
  try {
    const projects = getAllProjectsStored()
    const index = projects.findIndex(p => p.id === id)
    if (index === -1) {
      return { success: false, message: '專案不存在' }
    }
    if (projects[index].deleted) {
      return { success: false, message: '專案不存在' }
    }
    projects[index] = {
      ...projects[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    persist(projects)
    return { success: true }
  } catch (error) {
    console.error('Error updating project:', error)
    return { success: false, message: '更新失敗' }
  }
}

const PROJECT_LAST_WRITE_KEY = 'jiameng_projects_last_write'

// 删除專案（軟刪除 + 同步；硬刪會被 supabaseSync 與雲端合併時併回）
export const deleteProject = async (id) => {
  try {
    const projects = getAllProjectsStored()
    const index = projects.findIndex((p) => p.id === id)
    if (index === -1) {
      return { success: false, message: '專案不存在' }
    }
    const now = new Date().toISOString()
    projects[index] = {
      ...projects[index],
      deleted: true,
      updatedAt: now
    }
    const val = JSON.stringify(projects)
    localStorage.setItem(PROJECT_STORAGE_KEY, val)
    try { localStorage.setItem(PROJECT_LAST_WRITE_KEY, Date.now().toString()) } catch (_) {}
    await syncKeyToSupabase(PROJECT_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error deleting project:', error)
    return { success: false, message: '刪除失敗' }
  }
}
