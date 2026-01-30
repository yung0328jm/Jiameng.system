import { useState, useEffect, useRef } from 'react'
import { getEventsByDate, saveEvent, deleteEvent, getEvents } from '../utils/calendarStorage'
import { getSchedules, saveSchedule, updateSchedule, deleteSchedule } from '../utils/scheduleStorage'
import { getDropdownOptionsByCategory, addDropdownOption, getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getLeaderboardItems, getManualRankings, addManualRanking, updateManualRanking, saveManualRankings } from '../utils/leaderboardStorage'
import { getTripReportsByProject } from '../utils/tripReportStorage'
import { getNameEffectStyle, getDecorationForNameEffect, getUserTitle, getTitleBadgeStyle } from '../utils/nameEffectUtils'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getUsers } from '../utils/storage'
import { getProjects } from '../utils/projectStorage'
import { getLeaveApplications } from '../utils/leaveApplicationStorage'
import {
  normalizeWorkItem,
  getWorkItemCollaborators,
  getWorkItemCollabMode,
  getWorkItemSharedActual,
  getWorkItemTotalActual,
  getWorkItemActualForNameForPerformance,
  parseCollaboratorsCsv,
  toCollaboratorsCsv
} from '../utils/workItemCollaboration'

function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false) // 显示排程表单
  const [showDateDetailModal, setShowDateDetailModal] = useState(false) // 显示日期详情弹窗
  const [showTopicForm, setShowTopicForm] = useState(false) // 显示新增主題表单
  const [showDetailModal, setShowDetailModal] = useState(false) // 显示详情弹窗
  const [selectedDetailItem, setSelectedDetailItem] = useState(null) // 选中的详情项（主题或排程）
  const [selectedDetailType, setSelectedDetailType] = useState(null) // 'topic' 或 'schedule'
  const [editingScheduleId, setEditingScheduleId] = useState(null) // 正在编辑的排程ID
  const [selectedDateForSchedule, setSelectedDateForSchedule] = useState(null)
  const [expandedSchedules, setExpandedSchedules] = useState({}) // 展开的排程ID
  const [expandedWorkItems, setExpandedWorkItems] = useState({}) // 展开的工作项目
  const [topicFormData, setTopicFormData] = useState({
    title: '',
    date: '',
    description: '',
    schedules: [] // 关联的工程排程ID列表
  })
  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'blue', // red, green, blue, purple, yellow
    date: '',
    allDay: false,
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    saveAsMemo: false,
    companyActivity: '',
    participants: '',
    notification: ''
  })
  const [schedules, setSchedules] = useState([])
  const [participantOptions, setParticipantOptions] = useState([])
  const [vehicleOptions, setVehicleOptions] = useState([])
  const [responsiblePersonOptions, setResponsiblePersonOptions] = useState([])
  const [projectSiteOptions, setProjectSiteOptions] = useState([]) // 專案管理案場（用於「活動」下拉；含狀態標籤）
  const [siteStatusFilter, setSiteStatusFilter] = useState('all') // all | in_progress | planning | completed | on_hold
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false)
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false)
  const [showSiteDropdown, setShowSiteDropdown] = useState(false)
  const [showResponsiblePersonDropdown, setShowResponsiblePersonDropdown] = useState({}) // 每个工作项目的下拉選單状态
  const participantDropdownRef = useRef(null)
  const vehicleDropdownRef = useRef(null)
  const siteDropdownRef = useRef(null)
  const responsiblePersonDropdownRefs = useRef({})
  const scheduleModalBodyRef = useRef(null)
  const [scheduleFormData, setScheduleFormData] = useState({
    siteName: '',
    date: '',
    isAllDay: true, // 是否全天
    startTime: '', // 开始时间
    endTime: '', // 结束时间
    participants: '',
    vehicle: '',
    departureDriver: '',
    returnDriver: '',
    departureMileage: '',
    returnMileage: '',
    needRefuel: false,
    fuelCost: '',
    invoiceReturned: false,
    workItems: [],
    tag: 'blue' // 标签：red(重要/節假日), green(活動), blue(工作/項目), yellow(出差)
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // 获取月份的第一天和最后一天
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay() // 0 = 週日, 1 = 週一, ...

  // 获取上个月的最后几天
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  const prevMonthDays = []
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    prevMonthDays.push(prevMonthLastDay - i)
  }

  // 生成当前月的所有日期
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // 计算下个月需要显示的天数
  const totalCells = prevMonthDays.length + currentMonthDays.length
  const nextMonthDays = []
  const remainingCells = 42 - totalCells // 6行 x 7列 = 42
  for (let i = 1; i <= remainingCells; i++) {
    nextMonthDays.push(i)
  }

  const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

  const typeColors = {
    red: 'bg-red-500',
    green: 'bg-orange-500', // 活動改为橙色，避免与绿灯冲突
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    yellow: 'bg-yellow-400',
    leave: 'bg-teal-500' // 請假（由請假申請自動帶入）
  }

  const typeTextColors = {
    red: 'text-white',
    green: 'text-white',
    blue: 'text-white',
    purple: 'text-white',
    yellow: 'text-black',
    leave: 'text-white'
  }

  // 时间文字颜色（用于非全天显示）
  const typeTimeColors = {
    red: 'text-red-400',
    green: 'text-orange-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    yellow: 'text-yellow-300',
    leave: 'text-teal-400'
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  useEffect(() => {
    // 加载所有排程
    const allSchedules = getSchedules()
    setSchedules(allSchedules)
    // 加载下拉選單选项
    loadDropdownOptions()
  }, [currentDate])

  // 加载下拉選單选项
  const loadDropdownOptions = () => {
    const participants = getDropdownOptionsByCategory('participants')
    const vehicles = getDropdownOptionsByCategory('vehicles')
    const responsiblePersons = getDropdownOptionsByCategory('responsible_persons')
    setParticipantOptions(participants.map(opt => opt.value))
    setVehicleOptions(vehicles.map(opt => opt.value))
    setResponsiblePersonOptions(responsiblePersons.map(opt => opt.value))

    // 專案管理案場 → 活動下拉
    const projects = getProjects()
    const getWeight = (status) => {
      // 需求：進行中最上、規劃中往下、已完成最底（避免誤選）
      switch (status) {
        case 'in_progress': return 0
        case 'planning': return 1
        case 'on_hold': return 2
        case 'completed': return 3
        default: return 1
      }
    }
    const getStatusLabel = (status) => {
      switch (status) {
        case 'in_progress': return '進行中'
        case 'planning': return '規劃中'
        case 'completed': return '已完成'
        case 'on_hold': return '暫停'
        default: return '未分類'
      }
    }
    // 同名案場可能有多筆：保留「狀態優先」的那個排序權重（進行中優先）
    const bestByName = new Map() // name -> { weight, status }
    ;(Array.isArray(projects) ? projects : []).forEach((p) => {
      const name = String(p?.name || '').trim()
      if (!name) return
      const status = String(p?.status || '').trim()
      const w = getWeight(status)
      const prev = bestByName.get(name)
      if (!prev || w < prev.weight) bestByName.set(name, { weight: w, status })
    })
    const sorted = Array.from(bestByName.entries())
      .sort((a, b) => (a[1].weight - b[1].weight) || a[0].localeCompare(b[0], 'zh-Hant'))
      .map(([name, meta]) => ({
        name,
        status: meta?.status || '',
        label: getStatusLabel(meta?.status),
        weight: meta?.weight ?? 9
      }))
    setProjectSiteOptions(sorted)
  }

  const refetchForRealtime = () => {
    setSchedules(getSchedules())
    loadDropdownOptions()
  }
  useRealtimeKeys(['jiameng_engineering_schedules', 'jiameng_calendar_events', 'jiameng_dropdown_options', 'jiameng_projects'], refetchForRealtime)

  // 点击外部关闭下拉選單
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (participantDropdownRef.current && !participantDropdownRef.current.contains(event.target)) {
        setShowParticipantDropdown(false)
      }
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(event.target)) {
        setShowVehicleDropdown(false)
      }
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target)) {
        setShowSiteDropdown(false)
      }
      // 检查所有負責人下拉選單
      Object.keys(responsiblePersonDropdownRefs.current).forEach(itemId => {
        const ref = responsiblePersonDropdownRefs.current[itemId]
        if (ref && !ref.contains(event.target)) {
          setShowResponsiblePersonDropdown(prev => ({ ...prev, [itemId]: false }))
        }
      })
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 处理參與人員选择
  const splitCsv = (csv) => (String(csv || '').split(',').map((v) => String(v || '').trim()).filter(Boolean))

  const buildLeaveNameSetForDate = (ymd) => {
    const date = String(ymd || '').slice(0, 10)
    const set = new Set()
    if (!date) return set
    const isInRange = (d, start, end) => {
      const ds = String(d || '').slice(0, 10)
      const s = String(start || '').slice(0, 10)
      const e = String(end || '').slice(0, 10)
      if (!ds || !s || !e) return false
      return ds >= s && ds <= e
    }
    const apps = Array.isArray(getLeaveApplications()) ? getLeaveApplications() : []
    apps
      .filter((r) => String(r?.status || '').trim() === 'approved')
      .filter((r) => isInRange(date, r?.startDate, r?.endDate))
      .forEach((r) => {
        const acc = String(r?.userId || r?.userName || '').trim()
        const name = String(r?.userName || '').trim()
        if (name) set.add(name)
        if (acc) {
          try { set.add(getDisplayNameForAccount(acc)) } catch (_) {}
          try { (getDisplayNamesForAccount(acc) || []).forEach((n) => { const t = String(n || '').trim(); if (t) set.add(t) }) } catch (_) {}
        }
      })
    return set
  }

  const toggleParticipant = (name, leaveSet) => {
    const n = String(name || '').trim()
    if (!n) return
    if (leaveSet && leaveSet.has(n)) return // 請假人員不可選
    setScheduleFormData((prev) => {
      const values = splitCsv(prev.participants)
      const exists = values.includes(n)
      const next = exists ? values.filter((x) => x !== n) : [...values, n]
      return { ...prev, participants: next.join(', ') }
    })
  }

  const selectAllParticipants = (leaveSet) => {
    setScheduleFormData((prev) => {
      const existing = splitCsv(prev.participants)
      const extras = existing.filter((n) => !participantOptions.includes(n))
      const all = (Array.isArray(participantOptions) ? participantOptions : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .filter((n) => !(leaveSet && leaveSet.has(n)))
      const unique = Array.from(new Set([...extras, ...all]))
      return { ...prev, participants: unique.join(', ') }
    })
  }

  const clearParticipants = () => {
    setScheduleFormData((prev) => ({ ...prev, participants: '' }))
  }

  const removeLeaveParticipants = (leaveSet) => {
    if (!leaveSet || leaveSet.size === 0) return
    setScheduleFormData((prev) => {
      const filtered = splitCsv(prev.participants).filter((n) => !leaveSet.has(n))
      return { ...prev, participants: filtered.join(', ') }
    })
  }

  // 处理車輛选择
  const handleVehicleSelect = (value) => {
    setScheduleFormData(prev => ({ ...prev, vehicle: value }))
    setShowVehicleDropdown(false)
  }

  // 处理參與人員输入
  const handleParticipantInput = (e) => {
    const value = e.target.value
    setScheduleFormData(prev => ({ ...prev, participants: value }))
  }

  // 处理車輛输入
  const handleVehicleInput = (e) => {
    const value = e.target.value
    setScheduleFormData(prev => ({ ...prev, vehicle: value }))
  }

  // 处理活動（案場）输入/选择
  const handleSiteInput = (e) => {
    const value = e.target.value
    setScheduleFormData(prev => ({ ...prev, siteName: value }))
  }
  const handleSiteSelect = (value) => {
    setScheduleFormData(prev => ({ ...prev, siteName: value }))
    setShowSiteDropdown(false)
  }

  // 添加新的參與人員到下拉選單
  const handleAddParticipant = () => {
    const values = splitCsv(scheduleFormData.participants)
    if (values.length === 0) return
    let any = false
    values.forEach((value) => {
      if (value && !participantOptions.includes(value)) {
        addDropdownOption(value, 'participants')
        any = true
      }
    })
    if (any) loadDropdownOptions()
  }

  // 添加新的車輛到下拉選單
  const handleAddVehicle = () => {
    const value = scheduleFormData.vehicle.trim()
    if (value && !vehicleOptions.includes(value)) {
      addDropdownOption(value, 'vehicles')
      loadDropdownOptions()
    }
  }

  // 处理負責人选择
  const handleResponsiblePersonSelect = (itemId, value) => {
    handleWorkItemChange(
      scheduleFormData.workItems.findIndex(item => item.id === itemId),
      'responsiblePerson',
      value
    )
    setShowResponsiblePersonDropdown(prev => ({ ...prev, [itemId]: false }))
  }

  // 处理負責人输入
  const handleResponsiblePersonInput = (itemId, value) => {
    handleWorkItemChange(
      scheduleFormData.workItems.findIndex(item => item.id === itemId),
      'responsiblePerson',
      value
    )
  }

  // 添加新的負責人到下拉選單
  const handleAddResponsiblePerson = (itemId) => {
    const item = scheduleFormData.workItems.find(item => item.id === itemId)
    const value = item?.responsiblePerson?.trim()
    if (value && !responsiblePersonOptions.includes(value)) {
      addDropdownOption(value, 'responsible_persons')
      loadDropdownOptions()
    }
  }

  const handleDateClick = (day, isCurrentMonth = true) => {
    if (isCurrentMonth) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      setSelectedDate({ year, month, day })
      setSelectedDateForSchedule(dateStr)
      // 初始化排程表单数据
      setScheduleFormData({
        siteName: '',
        date: dateStr,
        isAllDay: true,
        startTime: '',
        endTime: '',
        participants: '',
        vehicle: '',
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: [],
        tag: 'blue'
      })
      // 显示新增工程排程表单
      setShowScheduleForm(true)
    }
  }

  const handleShowAddSchedule = () => {
    setShowDateDetailModal(false)
    // 初始化排程表单数据
    if (selectedDateForSchedule) {
      setScheduleFormData({
        siteName: '',
        date: selectedDateForSchedule,
        isAllDay: true,
        startTime: '',
        endTime: '',
        participants: '',
        vehicle: '',
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: []
      })
    }
    setShowScheduleForm(true)
  }

  const handleTopicChange = (e) => {
    const { name, value } = e.target
    setTopicFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveTopic = (e) => {
    e.preventDefault()
    if (!topicFormData.title) {
      alert('請輸入主題名稱')
      return
    }

    // 保存主题作为事件
    const result = saveEvent({
      title: topicFormData.title,
      type: 'blue',
      date: topicFormData.date,
      description: topicFormData.description,
      scheduleIds: topicFormData.schedules,
      isTopic: true
    })

    if (result.success) {
      // 重新加载排程列表
      const allSchedules = getSchedules()
      setSchedules(allSchedules)
      // 重置表单
      setTopicFormData({
        title: '',
        date: selectedDateForSchedule || '',
        description: '',
        schedules: []
      })
      setShowTopicForm(false)
      setSelectedDate(null)
      setSelectedDateForSchedule(null)
    } else {
      alert(result.message || '保存失敗')
    }
  }

  const handleToggleWorkItems = (scheduleId) => {
    setExpandedWorkItems(prev => ({
      ...prev,
      [scheduleId]: !prev[scheduleId]
    }))
  }

  const handleScheduleClick = (e, schedule) => {
    e.stopPropagation()
    setSelectedDetailItem(schedule)
    setSelectedDetailType('schedule')
    setShowDetailModal(true)
  }

  const handleEventClick = (e, event) => {
    e.stopPropagation()
    if (event.isTopic) {
      // 如果是主题，显示主题详情
      setSelectedDetailItem(event)
      setSelectedDetailType('topic')
      setShowDetailModal(true)
    } else {
      // 普通事件，显示事件详情
      setSelectedDetailItem(event)
      setSelectedDetailType('event')
      setShowDetailModal(true)
    }
  }

  const handleEditSchedule = () => {
    if (selectedDetailItem && selectedDetailType === 'schedule') {
      // 填充编辑表单数据
      setScheduleFormData({
        siteName: selectedDetailItem.siteName || '',
        date: selectedDetailItem.date || '',
        isAllDay: selectedDetailItem.isAllDay !== undefined ? selectedDetailItem.isAllDay : true,
        startTime: selectedDetailItem.startTime || '',
        endTime: selectedDetailItem.endTime || '',
        participants: selectedDetailItem.participants || '',
        vehicle: selectedDetailItem.vehicle || '',
        departureDriver: selectedDetailItem.departureDriver || '',
        returnDriver: selectedDetailItem.returnDriver || '',
        departureMileage: selectedDetailItem.departureMileage || '',
        returnMileage: selectedDetailItem.returnMileage || '',
        needRefuel: selectedDetailItem.needRefuel || false,
        fuelCost: selectedDetailItem.fuelCost || '',
        invoiceReturned: selectedDetailItem.invoiceReturned || false,
        workItems: selectedDetailItem.workItems || [],
        tag: selectedDetailItem.tag || 'blue'
      })
      // 关闭详情弹窗，打开编辑表单
      setShowDetailModal(false)
      setShowScheduleForm(true)
      // 保存编辑ID
      setEditingScheduleId(selectedDetailItem.id)
    }
  }

  const handleDeleteSchedule = () => {
    if (selectedDetailItem && selectedDetailType === 'schedule') {
      if (window.confirm('確定要刪除此工程排程嗎？')) {
        const result = deleteSchedule(selectedDetailItem.id)
        if (result.success) {
          // 重新加载排程列表
          const allSchedules = getSchedules()
          setSchedules(allSchedules)
          // 关闭详情弹窗
          setShowDetailModal(false)
          setSelectedDetailItem(null)
          setSelectedDetailType(null)
        } else {
          alert(result.message || '刪除失敗')
        }
      }
    }
  }

  const handleDeleteTopic = () => {
    if (selectedDetailItem && selectedDetailType === 'topic') {
      if (window.confirm('確定要刪除此主題嗎？')) {
        const result = deleteEvent(selectedDetailItem.id)
        if (result.success) {
          // 关闭详情弹窗
          setShowDetailModal(false)
          setSelectedDetailItem(null)
          setSelectedDetailType(null)
          // 強制重新渲染日曆
          setCurrentDate(new Date(currentDate))
        } else {
          alert(result.message || '刪除失敗')
        }
      }
    }
  }

  const handleAddNewActivity = () => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
    const weekDay = weekDays[today.getDay()]
    const formattedDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${weekDay}`
    
    setSelectedDateForSchedule(dateStr)
    const defaultTime = '01:00'
    setNewEvent({
      title: '',
      type: 'blue',
      date: dateStr,
      allDay: false,
      startDate: dateStr,
      startTime: defaultTime,
      endDate: dateStr,
      endTime: '02:00',
      saveAsMemo: false,
      companyActivity: '',
      participants: '',
      notification: ''
    })
    setShowEventModal(true)
  }

  const handleShowScheduleForm = () => {
    // 初始化排程表单数据
    if (selectedDateForSchedule) {
      setScheduleFormData({
        siteName: '',
        date: selectedDateForSchedule,
        isAllDay: true,
        startTime: '',
        endTime: '',
        participants: '',
        vehicle: '',
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: [],
        tag: 'blue'
      })
    }
    setShowScheduleForm(true)
    setShowEventModal(false) // 隐藏活动表单
  }

  const handleScheduleChange = (e) => {
    const { name, value, type, checked } = e.target
    setScheduleFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleWorkItemChange = (index, field, value) => {
    // 使用 functional update，避免同一事件內多次更新互相覆蓋
    setScheduleFormData((prev) => {
      const list = Array.isArray(prev.workItems) ? prev.workItems : []
      const newWorkItems = [...list]
      if (index < 0 || index >= newWorkItems.length) return prev
      newWorkItems[index] = { ...newWorkItems[index], [field]: value }
      return { ...prev, workItems: newWorkItems }
    })
  }

  const handleAddWorkItem = () => {
    setScheduleFormData(prev => ({
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
          sharedActualQuantity: ''
        }
      ]
    }))
    // 新增後自動捲到底部，看到新工作項目
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scheduleModalBodyRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    })
  }

  const handleRemoveWorkItem = (itemId) => {
    setScheduleFormData(prev => ({
      ...prev,
      workItems: prev.workItems.filter(item => item.id !== itemId)
    }))
  }

  const handleScheduleSubmit = (e) => {
    e.preventDefault()
    
    if (!scheduleFormData.siteName || !scheduleFormData.date) {
      alert('請填寫活動和日期')
      return
    }

    // 處理工作項目累積到排行榜的邏輯
    const leaderboardItems = getLeaderboardItems()
    const scheduleDate = scheduleFormData.date ? new Date(scheduleFormData.date) : new Date()
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
      // 如果是今天以前的排程，直接跳過累加邏輯（不累加到排行榜，但仍保存排程）
      // 注意：這裡不能直接 return，因為還需要保存排程，只是不累加到排行榜
    } else {
      // 今天當天的排程（在24:00前）或之後的排程，都會執行累加邏輯
      // 只有當天或之後的排程才會執行累加邏輯
      // 遍歷所有工作項目
      scheduleFormData.workItems.forEach(rawItem => {
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
            rawItem.lastAccumulatedAt = scheduleDate.toISOString()
          }
        }
      })
    }

    let result
    if (editingScheduleId) {
      // 更新现有排程
      result = updateSchedule(editingScheduleId, scheduleFormData)
    } else {
      // 新增排程
      result = saveSchedule(scheduleFormData)
    }

    if (result.success) {
      // 重新加载排程列表
      const allSchedules = getSchedules()
      setSchedules(allSchedules)
      // 重置表单
      setScheduleFormData({
        siteName: '',
        date: '',
        participants: '',
        vehicle: '',
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: [],
        tag: 'blue'
      })
      setShowScheduleForm(false)
      setShowScheduleModal(false)
      setEditingScheduleId(null)
      setSelectedDateForSchedule(null)
    } else {
      alert(result.message || '保存失敗')
    }
  }

  const handleScheduleCancel = () => {
    setScheduleFormData({
      siteName: '',
      date: selectedDateForSchedule || '',
      participants: '',
      vehicle: '',
      departureDriver: '',
      returnDriver: '',
      departureMileage: '',
      returnMileage: '',
      needRefuel: false,
      fuelCost: '',
      invoiceReturned: false,
      workItems: [],
      tag: 'blue'
    })
    setEditingScheduleId(null)
    if (showScheduleForm) {
      // 如果是从主题表单打开的，返回主题表单
      setShowScheduleForm(false)
      if (showTopicForm) {
        // 主题表单保持打开
      } else if (showDateDetailModal) {
        setShowDateDetailModal(true)
      } else if (showEventModal) {
        setShowEventModal(true)
      }
    } else {
      // 如果是独立打开的，关闭
      setShowScheduleModal(false)
      setSelectedDateForSchedule(null)
    }
  }

  const handleScheduleSubmitFromModal = (e) => {
    e.preventDefault()
    
    if (!scheduleFormData.siteName || !scheduleFormData.date) {
      alert('請填寫活動和日期')
      return
    }

    // 處理工作項目累積到排行榜的邏輯
    const leaderboardItems = getLeaderboardItems()
    const scheduleDate = scheduleFormData.date ? new Date(scheduleFormData.date) : new Date()
    const scheduleDateStr = scheduleDate.toISOString().split('T')[0] // YYYY-MM-DD 格式
    
    // 獲取今天的日期（不包含時間）
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD 格式
    
    // 累加規則：只有當天或之後的排程才會被累加到排行榜（避免串改過去數量）
    if (scheduleDateStr < todayStr) {
      // 如果是今天以前的排程，直接跳過累加邏輯
      // 注意：這裡不能直接 return，因為還需要保存排程，只是不累加到排行榜
    } else {
      // 只有當天或之後的排程才會執行累加邏輯
      // 遍歷所有工作項目
      scheduleFormData.workItems.forEach(workItem => {
        if (!workItem.workContent || !workItem.responsiblePerson) return
        
        // 檢查該工作項目是否已經在排程日期當天或之後累加過
        const lastAccumulatedAt = workItem.lastAccumulatedAt ? new Date(workItem.lastAccumulatedAt) : null
        const lastAccumulatedDateStr = lastAccumulatedAt ? lastAccumulatedAt.toISOString().split('T')[0] : null
        
        // 如果已經在排程日期當天或之後累加過，跳過（避免重複累加）
        if (lastAccumulatedDateStr && lastAccumulatedDateStr >= scheduleDateStr) {
          return // 已經累加過，不重複計算
        }
        
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
          
          // 只使用實際完成數量，且必須有數值才會上榜
          const quantity = parseFloat(workItem.actualQuantity) || 0
          
          if (quantity > 0) {
            // 查找是否已有該負責人的排名記錄
            const existingRanking = rankings.find(r => r.name === workItem.responsiblePerson)
            
            // 檢查是否有重置記錄（如果有重置，需要同時更新總數和本周累計）
            const hasReset = matchedLeaderboard.lastResetAt ? true : false
            
            if (existingRanking) {
              // 累積數量（總數和本周累計）
              const newQuantity = (parseFloat(existingRanking.quantity) || 0) + quantity
              const currentWeekQuantity = parseFloat(existingRanking.weekQuantity) || 0
              const newWeekQuantity = hasReset ? (currentWeekQuantity + quantity) : currentWeekQuantity
              
              updateManualRanking(matchedLeaderboard.id, existingRanking.id, {
                quantity: newQuantity.toString(),
                weekQuantity: hasReset ? newWeekQuantity.toString() : (existingRanking.weekQuantity || '0')
              })
            } else {
              // 新增排名記錄
              addManualRanking(matchedLeaderboard.id, {
                name: workItem.responsiblePerson,
                quantity: quantity.toString(),
                weekQuantity: hasReset ? quantity.toString() : '0',
                time: '',
                department: ''
              })
            }
            
            // 重新排序（數量多的排前面）
            const updatedRankings = getManualRankings(matchedLeaderboard.id)
            updatedRankings.sort((a, b) => {
              const qtyA = parseFloat(a.quantity) || 0
              const qtyB = parseFloat(b.quantity) || 0
              return qtyB - qtyA // 降序排列
            })
            
            // 重新分配排名
            updatedRankings.forEach((r, index) => {
              r.rank = index + 1
            })
            
            saveManualRankings(matchedLeaderboard.id, updatedRankings)
            
            // 標記該工作項目已經累加過（使用排程日期）
            workItem.lastAccumulatedAt = scheduleDate.toISOString()
          }
        }
      })
    }

    const result = saveSchedule(scheduleFormData)
    if (result.success) {
      // 重新加载排程列表
      const allSchedules = getSchedules()
      setSchedules(allSchedules)
      
      // 将新创建的排程ID添加到主题表单的schedules数组中
      const newSchedule = allSchedules.find(s => 
        s.siteName === scheduleFormData.siteName && 
        s.date === scheduleFormData.date
      )
      if (newSchedule && showTopicForm) {
        setTopicFormData(prev => ({
          ...prev,
          schedules: [...prev.schedules, newSchedule.id]
        }))
      }
      
      // 重置表单并返回活动表单
      setScheduleFormData({
        siteName: '',
        date: selectedDateForSchedule || '',
        participants: '',
        vehicle: '',
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: [],
        tag: 'blue'
      })
      setShowScheduleForm(false)
      // 主题表单保持打开，用户可以继续添加或保存
    } else {
      alert(result.message || '保存失敗')
    }
  }

  const handleAddEvent = (e) => {
    e.preventDefault()
    if (newEvent.title && newEvent.startDate) {
      const result = saveEvent(newEvent)
      if (result.success) {
        setNewEvent({ 
          title: '', 
          type: 'blue', 
          date: '',
          allDay: false,
          startDate: '',
          startTime: '',
          endDate: '',
          endTime: '',
          saveAsMemo: false,
          companyActivity: '',
          participants: '',
          notification: ''
        })
        setShowEventModal(false)
        setSelectedDate(null)
        setSelectedDateForSchedule(null)
        // 重新加载事件
        const allSchedules = getSchedules()
        setSchedules(allSchedules)
      }
    }
  }

  const handleDeleteEvent = (eventId) => {
    if (window.confirm('確定要刪除此事件嗎？')) {
      deleteEvent(eventId)
    }
  }

  const getEventsForDay = (day, isCurrentMonth = true) => {
    if (!isCurrentMonth) return []
    const events = getEventsByDate(year, month, day)
    return events
  }

  const getSchedulesForDay = (day, isCurrentMonth = true) => {
    if (!isCurrentMonth) return []
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return schedules.filter(schedule => schedule.date === dateStr)
  }

  const handleAddScheduleToCalendar = (scheduleId) => {
    const schedule = schedules.find(s => s.id === scheduleId)
    if (schedule && selectedDateForSchedule) {
      // 将排程添加到日历事件
      const result = saveEvent({
        title: schedule.siteName,
        type: 'blue',
        date: selectedDateForSchedule,
        scheduleId: schedule.id,
        isSchedule: true
      })
      if (result.success) {
        setShowScheduleModal(false)
        setSelectedDateForSchedule(null)
        // 重新加载排程列表
        const allSchedules = getSchedules()
        setSchedules(allSchedules)
      }
    }
  }

  const handleRemoveScheduleFromCalendar = (eventId, scheduleId) => {
    if (window.confirm('確定要從行事曆中移除此排程嗎？')) {
      deleteEvent(eventId)
    }
  }

  const handleDeleteTestAnd7777 = () => {
    const all = getSchedules()
    const toDelete = all.filter(s => (s.siteName || '').trim() === '測試' || (s.siteName || '').trim() === '7777')
    if (toDelete.length === 0) {
      alert('找不到「測試」或「7777」的排程')
      return
    }
    if (!window.confirm(`確定要刪除以下 ${toDelete.length} 個工成項目嗎？\n${toDelete.map(s => `・${s.siteName}（${s.date || '未設日期'}）`).join('\n')}`)) return
    
    // 刪除排程
    toDelete.forEach(s => {
      deleteSchedule(s.id)
      // 同時刪除關聯的日曆事件
      const allEvents = getEvents()
      const relatedEvents = allEvents.filter(e => e.scheduleId === s.id || (e.isSchedule && e.title === s.siteName))
      relatedEvents.forEach(e => deleteEvent(e.id))
    })
    
    // 重新載入排程和事件
    setSchedules(getSchedules())
    setShowDetailModal(false)
    setSelectedDetailItem(null)
    setSelectedDetailType(null)
    
    // 強制重新渲染日曆
    setCurrentDate(new Date(currentDate))
  }

  const isToday = (day) => {
    const today = new Date()
    return today.getFullYear() === year &&
           today.getMonth() === month &&
           today.getDate() === day
  }

  const isHoliday = (day) => {
    // 简单的节假日判断（可以根据需要扩展）
    if (day === 1 && month === 0) return true // 元旦
    return false
  }

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                     '七月', '八月', '九月', '十月', '十一月', '十二月']

  return (
    <div className="bg-charcoal rounded-none sm:rounded-lg py-4 px-px sm:px-4 md:px-6 w-full max-w-full min-w-0">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-yellow-400">行事曆</h2>
          {schedules.some(s => (s.siteName || '').trim() === '測試' || (s.siteName || '').trim() === '7777') && (
            <button
              type="button"
              onClick={handleDeleteTestAnd7777}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              刪除「測試」「7777」工成項目
            </button>
          )}
        </div>
        
        {/* 月份导航 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handlePrevMonth}
            className="text-white hover:text-yellow-400 transition-colors px-4 py-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-xl font-semibold text-white">
            {year}年 {monthNames[month]}
          </h3>
          <button
            onClick={handleNextMonth}
            className="text-white hover:text-yellow-400 transition-colors px-4 py-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 周标题 */}
        <div className="grid grid-cols-7 gap-px sm:gap-1 mb-1.5 sm:mb-2">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className="text-center text-gray-400 text-[10px] sm:text-sm font-medium py-0.5"
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div className="grid grid-cols-7 gap-px sm:gap-1 min-w-0 w-full">
          {/* 上个月的日期 */}
          {prevMonthDays.map((day) => {
            const events = []
            return (
              <div
                key={`prev-${day}`}
                className="min-h-[110px] sm:min-h-[100px] bg-gray-900 border border-gray-700 rounded p-0.5 text-gray-600 overflow-hidden min-w-0"
              >
                <div className="text-[10px] mb-0.5 font-medium">{day}</div>
                <div className="space-y-0.5 overflow-hidden min-w-0">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className={`${typeColors[event.type] || 'bg-gray-500'} ${typeTextColors[event.type] || 'text-white'} text-[9px] px-0.5 py-0.5 rounded truncate`}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* 当前月的日期 */}
          {currentMonthDays.map((day) => {
            const events = getEventsForDay(day, true)
            const daySchedules = getSchedulesForDay(day, true)
            const today = isToday(day)
            const holiday = isHoliday(day)
            
            return (
              <div
                key={day}
                onClick={() => handleDateClick(day, true)}
                className={`min-h-[110px] sm:min-h-[100px] bg-gray-800 border rounded p-0.5 cursor-pointer hover:bg-gray-750 transition-colors overflow-hidden min-w-0 ${
                  today ? 'border-yellow-400 ring-2 ring-yellow-400' : 
                  holiday ? 'border-red-500' : 
                  'border-gray-700'
                }`}
              >
                <div className={`text-[10px] sm:text-xs mb-0.5 font-medium truncate ${today ? 'text-yellow-400 font-bold' : holiday ? 'text-red-400 font-semibold' : 'text-white'}`}>
                  {day}
                  {day === 1 && month === 0 && (
                    <span className="ml-0.5 text-[10px]">元旦</span>
                  )}
                </div>
                <div className="space-y-0.5 overflow-hidden min-w-0">
                  {/* 显示排程（案场名称） */}
                  {daySchedules.map((schedule) => {
                    const scheduleTag = schedule.tag || 'blue'
                    const isAllDay = schedule.isAllDay !== undefined ? schedule.isAllDay : true
                    // 全天：显示标签底色；非全天：只修改字体颜色
                    const displayClass = isAllDay
                      ? `${typeColors[scheduleTag] || 'bg-blue-500'} ${typeTextColors[scheduleTag] || 'text-white'}`
                      : `bg-gray-700 ${typeTimeColors[scheduleTag] || 'text-blue-400'}`
                    
                    // 显示时间信息
                    const timeDisplay = !isAllDay && schedule.startTime
                      ? ` ${schedule.startTime}${schedule.endTime ? ` - ${schedule.endTime}` : ''}`
                      : ''
                    
                    return (
                      <div 
                        key={schedule.id} 
                        className={`${displayClass} text-[10px] px-0.5 py-0.5 rounded cursor-pointer hover:opacity-80 flex items-center justify-between gap-0.5 min-w-0 overflow-hidden`}
                        onClick={(e) => handleScheduleClick(e, schedule)}
                        title={`${schedule.siteName}${timeDisplay} - 工程排程`}
                      >
                        <span className="truncate flex-1 min-w-0">{schedule.siteName}{timeDisplay}</span>
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                          {/* 加油指示灯 */}
                          <div 
                            className={`relative w-2 h-2 rounded-full shadow ${
                              schedule.needRefuel 
                                ? 'bg-green-500' 
                                : 'bg-gray-500'
                            }`}
                            title={schedule.needRefuel ? '已加油' : '未加油'}
                          >
                            {schedule.needRefuel ? (
                              <>
                                <div className="absolute inset-0 rounded-full bg-green-400 animate-gentle-blink opacity-75"></div>
                                <div className="absolute inset-0 rounded-full bg-green-500 animate-gentle-blink"></div>
                                <div className="absolute inset-0 rounded-full shadow-[0_0_8px_2px_rgba(34,197,94,0.8)] animate-gentle-blink"></div>
                              </>
                            ) : (
                              <div className="absolute inset-0 rounded-full bg-gray-500"></div>
                            )}
                          </div>
                          {/* 發票指示灯 */}
                          <div 
                            className={`relative w-2 h-2 rounded-full shadow ${
                              // 如果未勾选加油，發票灯为灰色（无状态）
                              !schedule.needRefuel
                                ? 'bg-gray-500'
                                // 如果勾选加油且發票已交回，發票灯为绿色
                                : schedule.invoiceReturned === true
                                ? 'bg-green-500'
                                // 如果勾选加油但發票未交回，發票灯为红色
                                : 'bg-red-500'
                            }`}
                            title={
                              !schedule.needRefuel
                                ? '無發票狀態（未加油）'
                                : schedule.invoiceReturned === true
                                ? '發票已繳回'
                                : '發票未繳回'
                            }
                          >
                            {!schedule.needRefuel ? (
                              // 未勾选加油，發票灯灰色（无状态）
                              <div className="absolute inset-0 rounded-full bg-gray-500"></div>
                            ) : schedule.invoiceReturned === true ? (
                              // 勾选加油且發票已交回，發票灯绿色
                              <>
                                <div className="absolute inset-0 rounded-full bg-green-400 animate-gentle-blink opacity-75"></div>
                                <div className="absolute inset-0 rounded-full bg-green-500 animate-gentle-blink"></div>
                                <div className="absolute inset-0 rounded-full shadow-[0_0_8px_2px_rgba(34,197,94,0.8)] animate-gentle-blink"></div>
                              </>
                            ) : (
                              // 勾选加油但發票未交回，發票灯红色
                              <>
                                <div className="absolute inset-0 rounded-full bg-red-400 animate-gentle-blink opacity-75"></div>
                                <div className="absolute inset-0 rounded-full bg-red-500 animate-gentle-blink"></div>
                                <div className="absolute inset-0 rounded-full shadow-[0_0_8px_2px_rgba(239,68,68,0.8)] animate-gentle-blink"></div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* 显示其他事件 */}
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className={`${typeColors[event.type] || 'bg-gray-500'} ${typeTextColors[event.type] || 'text-white'} text-[9px] px-0.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80`}
                      title={event.title}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEventClick(e, event)
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* 下个月的日期 */}
          {nextMonthDays.map((day) => {
            const events = []
            return (
              <div
                key={`next-${day}`}
                className="min-h-[100px] bg-gray-900 border border-gray-700 rounded p-0.5 text-gray-600 overflow-hidden min-w-0"
              >
                <div className="text-[10px] mb-0.5">{day}</div>
                <div className="space-y-0.5 overflow-hidden min-w-0">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className={`${typeColors[event.type] || 'bg-gray-500'} ${typeTextColors[event.type] || 'text-white'} text-[9px] px-0.5 py-0.5 rounded truncate`}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 新增主題表单 */}
      {showTopicForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-charcoal border border-yellow-400 rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-yellow-400">新增主題</h3>
              <button
                onClick={() => {
                  setShowTopicForm(false)
                  setSelectedDate(null)
                  setSelectedDateForSchedule(null)
                  setTopicFormData({
                    title: '',
                    date: '',
                    description: '',
                    schedules: []
                  })
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveTopic} className="space-y-4">
              {/* 主題名稱 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  主題名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={topicFormData.title}
                  onChange={handleTopicChange}
                  placeholder="請輸入主題名稱"
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
                  value={topicFormData.date}
                  onChange={handleTopicChange}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                  required
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  描述
                </label>
                <textarea
                  name="description"
                  value={topicFormData.description}
                  onChange={handleTopicChange}
                  placeholder="請輸入主題描述（選填）"
                  rows="3"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* 已添加的工程項目列表 */}
              {topicFormData.schedules.length > 0 && (
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    已添加的工程項目
                  </label>
                  <div className="space-y-2">
                    {topicFormData.schedules.map((scheduleId) => {
                      const schedule = schedules.find(s => s.id === scheduleId)
                      if (!schedule) return null
                      return (
                        <div key={scheduleId} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-white font-semibold">{schedule.siteName}</div>
                              {schedule.participants && (
                                <div className="text-gray-400 text-sm">參與人員: {schedule.participants}</div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTopicFormData(prev => ({
                                  ...prev,
                                  schedules: prev.schedules.filter(id => id !== scheduleId)
                                }))
                              }}
                              className="text-red-400 hover:text-red-500"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 新增工程項目按钮 */}
              <div className="pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={handleShowAddSchedule}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  + 新增工程項目
                </button>
              </div>

              {/* 保存按钮 */}
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500 transition-colors"
                >
                  保存主題
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTopicForm(false)
                    setSelectedDate(null)
                    setSelectedDateForSchedule(null)
                    setTopicFormData({
                      title: '',
                      date: '',
                      description: '',
                      schedules: []
                    })
                  }}
                  className="flex-1 bg-gray-700 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情弹窗 - 显示主题或排程的完整信息 */}
      {showDetailModal && selectedDetailItem && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          // 點擊空白處收合
          onClick={() => {
            setShowDetailModal(false)
            setSelectedDetailItem(null)
            setSelectedDetailType(null)
          }}
        >
          <div
            className={`${selectedDetailType === 'schedule' ? 'bg-blue-900 border-blue-500' : 'bg-charcoal border-yellow-400'} border rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto`}
            // 點擊彈窗本體不收合
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${selectedDetailType === 'schedule' ? 'text-white' : 'text-yellow-400'}`}>
                {selectedDetailType === 'topic' ? '主題詳情' : 
                 selectedDetailType === 'schedule' ? '工程排程詳情' : 
                 '活動詳情'}
              </h3>
              <div className="flex items-center space-x-2">
                {/* 排程詳情：上方不顯示編輯/刪除（避免擠在一起），改用下方大按鈕 */}
                {selectedDetailType === 'topic' && (
                  <button
                    onClick={handleDeleteTopic}
                    className="bg-red-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm"
                  >
                    刪除
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    setSelectedDetailItem(null)
                    setSelectedDetailType(null)
                  }}
                  className="text-white hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {selectedDetailType === 'topic' && (
                <>
                  {/* 主题信息 */}
                  <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                    <div>
                      <span className="text-gray-400 text-sm">主題名稱:</span>
                      <div className="text-white font-semibold text-lg mt-1">{selectedDetailItem.title}</div>
                    </div>
                    {selectedDetailItem.date && (
                      <div>
                        <span className="text-gray-400 text-sm">日期:</span>
                        <div className="text-white mt-1">{selectedDetailItem.date.replace(/-/g, '/')}</div>
                      </div>
                    )}
                    {selectedDetailItem.description && (
                      <div>
                        <span className="text-gray-400 text-sm">描述:</span>
                        <div className="text-white mt-1">{selectedDetailItem.description}</div>
                      </div>
                    )}
                  </div>

                  {/* 关联的工程項目 */}
                  {selectedDetailItem.scheduleIds && selectedDetailItem.scheduleIds.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-yellow-400 mb-3">關聯的工程項目</h4>
                      <div className="space-y-3">
                        {selectedDetailItem.scheduleIds.map((scheduleId) => {
                          const schedule = schedules.find(s => s.id === scheduleId)
                          if (!schedule) return null
                          return (
                            <div key={scheduleId} className="bg-blue-900 border border-blue-700 rounded-lg p-4 space-y-2">
                              <div className="text-white font-semibold text-lg">{schedule.siteName}</div>
                              {schedule.date && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">日期:</span> {schedule.date.replace(/-/g, '/')}
                                </div>
                              )}
                              {schedule.participants && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">參與人員:</span> {schedule.participants}
                                </div>
                              )}
                              {schedule.vehicle && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">車輛:</span> {schedule.vehicle}
                                </div>
                              )}
                              {schedule.departureDriver && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">出發駕駛:</span> {schedule.departureDriver}
                                </div>
                              )}
                              {schedule.returnDriver && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">回程駕駛:</span> {schedule.returnDriver}
                                </div>
                              )}
                              {schedule.workItems && schedule.workItems.length > 0 && (
                                <div className="text-blue-200 text-sm">
                                  <span className="text-blue-300">工作項目:</span>
                                  <div className="mt-1 space-y-1 pl-4">
                                    {schedule.workItems.map((item, idx) => (
                                      <div key={idx} className="text-blue-100">
                                        • {item.workContent || item.content || '未命名工作項目'}
                                        {(() => {
                                          const it = normalizeWorkItem(item)
                                          const collabs = getWorkItemCollaborators(it)
                                          const isCollab = !!it?.isCollaborative
                                          const mode = isCollab ? getWorkItemCollabMode(it) : 'separate'
                                          const name = String(it?.responsiblePerson || '').trim()
                                          const t = parseFloat(it?.targetQuantity) || 0
                                          const a = parseFloat(it?.actualQuantity) || 0
                                          if (!isCollab) {
                                            return (
                                              <>
                                                {name ? ` (${name})` : ''}
                                                {t > 0 ? ` - 目標: ${t}` : ''}
                                                {a > 0 ? `, 實際: ${a}` : ''}
                                              </>
                                            )
                                          }
                                          const names = collabs.map((c) => String(c?.name || '').trim()).filter(Boolean).join(', ')
                                          const sharedT = t
                                          const sharedA = getWorkItemSharedActual(it)
                                          return (
                                            <>
                                              {names ? ` (${names})` : ''}
                                              {mode === 'shared' && (
                                                <div className="text-blue-200 text-xs mt-1">
                                                  共同：目標 {sharedT > 0 ? sharedT : 'N/A'} / 實際 {sharedA > 0 ? sharedA : 'N/A'}
                                                </div>
                                              )}
                                              {mode === 'separate' && collabs.length > 0 && (
                                                <div className="mt-1 space-y-1">
                                                  {collabs.map((c) => {
                                                    const cn = String(c?.name || '').trim()
                                                    const ct = parseFloat(c?.targetQuantity) || 0
                                                    const ca = parseFloat(c?.actualQuantity) || 0
                                                    const cr = ct > 0 ? ((ca / ct) * 100).toFixed(1) : ''
                                                    return (
                                                      <div key={cn} className="text-blue-200 text-xs">
                                                        - {cn || '—'}：目標 {ct || 'N/A'} / 實際 {ca || 'N/A'}{cr ? `（${cr}%）` : ''}
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </>
                                          )
                                        })()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedDetailType === 'schedule' && (
                <div className="space-y-3 text-white">
                  {/* 活動 */}
                  <div className="text-lg font-semibold">{selectedDetailItem.siteName || '未命名'}</div>
                  
                  {/* 日期 */}
                  {selectedDetailItem.date && (
                    <div>
                      <span className="text-blue-300">日期:</span>
                      <span className="ml-2">{selectedDetailItem.date.replace(/-/g, '/')}</span>
                      {selectedDetailItem.isAllDay === false && (
                        <span className="ml-2 text-gray-400">
                          {selectedDetailItem.startTime || ''}
                          {selectedDetailItem.startTime && selectedDetailItem.endTime ? ' - ' : ''}
                          {selectedDetailItem.endTime || ''}
                        </span>
                      )}
                      {selectedDetailItem.isAllDay !== false && (
                        <span className="ml-2 text-gray-400">全天</span>
                      )}
                    </div>
                  )}

                  {/* 參與人員 */}
                  {selectedDetailItem.participants && (
                    <div>
                      <span className="text-blue-300">參與人員:</span>
                      <span className="ml-2">{selectedDetailItem.participants}</span>
                    </div>
                  )}

                  {/* 車輛 */}
                  {selectedDetailItem.vehicle && (
                    <div>
                      <span className="text-blue-300">車輛:</span>
                      <span className="ml-2">{selectedDetailItem.vehicle}</span>
                    </div>
                  )}

                  {/* 出發駕駛 */}
                  {selectedDetailItem.departureDriver && (
                    <div>
                      <span className="text-blue-300">出發駕駛:</span>
                      <span className="ml-2">{selectedDetailItem.departureDriver}</span>
                    </div>
                  )}

                  {/* 回程駕駛 */}
                  {selectedDetailItem.returnDriver && (
                    <div>
                      <span className="text-blue-300">回程駕駛:</span>
                      <span className="ml-2">{selectedDetailItem.returnDriver}</span>
                    </div>
                  )}

                  {/* 出發里程 */}
                  {selectedDetailItem.departureMileage && (
                    <div>
                      <span className="text-blue-300">出發里程:</span>
                      <span className="ml-2">{selectedDetailItem.departureMileage} km</span>
                    </div>
                  )}

                  {/* 回程里程 */}
                  {selectedDetailItem.returnMileage && (
                    <div>
                      <span className="text-blue-300">回程里程:</span>
                      <span className="ml-2">{selectedDetailItem.returnMileage} km</span>
                    </div>
                  )}

                  {/* 今日總里程 */}
                  {selectedDetailItem.departureMileage && selectedDetailItem.returnMileage && (
                    <div>
                      <span className="text-blue-300">今日總里程:</span>
                      <span className="ml-2">
                        {(() => {
                          const departure = parseFloat(selectedDetailItem.departureMileage) || 0
                          const returnMile = parseFloat(selectedDetailItem.returnMileage) || 0
                          const total = returnMile > departure ? returnMile - departure : 0
                          return `${total} km`
                        })()}
                      </span>
                    </div>
                  )}

                  {/* 是否加油 */}
                  <div className="flex items-center">
                    <span className="text-blue-300">是否加油:</span>
                    <span className="ml-2">{selectedDetailItem.needRefuel ? '是' : '否'}</span>
                    {/* 加油指示灯 */}
                    <div className="ml-3 flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${selectedDetailItem.needRefuel ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                      <span className="text-xs text-gray-400">加油</span>
                    </div>
                  </div>

                  {/* 油資 */}
                  {selectedDetailItem.fuelCost && (
                    <div>
                      <span className="text-blue-300">油資:</span>
                      <span className="ml-2">NT$ {parseFloat(selectedDetailItem.fuelCost).toLocaleString()}</span>
                    </div>
                  )}

                  {/* 發票是否繳回 */}
                  <div className="flex items-center">
                    <span className="text-blue-300">發票是否繳回:</span>
                    <span className="ml-2">{selectedDetailItem.invoiceReturned ? '是' : '否'}</span>
                    {/* 發票指示灯 */}
                    <div className="ml-3 flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${selectedDetailItem.invoiceReturned ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-xs text-gray-400">發票</span>
                    </div>
                  </div>

                  {/* 工作項目 */}
                  {selectedDetailItem.workItems && selectedDetailItem.workItems.length > 0 && (
                    <div className="mt-4">
                      <div className="text-blue-300 mb-2">工作項目:</div>
                      <div className="space-y-2">
                        {selectedDetailItem.workItems.map((item, idx) => (
                          <div key={idx} className="bg-blue-800 rounded-lg p-3">
                            <div className="text-white">
                              {item.workContent || item.content || `工作項目 ${idx + 1}`}
                            </div>
                            {(() => {
                              const it = normalizeWorkItem(item)
                              const collabs = getWorkItemCollaborators(it)
                              const isCollab = !!it?.isCollaborative
                              const mode = isCollab ? getWorkItemCollabMode(it) : 'separate'
                              const name = String(it?.responsiblePerson || '').trim()
                              const t = parseFloat(it?.targetQuantity) || 0
                              const a = parseFloat(it?.actualQuantity) || 0
                              const sharedT = t
                              const sharedA = getWorkItemSharedActual(it)
                              return (
                                <>
                                  {!isCollab && name && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      負責人: {name}
                                    </div>
                                  )}
                                  {!isCollab && (t > 0 || a > 0) && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      目標: {t > 0 ? t : 'N/A'} / 實際: {a > 0 ? a : 'N/A'}
                                    </div>
                                  )}
                                  {isCollab && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      負責人: {collabs.map((c) => String(c?.name || '').trim()).filter(Boolean).join(', ') || '—'}
                                    </div>
                                  )}
                                  {isCollab && mode === 'shared' && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      共同：目標 {sharedT > 0 ? sharedT : 'N/A'} / 實際 {sharedA > 0 ? sharedA : 'N/A'}
                                    </div>
                                  )}
                                  {isCollab && mode === 'separate' && collabs.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {collabs.map((c) => {
                                        const cn = String(c?.name || '').trim()
                                        const ct = parseFloat(c?.targetQuantity) || 0
                                        const ca = parseFloat(c?.actualQuantity) || 0
                                        const cr = ct > 0 ? ((ca / ct) * 100).toFixed(1) : ''
                                        return (
                                          <div key={cn} className="text-blue-200 text-sm">
                                            - {cn || '—'}：目標 {ct || 'N/A'} / 實際 {ca || 'N/A'}{cr ? `（${cr}%）` : ''}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 行程回報紀錄：依此排程案場（siteName）顯示；名子套用特效邏輯 */}
                  {selectedDetailType === 'schedule' && (() => {
                    const siteName = (selectedDetailItem?.siteName || '').trim()
                    const tripReports = siteName ? getTripReportsByProject(siteName) : []
                    const leaderboardItems = getLeaderboardItems()
                    const formatTime = (iso) => {
                      try {
                        const d = new Date(iso)
                        return d.toLocaleString('zh-TW', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                        })
                      } catch (_) { return iso }
                    }
                    return (
                      <div className="mt-4">
                        <div className="text-blue-300 mb-2">行程回報紀錄:</div>
                        {tripReports.length === 0 ? (
                          <div className="bg-blue-800 rounded-lg p-3 text-blue-200 text-sm">尚無行程回報，可至「行程回報」選擇此案場紀錄出發／抵達／休息／上工／收工／離場。</div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {tripReports.map((r) => {
                              const userId = r.userId || ''
                              const nameEffectStyle = getNameEffectStyle(userId, leaderboardItems)
                              const nameDeco = getDecorationForNameEffect(userId, leaderboardItems)
                              const userTitle = getUserTitle(userId)
                              const titleBadgeStyle = getTitleBadgeStyle(userId, leaderboardItems)
                              return (
                                <div key={r.id} className="bg-blue-800 rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-medium text-yellow-400">{r.actionType}</span>
                                  <span className="text-blue-200 text-sm flex items-center flex-wrap gap-1">
                                    <span style={nameEffectStyle || { color: 'inherit' }}>{getDisplayNameForAccount(r.userId || r.userName || '')}</span>
                                    {nameDeco && <span className={nameDeco.className}>{nameDeco.emoji}</span>}
                                    {userTitle && (
                                      <span className="text-xs font-bold rounded" style={titleBadgeStyle}>{userTitle}</span>
                                    )}
                                  </span>
                                  <span className="text-blue-300 text-xs">{formatTime(r.createdAt)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  
                  {/* 编辑和删除按钮 */}
                  <div className="flex space-x-3 pt-4 border-t border-blue-700">
                    <button
                      onClick={handleEditSchedule}
                      className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500 transition-colors"
                    >
                      編輯
                    </button>
                    <button
                      onClick={handleDeleteSchedule}
                      className="flex-1 bg-red-500 text-white font-semibold py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              )}

              {selectedDetailType === 'event' && (
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="text-white font-semibold text-lg">{selectedDetailItem.title}</div>
                  {selectedDetailItem.date && (
                    <div>
                      <span className="text-gray-400 text-sm">日期:</span>
                      <div className="text-white mt-1">{selectedDetailItem.date.replace(/-/g, '/')}</div>
                    </div>
                  )}
                  {selectedDetailItem.description && (
                    <div>
                      <span className="text-gray-400 text-sm">描述:</span>
                      <div className="text-white mt-1">{selectedDetailItem.description}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 日期详情弹窗 */}
      {showDateDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 border border-blue-500 rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="text-2xl font-bold text-white">
                  {selectedDate?.day || ''}
                </div>
                <div className="text-lg font-semibold text-blue-200">
                  {selectedDateForSchedule ? (() => {
                    const daySchedules = schedules.filter(s => s.date === selectedDateForSchedule)
                    return daySchedules.length > 0 ? daySchedules[0].siteName : '無排程'
                  })() : '無排程'}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDateDetailModal(false)
                  setSelectedDate(null)
                  setSelectedDateForSchedule(null)
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {(() => {
                const daySchedules = selectedDateForSchedule ? 
                  schedules.filter(s => s.date === selectedDateForSchedule) : []
                
                if (daySchedules.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-400">
                      <p>此日期尚無排程</p>
                    </div>
                  )
                }

                return daySchedules.map((schedule) => {
                  const isWorkItemsExpanded = expandedWorkItems[schedule.id]
                  return (
                    <div key={schedule.id} className="bg-blue-800 rounded-lg p-4 space-y-3">
                      {/* 日期 */}
                      <div className="text-white text-sm">
                        <span className="text-blue-300">日期:</span> {schedule.date ? 
                          schedule.date.replace(/-/g, '/') : '未設定'}
                      </div>

                      {/* 參與人員 */}
                      {schedule.participants && (
                        <div className="text-white text-sm">
                          <span className="text-blue-300">參與人員:</span> {schedule.participants}
                        </div>
                      )}

                      {/* 車輛 */}
                      {schedule.vehicle && (
                        <div className="text-white text-sm">
                          <span className="text-blue-300">車輛:</span> {schedule.vehicle}
                        </div>
                      )}

                      {/* 出發駕駛 */}
                      {schedule.departureDriver && (
                        <div className="text-white text-sm">
                          <span className="text-blue-300">出發駕駛:</span> {schedule.departureDriver}
                        </div>
                      )}

                      {/* 回程駕駛 */}
                      {schedule.returnDriver && (
                        <div className="text-white text-sm">
                          <span className="text-blue-300">回程駕駛:</span> {schedule.returnDriver}
                        </div>
                      )}

                      {/* 工作項目 */}
                      {schedule.workItems && schedule.workItems.length > 0 && (
                        <div className="text-white text-sm">
                          <div 
                            className="flex items-center justify-between cursor-pointer hover:text-blue-200"
                            onClick={() => handleToggleWorkItems(schedule.id)}
                          >
                            <span className="text-blue-300">工作項目:</span>
                            <svg 
                              className={`w-4 h-4 transform transition-transform ${isWorkItemsExpanded ? 'rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          {isWorkItemsExpanded && (
                            <div className="mt-2 pl-4 space-y-1">
                              {schedule.workItems.map((item, idx) => (
                                <div key={idx} className="text-blue-100">
                                  • {item.workContent || item.content || '未命名工作項目'} 
                                  {item.responsiblePerson && ` (${item.responsiblePerson})`}
                                  {item.targetQuantity && ` - 目標: ${item.targetQuantity}`}
                                  {item.actualQuantity && `, 實際: ${item.actualQuantity}`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}

              {/* 新增排程按钮 */}
              <div className="pt-4 border-t border-blue-700">
                <button
                  onClick={handleShowAddSchedule}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  + 新增排程
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新增/编辑排程模态框 */}
      {(showScheduleForm || showScheduleModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div ref={scheduleModalBodyRef} className="bg-charcoal border border-yellow-400 rounded-lg shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-yellow-400">
                {editingScheduleId ? '編輯排程' : '新增排程'}
              </h3>
              <button
                onClick={handleScheduleCancel}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 活動（套用專案管理案場下拉） */}
                <div className="relative" ref={siteDropdownRef}>
                  <label className="block text-gray-300 text-sm mb-2">
                    活動 <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="siteName"
                      value={scheduleFormData.siteName}
                      onChange={handleSiteInput}
                      onFocus={() => setShowSiteDropdown(true)}
                      placeholder="請選擇案場（可輸入搜尋）"
                      className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                      required
                    />
                    {showSiteDropdown && projectSiteOptions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {/* 狀態標籤：點擊後篩選案場 */}
                        <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/40 sticky top-0 z-10">
                          <div className="flex flex-wrap gap-2">
                            {[
                              { id: 'all', label: '全部' },
                              { id: 'in_progress', label: '進行中' },
                              { id: 'planning', label: '規劃中' },
                              { id: 'completed', label: '已完成' },
                              { id: 'on_hold', label: '暫停' }
                            ].map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSiteStatusFilter(t.id)}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                  siteStatusFilter === t.id
                                    ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                    : 'bg-gray-800 border-gray-600 text-gray-200 hover:border-yellow-400 hover:text-yellow-200'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {projectSiteOptions
                          .filter((opt) => {
                            const q = (scheduleFormData.siteName || '').trim()
                            if (!q) return true
                            const name = String(opt?.name || '')
                            const label = String(opt?.label || '')
                            const status = String(opt?.status || '')
                            return name.includes(q) || label.includes(q) || status.includes(q)
                          })
                          .filter((opt) => {
                            if (siteStatusFilter === 'all') return true
                            return String(opt?.status || '') === siteStatusFilter
                          })
                          .slice(0, 200)
                          .map((option) => (
                            <div
                              key={option?.name}
                              onClick={() => handleSiteSelect(option?.name)}
                              className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{option?.name}</span>
                              <span
                                className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${
                                  option?.label === '進行中'
                                    ? 'bg-green-600/20 border-green-500/40 text-green-200'
                                    : option?.label === '規劃中'
                                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                                      : option?.label === '已完成'
                                        ? 'bg-gray-600/20 border-gray-500/40 text-gray-200'
                                        : 'bg-yellow-600/20 border-yellow-500/40 text-yellow-200'
                                }`}
                              >
                                {option?.label}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 日期 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    日期 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={scheduleFormData.date}
                    onChange={handleScheduleChange}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                    required
                  />
                </div>

                {/* 時間選項 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    時間
                  </label>
                  <div className="space-y-3">
                    {/* 全天選項 */}
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="isAllDay"
                          checked={scheduleFormData.isAllDay}
                          onChange={handleScheduleChange}
                          className="w-5 h-5 text-yellow-400 bg-gray-700 border-gray-500 rounded focus:ring-yellow-400"
                        />
                        <span className="text-gray-300 text-sm">全天</span>
                      </label>
                    </div>
                    {/* 時間輸入（非全天時顯示） */}
                    {!scheduleFormData.isAllDay && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">開始時間</label>
                          <input
                            type="time"
                            name="startTime"
                            value={scheduleFormData.startTime}
                            onChange={handleScheduleChange}
                            className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">結束時間</label>
                          <input
                            type="time"
                            name="endTime"
                            value={scheduleFormData.endTime}
                            onChange={handleScheduleChange}
                            className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 標籤 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    標籤
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleFormData(prev => ({ ...prev, tag: 'red' }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        scheduleFormData.tag === 'red'
                          ? 'bg-red-500 text-white ring-2 ring-red-300'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      重要/節假日
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFormData(prev => ({ ...prev, tag: 'green' }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        scheduleFormData.tag === 'green'
                          ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      活動
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFormData(prev => ({ ...prev, tag: 'blue' }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        scheduleFormData.tag === 'blue'
                          ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      工作/項目
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFormData(prev => ({ ...prev, tag: 'yellow' }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        scheduleFormData.tag === 'yellow'
                          ? 'bg-yellow-400 text-black ring-2 ring-yellow-300'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      出差
                    </button>
                  </div>
                </div>

                {/* 參與人員 */}
                <div className="relative" ref={participantDropdownRef}>
                  <label className="block text-gray-300 text-sm mb-2">
                    參與人員
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="participants"
                      value={scheduleFormData.participants}
                      onChange={handleParticipantInput}
                      onFocus={() => {
                        // 點到參與人員時，自動捲到此區塊（你希望跳到照片那邊的位置）
                        setShowParticipantDropdown(true)
                        requestAnimationFrame(() => {
                          try {
                            participantDropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          } catch (_) {}
                        })
                      }}
                      placeholder="請輸入參與人員（多個用逗號分隔）"
                      className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    />
                    {showParticipantDropdown && participantOptions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {(() => {
                          const leaveSet = buildLeaveNameSetForDate(scheduleFormData.date)
                          const selected = new Set(splitCsv(scheduleFormData.participants))
                          const all = Array.isArray(participantOptions) ? participantOptions : []
                          return (
                            <>
                              <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/40 sticky top-0 z-10">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <button
                                    type="button"
                                    onClick={() => selectAllParticipants(leaveSet)}
                                    className="text-xs px-3 py-1 rounded-full border bg-gray-800 border-gray-600 text-gray-200 hover:border-yellow-400 hover:text-yellow-200"
                                    title="一次選取所有參與人員（自動排除請假）"
                                  >
                                    全選（排除請假）
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLeaveParticipants(leaveSet)}
                                    className="text-xs px-3 py-1 rounded-full border bg-gray-800 border-gray-600 text-gray-200 hover:border-yellow-400 hover:text-yellow-200"
                                    title="把已選名單中的請假人員移除"
                                  >
                                    排除請假
                                  </button>
                                  <button
                                    type="button"
                                    onClick={clearParticipants}
                                    className="text-xs px-3 py-1 rounded-full border bg-gray-800 border-gray-600 text-gray-200 hover:border-yellow-400 hover:text-yellow-200"
                                  >
                                    清空
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowParticipantDropdown(false)}
                                    className="text-xs px-3 py-1 rounded-full border bg-yellow-500/20 border-yellow-400 text-yellow-200 hover:bg-yellow-500/30"
                                  >
                                    完成
                                  </button>
                                </div>
                                {leaveSet.size > 0 && (
                                  <div className="text-[11px] text-gray-400 mt-2">
                                    請假人員已自動排除（可在清單中看到「請假」標記）
                                  </div>
                                )}
                              </div>
                              {all.map((option) => {
                                const name = String(option || '').trim()
                                if (!name) return null
                                const onLeave = leaveSet.has(name)
                                const isSelected = selected.has(name)
                                return (
                                  <div
                                    key={name}
                                    onClick={() => toggleParticipant(name, leaveSet)}
                                    className={`px-4 py-2 text-sm flex items-center justify-between gap-2 ${
                                      onLeave
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'cursor-pointer hover:bg-gray-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => toggleParticipant(name, leaveSet)}
                                        disabled={onLeave}
                                        className="w-4 h-4 accent-yellow-400"
                                      />
                                      <span className="text-white truncate">{name}</span>
                                      {onLeave && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-teal-600/20 border-teal-500/40 text-teal-200">
                                          請假
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                  {scheduleFormData.participants && (
                    <button
                      type="button"
                      onClick={handleAddParticipant}
                      className="mt-2 text-xs text-yellow-400 hover:text-yellow-300"
                    >
                      + 將此參與人員加入選單
                    </button>
                  )}
                </div>

                {/* 車輛 */}
                <div className="relative" ref={vehicleDropdownRef}>
                  <label className="block text-gray-300 text-sm mb-2">
                    車輛
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="vehicle"
                      value={scheduleFormData.vehicle}
                      onChange={handleVehicleInput}
                      onFocus={() => setShowVehicleDropdown(true)}
                      placeholder="請輸入車輛資訊"
                      className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    />
                    {showVehicleDropdown && vehicleOptions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {vehicleOptions.map((option, index) => (
                          <div
                            key={index}
                            onClick={() => handleVehicleSelect(option)}
                            className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm"
                          >
                            {option}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {scheduleFormData.vehicle && (
                    <button
                      type="button"
                      onClick={handleAddVehicle}
                      className="mt-2 text-xs text-yellow-400 hover:text-yellow-300"
                    >
                      + 將此車輛加入選單
                    </button>
                  )}
                </div>

                {/* 出發駕駛 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">出發駕駛</label>
                  <select
                    name="departureDriver"
                    value={scheduleFormData.departureDriver}
                    onChange={handleScheduleChange}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">請選擇</option>
                    {responsiblePersonOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* 回程駕駛 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">回程駕駛</label>
                  <select
                    name="returnDriver"
                    value={scheduleFormData.returnDriver}
                    onChange={handleScheduleChange}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">請選擇</option>
                    {responsiblePersonOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* 出發里程 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    出發里程
                  </label>
                  <input
                    type="number"
                    name="departureMileage"
                    value={scheduleFormData.departureMileage}
                    onChange={handleScheduleChange}
                    placeholder="請輸入出發里程"
                    className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    min="0"
                    step="0.1"
                  />
                </div>

                {/* 回程里程 */}
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    回程里程
                  </label>
                  <input
                    type="number"
                    name="returnMileage"
                    value={scheduleFormData.returnMileage}
                    onChange={handleScheduleChange}
                    placeholder="請輸入回程里程"
                    className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    min="0"
                    step="0.1"
                  />
                </div>

                {/* 是否加油 */}
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="needRefuel"
                      checked={scheduleFormData.needRefuel}
                      onChange={handleScheduleChange}
                      className="w-5 h-5 text-yellow-400 bg-gray-700 border-gray-500 rounded focus:ring-yellow-400"
                    />
                    <span className="text-gray-300 text-sm">是否加油</span>
                  </label>
                </div>

                {/* 油資 */}
                {scheduleFormData.needRefuel && (
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      油資
                    </label>
                    <input
                      type="number"
                      name="fuelCost"
                      value={scheduleFormData.fuelCost}
                      onChange={handleScheduleChange}
                      placeholder="請輸入油資金額"
                      className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}

                {/* 發票是否繳回 */}
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="invoiceReturned"
                      checked={scheduleFormData.invoiceReturned}
                      onChange={handleScheduleChange}
                      className="w-5 h-5 text-yellow-400 bg-gray-700 border-gray-500 rounded focus:ring-yellow-400"
                    />
                    <span className="text-gray-300 text-sm">發票是否繳回</span>
                  </label>
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
                  {scheduleFormData.workItems.map((item, index) => (
                    <div key={item.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-yellow-400 font-semibold text-sm">工作項目 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkItem(item.id)}
                          className="text-red-400 hover:text-red-500 text-sm"
                        >
                          刪除
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-300 text-xs mb-1">工作內容 *</label>
                          <input
                            type="text"
                            value={item.workContent}
                            onChange={(e) => handleWorkItemChange(index, 'workContent', e.target.value)}
                            placeholder="請輸入工作內容"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            required
                          />
                        </div>
                        <div 
                          className="relative"
                          ref={(el) => {
                            if (el) {
                              responsiblePersonDropdownRefs.current[item.id] = el
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-gray-300 text-xs">負責人 *</label>
                            <label className="flex items-center gap-1 text-xs text-gray-300 select-none">
                              <input
                                type="checkbox"
                                checked={!!item.isCollaborative}
                                onChange={(e) => {
                                  const on = e.target.checked
                                  if (!on) {
                                    const it = normalizeWorkItem(item)
                                    const first = (getWorkItemCollaborators(it)[0]?.name) || ''
                                    const firstTarget = getWorkItemCollaborators(it)[0]?.targetQuantity ?? ''
                                    const firstActual = getWorkItemCollaborators(it)[0]?.actualQuantity ?? ''
                                    handleWorkItemChange(index, 'isCollaborative', false)
                                    handleWorkItemChange(index, 'responsiblePerson', first)
                                    handleWorkItemChange(index, 'targetQuantity', firstTarget)
                                    handleWorkItemChange(index, 'actualQuantity', firstActual)
                                    handleWorkItemChange(index, 'collaborators', [])
                                  } else {
                                    const rp = String(item.responsiblePerson || '').trim()
                                    const tq = item.targetQuantity ?? ''
                                    const aq = item.actualQuantity ?? ''
                                    handleWorkItemChange(index, 'isCollaborative', true)
                                    handleWorkItemChange(index, 'collabMode', 'shared')
                                    handleWorkItemChange(index, 'sharedActualQuantity', '')
                                    handleWorkItemChange(index, 'collaborators', rp ? [{ name: rp, targetQuantity: tq, actualQuantity: aq }] : [])
                                  }
                                }}
                                className="w-4 h-4 accent-yellow-400"
                              />
                              <span>協作</span>
                            </label>
                          </div>
                          <div className="relative">
                            {item.isCollaborative ? (
                              <>
                                <div className="mb-2">
                                  <label className="block text-gray-300 text-xs mb-1">協作計算方式</label>
                                  <select
                                    value={getWorkItemCollabMode(item)}
                                    onChange={(e) => {
                                      const nextMode = e.target.value
                                      handleWorkItemChange(index, 'collabMode', nextMode)
                                      if (nextMode === 'shared') {
                                        const it = normalizeWorkItem(item)
                                        const existing = String(it.sharedActualQuantity ?? '').trim()
                                        if (!existing) {
                                          const fallback = getWorkItemSharedActual(it) || getWorkItemTotalActual(it)
                                          if (fallback > 0) handleWorkItemChange(index, 'sharedActualQuantity', String(fallback))
                                        }
                                      }
                                    }}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                                  >
                                    <option value="shared">一起完成（算總數）</option>
                                    <option value="separate">分開完成（各自算）</option>
                                  </select>
                                </div>
                                <input
                                  type="text"
                                  value={toCollaboratorsCsv(item)}
                                  onChange={(e) => {
                                    const next = parseCollaboratorsCsv(e.target.value)
                                    const prev = getWorkItemCollaborators(item)
                                    const prevTarget = new Map(prev.map((c) => [String(c.name).trim(), c.targetQuantity]))
                                    const prevActual = new Map(prev.map((c) => [String(c.name).trim(), c.actualQuantity]))
                                    const merged = next.map((c) => ({
                                      ...c,
                                      targetQuantity: prevTarget.get(String(c.name).trim()) ?? '',
                                      actualQuantity: prevActual.get(String(c.name).trim()) ?? ''
                                    }))
                                    handleWorkItemChange(index, 'collaborators', merged)
                                  }}
                                  placeholder="輸入協作負責人（可逗號分隔/可手打）"
                                  className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                  required
                                />
                                {responsiblePersonOptions.length > 0 && (
                                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-24 overflow-y-auto w-full max-w-full min-w-0 overflow-x-hidden pr-1">
                                    {responsiblePersonOptions.map((opt) => {
                                      const selected = (getWorkItemCollaborators(item) || []).some((c) => String(c?.name || '').trim() === String(opt || '').trim())
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          title={opt}
                                          onClick={() => {
                                            const prev = getWorkItemCollaborators(item)
                                            const name = String(opt || '').trim()
                                            if (!name) return
                                            const next = selected
                                              ? prev.filter((c) => String(c?.name || '').trim() !== name)
                                              : [...prev, { name, targetQuantity: '', actualQuantity: '' }]
                                            handleWorkItemChange(index, 'collaborators', next)
                                          }}
                                          className={`w-full text-[11px] leading-tight px-2 py-1 rounded border transition-colors truncate ${
                                            selected
                                              ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                              : 'bg-gray-700 border-gray-600 text-gray-200 hover:border-yellow-400 hover:text-yellow-200'
                                          }`}
                                        >
                                          {opt}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <input
                                type="text"
                                value={item.responsiblePerson || ''}
                                onChange={(e) => handleResponsiblePersonInput(item.id, e.target.value)}
                                onFocus={() => setShowResponsiblePersonDropdown(prev => ({ ...prev, [item.id]: true }))}
                                placeholder="請輸入負責人"
                                className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                required
                              />
                            )}
                            {!item.isCollaborative && showResponsiblePersonDropdown[item.id] && responsiblePersonOptions.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {responsiblePersonOptions.map((option, optIndex) => (
                                  <div
                                    key={optIndex}
                                    onClick={() => handleResponsiblePersonSelect(item.id, option)}
                                    className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm"
                                  >
                                    {option}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {!item.isCollaborative && item.responsiblePerson && (
                            <button
                              type="button"
                              onClick={() => handleAddResponsiblePerson(item.id)}
                              className="mt-1 text-xs text-yellow-400 hover:text-yellow-300"
                            >
                              + 將此負責人加入選單
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="block text-gray-300 text-xs mb-1">目標數量</label>
                          {item.isCollaborative ? (
                            getWorkItemCollabMode(item) === 'shared' ? (
                              <input
                                type="number"
                                value={item.targetQuantity ?? ''}
                                onChange={(e) => handleWorkItemChange(index, 'targetQuantity', e.target.value)}
                                placeholder="共同目標"
                                className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                min="0"
                                step="0.01"
                              />
                            ) : (
                              <div className="text-gray-300 text-xs leading-relaxed">
                                分開完成：請在下方為每位負責人填寫自己的目標。
                              </div>
                            )
                          ) : (
                            <input
                              type="number"
                              value={item.targetQuantity}
                              onChange={(e) => handleWorkItemChange(index, 'targetQuantity', e.target.value)}
                              placeholder="請輸入目標數量"
                              className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                              min="0"
                              step="0.01"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-gray-300 text-xs mb-1">實際達成數量</label>
                          {item.isCollaborative ? (
                            getWorkItemCollabMode(item) === 'shared' ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="text-gray-200 text-xs w-24 truncate" title="共同實際">共同實際</div>
                                  <input
                                    type="number"
                                    value={item.sharedActualQuantity ?? ''}
                                    onChange={(e) => handleWorkItemChange(index, 'sharedActualQuantity', e.target.value)}
                                    placeholder="共同實際"
                                    className="flex-1 bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                    min="0"
                                    step="0.01"
                                  />
                                </div>
                                <div className="text-gray-300 text-xs">
                                  共同完成：協作人員不需各自填寫實際；績效會一起達成/一起扣分。
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(getWorkItemCollaborators(item) || []).length === 0 ? (
                                  <div className="text-gray-300 text-xs">尚未選擇協作負責人</div>
                                ) : (
                                  getWorkItemCollaborators(item).map((c) => (
                                    <div key={c.name} className="w-full min-w-0">
                                      <div className="text-gray-200 text-xs truncate mb-1" title={c.name}>{c.name}</div>
                                      <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                                        <input
                                          type="number"
                                          value={c.targetQuantity ?? ''}
                                          onChange={(e) => {
                                            const prev = getWorkItemCollaborators(item)
                                            const next = prev.map((x) => (String(x.name).trim() === String(c.name).trim()
                                              ? { ...x, targetQuantity: e.target.value }
                                              : x
                                            ))
                                            handleWorkItemChange(index, 'collaborators', next)
                                          }}
                                          placeholder="目標"
                                          className="w-full min-w-0 bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-[12px]"
                                          min="0"
                                          step="0.01"
                                        />
                                        <input
                                          type="number"
                                          value={c.actualQuantity ?? ''}
                                          onChange={(e) => {
                                            const prev = getWorkItemCollaborators(item)
                                            const next = prev.map((x) => (String(x.name).trim() === String(c.name).trim()
                                              ? { ...x, actualQuantity: e.target.value }
                                              : x
                                            ))
                                            handleWorkItemChange(index, 'collaborators', next)
                                          }}
                                          placeholder="實際"
                                          className="w-full min-w-0 bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-[12px]"
                                          min="0"
                                          step="0.01"
                                        />
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )
                          ) : (
                            <input
                              type="number"
                              value={item.actualQuantity}
                              onChange={(e) => handleWorkItemChange(index, 'actualQuantity', e.target.value)}
                              placeholder="請輸入實際達成數量"
                              className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                              min="0"
                              step="0.01"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {scheduleFormData.workItems.length === 0 && (
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
                  新增
                </button>
                <button
                  type="button"
                  onClick={handleScheduleCancel}
                  className="flex-1 bg-gray-700 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  返回
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加事件模态框 */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-charcoal border border-purple-500 rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">新增活動</h3>
              <button
                onClick={() => {
                  setShowEventModal(false)
                  setSelectedDate(null)
                  setSelectedDateForSchedule(null)
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              {/* 事件名稱 */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">事件名稱 *</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="請輸入事件名稱"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              {/* 全天开关 */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-white">全天</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvent.allDay}
                    onChange={(e) => setNewEvent({ ...newEvent, allDay: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
              </div>

              {/* 开始日期和时间 */}
              <div className="flex items-center justify-between py-2 border-t border-gray-700">
                <div className="flex items-center space-x-3 flex-1">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-white text-sm">
                      {newEvent.startDate ? (() => {
                        const date = new Date(newEvent.startDate)
                        const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
                        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`
                      })() : '選擇開始日期'}
                    </div>
                  </div>
                </div>
                {!newEvent.allDay && (
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                  />
                )}
              </div>
              {newEvent.allDay ? (
                <input
                  type="date"
                  value={newEvent.startDate}
                  onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value, endDate: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                />
              ) : (
                <input
                  type="date"
                  value={newEvent.startDate}
                  onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                />
              )}

              {/* 结束日期和时间 */}
              {!newEvent.allDay && (
                <>
                  <div className="flex items-center justify-between py-2 border-t border-gray-700">
                    <div className="flex items-center space-x-3 flex-1">
                      <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                      </svg>
                      <div className="flex-1">
                        <div className="text-white text-sm">
                          {newEvent.endDate ? (() => {
                            const date = new Date(newEvent.endDate)
                            const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
                            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`
                          })() : '選擇結束日期'}
                        </div>
                      </div>
                    </div>
                    <input
                      type="time"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm"
                    />
                  </div>
                  <input
                    type="date"
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                </>
              )}

              {/* 儲存為交流區 */}
              <div className="flex items-center justify-between py-2 border-t border-gray-700">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span className="text-white">儲存為交流區</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvent.saveAsMemo}
                    onChange={(e) => setNewEvent({ ...newEvent, saveAsMemo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
              </div>

              {/* 公司活動 */}
              <div className="flex items-center justify-between py-2 border-t border-gray-700 cursor-pointer">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="text-white">公司活動</span>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* 參與人員 */}
              <div className="flex items-center justify-between py-2 border-t border-gray-700 cursor-pointer">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-white">參與人員</span>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* 新增排程按钮 */}
              <div className="pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={handleShowScheduleForm}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  + 新增排程
                </button>
              </div>

              {/* 保存按钮 */}
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-purple-500 text-white font-semibold py-2 rounded-lg hover:bg-purple-600 transition-colors"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEventModal(false)
                    setSelectedDate(null)
                    setSelectedDateForSchedule(null)
                  }}
                  className="flex-1 bg-gray-700 text-white font-semibold py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default Calendar
