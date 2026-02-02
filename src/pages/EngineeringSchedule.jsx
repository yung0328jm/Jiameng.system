import { useState, useEffect } from 'react'
import { getSchedules, saveSchedule, deleteSchedule, updateSchedule } from '../utils/scheduleStorage'
import { getLeaderboardItems, getManualRankings, addManualRanking, updateManualRanking, saveManualRankings } from '../utils/leaderboardStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import {
  normalizeWorkItem,
  getWorkItemCollaborators,
  getWorkItemTotalActual,
  getWorkItemTotalTarget,
  getWorkItemCollabMode,
  getWorkItemActualForNameForPerformance,
  parseCollaboratorsCsv,
  toCollaboratorsCsv
} from '../utils/workItemCollaboration'

function EngineeringSchedule() {
  const [schedules, setSchedules] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedSchedule, setExpandedSchedule] = useState(null) // 展开的排程ID
  const [changeReq, setChangeReq] = useState({
    open: false,
    scheduleId: '',
    itemId: '',
    reason: '',
    proposedWorkContent: '',
    proposedResponsiblePerson: '',
    proposedIsCollaborative: false,
    proposedCollabMode: 'shared',
    proposedTargetQuantity: '',
    proposedCollaborators: [] // [{ name, targetQuantity }]
  })
  const [formData, setFormData] = useState({
    siteName: '',
    date: '',
    participants: '',
    vehicle: '',
    departureMileage: '',
    returnMileage: '',
    needRefuel: false,
    fuelCost: '',
    invoiceReturned: false,
    workItems: [] // 工作项目列表
  })

  useEffect(() => {
    loadSchedules()
    
    // 检查URL参数中是否有预设日期
    const urlParams = new URLSearchParams(window.location.search)
    const presetDate = urlParams.get('date')
    if (presetDate) {
      setFormData(prev => ({ ...prev, date: presetDate }))
      setShowForm(true)
    }
  }, [])

  const loadSchedules = () => {
    const data = getSchedules()
    setSchedules(data.sort((a, b) => new Date(b.date) - new Date(a.date)))
  }

  useRealtimeKeys(['jiameng_engineering_schedules'], loadSchedules)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleAddWorkItem = () => {
    const now = new Date().toISOString()
    setFormData(prev => ({
      ...prev,
      workItems: [
        ...prev.workItems,
        {
          id: Date.now().toString(),
          workContent: '',
          responsiblePerson: '',
          targetQuantity: '',
          actualQuantity: '',
          isCollaborative: false,
          collaborators: [],
          collabMode: 'shared', // shared: 一起完成算總數；separate: 分開完成各自算
          sharedActualQuantity: '',
          createdAt: now,
          createdBy: currentUser || ''
        }
      ]
    }))
  }

  const handleWorkItemChange = (itemId, field, value) => {
    setFormData(prev => {
      const updatedWorkItems = prev.workItems.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
      
      
      return {
        ...prev,
        workItems: updatedWorkItems
      }
    })
  }

  const handleRemoveWorkItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      workItems: prev.workItems.filter(item => item.id !== itemId)
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // 验证必填字段
    if (!formData.siteName || !formData.date) {
      alert('請填寫活動和日期')
      return
    }

    // 處理工作項目累積到排行榜的邏輯
    const leaderboardItems = getLeaderboardItems()
    const scheduleDate = formData.date ? new Date(formData.date) : new Date()
    const scheduleDateStr = scheduleDate.toISOString().split('T')[0] // YYYY-MM-DD 格式
    
    // 獲取今天的日期（不包含時間）
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD 格式
    
    // 累加規則：
    // 1. 今天當天的排程，只要在今天晚上24:00前，都要算進去總排行累加和團體進度
    // 2. 過了今天晚上24:00後，前一天以前的數據不再累加（即使修改也不變動）
    // 注意：通過比較日期字符串（YYYY-MM-DD），今天的排程（scheduleDateStr === todayStr）會被累加
    // 過了今天晚上24:00後，系統日期會變成明天，今天的排程就變成「昨天」，不會再被累加
    const isBeforeToday = scheduleDateStr < todayStr
    
    if (isBeforeToday) {
      // 如果是今天以前的排程，直接跳過累加邏輯
      return
    }
    // 今天當天的排程（在24:00前）或之後的排程，都會執行累加邏輯
    
    // 遍歷所有工作項目
    formData.workItems.forEach((rawItem) => {
      const workItem = normalizeWorkItem(rawItem)
      if (!workItem.workContent) return

      const contributors = workItem.isCollaborative
        ? getWorkItemCollaborators(workItem)
        : [{
          name: String(workItem.responsiblePerson || '').trim(),
          actualQuantity: workItem.actualQuantity ?? ''
        }].filter((c) => !!c.name)

      if (contributors.length === 0) return
      
      // 查找匹配的排行榜項目
      const matchedLeaderboard = leaderboardItems.find(lb => {
        // 優先檢查 workContent 字段
        if (lb.workContent && lb.workContent.trim() !== '') {
          const workContentMatch = workItem.workContent.includes(lb.workContent) || lb.workContent.includes(workItem.workContent)
          if (workContentMatch) return true
        }
        // 如果 workContent 為空或不匹配，檢查 title 字段（排行榜標題）
        if (lb.title && lb.title.trim() !== '') {
          const titleMatch = workItem.workContent.includes(lb.title) || lb.title.includes(workItem.workContent)
          if (titleMatch) return true
        }
        // 如果 title 也不匹配，檢查 name 字段（排行榜名稱）
        if (lb.name && lb.name.trim() !== '') {
          const nameMatch = workItem.workContent.includes(lb.name) || lb.name.includes(workItem.workContent)
          if (nameMatch) return true
        }
        return false
      })
      
      if (matchedLeaderboard) {
        // 獲取該排行榜的現有排名數據
        const rankings = getManualRankings(matchedLeaderboard.id)

        const hasReset = matchedLeaderboard.lastResetAt ? true : false
        const lastBy = (rawItem.lastAccumulatedBy && typeof rawItem.lastAccumulatedBy === 'object')
          ? { ...rawItem.lastAccumulatedBy }
          : {}

        // 協作：每個負責人各自記一次，避免第二位永遠被擋掉
        let anyChanged = false
        contributors.forEach((c) => {
          const name = String(c?.name || '').trim()
          if (!name) return
          // shared：按目標比例/人數分配共同實際，避免多人重複累加
          // separate：各自累加
          const quantity = getWorkItemActualForNameForPerformance(workItem, name)
          if (!(quantity > 0)) return

          const lastAccumulatedAt = lastBy?.[name] ? new Date(lastBy[name]) : null
          const lastAccumulatedDateStr = lastAccumulatedAt ? lastAccumulatedAt.toISOString().split('T')[0] : null
          if (lastAccumulatedDateStr && lastAccumulatedDateStr >= scheduleDateStr) return

          const existingRanking = rankings.find(r => r.name === name)
          if (existingRanking) {
            const newQuantity = (parseFloat(existingRanking.quantity) || 0) + quantity
            const currentWeekQuantity = parseFloat(existingRanking.weekQuantity) || 0
            const newWeekQuantity = hasReset ? (currentWeekQuantity + quantity) : currentWeekQuantity
            updateManualRanking(matchedLeaderboard.id, existingRanking.id, {
              quantity: newQuantity.toString(),
              weekQuantity: hasReset ? newWeekQuantity.toString() : (existingRanking.weekQuantity || '0')
            })
          } else {
            addManualRanking(matchedLeaderboard.id, {
              name,
              quantity: quantity.toString(),
              weekQuantity: hasReset ? quantity.toString() : '0',
              time: '',
              department: ''
            })
          }

          lastBy[name] = scheduleDate.toISOString()
          anyChanged = true
        })

        if (anyChanged) {
          const updatedRankings = getManualRankings(matchedLeaderboard.id)
          updatedRankings.sort((a, b) => {
            const qtyA = parseFloat(a.quantity) || 0
            const qtyB = parseFloat(b.quantity) || 0
            return qtyB - qtyA
          })
          updatedRankings.forEach((r, index) => { r.rank = index + 1 })
          saveManualRankings(matchedLeaderboard.id, updatedRankings)

          rawItem.lastAccumulatedBy = lastBy
          // 兼容：保留舊欄位，作為「最後一次累加」的統一時間戳
          rawItem.lastAccumulatedAt = scheduleDate.toISOString()
        }
      }
    })

    if (editingId) {
      // 更新现有排程（保留建立者）
      const payload = {
        ...formData,
        createdBy: formData?.createdBy || '',
        createdAt: formData?.createdAt || ''
      }
      updateSchedule(editingId, payload)
    } else {
      // 新增排程
      const payload = {
        ...formData,
        createdBy: formData?.createdBy || currentUser || ''
      }
      saveSchedule(payload)
    }

    // 重置表单
    setFormData({
      siteName: '',
      date: '',
      participants: '',
      vehicle: '',
      departureMileage: '',
      returnMileage: '',
      needRefuel: false,
      fuelCost: '',
      invoiceReturned: false,
      workItems: []
    })
    setShowForm(false)
    setEditingId(null)
    loadSchedules()
  }

  const handleEdit = (schedule) => {
    setFormData({
      siteName: schedule.siteName || '',
      date: schedule.date || '',
      participants: schedule.participants || '',
      vehicle: schedule.vehicle || '',
      departureMileage: schedule.departureMileage || '',
      returnMileage: schedule.returnMileage || '',
      needRefuel: schedule.needRefuel || false,
      fuelCost: schedule.fuelCost || '',
      invoiceReturned: schedule.invoiceReturned || false,
      workItems: schedule.workItems || [],
      createdBy: schedule.createdBy || '',
      createdAt: schedule.createdAt || ''
    })
    setEditingId(schedule.id)
    setShowForm(true)
  }

  const handleDelete = (id) => {
    if (window.confirm('確定要刪除此排程嗎？')) {
      deleteSchedule(id)
      loadSchedules()
    }
  }

  const handleCancel = () => {
    setFormData({
      siteName: '',
      date: '',
      participants: '',
      vehicle: '',
      departureMileage: '',
      returnMileage: '',
      needRefuel: false,
      fuelCost: '',
      invoiceReturned: false,
      workItems: [],
      createdBy: '',
      createdAt: ''
    })
    setShowForm(false)
    setEditingId(null)
  }

  const toggleExpand = (scheduleId) => {
    setExpandedSchedule(expandedSchedule === scheduleId ? null : scheduleId)
  }

  const patchWorkItem = (scheduleId, itemId, patch) => {
    const schedule = schedules.find(s => s.id === scheduleId)
    if (!schedule) return

    const updatedWorkItems = (Array.isArray(schedule.workItems) ? schedule.workItems : []).map((item) =>
      item.id === itemId ? { ...item, ...patch } : item
    )

    updateSchedule(scheduleId, { workItems: updatedWorkItems })
    loadSchedules()
  }

  const updateWorkItem = (scheduleId, itemId, field, value) => {
    patchWorkItem(scheduleId, itemId, { [field]: value })
  }

  const calculateTotalMileage = (departure, returnMile) => {
    const dep = parseFloat(departure) || 0
    const ret = parseFloat(returnMile) || 0
    return ret > dep ? ret - dep : 0
  }

  const isToday = (dateStr) => {
    if (!dateStr) return false
    const today = new Date()
    const scheduleDate = new Date(dateStr)
    return today.toDateString() === scheduleDate.toDateString()
  }

  const isPastDate = (dateStr) => {
    if (!dateStr) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const scheduleDate = new Date(dateStr)
    scheduleDate.setHours(0, 0, 0, 0)
    return scheduleDate < today
  }

  const currentUser = getCurrentUser()
  const currentRole = getCurrentUserRole()
  const myDisplayNames = getDisplayNamesForAccount(currentUser || '') || []
  const canEditForName = (displayName) => {
    if (currentRole === 'admin') return true
    const n = String(displayName || '').trim()
    if (!n) return false
    return myDisplayNames.includes(n)
  }

  // 規則：
  // - 新增表單（editingId === null）：可自由編輯預計欄位
  // - 已存在排程（editingId !== null 或排程列表中的項目）：預計欄位視為已鎖定
  // - 舊資料若沒 plannedLockedAt，也要視為已鎖定（避免看不到「異動申請」且改了不生效）
  const isPlannedLocked = (item, scheduleId = null) => {
    const it = normalizeWorkItem(item)
    if (!!it?.plannedLockedAt) return true
    if (scheduleId) return true
    if (editingId) return true
    return false
  }

  const openChangeRequest = (scheduleId, item) => {
    const it = normalizeWorkItem(item)
    const collabs = getWorkItemCollaborators(it)
    setChangeReq({
      open: true,
      scheduleId: String(scheduleId || ''),
      itemId: String(it?.id || ''),
      reason: '',
      proposedWorkContent: it.workContent || '',
      proposedResponsiblePerson: String(it.responsiblePerson || '').trim(),
      proposedIsCollaborative: !!it.isCollaborative,
      proposedCollabMode: getWorkItemCollabMode(it),
      proposedTargetQuantity: it.targetQuantity ?? '',
      proposedCollaborators: collabs.map((c) => ({
        name: String(c?.name || '').trim(),
        targetQuantity: c?.targetQuantity ?? ''
      }))
    })
  }

  const closeChangeRequest = () => {
    setChangeReq((prev) => ({ ...prev, open: false }))
  }

  const submitChangeRequest = () => {
    if (!changeReq.scheduleId || !changeReq.itemId) return
    const reason = String(changeReq.reason || '').trim()
    if (!reason) {
      alert('請填寫異動原因')
      return
    }

    const proposed = {
      workContent: changeReq.proposedWorkContent,
      responsiblePerson: changeReq.proposedResponsiblePerson,
      isCollaborative: !!changeReq.proposedIsCollaborative,
      collabMode: changeReq.proposedCollabMode,
      targetQuantity: changeReq.proposedTargetQuantity,
      collaborators: (Array.isArray(changeReq.proposedCollaborators) ? changeReq.proposedCollaborators : [])
        .map((c) => ({ name: String(c?.name || '').trim(), targetQuantity: c?.targetQuantity ?? '' }))
        .filter((c) => !!c.name)
    }

    patchWorkItem(changeReq.scheduleId, changeReq.itemId, {
      changeRequest: {
        status: 'pending',
        reason,
        proposed,
        requestedAt: new Date().toISOString(),
        requestedBy: currentUser || ''
      }
    })
    closeChangeRequest()
  }

  const approveChangeRequest = (scheduleId, item) => {
    const it = normalizeWorkItem(item)
    const cr = it?.changeRequest
    if (cr?.status !== 'pending' || !cr?.proposed) return
    const p = cr.proposed

    const patch = {
      // 套用 proposed 到預計欄位（資料層會在 approved 時允許寫入）
      workContent: p.workContent,
      responsiblePerson: p.responsiblePerson,
      isCollaborative: !!p.isCollaborative,
      collabMode: p.collabMode,
      targetQuantity: p.targetQuantity,
      collaborators: p.collaborators,
      changeRequest: {
        ...cr,
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: currentUser || ''
      }
    }
    patchWorkItem(scheduleId, it.id, patch)
  }

  const rejectChangeRequest = (scheduleId, item) => {
    const it = normalizeWorkItem(item)
    const cr = it?.changeRequest
    if (cr?.status !== 'pending') return
    patchWorkItem(scheduleId, it.id, {
      changeRequest: {
        ...cr,
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: currentUser || ''
      }
    })
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">工程排程</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg hover:bg-yellow-500 transition-colors"
        >
          + 新增排程
        </button>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="mb-6 bg-gray-800 border border-yellow-400/50 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-yellow-400 mb-4">
            {editingId ? '編輯排程' : '新增排程'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 活動 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  活動 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="siteName"
                  value={formData.siteName}
                  onChange={handleChange}
                  placeholder="請輸入活動"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  required
                />
              </div>

              {/* 日期 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  日期 <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                  required
                />
              </div>

              {/* 參與人員 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  參與人員
                </label>
                <input
                  type="text"
                  name="participants"
                  value={formData.participants}
                  onChange={handleChange}
                  placeholder="請輸入參與人員（多個用逗號分隔）"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* 車輛 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  車輛
                </label>
                <input
                  type="text"
                  name="vehicle"
                  value={formData.vehicle}
                  onChange={handleChange}
                  placeholder="請輸入車輛資訊"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            {/* 工作項目列表 */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-gray-300 text-sm font-semibold">
                  工作項目
                </label>
                <button
                  type="button"
                  onClick={handleAddWorkItem}
                  className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded transition-colors"
                >
                  + 新增工作項目
                </button>
              </div>

              <div className="space-y-3">
                {formData.workItems.map((item, index) => {
                  const plannedLocked = isPlannedLocked(item)
                  return (
                    <div key={item.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-yellow-400 font-semibold text-sm">工作項目 {index + 1}</span>
                        <div className="flex items-center gap-2">
                          {plannedLocked && editingId && (
                            <button
                              type="button"
                              onClick={() => openChangeRequest(editingId, item)}
                              className="text-sm px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40 hover:bg-blue-600/40"
                            >
                              異動申請
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveWorkItem(item.id)}
                            className={`text-sm ${plannedLocked ? 'text-gray-500 cursor-not-allowed' : 'text-red-400 hover:text-red-500'}`}
                            disabled={plannedLocked}
                          >
                            {plannedLocked ? '已鎖定' : '刪除'}
                          </button>
                        </div>
                      </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-300 text-xs mb-1">工作內容 *</label>
                        <input
                          type="text"
                          value={item.workContent}
                          onChange={(e) => handleWorkItemChange(item.id, 'workContent', e.target.value)}
                          placeholder="請輸入工作內容"
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                          required
                          disabled={plannedLocked}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-gray-300 text-xs mb-1">負責人 *</label>
                          <label className="flex items-center gap-1 text-xs text-gray-300 select-none">
                            <input
                              type="checkbox"
                              checked={!!item.isCollaborative}
                              onChange={(e) => {
                                const on = e.target.checked
                                if (!on) {
                                  // 協作 -> 單人：保留第一位
                                  const it = normalizeWorkItem(item)
                                  const first = (getWorkItemCollaborators(it)[0]?.name) || ''
                                  const firstTarget = getWorkItemCollaborators(it)[0]?.targetQuantity ?? ''
                                  const firstActual = getWorkItemCollaborators(it)[0]?.actualQuantity ?? ''
                                  handleWorkItemChange(item.id, 'isCollaborative', false)
                                  handleWorkItemChange(item.id, 'responsiblePerson', first)
                                  handleWorkItemChange(item.id, 'targetQuantity', firstTarget)
                                  handleWorkItemChange(item.id, 'actualQuantity', firstActual)
                                  handleWorkItemChange(item.id, 'collaborators', [])
                                } else {
                                  // 單人 -> 協作：用目前負責人初始化
                                            const rp = String(item.responsiblePerson || '').trim()
                                            const tq = item.targetQuantity ?? ''
                                            const aq = item.actualQuantity ?? ''
                                  handleWorkItemChange(item.id, 'isCollaborative', true)
                                            handleWorkItemChange(item.id, 'collaborators', rp ? [{ name: rp, targetQuantity: tq, actualQuantity: aq }] : [])
                                }
                              }}
                              className="w-4 h-4 accent-yellow-400"
                              disabled={plannedLocked}
                            />
                            <span>協作</span>
                          </label>
                        </div>

                        {item.isCollaborative ? (
                          <input
                            type="text"
                            value={toCollaboratorsCsv(item)}
                            onChange={(e) => {
                              const collabs = parseCollaboratorsCsv(e.target.value)
                              handleWorkItemChange(item.id, 'collaborators', collabs)
                            }}
                            placeholder="輸入協作負責人（多個用逗號分隔）"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            required
                            disabled={plannedLocked}
                          />
                        ) : (
                          <input
                            type="text"
                            value={item.responsiblePerson}
                            onChange={(e) => handleWorkItemChange(item.id, 'responsiblePerson', e.target.value)}
                            placeholder="請輸入負責人"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            required
                            disabled={plannedLocked}
                          />
                        )}
                      </div>
                      {item.isCollaborative && (
                        <div>
                          <label className="block text-gray-300 text-xs mb-1">協作計算方式</label>
                          <select
                            value={getWorkItemCollabMode(item)}
                            onChange={(e) => {
                              handleWorkItemChange(item.id, 'collabMode', e.target.value)
                            }}
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                            disabled={plannedLocked}
                          >
                            <option value="shared">一起完成（算總數）</option>
                            <option value="separate">分開完成（各自算）</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-gray-300 text-xs mb-1">
                          {item.isCollaborative && getWorkItemCollabMode(item) === 'shared' ? '總目標數量' : '目標數量'}
                        </label>
                        {item.isCollaborative && getWorkItemCollabMode(item) === 'separate' ? (
                          <div className="space-y-2">
                            {(getWorkItemCollaborators(normalizeWorkItem(item)) || []).length === 0 ? (
                              <div className="text-gray-400 text-xs">
                                請先輸入協作負責人，才能設定每人目標（新增後即鎖定）。
                              </div>
                            ) : (
                              getWorkItemCollaborators(normalizeWorkItem(item)).map((c) => (
                                <div key={String(c?.name || '').trim()} className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-5 text-gray-200 text-xs truncate" title={String(c?.name || '').trim()}>
                                    {String(c?.name || '').trim()}
                                  </div>
                                  <input
                                    type="number"
                                    value={c?.targetQuantity ?? ''}
                                    onChange={(e) => {
                                      const it = normalizeWorkItem(item)
                                      const collabs = getWorkItemCollaborators(it)
                                      const name = String(c?.name || '').trim()
                                      const next = collabs.map((x) => (
                                        String(x?.name || '').trim() === name
                                          ? { ...x, targetQuantity: e.target.value }
                                          : x
                                      ))
                                      handleWorkItemChange(item.id, 'collaborators', next)
                                    }}
                                    placeholder="目標"
                                    className="col-span-7 bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                    min="0"
                                    step="0.01"
                                    disabled={plannedLocked}
                                  />
                                </div>
                              ))
                            )}
                            <div className="text-gray-400 text-xs">
                              分開完成：每人各自目標（新增後即鎖定，需異動請申請）。
                            </div>
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={item.targetQuantity}
                            onChange={(e) => handleWorkItemChange(item.id, 'targetQuantity', e.target.value)}
                            placeholder="請輸入目標數量"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            min="0"
                            step="0.01"
                            disabled={plannedLocked}
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-gray-300 text-xs mb-1">實際達成數量</label>
                        {item.isCollaborative ? (
                          <div className="text-gray-300 text-xs leading-relaxed">
                            協作模式：目標請先在此設定（新增後即鎖定），實際數量請在下方「排程列表」展開後填寫。
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={item.actualQuantity}
                            onChange={(e) => handleWorkItemChange(item.id, 'actualQuantity', e.target.value)}
                            placeholder="請輸入實際達成數量"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            min="0"
                            step="0.01"
                            disabled={!!editingId}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}
                {formData.workItems.length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    尚未添加工作項目，點擊「新增工作項目」開始添加
                  </div>
                )}
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                {editingId ? '更新' : '新增'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 bg-gray-700 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 排程列表 - 清单方式 */}
      <div className="mt-6">
        <h3 className="text-xl font-semibold text-white mb-4">排程列表</h3>
        {schedules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>尚無排程資料</p>
            <p className="text-sm mt-2">點擊「新增排程」開始建立排程</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule, index) => {
              const isExpanded = expandedSchedule === schedule.id
              const isPast = isPastDate(schedule.date)
              const isTodayDate = isToday(schedule.date)
              
              return (
                <div
                  key={schedule.id}
                  className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden transition-all"
                >
                  {/* 清单标题行 - 可点击展开/折叠 */}
                  <div
                    onClick={() => toggleExpand(schedule.id)}
                    className="p-4 cursor-pointer hover:bg-gray-750 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="flex items-center space-x-2">
                        <svg
                          className={`w-5 h-5 text-yellow-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-yellow-400 font-semibold">#{index + 1}</span>
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-white">{schedule.siteName}</h4>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-gray-400 text-sm">
                            {schedule.date ? new Date(schedule.date).toLocaleDateString('zh-TW') : ''}
                          </span>
                          {schedule.participants && (
                            <span className="text-gray-500 text-sm">參與人員: {schedule.participants}</span>
                          )}
                          {schedule.workItems && schedule.workItems.length > 0 && (
                            <span className="text-blue-400 text-sm">
                              {schedule.workItems.length} 個工作項目
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isTodayDate && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">今日</span>
                      )}
                      {isPast && (
                        <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded">已完成</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(schedule)
                        }}
                        className="text-yellow-400 hover:text-yellow-500 px-2 py-1 text-sm"
                      >
                        編輯
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(schedule.id)
                        }}
                        className="text-red-400 hover:text-red-500 px-2 py-1 text-sm"
                      >
                        刪除
                      </button>
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {isExpanded && (
                    <div className="border-t border-gray-700 p-4 bg-gray-900">
                      {/* 基本信息 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-4">
                        <div>
                          <span className="text-gray-400">參與人員：</span>
                          <span className="text-white ml-2">{schedule.participants || '未填寫'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">車輛：</span>
                          <span className="text-white ml-2">{schedule.vehicle || '未填寫'}</span>
                        </div>
                        {schedule.departureMileage && (
                          <div>
                            <span className="text-gray-400">出發里程：</span>
                            <span className="text-white ml-2">{schedule.departureMileage} km</span>
                          </div>
                        )}
                        {schedule.returnMileage && (
                          <div>
                            <span className="text-gray-400">回程里程：</span>
                            <span className="text-white ml-2">{schedule.returnMileage} km</span>
                          </div>
                        )}
                      </div>

                      {/* 工作項目列表 */}
                      <div className="mt-4">
                        <h5 className="text-white font-semibold mb-3">工作項目</h5>
                        {schedule.workItems && schedule.workItems.length > 0 ? (
                          <div className="space-y-3">
                            {schedule.workItems.map((item, itemIndex) => {
                              const it = normalizeWorkItem(item)
                              const isCollab = !!it.isCollaborative
                              const collabMode = isCollab ? getWorkItemCollabMode(it) : 'shared'
                              const actualQty = isCollab ? getWorkItemTotalActual(it) : (parseFloat(it.actualQuantity) || 0)
                              const targetQty = isCollab ? getWorkItemTotalTarget(it) : (parseFloat(it.targetQuantity) || 0)
                              const completionRate = targetQty > 0 ? (actualQty / targetQty * 100).toFixed(1) : 0
                              const collabs = getWorkItemCollaborators(it)
                              const plannedLocked = isPlannedLocked(it, schedule.id)
                              const crStatus = String(it?.changeRequest?.status || '')
                              const isPendingChange = crStatus === 'pending'
                              
                              return (
                                <div key={item.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-yellow-400 font-semibold">項目 {itemIndex + 1}</span>
                                    <div className="flex items-center gap-2">
                                      {isPendingChange && (
                                        <span className="text-sm px-2 py-1 rounded bg-purple-600/30 text-purple-200 border border-purple-500/40">
                                          異動待審（不計分）
                                        </span>
                                      )}
                                      {plannedLocked && !isPendingChange && (
                                        (isCollab
                                          ? collabs.some((x) => canEditForName(x?.name))
                                          : canEditForName(it?.responsiblePerson))
                                      ) && (
                                        <button
                                          type="button"
                                          onClick={() => openChangeRequest(schedule.id, it)}
                                          className="text-sm px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40 hover:bg-blue-600/40"
                                        >
                                          異動申請
                                        </button>
                                      )}
                                    </div>
                                    {!isPendingChange && !isCollab && targetQty > 0 && (
                                      <span className={`text-sm px-2 py-1 rounded ${
                                        actualQty >= targetQty ? 'bg-green-500 text-white' :
                                        actualQty > 0 ? 'bg-yellow-500 text-black' :
                                        'bg-gray-600 text-gray-300'
                                      }`}>
                                        達成率: {completionRate}%
                                      </span>
                                    )}
                                    {isCollab && (
                                      <span className="text-sm px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40">
                                        {collabMode === 'shared' ? '協作（一起完成）' : '協作（分開完成）'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-gray-400 text-xs mb-1">工作內容</label>
                                      <input
                                        type="text"
                                        value={item.workContent || ''}
                                        onChange={(e) => updateWorkItem(schedule.id, item.id, 'workContent', e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                        placeholder="請輸入工作內容"
                                        disabled={plannedLocked}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-gray-400 text-xs mb-1">負責人</label>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-gray-500 text-xs">
                                          {isCollab ? '協作' : '單人'}
                                        </span>
                                        <label className="flex items-center gap-1 text-xs text-gray-300 select-none">
                                          <input
                                            type="checkbox"
                                            checked={!!it.isCollaborative}
                                            onChange={(e) => {
                                              const on = e.target.checked
                                              if (!on) {
                                                const first = (collabs[0]?.name) || ''
                                                const firstTarget = collabs[0]?.targetQuantity ?? ''
                                                const firstActual = collabs[0]?.actualQuantity ?? ''
                                                patchWorkItem(schedule.id, item.id, {
                                                  isCollaborative: false,
                                                  responsiblePerson: first,
                                                  targetQuantity: firstTarget,
                                                  actualQuantity: firstActual,
                                                  collaborators: []
                                                })
                                              } else {
                                                const rp = String(it.responsiblePerson || '').trim()
                                                const aq = it.actualQuantity ?? ''
                                                patchWorkItem(schedule.id, item.id, {
                                                  isCollaborative: true,
                                                  collabMode: 'shared',
                                                  collaborators: rp ? [{ name: rp, targetQuantity: it.targetQuantity ?? '', actualQuantity: aq }] : (collabs.length ? collabs : [])
                                                })
                                              }
                                            }}
                                            className="w-4 h-4 accent-yellow-400"
                                            disabled={plannedLocked}
                                          />
                                          <span>協作</span>
                                        </label>
                                      </div>

                                      {isCollab ? (
                                        <>
                                          <input
                                            type="text"
                                            value={toCollaboratorsCsv(it)}
                                            onChange={(e) => {
                                              const next = parseCollaboratorsCsv(e.target.value)
                                              // 保留既有目標/實際數量
                                              const prevTarget = new Map(collabs.map((c) => [String(c.name).trim(), c.targetQuantity]))
                                              const prevActual = new Map(collabs.map((c) => [String(c.name).trim(), c.actualQuantity]))
                                              const merged = next.map((c) => ({
                                                ...c,
                                                targetQuantity: prevTarget.get(String(c.name).trim()) ?? '',
                                                actualQuantity: prevActual.get(String(c.name).trim()) ?? ''
                                              }))
                                              patchWorkItem(schedule.id, item.id, { collaborators: merged, isCollaborative: true })
                                            }}
                                            className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                            placeholder="協作負責人（逗號分隔）"
                                            disabled={plannedLocked}
                                          />
                                          <div className="mt-2">
                                            <label className="block text-gray-400 text-xs mb-1">協作計算方式</label>
                                            <select
                                              value={collabMode}
                                              onChange={(e) => {
                                                const nextMode = e.target.value
                                                const patch = { collabMode: nextMode, isCollaborative: true }
                                                // 切到 shared：若未填共同實際，先用目前「總實際」作為預設，避免顯示為 0
                                                if (nextMode === 'shared') {
                                                  const hasShared = String(it.sharedActualQuantity ?? '').trim()
                                                  if (!hasShared) {
                                                    const fallback = getWorkItemTotalActual(it)
                                                    if (fallback > 0) patch.sharedActualQuantity = String(fallback)
                                                  }
                                                }
                                                patchWorkItem(schedule.id, item.id, patch)
                                              }}
                                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                              disabled={plannedLocked}
                                            >
                                              <option value="shared">一起完成（算總數）</option>
                                              <option value="separate">分開完成（各自算）</option>
                                            </select>
                                          </div>
                                        </>
                                      ) : (
                                        <input
                                          type="text"
                                          value={it.responsiblePerson || ''}
                                          onChange={(e) => updateWorkItem(schedule.id, item.id, 'responsiblePerson', e.target.value)}
                                          className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                          placeholder="請輸入負責人"
                                          disabled={plannedLocked}
                                        />
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-gray-400 text-xs mb-1">目標數量</label>
                                      {isCollab ? (
                                        <div className="text-gray-500 text-xs leading-relaxed">
                                          {plannedLocked
                                            ? '協作模式：目標已鎖定（需異動請申請）。'
                                            : '協作模式：請在下方為每位負責人填寫自己的目標（新增後即鎖定）。'}
                                        </div>
                                      ) : (
                                        <input
                                          type="number"
                                          value={item.targetQuantity || ''}
                                          onChange={(e) => updateWorkItem(schedule.id, item.id, 'targetQuantity', e.target.value)}
                                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                          placeholder="請輸入目標數量"
                                          min="0"
                                          step="0.01"
                                          disabled={plannedLocked}
                                        />
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-gray-400 text-xs mb-1">
                                        實際達成數量
                                        {isPast || isTodayDate ? (
                                          <span className="text-yellow-400 ml-1">*</span>
                                        ) : null}
                                      </label>
                                      {isCollab ? (
                                        <div className="space-y-2">
                                          {collabMode === 'shared' && (
                                            <div className="grid grid-cols-12 gap-2 items-center">
                                              <div className="text-gray-300 text-xs w-24 truncate" title="共同實際">共同實際</div>
                                              <input
                                                type="number"
                                                value={it.sharedActualQuantity ?? ''}
                                                onChange={(e) => {
                                                  patchWorkItem(schedule.id, item.id, { sharedActualQuantity: e.target.value, isCollaborative: true })
                                                }}
                                                className="col-span-8 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                                placeholder="共同實際"
                                                min="0"
                                                step="0.01"
                                                disabled={
                                                  !(isPast || isTodayDate) ||
                                                  (currentRole !== 'admin' && !collabs.some((x) => canEditForName(x?.name)))
                                                }
                                              />
                                            </div>
                                          )}
                                          {collabs.length === 0 ? (
                                            <div className="text-gray-500 text-xs">尚未設定協作負責人</div>
                                          ) : (
                                            collabs.map((c) => {
                                              const name = c?.name
                                              const canEditTarget = canEditForName(name)
                                              const canEditActual = (isPast || isTodayDate) && canEditForName(name) && collabMode !== 'shared'
                                              return (
                                                <div key={name} className="grid grid-cols-12 gap-2 items-center">
                                                  <div className="text-gray-300 text-xs w-24 truncate" title={name}>{name}</div>
                                                  <input
                                                    type="number"
                                                    value={c?.targetQuantity ?? ''}
                                                    onChange={(e) => {
                                                      const next = collabs.map((x) => (String(x.name).trim() === String(name).trim()
                                                        ? { ...x, targetQuantity: e.target.value }
                                                        : x
                                                      ))
                                                      patchWorkItem(schedule.id, item.id, { collaborators: next, isCollaborative: true })
                                                    }}
                                                    className="col-span-4 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                                    placeholder="目標"
                                                    min="0"
                                                    step="0.01"
                                                    disabled={!canEditTarget || plannedLocked}
                                                  />
                                                  {collabMode === 'shared' ? (
                                                    <div className="col-span-4 text-gray-500 text-xs">
                                                      共同實際
                                                    </div>
                                                  ) : (
                                                    <input
                                                      type="number"
                                                      value={c?.actualQuantity ?? ''}
                                                      onChange={(e) => {
                                                        const next = collabs.map((x) => (String(x.name).trim() === String(name).trim()
                                                          ? { ...x, actualQuantity: e.target.value }
                                                          : x
                                                        ))
                                                        patchWorkItem(schedule.id, item.id, { collaborators: next, isCollaborative: true })
                                                      }}
                                                      className="col-span-4 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                                      placeholder="實際"
                                                      min="0"
                                                      step="0.01"
                                                      disabled={!canEditActual}
                                                    />
                                                  )}
                                                </div>
                                              )
                                            })
                                          )}
                                          {!isPast && !isTodayDate && (
                                            <p className="text-gray-500 text-xs">僅能在當日或之後輸入</p>
                                          )}
                                          {(isPast || isTodayDate) && currentRole !== 'admin' && (
                                            <p className="text-gray-500 text-xs">
                                              協作模式下：每位負責人只能填寫自己的「目標」
                                              {collabMode === 'separate' ? '與「實際」' : '；共同實際可由協作成員其中一位填寫'}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <>
                                          <input
                                            type="number"
                                            value={it.actualQuantity || ''}
                                            onChange={(e) => updateWorkItem(schedule.id, item.id, 'actualQuantity', e.target.value)}
                                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                                            placeholder="請輸入實際達成數量"
                                            min="0"
                                            step="0.01"
                                            disabled={!isPast && !isTodayDate}
                                          />
                                          {!isPast && !isTodayDate && (
                                            <p className="text-gray-500 text-xs mt-1">僅能在當日或之後輸入</p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {currentRole === 'admin' && isPendingChange && (
                                    <div className="mt-3 bg-gray-900/60 border border-purple-500/30 rounded-lg p-3">
                                      <div className="text-purple-200 font-semibold text-sm mb-2">異動申請審核</div>
                                      <div className="text-gray-300 text-sm space-y-1">
                                        <div>
                                          <span className="text-gray-500">申請人：</span>
                                          <span>{String(it?.changeRequest?.requestedBy || '').trim() || '—'}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">申請時間：</span>
                                          <span>{String(it?.changeRequest?.requestedAt || '').trim() || '—'}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">原因：</span>
                                          <span>{String(it?.changeRequest?.reason || '').trim() || '—'}</span>
                                        </div>
                                      </div>

                                      <div className="mt-3 text-gray-200 text-sm">
                                        <div className="text-gray-500 mb-1">申請變更內容：</div>
                                        <div className="space-y-1">
                                          <div><span className="text-gray-500">工作內容：</span>{String(it?.changeRequest?.proposed?.workContent || '').trim() || '—'}</div>
                                          <div><span className="text-gray-500">模式：</span>{it?.changeRequest?.proposed?.isCollaborative ? '協作' : '單人'}</div>
                                          {it?.changeRequest?.proposed?.isCollaborative ? (
                                            <>
                                              <div><span className="text-gray-500">協作方式：</span>{String(it?.changeRequest?.proposed?.collabMode || 'shared')}</div>
                                              {String(it?.changeRequest?.proposed?.collabMode || 'shared') === 'shared' ? (
                                                <div><span className="text-gray-500">總目標：</span>{String(it?.changeRequest?.proposed?.targetQuantity ?? '').trim() || '—'}</div>
                                              ) : (
                                                <div className="text-gray-300">
                                                  <span className="text-gray-500">每人目標：</span>
                                                  {(Array.isArray(it?.changeRequest?.proposed?.collaborators) ? it.changeRequest.proposed.collaborators : [])
                                                    .map((c) => `${String(c?.name || '').trim()}(${String(c?.targetQuantity ?? '').trim() || '—'})`)
                                                    .filter(Boolean)
                                                    .join('、') || '—'}
                                                </div>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <div><span className="text-gray-500">負責人：</span>{String(it?.changeRequest?.proposed?.responsiblePerson || '').trim() || '—'}</div>
                                              <div><span className="text-gray-500">目標：</span>{String(it?.changeRequest?.proposed?.targetQuantity ?? '').trim() || '—'}</div>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex gap-2 mt-3">
                                        <button
                                          type="button"
                                          onClick={() => approveChangeRequest(schedule.id, it)}
                                          className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded"
                                        >
                                          核准
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => rejectChangeRequest(schedule.id, it)}
                                          className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded"
                                        >
                                          退回
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-400 text-sm">
                            尚未添加工作項目
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 異動申請 Modal */}
      {changeReq.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">工作項目異動申請</h3>
              <button
                type="button"
                onClick={closeChangeRequest}
                className="text-gray-300 hover:text-white"
              >
                關閉
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">異動原因 *</label>
                <textarea
                  value={changeReq.reason}
                  onChange={(e) => setChangeReq((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  rows={3}
                  placeholder="請說明為何需要異動（外在因素、施工限制、客戶變更等）"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-sm mb-1">工作內容（申請改為）</label>
                  <input
                    type="text"
                    value={changeReq.proposedWorkContent}
                    onChange={(e) => setChangeReq((prev) => ({ ...prev, proposedWorkContent: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    placeholder="工作內容"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm mb-1">模式</label>
                  <select
                    value={changeReq.proposedIsCollaborative ? 'collab' : 'single'}
                    onChange={(e) => {
                      const isCollab = e.target.value === 'collab'
                      setChangeReq((prev) => ({
                        ...prev,
                        proposedIsCollaborative: isCollab,
                        proposedCollabMode: isCollab ? prev.proposedCollabMode : 'shared'
                      }))
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="single">單人</option>
                    <option value="collab">協作</option>
                  </select>
                </div>
              </div>

              {!changeReq.proposedIsCollaborative ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">負責人（申請改為）</label>
                    <input
                      type="text"
                      value={changeReq.proposedResponsiblePerson}
                      onChange={(e) => setChangeReq((prev) => ({ ...prev, proposedResponsiblePerson: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                      placeholder="負責人"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">目標數量（申請改為）</label>
                    <input
                      type="number"
                      value={changeReq.proposedTargetQuantity}
                      onChange={(e) => setChangeReq((prev) => ({ ...prev, proposedTargetQuantity: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                      min="0"
                      step="0.01"
                      placeholder="目標"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-300 text-sm mb-1">協作負責人（逗號分隔）</label>
                      <input
                        type="text"
                        value={(Array.isArray(changeReq.proposedCollaborators) ? changeReq.proposedCollaborators : []).map((c) => c.name).join(', ')}
                        onChange={(e) => {
                          const next = parseCollaboratorsCsv(e.target.value)
                          const prevTarget = new Map((changeReq.proposedCollaborators || []).map((c) => [String(c.name).trim(), c.targetQuantity]))
                          const merged = next.map((c) => ({
                            name: c.name,
                            targetQuantity: prevTarget.get(String(c.name).trim()) ?? ''
                          }))
                          setChangeReq((prev) => ({ ...prev, proposedCollaborators: merged }))
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                        placeholder="例如：小明, 小華"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-300 text-sm mb-1">協作計算方式</label>
                      <select
                        value={changeReq.proposedCollabMode}
                        onChange={(e) => setChangeReq((prev) => ({ ...prev, proposedCollabMode: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                      >
                        <option value="shared">一起完成（算總數）</option>
                        <option value="separate">分開完成（各自算）</option>
                      </select>
                    </div>
                  </div>

                  {changeReq.proposedCollabMode === 'shared' ? (
                    <div>
                      <label className="block text-gray-300 text-sm mb-1">總目標數量（申請改為）</label>
                      <input
                        type="number"
                        value={changeReq.proposedTargetQuantity}
                        onChange={(e) => setChangeReq((prev) => ({ ...prev, proposedTargetQuantity: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                        min="0"
                        step="0.01"
                        placeholder="總目標"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-gray-300 text-sm">每人目標（申請改為）</div>
                      {(changeReq.proposedCollaborators || []).length === 0 ? (
                        <div className="text-gray-500 text-sm">尚未填協作負責人</div>
                      ) : (
                        (changeReq.proposedCollaborators || []).map((c) => (
                          <div key={c.name} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-4 text-gray-300 text-sm truncate" title={c.name}>{c.name}</div>
                            <input
                              type="number"
                              value={c.targetQuantity ?? ''}
                              onChange={(e) => {
                                const next = (changeReq.proposedCollaborators || []).map((x) => (
                                  String(x.name).trim() === String(c.name).trim()
                                    ? { ...x, targetQuantity: e.target.value }
                                    : x
                                ))
                                setChangeReq((prev) => ({ ...prev, proposedCollaborators: next }))
                              }}
                              className="col-span-8 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                              min="0"
                              step="0.01"
                              placeholder="目標"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={submitChangeRequest}
                  className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500 transition-colors"
                >
                  送出申請
                </button>
                <button
                  type="button"
                  onClick={closeChangeRequest}
                  className="flex-1 bg-gray-800 text-white font-semibold py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
              </div>
              <p className="text-gray-500 text-xs">
                送出後，此工作項目將「暫不列入績效評分」，直到管理員審核完成。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EngineeringSchedule
