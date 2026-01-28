import { useState, useEffect } from 'react'
import React from 'react'
import { getProjects, saveProject, updateProject, deleteProject } from '../utils/projectStorage'
import { getProjectRecords, saveProjectRecord, saveAllProjectRecords, updateProjectRecord, deleteProjectRecord } from '../utils/projectRecordStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

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

  const refetchDeficiency = () => {
    const data = getProjects()
    setProjects(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
  }
  useRealtimeKeys(['jiameng_projects', 'jiameng_project_records', 'jiameng_engineering_schedules', 'jiameng_project_deficiencies'], refetchDeficiency)

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
          const departure = parseFloat(schedule.departureMileage) || 0
          const returnMileage = parseFloat(schedule.returnMileage) || 0
          if (returnMileage > departure) {
            totalMileage += (returnMileage - departure)
          }
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
    setProjects(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
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
    }

    const result = updateProjectRecord(viewingProjectId, recordId, updates)
    if (result.success) {
      loadProjectRecords()
      setEditingField(null)
    }
  }

  const handleDeleteRecord = (recordId) => {
    if (window.confirm('確定要刪除此記錄嗎？')) {
      const result = deleteProjectRecord(viewingProjectId, recordId)
      if (result.success) {
        loadProjectRecords()
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
      const matchSubmitter = record.submitter?.toLowerCase().includes(keyword)
      const matchDate = record.date?.includes(keyword)
      const matchRevisions = Object.values(record.revisions || {}).some(rev => 
        rev.modifier?.toLowerCase().includes(keyword) || 
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
    if (filterSubmitter && record.submitter !== filterSubmitter) {
      return false
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
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">專案管理</h2>
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
          showFormatHelp={showFormatHelp}
          setShowFormatHelp={setShowFormatHelp}
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
  showFormatHelp,
  setShowFormatHelp,
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
  getStatusColor
}) {
  const [showDeficiencyRecord, setShowDeficiencyRecord] = useState(false)
  const [isEditingProjectInfo, setIsEditingProjectInfo] = useState(false)
  const [projectInfoForm, setProjectInfoForm] = useState({
    startDate: '',
    endDate: '',
    manager: '',
    workerCount: '',
    totalMileage: ''
  })

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

  return (
    <div>
      {/* 標題和返回按鈕 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">
          專案內容: {project?.name || ''}
        </h2>
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

      {/* 專案基本資訊 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
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
          className="p-4 cursor-pointer hover:bg-gray-750 transition-colors flex items-center justify-between"
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

        {/* 展開內容 */}
        {showDeficiencyRecord && (
          <div className="border-t border-gray-700 p-6">
            {/* 快速輸入區 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-yellow-400">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">
          快速輸入區 (請在此輸入缺失記錄)
        </h3>
        <textarea
          value={quickInputText}
          onChange={(e) => setQuickInputText(e.target.value)}
          placeholder="請輸入缺失記錄，每行一筆或停用分兩所分子"
          rows="6"
          className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500 resize-y"
        />
        
        {/* 輸入格式說明 */}
        <div className="mt-4">
          <button
            onClick={() => setShowFormatHelp(!showFormatHelp)}
            className="text-yellow-400 hover:text-yellow-500 text-sm font-semibold flex items-center space-x-1"
          >
            <span>輸入格式說明:</span>
            <svg
              className={`w-4 h-4 transition-transform ${showFormatHelp ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showFormatHelp && (
            <div className="mt-2 p-4 bg-gray-900 rounded border border-gray-700 text-sm text-gray-300">
              <p className="mb-2">• 每行輸入一筆記錄</p>
              <p className="mb-2">• 可使用關鍵字：使用、經、分詞、錯誤、時間、地點、人員等</p>
              <p className="mb-2">• 如需分隔多個項目，可使用 // 分隔</p>
              <p>• 範例：缺失項目1 // 缺失項目2</p>
            </div>
          )}
        </div>

        {/* 按鈕 */}
        <div className="flex space-x-3 mt-4">
          <button
            onClick={onConsolidateInput}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>彙整輸入</span>
          </button>
          <button
            onClick={onClearInput}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            清除輸入
          </button>
        </div>
      </div>

            {/* 搜索與篩選 */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">搜索與篩選</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-300 text-sm mb-2">關鍵字搜尋</label>
            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="輸入關鍵字搜尋 (內容、人員、日期等)"
                className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 pr-10"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-gray-300 text-sm mb-2">狀態</label>
            <select
              value={filterRecordStatus}
              onChange={(e) => setFilterRecordStatus(e.target.value)}
              className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="all">全部狀態</option>
              <option value="pending">待處理</option>
              <option value="in_progress">處理中</option>
              <option value="completed">已完成</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-300 text-sm mb-2">填單人或修改人員</label>
            <input
              type="text"
              value={filterSubmitter}
              onChange={(e) => setFilterSubmitter(e.target.value)}
              placeholder="請輸入人員名稱"
              className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
            />
          </div>
        </div>
      </div>

            {/* 數據表格 */}
            <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-900 border-b-2 border-yellow-400">
                <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">項次</th>
                <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">狀態</th>
                <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">內容/備註</th>
                <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">填單人</th>
                <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">日期</th>
                <th className="px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs border-l-2 border-yellow-400" colSpan="3">
                  第一次修訂
                </th>
                <th className="px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs border-l-2 border-yellow-400" colSpan="3">
                  第二次修訂
                </th>
                <th className="px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs border-l-2 border-yellow-400" colSpan="3">
                  第三次修訂
                </th>
              </tr>
              <tr className="bg-gray-900 border-b border-gray-700 sticky top-[38px] z-10">
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">修改人員</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">進度</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">日期</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold border-l border-gray-700">修改人員</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">進度</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">日期</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold border-l border-gray-700">修改人員</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">進度</th>
                <th className="px-1 py-1 text-yellow-400 text-[9px] sm:text-[10px] font-semibold">日期</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-2 py-6 text-center text-gray-400 text-xs">
                    尚無記錄，請使用快速輸入區新增記錄
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const isEditingContent = editingField?.recordId === record.id && editingField?.field === 'content' && !editingField?.revision
                  const editingRevision = editingField?.recordId === record.id ? editingField?.revision : null

                  return (
                    <tr key={record.id} className="border-b border-gray-700 hover:bg-gray-900">
                      <td className="px-2 py-1.5 text-yellow-400 font-semibold text-[10px] sm:text-xs">{record.rowNumber}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center space-x-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotColor(record.status)}`}></div>
                          <select
                            value={record.status}
                            onChange={(e) => onStatusChange(record.id, e.target.value)}
                            className="bg-gray-700 border border-gray-500 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none focus:border-yellow-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="pending">待處理</option>
                            <option value="in_progress">處理中</option>
                            <option value="completed">已完成</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditingContent ? (
                          <div className="flex items-center space-x-1">
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
                              className="flex-1 min-w-0 bg-gray-700 border border-yellow-400 rounded px-1 py-0.5 text-white text-[10px] sm:text-xs focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <span className="text-white text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{record.content || '—'}</span>
                            <button
                              onClick={() => onEditField(record.id, 'content')}
                              className="text-yellow-400 hover:text-yellow-500 flex-shrink-0"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{record.submitter || '—'}</td>
                      <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{record.date || '—'}</td>
                      
                      {/* 第一次修訂 */}
                      {['first', 'second', 'third'].map((revision, idx) => {
                        const rev = record.revisions?.[revision] || {}
                        const isEditingProgress = editingRevision === revision && editingField?.field === 'progress'
                        
                        return (
                          <React.Fragment key={revision}>
                            {/* 修改人員 - 只顯示，不可編輯 */}
                            <td className={`px-1 py-1.5 text-white text-[10px] sm:text-xs ${idx > 0 ? 'border-l border-gray-700' : ''}`}>
                              <span className="text-gray-300">{rev.modifier || '—'}</span>
                            </td>
                            {/* 進度 - 可編輯 */}
                            <td className="px-1 py-1.5 text-white text-[10px] sm:text-xs">
                              {isEditingProgress ? (
                                <input
                                  type="text"
                                  defaultValue={rev.progress}
                                  onBlur={(e) => onSaveField(record.id, 'progress', e.target.value, revision)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      onSaveField(record.id, 'progress', e.target.value, revision)
                                    }
                                    if (e.key === 'Escape') {
                                      onEditField(null, null)
                                    }
                                  }}
                                  autoFocus
                                  className="w-full bg-gray-700 border border-yellow-400 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                                />
                              ) : (
                                <span 
                                  className="cursor-pointer hover:text-yellow-400"
                                  onClick={() => onEditField(record.id, 'progress', revision)}
                                >
                                  {rev.progress || '進度'}
                                </span>
                              )}
                            </td>
                            {/* 日期 - 只顯示，不可編輯 */}
                            <td className="px-1 py-1.5 text-white text-[10px] sm:text-xs">
                              <span className="text-gray-300">{rev.date || '—'}</span>
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectDeficiencyTracking
