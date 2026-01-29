// 專案存储工具
import { syncKeyToSupabase } from './supabaseSync'
const PROJECT_STORAGE_KEY = 'jiameng_projects'

const persist = (projects) => {
  const val = JSON.stringify(projects)
  localStorage.setItem(PROJECT_STORAGE_KEY, val)
  syncKeyToSupabase(PROJECT_STORAGE_KEY, val)
}

// 获取所有專案
export const getProjects = () => {
  try {
    const projects = localStorage.getItem(PROJECT_STORAGE_KEY)
    const parsed = projects ? JSON.parse(projects) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Error getting projects:', error)
    return []
  }
}

// 保存專案
export const saveProject = (project) => {
  try {
    const projects = getProjects()
    const newProject = {
      ...project,
      id: project.id || Date.now().toString(),
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    const projects = getProjects()
    const index = projects.findIndex(p => p.id === id)
    if (index === -1) {
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

// 删除專案
export const deleteProject = (id) => {
  try {
    const projects = getProjects()
    const filtered = projects.filter(p => p.id !== id)
    persist(filtered)
    return { success: true }
  } catch (error) {
    console.error('Error deleting project:', error)
    return { success: false, message: '刪除失敗' }
  }
}
