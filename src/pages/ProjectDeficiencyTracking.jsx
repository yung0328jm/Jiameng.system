import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { createPortal } from 'react-dom'
import { getProjects, saveProject, updateProject, deleteProject } from '../utils/projectStorage'
import { getProjectRecords, saveProjectRecord, saveAllProjectRecords, updateProjectRecord, deleteProjectRecord } from '../utils/projectRecordStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabaseClient'

function ProjectDeficiencyTracking() {
  const [projects, setProjects] = useState([])
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    location: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: 'planning', // planning, in_progress, completed, on_hold
    manager: '',
    budget: '',
    notes: '',
    workerCount: '', // 出工人數
    totalMileage: '' // 里程總合
  })
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [viewingProjectId, setViewingProjectId] = useState(null) // 正在查看的專案ID
  const [projectRecords, setProjectRecords] = useState([])
  const [quickInputText, setQuickInputText] = useState('')
  const [showFormatHelp, setShowFormatHelp] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterRecordStatus, setFilterRecordStatus] = useState('all')
  const [filterSubmitter, setFilterSubmitter] = useState('')
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [editingField, setEditingField] = useState(null) // {recordId, field, revision}
  const [filterProjectStatus, setFilterProjectStatus] = useState('all') // all, planning, in_progress, completed, on_hold
  const [editingProjectStatusId, setEditingProjectStatusId] = useState(null) // 正在編輯狀態的專案ID
  const [isLandscapeFullscreen, setIsLandscapeFullscreen] = useState(false)

  const deficiencyTableFullscreenRef = useRef(null)

  // Realtime callback 會用到：避免閉包拿到舊 viewingProjectId
  const viewingProjectIdRef = useRef(null)
  useEffect(() => {
    viewingProjectIdRef.current = viewingProjectId
  }, [viewingProjectId])

  // 橫向觀看：全螢幕 + 鎖定橫向，方便手機閱讀缺失表
  const enterLandscapeView = async () => {
    const el = deficiencyTableFullscreenRef.current
    if (!el) return
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen()
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen()
      } else {
        alert('您的裝置不支援全螢幕，請手動將手機轉為橫向')
        return
      }
      setIsLandscapeFullscreen(true)
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
        try {
          await screen.orientation.lock('landscape')
        } catch (_) {
          // 部分瀏覽器需先全螢幕才可 lock，或僅支援部分模式
        }
      }
    } catch (e) {
      console.warn('橫向觀看失敗', e)
      alert('無法切換橫向，請手動將手機轉為橫向後重新整理')
    }
  }
  const exitLandscapeView = async () => {
    try {
      const doc = document
      if (doc.exitFullscreen) {
        await doc.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen()
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen()
      }
      setIsLandscapeFullscreen(false)
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.unlock) {
        try {
          screen.orientation.unlock()
        } catch (_) {}
      }
    } catch (e) {
      setIsLandscapeFullscreen(false)
    }
  }
  useEffect(() => {
    const onFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      )
      if (!isFull) {
        setIsLandscapeFullscreen(false)
        if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.unlock) {
          try {
            screen.orientation.unlock()
          } catch (_) {}
        }
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('MSFullscreenChange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      document.removeEventListener('MSFullscreenChange', onFullscreenChange)
    }
  }, [])

  // 備援即時同步：有些裝置收不到 Realtime（或 app_data RLS/省電造成延遲）
  // 策略：針對「當前專案」的 per-project key，每 1 秒只抓 updated_at（timestamp），變更才抓整包 data
  // 目標：任何一個用戶更改狀態，其他裝置在 1 秒內刷新，且不會每秒都拉大 payload
  const prCloudUpdatedAtRef = useRef('')
  useEffect(() => {
    if (!viewingProjectId) return
    if (!isSupabaseEnabled()) return
    const sb = getSupabaseClient()
    if (!sb) return

    let disposed = false
    let inFlight = false
    const fetchOnce = async () => {
      try {
        if (inFlight) return
        inFlight = true

        // 跟待辦同套路徑：雲端 key 用安全命名（避免 ':' 在某些環境被擋）
        const key = `jiameng_project_records__${encodeURIComponent(String(viewingProjectId || '').trim())}`
        const localKey = `jiameng_project_records:${String(viewingProjectId || '').trim()}`
        // 1) 先只抓 updated_at（小流量）
        const { data: tsRow, error: tsErr } = await sb
          .from('app_data')
          .select('updated_at')
          .eq('key', key)
          .maybeSingle()
        if (disposed) return
        if (tsErr) throw tsErr
        const updatedAt = String(tsRow?.updated_at || '')
        if (!updatedAt) return
        if (updatedAt === prCloudUpdatedAtRef.current) return

        // 2) 有變更才抓整包 data
        const { data: fullRow, error: fullErr } = await sb
          .from('app_data')
          .select('data, updated_at')
          .eq('key', key)
          .maybeSingle()
        if (disposed) return
        if (fullErr) throw fullErr
        const updatedAt2 = String(fullRow?.updated_at || '')
        if (updatedAt2) prCloudUpdatedAtRef.current = updatedAt2

        const raw = fullRow?.data
        const arr =
          Array.isArray(raw)
            ? raw
            : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw || '[]') } catch (_) { return [] } })() : [])
        const pid = String(viewingProjectId || '').trim()

        // 寫回 localStorage（per-project key + legacy map），讓其它頁面也能一致運作
        try { localStorage.setItem(localKey, JSON.stringify(arr)) } catch (_) {}
        try {
          const legacyRaw = localStorage.getItem('jiameng_project_records')
          const legacy = legacyRaw ? JSON.parse(legacyRaw) : {}
          const nextLegacy = legacy && typeof legacy === 'object' ? { ...legacy } : {}
          nextLegacy[String(pid)] = arr
          localStorage.setItem('jiameng_project_records', JSON.stringify(nextLegacy))
        } catch (_) {}

        setProjectRecords(arr)
      } catch (_) {
        // 靜默：避免一直跳錯誤視窗干擾操作
      } finally {
        inFlight = false
      }
    }

    fetchOnce()
    const id = setInterval(fetchOnce, 1000)
    return () => {
      disposed = true
      try { clearInterval(id) } catch (_) {}
    }
  }, [viewingProjectId])

  const refetchDeficiency = () => {
    // 1) 專案清單更新
    const data = getProjects()
    const list = Array.isArray(data) ? [...data] : []
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    setProjects(list)
    // 2) 若目前正在看某專案，則同步重讀該專案的缺失表（狀態/進度要即時更新）
    const pid = viewingProjectIdRef.current
    if (pid) {
      try {
        setProjectRecords(getProjectRecords(pid) || [])
      } catch (_) {}
    }
  }
  // 監聽 per-project keys：任何專案缺失表有變動都觸發 refetch（prefix match）
  useRealtimeKeys(['jiameng_projects', 'jiameng_project_records:*', 'jiameng_project_records__*', 'jiameng_engineering_schedules', 'jiameng_project_deficiencies'], refetchDeficiency)

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    if (viewingProjectId) {
      loadProjectRecords()
      updateWorkerCountFromSchedules()
    }
  }, [viewingProjectId, projects])

  // 從工程排程中計算並更新出工人數
  const updateWorkerCountFromSchedules = () => {
    if (!viewingProjectId) return
    
    const project = projects.find(p => p.id === viewingProjectId)
    if (!project) return

    const schedules = getSchedules()
    let totalWorkers = 0
    let totalMileage = 0
    const processedWorkerDates = new Map() // 記錄每天已計算的人員，避免重複
    const processedMileageKeys = new Set() // 同一天同一台車：此專案只加一次分攤里程

    // B 方案：先建立同車同日的「總里程」與「當天案場數量」，用於平均分攤
    // key = ymd__vehicle
    const vehicleDay = new Map() // key -> { mileage:number, sites:Set<string> }
    ;(Array.isArray(schedules) ? schedules : []).forEach((s) => {
      const ymd = String(s?.date || '').slice(0, 10)
      const vehicle = String(s?.vehicle || '').trim()
      const site = String(s?.siteName || '').trim()
      if (!ymd || !vehicle) return
      const key = `${ymd}__${vehicle}`
      if (!vehicleDay.has(key)) vehicleDay.set(key, { mileage: 0, sites: new Set() })
      const bucket = vehicleDay.get(key)
      if (site) bucket.sites.add(site)
      const dep = parseFloat(s?.departureMileage) || 0
      const ret = parseFloat(s?.returnMileage) || 0
      const delta = ret > dep ? (ret - dep) : 0
      if (delta > bucket.mileage) bucket.mileage = delta
    })

    // 遍歷所有排程，找出與專案案場地址相關的排程
    schedules.forEach(schedule => {
      if (!schedule.siteName) return

      // 匹配案場名稱（siteName）或案場地址（location）
      const isMatch = project.location ? (
        schedule.siteName.includes(project.location) || 
        project.location.includes(schedule.siteName) ||
        schedule.siteName === project.location ||
        schedule.siteName === project.name
      ) : (
        schedule.siteName === project.name
      )

      if (isMatch) {
        // 計算參與人員數量（用逗號分隔）
        if (schedule.participants) {
          const participants = schedule.participants.split(',').map(p => p.trim()).filter(p => p)
          const dateKey = schedule.date || 'unknown'
          
          // 計算當天的人數（去重）
          const dayWorkers = new Set(participants).size
          
          // 累加每天的人數（同一天只計算一次，但累加不同天）
          if (!processedWorkerDates.has(dateKey)) {
            totalWorkers += dayWorkers
            processedWorkerDates.set(dateKey, dayWorkers)
          }
        }

        // 累加里程（如果有）
        if (schedule.departureMileage && schedule.returnMileage) {
          const ymd = String(schedule.date || '').slice(0, 10)
          const vehicle = String(schedule.vehicle || '').trim()
          if (ymd && vehicle) {
            const key = `${ymd}__${vehicle}`
            if (processedMileageKeys.has(key)) return
            const bucket = vehicleDay.get(key)
            const cnt = bucket ? bucket.sites.size : 0
            if (bucket && bucket.mileage > 0 && cnt > 0) {
              totalMileage += (bucket.mileage / cnt)
              processedMileageKeys.add(key)
              return
            }
          }

          // fallback：沒車牌/日期等資料就維持舊算法（直接加）
          const departure = parseFloat(schedule.departureMileage) || 0
          const returnMileage = parseFloat(schedule.returnMileage) || 0
          if (returnMileage > departure) totalMileage += (returnMileage - departure)
        }
      }
    })

    // 更新專案的出工人數和里程總合（即使為0也更新，確保同步）
    const updates = {
      workerCount: totalWorkers.toString(),
      totalMileage: totalMileage > 0 ? totalMileage.toFixed(1) : '0'
    }
    
    updateProject(viewingProjectId, updates)
    // 重新載入專案列表以更新顯示
    loadProjects()
  }

  const loadProjects = () => {
    const data = getProjects()
    const list = Array.isArray(data) ? [...data] : []
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    setProjects(list)
  }

  const loadProjectRecords = () => {
    if (!viewingProjectId) return
    const data = getProjectRecords(viewingProjectId)
    setProjectRecords(data)
  }


  const handleProjectChange = (e) => {
    const { name, value } = e.target
    setProjectFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleProjectSubmit = (e) => {
    e.preventDefault()
    
    if (!projectFormData.name) {
      alert('請填寫專案名稱')
      return
    }

    if (editingProjectId) {
      const result = updateProject(editingProjectId, projectFormData)
      if (result.success) {
        loadProjects()
        alert('專案更新成功！')
        resetProjectForm()
      } else {
        alert(result.message || '更新失敗')
      }
    } else {
      const result = saveProject(projectFormData)
      if (result.success) {
        loadProjects()
        alert('專案建立成功！')
        resetProjectForm()
      } else {
        alert(result.message || '保存失敗')
      }
    }
  }

  const handleEditProject = (project) => {
    setProjectFormData({
      name: project.name || '',
      description: project.description || '',
      location: project.location || '',
      startDate: project.startDate || new Date().toISOString().split('T')[0],
      endDate: project.endDate || '',
      status: project.status || 'planning',
      manager: project.manager || '',
      budget: project.budget || '',
      notes: project.notes || '',
      workerCount: project.workerCount || '',
      totalMileage: project.totalMileage || ''
    })
    setEditingProjectId(project.id)
    setSelectedProjectId(project.id)
    setShowProjectForm(true)
  }

  const handleViewProject = (projectId) => {
    setViewingProjectId(projectId)
    setSelectedProjectId(projectId)
    setShowProjectForm(false)
  }

  const handleBackToProjectList = () => {
    setViewingProjectId(null)
    setSelectedProjectId('')
    setProjectRecords([])
    setQuickInputText('')
    setSearchKeyword('')
    setFilterRecordStatus('all')
    setFilterSubmitter('')
  }

  // 解析快速輸入的文字
  const parseQuickInput = (text) => {
    const lines = text.split('\n').filter(line => line.trim())
    const records = []
    const currentUser = getCurrentUser() || '作業'
    const today = new Date()
    const year = today.getFullYear() - 1911 // 民國年
    const dateStr = `${year}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`

    lines.forEach((line, index) => {
      const trimmedLine = line.trim()
      if (!trimmedLine) return

      // 如果使用 // 分隔，則分割
      let content = trimmedLine
      if (trimmedLine.includes('//')) {
        const parts = trimmedLine.split('//')
        content = parts[0].trim()
      }

      records.push({
        id: Date.now().toString() + index + Math.random().toString(36).substr(2, 9),
        rowNumber: projectRecords.length + records.length + 1,
        status: 'pending', // pending, in_progress, completed
        content: content,
        submitter: currentUser,
        date: dateStr,
        revisions: {
          first: { modifier: '', progress: '', date: '' },
          second: { modifier: '', progress: '', date: '' },
          third: { modifier: '', progress: '', date: '' }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    return records
  }

  const handleConsolidateInput = () => {
    if (!quickInputText.trim()) {
      alert('請輸入內容')
      return
    }

    if (!viewingProjectId) {
      alert('請先選擇專案')
      return
    }

    const newRecords = parseQuickInput(quickInputText)
    const allRecords = [...projectRecords, ...newRecords]
    
    // 重新編號
    allRecords.forEach((record, index) => {
      record.rowNumber = index + 1
    })

    const result = saveAllProjectRecords(viewingProjectId, allRecords)
    if (result.success) {
      setQuickInputText('')
      loadProjectRecords()
      alert(`成功新增 ${newRecords.length} 筆記錄`)
    } else {
      alert(result.message || '保存失敗')
    }
  }

  const handleClearInput = () => {
    if (window.confirm('確定要清除輸入內容嗎？')) {
      setQuickInputText('')
    }
  }

  const handleEditRecordField = (recordId, field, revision = null) => {
    setEditingField({ recordId, field, revision })
  }

  const handleSaveRecordField = (recordId, field, value, revision = null) => {
    const record = projectRecords.find(r => r.id === recordId)
    if (!record) return

    const currentUser = getCurrentUser() || '作業'
    const updates = {}
    if (revision) {
      updates.revisions = { ...record.revisions }
      updates.revisions[revision] = {
        ...updates.revisions[revision],
        [field]: value
      }
      
      // 如果填寫進度，自動填入修改人員和日期
      if (field === 'progress' && value) {
        const today = new Date()
        const year = today.getFullYear() - 1911
        const dateStr = `${year}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`
        
        // 自動填入修改人員（當前用戶）
        updates.revisions[revision].modifier = currentUser
        // 自動填入日期
        updates.revisions[revision].date = dateStr
      }
    } else {
      updates[field] = value
      // 內容/備註被他人編輯時，「填單人」改為最新編輯者（讓表格能反映誰最後更新）
      if (field === 'content') {
        updates.submitter = currentUser
        try {
          const today = new Date()
          const year = today.getFullYear() - 1911
          updates.date = `${year}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`
        } catch (_) {}
      }
    }

    const result = updateProjectRecord(viewingProjectId, recordId, updates)
    if (result.success) {
      loadProjectRecords()
      setEditingField(null)
    }
  }

  const handleDeleteRecord = (recordId) => {
    const wasFullscreen = isLandscapeFullscreen
    if (window.confirm('確定要刪除此記錄嗎？')) {
      const result = deleteProjectRecord(viewingProjectId, recordId)
      if (result.success) {
        loadProjectRecords()
        if (wasFullscreen) {
          setTimeout(() => enterLandscapeView(), 100)
        }
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }

  const handleRecordStatusChange = (recordId, newStatus) => {
    const result = updateProjectRecord(viewingProjectId, recordId, { status: newStatus })
    if (result.success) {
      loadProjectRecords()
    }
  }

  // 過濾記錄
  const filteredRecords = projectRecords.filter(record => {
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      const matchContent = record.content?.toLowerCase().includes(keyword)
      const matchSubmitter =
        record.submitter?.toLowerCase().includes(keyword) ||
        getDisplayNameForAccount(record.submitter || '').toLowerCase().includes(keyword)
      const matchDate = record.date?.includes(keyword)
      const matchRevisions = Object.values(record.revisions || {}).some(rev => 
        rev.modifier?.toLowerCase().includes(keyword) || 
        getDisplayNameForAccount(rev.modifier || '').toLowerCase().includes(keyword) ||
        rev.progress?.toLowerCase().includes(keyword) ||
        rev.date?.includes(keyword)
      )
      if (!matchContent && !matchSubmitter && !matchDate && !matchRevisions) {
        return false
      }
    }
    if (filterRecordStatus !== 'all' && record.status !== filterRecordStatus) {
      return false
    }
    if (filterSubmitter) {
      const kw = String(filterSubmitter || '').toLowerCase()
      const matchSubmitter =
        String(record.submitter || '').toLowerCase().includes(kw) ||
        getDisplayNameForAccount(record.submitter || '').toLowerCase().includes(kw)
      const matchRevisions = Object.values(record.revisions || {}).some(rev =>
        String(rev.modifier || '').toLowerCase().includes(kw) ||
        getDisplayNameForAccount(rev.modifier || '').toLowerCase().includes(kw)
      )
      if (!matchSubmitter && !matchRevisions) return false
    }
    return true
  })

  const handleDeleteProject = (id) => {
    if (window.confirm('確定要刪除此專案嗎？')) {
      const result = deleteProject(id)
      if (result.success) {
        loadProjects()
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }

  const resetProjectForm = () => {
    setProjectFormData({
      name: '',
      description: '',
      location: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      status: 'planning',
      manager: '',
      budget: '',
      notes: '',
      workerCount: '',
      totalMileage: ''
    })
    setEditingProjectId(null)
    setSelectedProjectId('')
    setShowProjectForm(false)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-red-500'
      case 'in_progress':
        return 'bg-yellow-400'
      case 'completed':
        return 'bg-green-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'pending':
        return '待處理'
      case 'in_progress':
        return '處理中'
      case 'completed':
        return '已完成'
      default:
        return status
    }
  }

  const getProjectStatusColor = (status) => {
    switch (status) {
      case 'planning':
        return 'bg-blue-500'
      case 'in_progress':
        return 'bg-yellow-400'
      case 'completed':
        return 'bg-green-500'
      case 'on_hold':
        return 'bg-gray-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getProjectStatusText = (status) => {
    switch (status) {
      case 'planning':
        return '規劃中'
      case 'in_progress':
        return '進行中'
      case 'completed':
        return '已完成'
      case 'on_hold':
        return '暫停'
      default:
        return status
    }
  }

  const formatProjectDate = (dateStr) => {
    if (!dateStr) return '—'
    // 如果是 YYYY-MM-DD 格式
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-')
      const year = parseInt(y) - 1911
      return `${year}/${m}/${d}`
    }
    return dateStr
  }

  const filteredProjects = projects.filter(p => {
    if (filterProjectStatus !== 'all' && p.status !== filterProjectStatus) return false
    return true
  })

  return (
    <div
      className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-[80vh]"
      style={{ backgroundColor: '#1A1A1A', color: '#fff', minHeight: '80vh' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-yellow-400" style={{ color: '#facc15' }}>專案管理</h2>
        {!viewingProjectId && (
          <button
            onClick={() => {
              setSelectedProjectId('')
              resetProjectForm()
              setShowProjectForm(true)
            }}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>新增專案</span>
          </button>
        )}
      </div>

      {/* 專案管理內容 */}
      {!viewingProjectId && (
        <>
          {/* 專案管理標題 */}
          <div className="flex items-center space-x-2 mb-6">
            <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h3 className="text-xl font-bold text-yellow-400">專案管理</h3>
          </div>

          {/* 狀態分類標籤 */}
          <div className="flex items-center flex-wrap gap-3 sm:gap-2 mb-6 pb-4 border-b border-gray-700">
            <button
              onClick={() => setFilterProjectStatus('all')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterProjectStatus === 'all'
                  ? 'bg-yellow-400 text-gray-800'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilterProjectStatus('planning')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterProjectStatus === 'planning'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              規劃中
            </button>
            <button
              onClick={() => setFilterProjectStatus('in_progress')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterProjectStatus === 'in_progress'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              進行中
            </button>
            <button
              onClick={() => setFilterProjectStatus('completed')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterProjectStatus === 'completed'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              已完成
            </button>
          </div>

          {/* 專案網格卡片 */}
          {filteredProjects.length === 0 ? (
            <div className="text-gray-400 text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-xs sm:text-sm mb-1">
                {projects.length === 0 
                  ? '目前尚無專案' 
                  : `目前沒有「${getProjectStatusText(filterProjectStatus)}」狀態的專案`}
              </p>
              <p className="text-[10px] sm:text-xs">
                {projects.length === 0 
                  ? '點擊「新增專案」開始建立' 
                  : '請選擇其他分類或新增專案'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="bg-gray-800 border-2 border-gray-700 rounded-lg p-3 sm:p-4 hover:border-yellow-400 hover:shadow-lg transition-all group relative min-w-0"
                >
                  {/* 刪除按鈕 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteProject(project.id)
                    }}
                    className="absolute top-1 right-1 text-red-400 hover:text-red-500 transition-colors p-0.5 rounded hover:bg-red-900/20"
                    title="刪除專案"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  <div
                    onClick={() => handleViewProject(project.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-1.5 pr-6">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors mb-0.5 break-words line-clamp-2">
                          {project.name}
                        </h4>
                        {project.location && (
                          <p className="text-gray-400 text-[10px] sm:text-xs mb-0 truncate">
                            <svg className="w-3 h-3 inline mr-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {project.location}
                          </p>
                        )}
                      </div>
                      <div className="relative flex-shrink-0">
                        {editingProjectStatusId === project.id ? (
                          <select
                            value={project.status}
                            onChange={(e) => {
                              const result = updateProject(project.id, { status: e.target.value })
                              if (result.success) {
                                loadProjects()
                                setEditingProjectStatusId(null)
                              } else {
                                alert(result.message || '更新失敗')
                              }
                            }}
                            onBlur={() => setEditingProjectStatusId(null)}
                            autoFocus
                            className={`px-1 py-0.5 rounded text-[9px] font-semibold ${getProjectStatusColor(project.status)} text-white border border-yellow-400 focus:outline-none`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="planning">規劃中</option>
                            <option value="in_progress">進行中</option>
                            <option value="completed">已完成</option>
                            <option value="on_hold">暫停</option>
                          </select>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingProjectStatusId(project.id)
                            }}
                            className={`px-1 py-0.5 rounded text-[9px] font-semibold ${getProjectStatusColor(project.status)} text-white hover:opacity-80 transition-opacity cursor-pointer`}
                            title="點擊編輯狀態"
                          >
                            {getProjectStatusText(project.status)}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-0.5 text-[10px] sm:text-xs">
                      {project.startDate && (
                        <div className="flex items-center text-gray-300">
                          <span className="text-gray-500 w-14 flex-shrink-0">開始:</span>
                          <span className="text-white truncate">{formatProjectDate(project.startDate)}</span>
                        </div>
                      )}
                      {project.manager && (
                        <div className="flex items-center text-gray-300">
                          <span className="text-gray-500 w-14 flex-shrink-0">負責人:</span>
                          <span className="text-white truncate">{project.manager}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="flex items-center text-yellow-400 text-[10px] sm:text-xs group-hover:text-yellow-300 transition-colors">
                        <span>查看詳情</span>
                        <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 專案詳情頁面 */}
      {viewingProjectId && (
        <ProjectDetailView
          project={projects.find(p => p.id === viewingProjectId)}
          records={filteredRecords}
          quickInputText={quickInputText}
          setQuickInputText={setQuickInputText}
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
          filterRecordStatus={filterRecordStatus}
          setFilterRecordStatus={setFilterRecordStatus}
          filterSubmitter={filterSubmitter}
          setFilterSubmitter={setFilterSubmitter}
          editingField={editingField}
          onBack={handleBackToProjectList}
          onConsolidateInput={handleConsolidateInput}
          onClearInput={handleClearInput}
          onEditField={handleEditRecordField}
          onSaveField={handleSaveRecordField}
          onDeleteRecord={handleDeleteRecord}
          onStatusChange={handleRecordStatusChange}
          onUpdateProject={updateProject}
          onLoadProjects={loadProjects}
          getStatusColor={getStatusColor}
          deficiencyTableFullscreenRef={deficiencyTableFullscreenRef}
          isLandscapeFullscreen={isLandscapeFullscreen}
          enterLandscapeView={enterLandscapeView}
          exitLandscapeView={exitLandscapeView}
        />
      )}

      {/* 新增/編輯專案表單 */}
      {showProjectForm && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border-2 border-yellow-400">
          <form onSubmit={handleProjectSubmit} className="space-y-4">
            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                專案名稱
              </label>
              <input
                type="text"
                name="name"
                value={projectFormData.name}
                onChange={handleProjectChange}
                placeholder="請輸入專案名稱 (例:XX大樓建案)"
                className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
                required
              />
            </div>

            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                案場地址
              </label>
              <input
                type="text"
                name="location"
                value={projectFormData.location}
                onChange={handleProjectChange}
                placeholder="請輸入案場地址"
                className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                開始日期
              </label>
              <div className="relative">
                <input
                  type="date"
                  name="startDate"
                  value={projectFormData.startDate}
                  onChange={handleProjectChange}
                  className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500 pr-10"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                結束日期
              </label>
              <div className="relative">
                <input
                  type="date"
                  name="endDate"
                  value={projectFormData.endDate}
                  onChange={handleProjectChange}
                  className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500 pr-10"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                出工人數 <span className="text-gray-400 text-xs">(自動從工程排程同步)</span>
              </label>
              <input
                type="text"
                name="workerCount"
                value={projectFormData.workerCount || '0'}
                readOnly
                className="w-full bg-gray-600 border-2 border-yellow-400 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none cursor-not-allowed"
                title="此欄位會自動從工程排程中相關案場的參與人員計算並累加"
              />
            </div>

            <div>
              <label className="block text-yellow-400 text-sm mb-2 font-semibold">
                里程總合 <span className="text-gray-400 text-xs">(自動從工程排程同步)</span>
              </label>
              <input
                type="text"
                name="totalMileage"
                value={projectFormData.totalMileage ? `${projectFormData.totalMileage} km` : '0 km'}
                readOnly
                className="w-full bg-gray-600 border-2 border-yellow-400 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none cursor-not-allowed"
                title="此欄位會自動從工程排程中相關案場的里程計算並累加"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>建立專案</span>
              </button>
              <button
                type="button"
                onClick={resetProjectForm}
                className="bg-gray-700 hover:bg-gray-600 text-yellow-400 font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// 專案詳情視圖組件
function ProjectDetailView({
  project,
  records,
  quickInputText,
  setQuickInputText,
  searchKeyword,
  setSearchKeyword,
  filterRecordStatus,
  setFilterRecordStatus,
  filterSubmitter,
  setFilterSubmitter,
  editingField,
  onBack,
  onConsolidateInput,
  onClearInput,
  onEditField,
  onSaveField,
  onDeleteRecord,
  onStatusChange,
  onUpdateProject,
  onLoadProjects,
  getStatusColor,
  deficiencyTableFullscreenRef,
  isLandscapeFullscreen,
  enterLandscapeView,
  exitLandscapeView
}) {
  const [showDeficiencyRecord, setShowDeficiencyRecord] = useState(false)
  const [showSearchFilter, setShowSearchFilter] = useState(false)
  const [isEditingProjectInfo, setIsEditingProjectInfo] = useState(false)
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [repairModalRecord, setRepairModalRecord] = useState(null)
  const [projectInfoForm, setProjectInfoForm] = useState({
    startDate: '',
    endDate: '',
    manager: '',
    workerCount: '',
    totalMileage: ''
  })

  // 展開案場缺失記錄後，常態以橫向全螢幕顯示
  useEffect(() => {
    if (showDeficiencyRecord && typeof enterLandscapeView === 'function') {
      enterLandscapeView()
    }
  }, [showDeficiencyRecord])

  const handlePrint = () => {
    try {
      window.print()
    } catch (e) {
      console.warn('print failed', e)
    }
  }

  useEffect(() => {
    if (project) {
      setProjectInfoForm({
        startDate: project.startDate || '',
        endDate: project.endDate || '',
        manager: project.manager || '',
        workerCount: project.workerCount || '',
        totalMileage: project.totalMileage || ''
      })
    }
  }, [project])

  const handleProjectInfoChange = (e) => {
    const { name, value } = e.target
    setProjectInfoForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveProjectInfo = () => {
    if (!project) return
    
    const result = onUpdateProject(project.id, projectInfoForm)
    if (result.success) {
      onLoadProjects()
      setIsEditingProjectInfo(false)
      alert('專案資訊更新成功！')
    } else {
      alert(result.message || '更新失敗')
    }
  }

  const handleCancelEdit = () => {
    if (project) {
      setProjectInfoForm({
        startDate: project.startDate || '',
        endDate: project.endDate || '',
        manager: project.manager || '',
        workerCount: project.workerCount || '',
        totalMileage: project.totalMileage || ''
      })
    }
    setIsEditingProjectInfo(false)
  }
  const getStatusDotColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-red-500'
      case 'in_progress':
        return 'bg-yellow-400'
      case 'completed':
        return 'bg-green-500'
      case 'unable':
        return 'bg-gray-500'
      default:
        return 'bg-gray-500'
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    // 如果是 ISO 格式，轉換為民國年
    if (dateStr.includes('T')) {
      const date = new Date(dateStr)
      const year = date.getFullYear() - 1911
      return `${year}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
    }
    // 如果是 YYYY-MM-DD 格式
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-')
      const year = parseInt(y) - 1911
      return `${year}/${m}/${d}`
    }
    return dateStr
  }

  const openRepairModal = (record) => {
    setRepairModalRecord(record || null)
    setShowRepairModal(true)
  }

  const closeRepairModal = () => {
    setShowRepairModal(false)
    setRepairModalRecord(null)
    try { onEditField(null, null) } catch (_) {}
  }

  const hasRepair = (record, revision) => {
    const rev = record?.revisions?.[revision] || {}
    const m = String(rev?.modifier || '').trim()
    const p = String(rev?.progress || '').trim()
    const d = String(rev?.date || '').trim()
    return Boolean(m || p || d)
  }

  // 修繕彈窗：當 records 更新（例如同步/儲存進度）時，讓彈窗內容即時跟著刷新
  useEffect(() => {
    if (!showRepairModal) return
    const id = String(repairModalRecord?.id || '').trim()
    if (!id) return
    const next = (Array.isArray(records) ? records : []).find((r) => String(r?.id || '').trim() === id)
    if (next) setRepairModalRecord(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, showRepairModal])

  return (
    <div>
      {/* 列印專用樣式：只印表格（含目前篩選結果），取消捲動與 sticky 表頭 */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: white !important; color: black !important; }
          .project-no-print { display: none !important; }
          body * { visibility: hidden; }
          .project-print-area, .project-print-area * { visibility: visible; }
          .project-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .project-print-area .print-table-wrap { overflow: visible !important; max-height: none !important; }
          .project-print-area table { width: 100% !important; border-collapse: collapse !important; }
          .project-print-area th, .project-print-area td { border: 1px solid #333 !important; color: #000 !important; background: #fff !important; }
          .project-print-area thead { position: static !important; }
          .project-print-area .sticky { position: static !important; top: auto !important; }
          .project-print-area .hover\\:bg-gray-900:hover { background: transparent !important; }
          .project-print-only { display: block !important; }
          .project-deficiency-body { display: block !important; }
        }
        .project-print-only { display: none; }
      `}</style>

      {/* 標題和返回按鈕 */}
      <div className="flex items-center justify-between mb-6 project-no-print">
        <h2 className="text-2xl font-bold text-yellow-400">
          專案內容: {project?.name || ''}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
            title="列印整份表格（含目前篩選結果）"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
            </svg>
            <span>列印表格</span>
          </button>
          <button
            onClick={onBack}
            className="bg-gray-700 hover:bg-gray-600 text-yellow-400 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>返回專案列表</span>
          </button>
        </div>
      </div>

      {/* 專案基本資訊 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700 project-no-print">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-yellow-400">專案資訊</h3>
          {!isEditingProjectInfo ? (
            <button
              onClick={() => setIsEditingProjectInfo(true)}
              className="text-yellow-400 hover:text-yellow-500 text-sm font-semibold flex items-center space-x-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>編輯</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSaveProjectInfo}
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-semibold px-3 py-1 rounded transition-colors flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>保存</span>
              </button>
              <button
                onClick={handleCancelEdit}
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-3 py-1 rounded transition-colors"
              >
                取消
              </button>
            </div>
          )}
        </div>
        
        {isEditingProjectInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">開始日期</label>
              <input
                type="date"
                name="startDate"
                value={projectInfoForm.startDate}
                onChange={handleProjectInfoChange}
                className="w-full bg-gray-700 border border-yellow-400 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">結束日期</label>
              <input
                type="date"
                name="endDate"
                value={projectInfoForm.endDate}
                onChange={handleProjectInfoChange}
                className="w-full bg-gray-700 border border-yellow-400 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                負責人
              </label>
              <input
                type="text"
                name="manager"
                value={projectInfoForm.manager}
                onChange={handleProjectInfoChange}
                placeholder="請輸入負責人"
                className="w-full bg-gray-700 border border-yellow-400 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                出工人數
                <span className="text-gray-500 text-xs ml-2">(自動同步)</span>
              </label>
              <input
                type="text"
                name="workerCount"
                value={projectInfoForm.workerCount}
                readOnly
                className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white cursor-not-allowed"
                title="此欄位會自動從工程排程中相關案場的參與人員計算並累加"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                里程總合
                <span className="text-gray-500 text-xs ml-2">(自動同步)</span>
              </label>
              <input
                type="text"
                name="totalMileage"
                value={projectInfoForm.totalMileage ? `${projectInfoForm.totalMileage} km` : '0 km'}
                readOnly
                className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white cursor-not-allowed"
                title="此欄位會自動從工程排程中相關案場的里程計算並累加"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">開始日期</label>
              <p className="text-white font-semibold">{formatDate(project?.startDate) || '—'}</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">結束日期</label>
              <p className="text-white font-semibold">{formatDate(project?.endDate) || '—'}</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">負責人</label>
              <p className="text-white font-semibold">{project?.manager || '—'}</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                出工人數
                <span className="text-gray-500 text-xs ml-2">(自動同步)</span>
              </label>
              <p className="text-white font-semibold">{project?.workerCount || '0'}</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">
                里程總合
                <span className="text-gray-500 text-xs ml-2">(自動同步)</span>
              </label>
              <p className="text-white font-semibold">{project?.totalMileage ? `${project.totalMileage} km` : '0 km'}</p>
            </div>
          </div>
        )}
      </div>

      {/* 案場缺失紀錄 - 可展開/折疊 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 mb-6 overflow-hidden">
        {/* 標題行 - 可點擊展開/折疊 */}
        <div
          onClick={() => setShowDeficiencyRecord(!showDeficiencyRecord)}
          className="p-4 cursor-pointer hover:bg-gray-750 transition-colors flex items-center justify-between project-no-print"
        >
          <div className="flex items-center space-x-3">
            <svg
              className={`w-5 h-5 text-yellow-400 transition-transform ${showDeficiencyRecord ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-lg font-bold text-yellow-400">案場缺失紀錄</h3>
          </div>
          <span className="text-gray-400 text-sm">
            {showDeficiencyRecord ? '點擊收起' : '點擊展開'}
          </span>
        </div>

        {/* 展開內容：直接橫向表格，工具列放快速輸入+篩選+橫向觀看 */}
        <div className={`border-t border-gray-700 p-4 project-deficiency-body ${showDeficiencyRecord ? '' : 'hidden'}`}>
            {/* 數據表格（列印時只顯示這塊） */}
            <div
              ref={deficiencyTableFullscreenRef}
              className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 project-print-area relative"
              style={isLandscapeFullscreen ? { minHeight: '100vh', display: 'flex', flexDirection: 'column' } : {}}
            >
        {isLandscapeFullscreen && (
          <div className="sticky top-0 z-20 flex flex-wrap justify-end items-center gap-2 p-2 bg-gray-800 border-b border-gray-700">
            <button type="button" onClick={() => setShowSearchFilter(!showSearchFilter)} className="bg-gray-600 hover:bg-gray-500 text-yellow-400 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              {showSearchFilter ? '收起搜尋' : '搜尋'}
            </button>
            {showSearchFilter && (
              <>
                <div className="relative">
                  <input type="text" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="關鍵字" className="w-28 h-[34px] bg-gray-700 border border-gray-500 rounded px-2 py-1.5 pr-7 text-white text-sm" />
                  {searchKeyword && <button type="button" onClick={() => setSearchKeyword('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400">×</button>}
                </div>
                <select value={filterRecordStatus} onChange={(e) => setFilterRecordStatus(e.target.value)} className="h-[34px] bg-gray-700 border border-gray-500 rounded px-2 text-white text-sm min-w-[5.5rem]">
                  <option value="all">全部</option>
                  <option value="pending">待處理</option>
                  <option value="in_progress">處理中</option>
                  <option value="completed">已完成</option>
                  <option value="unable">無法處理</option>
                </select>
                <input type="text" value={filterSubmitter} onChange={(e) => setFilterSubmitter(e.target.value)} placeholder="填單人" className="h-[34px] w-24 bg-gray-700 border border-gray-500 rounded px-2 text-white text-sm" />
              </>
            )}
            <button type="button" onClick={() => { exitLandscapeView(); setShowDeficiencyRecord(false) }} className="bg-gray-600 hover:bg-gray-500 text-yellow-400 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              返回
            </button>
          </div>
        )}
        {/* 工具列：快速輸入 + 篩選 + 橫向觀看（排列整齊） */}
        <div className="flex flex-wrap items-center gap-3 mb-2 p-3 bg-gray-800 border-b border-gray-700 project-no-print">
          <span className="text-gray-400 text-sm font-medium w-10 shrink-0">表格</span>
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
            <textarea
              value={quickInputText}
              onChange={(e) => setQuickInputText(e.target.value)}
              placeholder="快速輸入"
              rows={2}
              className="flex-1 min-w-[120px] bg-gray-700 border border-yellow-400 rounded px-2 py-1.5 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-yellow-500 resize-y min-h-[48px]"
            />
            <button onClick={onConsolidateInput} className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-3 py-1.5 rounded text-sm shrink-0 h-[34px]">彙整</button>
            <button onClick={onClearInput} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-1.5 rounded text-sm shrink-0 h-[34px]">清除</button>
          </div>
          {!isLandscapeFullscreen && (
            <button type="button" onClick={enterLandscapeView} className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0" title="全螢幕橫向觀看">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              橫向觀看
            </button>
          )}
        </div>
        <div className="project-print-only mb-3">
          <div className="text-lg font-bold">專案管理表格：{project?.name || ''}</div>
          <div className="text-sm mt-1">
            篩選：狀態 {filterRecordStatus || 'all'} ／ 關鍵字 {searchKeyword || '—'} ／ 人員 {filterSubmitter || '—'}
          </div>
          <div className="text-xs mt-1">列印時間：{new Date().toLocaleString('zh-TW')}</div>
        </div>
        <div
          className="print-table-wrap overflow-x-auto overflow-y-auto"
          style={
            isLandscapeFullscreen
              ? { maxHeight: 'none', flex: '1', minHeight: 0 }
              : { maxHeight: '60vh' }
          }
        >
          <table className="w-full min-w-0 table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-900 border-b-2 border-yellow-400">
                <th className="w-10 sm:w-12 px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0">項次</th>
                <th className="min-w-[5.5rem] w-28 px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0">狀態</th>
                <th className="min-w-0 px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">內容/備註</th>
                <th className="w-16 sm:w-20 px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0 hidden sm:table-cell">填單人</th>
                <th className="w-16 sm:w-20 px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0 hidden sm:table-cell">日期</th>
                <th className="w-14 sm:w-16 px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0">是否修繕過</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-2 py-6 text-center text-gray-400 text-xs">
                    尚無記錄，請使用快速輸入區新增記錄
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const isEditingContent = editingField?.recordId === record.id && editingField?.field === 'content' && !editingField?.revision

                  return (
                    <tr key={record.id} className="border-b border-gray-700 hover:bg-gray-900">
                      <td className="w-10 sm:w-12 px-2 py-1.5 text-yellow-400 font-semibold text-[10px] sm:text-xs flex-shrink-0">{record.rowNumber}</td>
                      <td className="min-w-[5.5rem] w-28 px-2 py-1.5 flex-shrink-0">
                        <div className="flex items-center space-x-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotColor(record.status)}`}></div>
                          <select
                            value={record.status}
                            onChange={(e) => onStatusChange(record.id, e.target.value)}
                            className="bg-gray-700 border border-gray-500 rounded px-1.5 py-0.5 text-white text-[10px] sm:text-xs focus:outline-none focus:border-yellow-400 min-w-[5.5rem]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="pending">待處理</option>
                            <option value="in_progress">處理中</option>
                            <option value="completed">已完成</option>
                            <option value="unable">無法處理</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 min-w-0">
                        {isEditingContent ? (
                          <div className="flex items-center space-x-1 min-w-0">
                            <input
                              type="text"
                              defaultValue={record.content}
                              onBlur={(e) => {
                                onSaveField(record.id, 'content', e.target.value)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onSaveField(record.id, 'content', e.target.value)
                                }
                                if (e.key === 'Escape') {
                                  onEditField(null, null)
                                }
                              }}
                              autoFocus
                              className={`flex-1 min-w-0 bg-gray-700 border border-yellow-400 rounded px-1 py-0.5 text-[10px] sm:text-xs focus:outline-none ${record.status === 'unable' ? 'text-red-400' : 'text-white'}`}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openRepairModal(record)
                              }}
                              className={`text-left text-[10px] sm:text-xs break-words hover:text-yellow-300 min-w-0 flex-1 ${record.status === 'unable' ? 'text-red-400' : 'text-white'}`}
                              title="點擊查看完整內容/修繕紀錄"
                            >
                              {record.content || '—'}
                            </button>
                            <button
                              onClick={() => onEditField(record.id, 'content')}
                              className="text-yellow-400 hover:text-yellow-500 flex-shrink-0"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteRecord(record.id)
                              }}
                              className="project-no-print text-red-400 hover:text-red-300 flex-shrink-0"
                              title="刪除缺失"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m5 0H4" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {/* 手機版：填單人、日期顯示在內容下方 */}
                        <div className="sm:hidden text-[10px] text-gray-400 mt-0.5">
                          {record.submitter ? getDisplayNameForAccount(record.submitter) : '—'} · {record.date || '—'}
                        </div>
                      </td>
                      <td className="w-16 sm:w-20 px-2 py-1.5 text-white text-[10px] sm:text-xs hidden sm:table-cell">{record.submitter ? getDisplayNameForAccount(record.submitter) : '—'}</td>
                      <td className="w-16 sm:w-20 px-2 py-1.5 text-white text-[10px] sm:text-xs hidden sm:table-cell">{record.date || '—'}</td>
                      <td className="w-14 sm:w-16 px-2 py-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openRepairModal(record)
                          }}
                          onTouchEnd={(e) => e.stopPropagation()}
                          className="w-full flex items-center justify-center gap-1 cursor-pointer touch-manipulation"
                          title="查看修繕紀錄（第一次/第二次/第三次）"
                        >
                          {['first', 'second', 'third'].map((rev) => {
                            const done = hasRepair(record, rev)
                            const cls = done ? 'bg-green-400' : 'bg-gray-600'
                            return <span key={rev} className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />
                          })}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
          </div>
      </div>

      {/* 修繕紀錄彈窗：全螢幕時 portal 到全螢幕容器內才能顯示在最上層，否則 portal 到 body */}
      {showRepairModal && typeof document !== 'undefined' && (() => {
        const modalContent = (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 project-no-print" onMouseDown={closeRepairModal} onClick={closeRepairModal}>
            <div className="w-[92vw] max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-4" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-yellow-400 font-semibold">修繕紀錄</div>
                  <div className={`text-sm mt-2 break-words whitespace-pre-wrap ${repairModalRecord?.status === 'unable' ? 'text-red-400' : 'text-gray-200'}`}>
                    {repairModalRecord?.content || '—'}
                  </div>
                </div>
                <button type="button" onClick={closeRepairModal} className="shrink-0 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded">
                  關閉
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {['first', 'second', 'third'].map((revision, idx) => {
                  const rev = repairModalRecord?.revisions?.[revision] || {}
                  const isEditingProgress = editingField?.recordId === repairModalRecord?.id && editingField?.field === 'progress' && editingField?.revision === revision
                  const title = idx === 0 ? '第一次修繕' : (idx === 1 ? '第二次修繕' : '第三次修繕')
                  return (
                    <div key={revision} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white font-semibold text-sm">{title}</div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${hasRepair(repairModalRecord, revision) ? 'bg-green-400' : 'bg-gray-600'}`} />
                          <span className="text-gray-400 text-xs">{hasRepair(repairModalRecord, revision) ? '已修繕' : '未修繕'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                        <div className="bg-gray-900/40 border border-gray-700 rounded p-2">
                          <div className="text-gray-400 mb-1">修改人員</div>
                          <div className="text-white break-all">{rev.modifier ? getDisplayNameForAccount(rev.modifier) : '—'}</div>
                        </div>
                        <div className="bg-gray-900/40 border border-gray-700 rounded p-2">
                          <div className="text-gray-400 mb-1">進度</div>
                          {isEditingProgress ? (
                            <input
                              type="text"
                              defaultValue={rev.progress}
                              onBlur={(e) => onSaveField(repairModalRecord.id, 'progress', e.target.value, revision)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onSaveField(repairModalRecord.id, 'progress', e.target.value, revision)
                                if (e.key === 'Escape') onEditField(null, null)
                              }}
                              autoFocus
                              className="w-full bg-gray-700 border border-yellow-400 rounded px-2 py-1 text-white text-xs focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              className="w-full text-left text-white hover:text-yellow-300"
                              onClick={() => onEditField(repairModalRecord.id, 'progress', revision)}
                              title="點擊編輯進度"
                            >
                              {String(rev.progress || '').trim() ? rev.progress : '點擊填寫進度'}
                            </button>
                          )}
                        </div>
                        <div className="bg-gray-900/40 border border-gray-700 rounded p-2">
                          <div className="text-gray-400 mb-1">日期</div>
                          <div className="text-white break-all">{rev.date || '—'}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
        const container = (isLandscapeFullscreen && deficiencyTableFullscreenRef.current)
          ? deficiencyTableFullscreenRef.current
          : document.body
        return createPortal(modalContent, container)
      })()}
    </div>
  )
}

export default ProjectDeficiencyTracking
