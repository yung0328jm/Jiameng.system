import { useState, useEffect, useRef } from 'react'
import { getEventsByDate, saveEvent, deleteEvent, getEvents } from '../utils/calendarStorage'
import { getSchedules, saveSchedule, updateSchedule, deleteSchedule, getLastReturnMileageByVehicle } from '../utils/scheduleStorage'
import { deleteSchedulesByLeaveApplicationId } from '../utils/scheduleStorage'
import { getDropdownOptionsByCategory, addDropdownOption, getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getLeaderboardItems, getManualRankings, addManualRanking, updateManualRanking, saveManualRankings } from '../utils/leaderboardStorage'
import { getTripReportsBySchedule, addTripReport, actionTypes as tripReportActionTypes } from '../utils/tripReportStorage'
import { getNameEffectStyle, getDecorationForNameEffect, getUserTitle, getTitleBadgeStyle } from '../utils/nameEffectUtils'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getUsers } from '../utils/storage'
import { getProjects } from '../utils/projectStorage'
import { getLeaveApplications } from '../utils/leaveApplicationStorage'
import { deleteLeaveApplication } from '../utils/leaveApplicationStorage'
import { getOvertimeApplicationsByScheduleId, getPendingOvertimeApplications, addOvertimeApplication, updateOvertimeApplicationStatus, deleteOvertimeApplication } from '../utils/overtimeApplicationStorage.js'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  normalizeWorkItem,
  getWorkItemCollaborators,
  getWorkItemCollabMode,
  getWorkItemSharedActual,
  getWorkItemTotalActual,
  getWorkItemActualForNameForPerformance,
  parseCollaboratorsCsv,
  toCollaboratorsCsv,
  expandWorkItemsToLogical
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
  const [tripReportsRevision, setTripReportsRevision] = useState(0) // 行程回報點擊後重讀列表
  const [tripReportFlashAt, setTripReportFlashAt] = useState(0) // 行程回報按鈕火焰閃光觸發時間
  const [exportingPdf, setExportingPdf] = useState(false) // 匯出 PDF 中，避免重複點擊與無反應
  const detailCardRef = useRef(null) // 詳情彈窗卡片，供匯出 PDF 使用
  const [selectedDetailSegmentIndex, setSelectedDetailSegmentIndex] = useState(0) // 排程詳情內切換案場（多處行程）的索引
  const [editingFormSegmentIndex, setEditingFormSegmentIndex] = useState(0) // 表單內編輯多處行程時，目前編輯的案場索引
  const [editingScheduleId, setEditingScheduleId] = useState(null) // 正在编辑的排程ID
  const [selectedDateForSchedule, setSelectedDateForSchedule] = useState(null)
  const [expandedSchedules, setExpandedSchedules] = useState({}) // 展开的排程ID
  const [expandedWorkItems, setExpandedWorkItems] = useState({}) // 展开的工作项目
  const [originalWorkItemIdMap, setOriginalWorkItemIdMap] = useState({}) // 編輯既有排程時：原本就存在的 workItem.id
  const [changeAction, setChangeAction] = useState({ open: false, scheduleId: '', itemId: '' })
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
    proposedCollaborators: [], // [{ name, targetQuantity }]
    proposedContentRows: [] // 多列工作內容（申請改為）[{ id, workContent, targetQuantity, actualQuantity }]
  })
  const [vehicleReturnMileageChangeReq, setVehicleReturnMileageChangeReq] = useState({
    open: false,
    scheduleId: '',
    vehicle: '',
    currentReturnMileage: '',
    proposedReturnMileage: '',
    reason: ''
  })
  const [showOvertimeForm, setShowOvertimeForm] = useState(false) // 排程詳情內「加班申請」是否展開
  const [overtimeReviewRevision, setOvertimeReviewRevision] = useState(0) // 審核後重繪已送出的申請列表
  const [overtimePendingBannerOpen, setOvertimePendingBannerOpen] = useState(true) // 管理員：待審加班清單是否展開
  const [showCopyScheduleModal, setShowCopyScheduleModal] = useState(false)
  const [copyScheduleTarget, setCopyScheduleTarget] = useState(null) // 要複製的排程
  const [copyScheduleNewDate, setCopyScheduleNewDate] = useState('') // 複製後的新日期 YYYY-MM-DD
  const [overtimeFormData, setOvertimeFormData] = useState({
    applicant: '',
    date: '',
    startTime: '',
    endTime: '',
    overtimePersonnel: [] // 勾選的加班人員名稱陣列
  })
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
  const [siteSearchQuery, setSiteSearchQuery] = useState('') // 多案場勾選時的搜尋關鍵字
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false)
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false)
  const [newVehicleInput, setNewVehicleInput] = useState('') // 用於「新增車輛到選單」的輸入，不直接寫入 vehicle
  const [showSiteDropdown, setShowSiteDropdown] = useState(false)
  const [selectedSiteNamesForPicker, setSelectedSiteNamesForPicker] = useState([]) // 多案場勾選時暫存的已選案場（套用後寫入 siteName）
  const [showResponsiblePersonDropdown, setShowResponsiblePersonDropdown] = useState({}) // 每个工作项目的下拉選單状态
  const participantDropdownRef = useRef(null)
  const vehicleDropdownRef = useRef(null)
  const siteDropdownRef = useRef(null)
  const responsiblePersonDropdownRefs = useRef({})
  const scheduleModalBodyRef = useRef(null)
  const changeReqScrollYRef = useRef(0) // 異動申請 Modal 關閉時還原捲動用
  const originalVehicleReturnMileageLockedRef = useRef(new Set()) // 編輯排程時：已有回程里程的車牌（輸入後鎖定，需異動申請才能改）
  const editFormSyncedRef = useRef(false) // 編輯表單是否已從排程同步過（避免重複覆蓋）
  const emptyVehicleEntry = () => ({
    vehicle: '',
    departureDriver: '',
    returnDriver: '',
    departureMileage: '',
    returnMileage: '',
    needRefuel: false,
    fuelCost: '',
    invoiceReturned: false
  })
  const [scheduleFormData, setScheduleFormData] = useState({
    siteName: '',
    date: '',
    isAllDay: true, // 是否全天
    startTime: '', // 开始时间
    endTime: '', // 结束时间
    participants: '',
    vehicle: '',
    vehicleEntries: [], // 每台車一組：出發/回程駕駛、里程、加油、發票
    departureDriver: '',
    returnDriver: '',
    departureMileage: '',
    returnMileage: '',
    needRefuel: false,
    fuelCost: '',
    invoiceReturned: false,
    workItems: [],
    tag: 'blue', // 标签：red(重要/節假日), green(活動), blue(工作/項目), yellow(出差)
    progressSheet: false,  // 工進單（新增活動卡預設不勾；未勾選時該組所有人績效扣1分、活動框紅色閃爍）
    constructionPhotos: false // 施工照片（同上）
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const currentUser = getCurrentUser()
  const currentRole = getCurrentUserRole()
  const myDisplayNames = getDisplayNamesForAccount(currentUser || '') || []

  const canEditForName = (displayName) => {
    if (currentRole === 'admin') return true
    const n = String(displayName || '').trim()
    if (!n) return false
    return myDisplayNames.includes(n)
  }

  const displayCreator = (account) => {
    const acc = String(account || '').trim()
    if (!acc) return '—'
    const name = String(getDisplayNameForAccount(acc) || '').trim()
    return name || acc
  }

  const hasPendingChangeRequest = (schedule) => {
    if (!schedule) return false
    // 工作項目可能在 schedule.workItems（單案場）或 schedule.segments[].workItems（多案場），需彙總後再判斷
    const segments = Array.isArray(schedule.segments) && schedule.segments.length > 0 ? schedule.segments : null
    const items = segments
      ? segments.flatMap((seg) => Array.isArray(seg?.workItems) ? seg.workItems : [])
      : (Array.isArray(schedule.workItems) ? schedule.workItems : [])
    const workPending = items.some((wi) => String(wi?.changeRequest?.status || '') === 'pending')
    const vehicleReturnPending = (Array.isArray(schedule?.vehicleReturnMileageChangeRequests) ? schedule.vehicleReturnMileageChangeRequests : []).some((r) => String(r?.status || '') === 'pending')
    return workPending || vehicleReturnPending
  }

  // 行事曆規則：
  // - 新增排程（editingScheduleId === null）：可自由編輯預計欄位
  // - 編輯既有排程（editingScheduleId !== null）：僅「原本就存在的工作項目」視為已鎖定；新加的工作項目可編輯，保存後才會鎖
  const isPlannedLocked = (item) => {
    const it = normalizeWorkItem(item)
    const id = String(it?.id || item?.id || '').trim()
    if (!!it?.plannedLockedAt) return true
    if (!editingScheduleId) return false
    return !!originalWorkItemIdMap?.[id]
  }

  const openChangeActionModal = (scheduleId, item) => {
    const it = normalizeWorkItem(item)
    setChangeAction({
      open: true,
      scheduleId: String(scheduleId || ''),
      itemId: String(it?.id || '')
    })
  }

  const closeChangeActionModal = () => setChangeAction({ open: false, scheduleId: '', itemId: '' })

  const openVehicleReturnMileageChangeReq = (scheduleId, entry) => {
    setVehicleReturnMileageChangeReq({
      open: true,
      scheduleId: String(scheduleId || ''),
      vehicle: String(entry?.vehicle || '').trim(),
      currentReturnMileage: entry?.returnMileage ?? '',
      proposedReturnMileage: entry?.returnMileage ?? '',
      reason: ''
    })
  }
  const closeVehicleReturnMileageChangeReq = () => setVehicleReturnMileageChangeReq({ open: false, scheduleId: '', vehicle: '', currentReturnMileage: '', proposedReturnMileage: '', reason: '' })

  const submitVehicleReturnMileageChangeReq = () => {
    const sid = String(vehicleReturnMileageChangeReq.scheduleId || '').trim()
    const vehicle = String(vehicleReturnMileageChangeReq.vehicle || '').trim()
    const reason = String(vehicleReturnMileageChangeReq.reason || '').trim()
    const proposed = String(vehicleReturnMileageChangeReq.proposedReturnMileage ?? '').trim()
    if (!sid || !vehicle) return
    if (!reason) {
      alert('請填寫異動原因')
      return
    }
    const schedule = schedules.find((s) => String(s?.id) === sid)
    if (!schedule) return
    const existing = Array.isArray(schedule.vehicleReturnMileageChangeRequests) ? schedule.vehicleReturnMileageChangeRequests : []
    const alreadyPending = existing.some((r) => String(r?.vehicle || '').trim() === vehicle && String(r?.status || '') === 'pending')
    if (alreadyPending) {
      alert('此車輛已有回程里程異動申請待審中')
      return
    }
    const newRequest = {
      vehicle,
      proposedReturnMileage: proposed,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requestedBy: currentUser || ''
    }
    updateSchedule(sid, { ...getScheduleEditorInfo(), vehicleReturnMileageChangeRequests: [...existing, newRequest] })
    setSchedules(getSchedules())
    if (editingScheduleId === sid) {
      const updated = getSchedules().find((s) => String(s?.id) === sid)
      if (updated?.vehicleReturnMileageChangeRequests) {
        setScheduleFormData((prev) => ({ ...prev })) // 觸發重繪以顯示待審提示
      }
    }
    closeVehicleReturnMileageChangeReq()
  }

  const submitCancelRequest = (scheduleId, itemId) => {
    const sid = String(scheduleId || '')
    const wid = String(itemId || '')
    if (!sid || !wid) return

    const baseItems = (editingScheduleId === sid)
      ? (Array.isArray(scheduleFormData.workItems) ? scheduleFormData.workItems : [])
      : (Array.isArray((selectedDetailItem && selectedDetailType === 'schedule' && String(selectedDetailItem?.id) === sid) ? selectedDetailItem.workItems : null)
        ? selectedDetailItem.workItems
        : (schedules.find((s) => String(s?.id) === sid)?.workItems || []))

    const nextItems = baseItems.map((wi) => (String(wi?.id || '') === wid
      ? {
        ...wi,
        changeRequest: {
          kind: 'cancel',
          status: 'pending',
          reason: String(wi?.changeRequest?.reason || '').trim(),
          requestedAt: new Date().toISOString(),
          requestedBy: currentUser || ''
        }
      }
      : wi
    ))

    updateSchedule(sid, { ...getScheduleEditorInfo(), workItems: nextItems })
    setSchedules(getSchedules())
    if (editingScheduleId === sid) setScheduleFormData((prev) => ({ ...prev, workItems: nextItems }))
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === sid) {
      setSelectedDetailItem((prev) => ({ ...prev, workItems: nextItems }))
    }
  }

  const openChangeRequest = (scheduleId, item) => {
    const it = normalizeWorkItem(item)
    const collabs = getWorkItemCollaborators(it)
    const hasContentRows = Array.isArray(item?.contentRows) && item.contentRows.length > 0
    const proposedContentRows = hasContentRows
      ? item.contentRows.map((r, i) => ({
          id: r.id || `row-${Date.now()}-${i}`,
          workContent: r.workContent ?? '',
          targetQuantity: r.targetQuantity ?? '',
          actualQuantity: r.actualQuantity ?? ''
        }))
      : [{
          id: `row-${Date.now()}`,
          workContent: it.workContent || '',
          targetQuantity: it.targetQuantity ?? '',
          actualQuantity: it.actualQuantity ?? it.sharedActualQuantity ?? ''
        }]
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
      })),
      proposedContentRows
    })
  }

  const closeChangeRequest = () => {
    if (typeof document !== 'undefined' && document.activeElement?.blur) document.activeElement.blur()
    setChangeReq((p) => ({ ...p, open: false }))
  }

  useEffect(() => {
    if (!showDetailModal) setShowOvertimeForm(false)
  }, [showDetailModal])

  // 手機板：異動申請 Modal 開啟時鎖住背景捲動，關閉時還原，避免關閉後無法滑動
  useEffect(() => {
    if (!changeReq.open) return
    changeReqScrollYRef.current = window.scrollY ?? window.pageYOffset
    const body = document.body
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${changeReqScrollYRef.current}px`
    body.style.left = '0'
    body.style.right = '0'
    return () => {
      const y = changeReqScrollYRef.current
      body.style.overflow = ''
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      requestAnimationFrame(() => { window.scrollTo(0, y) })
    }
  }, [changeReq.open])

  const submitChangeRequest = () => {
    const scheduleId = String(changeReq.scheduleId || '')
    const itemId = String(changeReq.itemId || '')
    const reason = String(changeReq.reason || '').trim()
    if (!scheduleId || !itemId) return
    if (!reason) {
      alert('請填寫異動原因')
      return
    }

    const proposedContentRows = Array.isArray(changeReq.proposedContentRows) ? changeReq.proposedContentRows : []
    const firstRow = proposedContentRows[0]
    const proposed = {
      workContent: firstRow?.workContent ?? changeReq.proposedWorkContent,
      responsiblePerson: changeReq.proposedResponsiblePerson,
      isCollaborative: !!changeReq.proposedIsCollaborative,
      collabMode: changeReq.proposedCollabMode,
      targetQuantity: firstRow?.targetQuantity ?? changeReq.proposedTargetQuantity,
      collaborators: (Array.isArray(changeReq.proposedCollaborators) ? changeReq.proposedCollaborators : [])
        .map((c) => ({ name: String(c?.name || '').trim(), targetQuantity: c?.targetQuantity ?? '' }))
        .filter((c) => !!c.name),
      ...(proposedContentRows.length > 0 ? { contentRows: proposedContentRows } : {})
    }

    const schedule = (editingScheduleId === scheduleId)
      ? { ...scheduleFormData, id: scheduleId }
      : (selectedDetailItem && selectedDetailType === 'schedule' && String(selectedDetailItem?.id) === scheduleId)
        ? selectedDetailItem
        : schedules.find((s) => String(s?.id) === scheduleId)
    if (!schedule) {
      closeChangeRequest()
      return
    }

    const segs = Array.isArray(schedule?.segments) && schedule.segments.length > 0 ? schedule.segments : null
    let baseItems = []
    let segIndex = -1
    if (editingScheduleId === scheduleId && Array.isArray(scheduleFormData.workItems)) {
      baseItems = scheduleFormData.workItems
      if (segs) segIndex = editingFormSegmentIndex
    } else if (segs) {
      segIndex = segs.findIndex((seg) => (Array.isArray(seg?.workItems) ? seg.workItems : []).some((wi) => String(wi?.id || '') === itemId))
      if (segIndex >= 0) baseItems = Array.isArray(segs[segIndex]?.workItems) ? segs[segIndex].workItems : []
    } else {
      baseItems = Array.isArray(schedule?.workItems) ? schedule.workItems : []
    }

    const nextItems = baseItems.map((wi) => (String(wi?.id || '') === itemId
      ? {
        ...wi,
        changeRequest: {
          kind: 'change',
          status: 'pending',
          reason,
          proposed,
          requestedAt: new Date().toISOString(),
          requestedBy: currentUser || ''
        }
      }
      : wi
    ))

    if (segs && segIndex >= 0) {
      const updatedSegments = segs.map((seg, i) => (i === segIndex ? { ...seg, workItems: nextItems } : seg))
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), segments: updatedSegments })
    } else {
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), workItems: nextItems })
    }
    const allSchedules = getSchedules()
    setSchedules(allSchedules)
    const updated = allSchedules.find((s) => String(s?.id) === scheduleId)
    if (editingScheduleId === scheduleId && updated) {
      const nextFormItems = Array.isArray(updated?.segments) && updated.segments.length > 0
        ? ((updated.segments[editingFormSegmentIndex]?.workItems ?? updated.segments[0]?.workItems) || [])
        : (updated?.workItems || [])
      setScheduleFormData((prev) => ({ ...prev, workItems: nextFormItems }))
    }
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === scheduleId && updated) {
      setSelectedDetailItem(updated)
    }
    closeChangeRequest()
    alert('異動申請已送出，待管理員審核。')
  }

  const approveChangeRequest = (scheduleId, item) => {
    if (currentRole !== 'admin') return
    const it = normalizeWorkItem(item)
    const cr = it?.changeRequest
    if (cr?.status !== 'pending') return
    const kind = String(cr?.kind || cr?.type || 'change').trim() || 'change'
    const p = cr?.proposed
    const schedule = schedules.find((s) => String(s?.id) === String(scheduleId))
    const isViewingThisSchedule = selectedDetailItem && selectedDetailType === 'schedule' && String(selectedDetailItem?.id) === String(scheduleId)
    const segments = schedule ? (Array.isArray(schedule.segments) && schedule.segments.length > 0 ? schedule.segments : null) : null
    const baseItems = (() => {
      if (isViewingThisSchedule && segments) {
        const seg = segments[selectedDetailSegmentIndex] || segments[0]
        return Array.isArray(seg?.workItems) ? seg.workItems : []
      }
      if (isViewingThisSchedule && selectedDetailItem) {
        const segs = getScheduleSegments(selectedDetailItem)
        const seg = segs[selectedDetailSegmentIndex] || segs[0]
        return Array.isArray(seg?.workItems) ? seg.workItems : (Array.isArray(selectedDetailItem.workItems) ? selectedDetailItem.workItems : [])
      }
      return Array.isArray(schedule?.workItems) ? schedule.workItems : []
    })()
    const nextItems = (Array.isArray(baseItems) ? baseItems : []).map((wi) => {
      if (String(wi?.id || '') !== String(it?.id || '')) return wi
      if (kind === 'cancel') {
        return {
          ...wi,
          changeRequest: {
            ...cr,
            kind: 'cancel',
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: currentUser || ''
          }
        }
      }
      if (!p) return wi
      const firstContentRow = Array.isArray(p.contentRows) && p.contentRows.length > 0 ? p.contentRows[0] : null
      return {
        ...wi,
        workContent: firstContentRow?.workContent ?? p.workContent,
        responsiblePerson: p.responsiblePerson,
        isCollaborative: !!p.isCollaborative,
        collabMode: p.collabMode,
        targetQuantity: firstContentRow?.targetQuantity ?? p.targetQuantity,
        sharedActualQuantity: firstContentRow?.actualQuantity ?? wi.sharedActualQuantity,
        actualQuantity: firstContentRow?.actualQuantity ?? wi.actualQuantity,
        collaborators: p.collaborators,
        contentRows: Array.isArray(p.contentRows) && p.contentRows.length > 0 ? p.contentRows : undefined,
        changeRequest: {
          ...cr,
          kind: 'change',
          status: 'approved',
          reviewedAt: new Date().toISOString(),
          reviewedBy: currentUser || ''
        }
      }
    })
    // 取消申請核准後：自動刪除該工作項目
    const segIndex = isViewingThisSchedule ? selectedDetailSegmentIndex : 0
    if (segments && segments.length > 0) {
      const updatedSegments = segments.map((seg, i) =>
        i === segIndex ? { ...seg, workItems: nextItems } : seg
      )
      if (kind === 'cancel') {
        updateSchedule(scheduleId, { ...getScheduleEditorInfo(), segments: updatedSegments, __deleteWorkItemIds: [String(it?.id || '')] })
      } else {
        updateSchedule(scheduleId, { ...getScheduleEditorInfo(), segments: updatedSegments })
      }
    } else {
      if (kind === 'cancel') {
        updateSchedule(scheduleId, { ...getScheduleEditorInfo(), workItems: nextItems, __deleteWorkItemIds: [String(it?.id || '')] })
      } else {
        updateSchedule(scheduleId, { ...getScheduleEditorInfo(), workItems: nextItems })
      }
    }
    const allSchedules = getSchedules()
    setSchedules(allSchedules)
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === String(scheduleId)) {
      const updated = allSchedules.find((s) => String(s?.id) === String(scheduleId))
      if (updated) setSelectedDetailItem(updated)
    }
  }

  const rejectChangeRequest = (scheduleId, item) => {
    if (currentRole !== 'admin') return
    const it = normalizeWorkItem(item)
    const cr = it?.changeRequest
    if (cr?.status !== 'pending') return
    const kind = String(cr?.kind || cr?.type || 'change').trim() || 'change'
    const schedule = schedules.find((s) => String(s?.id) === String(scheduleId))
    const isViewingThisSchedule = selectedDetailItem && selectedDetailType === 'schedule' && String(selectedDetailItem?.id) === String(scheduleId)
    const segments = schedule ? (Array.isArray(schedule.segments) && schedule.segments.length > 0 ? schedule.segments : null) : null
    const baseItems = (() => {
      if (isViewingThisSchedule && segments) {
        const seg = segments[selectedDetailSegmentIndex] || segments[0]
        return Array.isArray(seg?.workItems) ? seg.workItems : []
      }
      if (isViewingThisSchedule && selectedDetailItem) {
        const segs = getScheduleSegments(selectedDetailItem)
        const seg = segs[selectedDetailSegmentIndex] || segs[0]
        return Array.isArray(seg?.workItems) ? seg.workItems : (Array.isArray(selectedDetailItem.workItems) ? selectedDetailItem.workItems : [])
      }
      return Array.isArray(schedule?.workItems) ? schedule.workItems : []
    })()
    const nextItems = (Array.isArray(baseItems) ? baseItems : []).map((wi) => {
      if (String(wi?.id || '') !== String(it?.id || '')) return wi
      return {
        ...wi,
        changeRequest: {
          ...cr,
          kind,
          status: 'rejected',
          reviewedAt: new Date().toISOString(),
          reviewedBy: currentUser || ''
        }
      }
    })
    const segIndex = isViewingThisSchedule ? selectedDetailSegmentIndex : 0
    if (segments && segments.length > 0) {
      const updatedSegments = segments.map((seg, i) =>
        i === segIndex ? { ...seg, workItems: nextItems } : seg
      )
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), segments: updatedSegments })
    } else {
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), workItems: nextItems })
    }
    const allSchedulesReject = getSchedules()
    setSchedules(allSchedulesReject)
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === String(scheduleId)) {
      const updated = allSchedulesReject.find((s) => String(s?.id) === String(scheduleId))
      if (updated) setSelectedDetailItem(updated)
    }
  }

  const approveVehicleReturnMileageChangeRequest = (scheduleId, request) => {
    if (currentRole !== 'admin') return
    if (String(request?.status || '') !== 'pending') return
    const schedule = schedules.find((s) => String(s?.id) === String(scheduleId))
    if (!schedule) return
    const vehicle = String(request?.vehicle || '').trim()
    const proposed = String(request?.proposedReturnMileage ?? '').trim()
    const nextRequests = (Array.isArray(schedule.vehicleReturnMileageChangeRequests) ? schedule.vehicleReturnMileageChangeRequests : []).filter(
      (r) => !(String(r?.vehicle || '').trim() === vehicle && String(r?.status || '') === 'pending' && r?.requestedAt === request?.requestedAt)
    )
    const segs = Array.isArray(schedule.segments) && schedule.segments.length > 0 ? schedule.segments : null
    if (segs) {
      const editorBy = getCurrentUser()
      const editorAt = new Date().toISOString()
      const nextSegments = segs.map((seg) => ({
        ...seg,
        vehicleEntries: (Array.isArray(seg.vehicleEntries) ? seg.vehicleEntries : []).map((e) =>
          String(e?.vehicle || '').trim() === vehicle ? { ...e, returnMileage: proposed, returnMileageBy: editorBy, returnMileageAt: editorAt } : e
        )
      }))
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), segments: nextSegments, vehicleReturnMileageChangeRequests: nextRequests })
    } else {
      const entries = Array.isArray(schedule.vehicleEntries) ? [...schedule.vehicleEntries] : []
      const editorBy = getCurrentUser()
      const editorAt = new Date().toISOString()
      const nextEntries = entries.map((e) => (String(e?.vehicle || '').trim() === vehicle ? { ...e, returnMileage: proposed, returnMileageBy: editorBy, returnMileageAt: editorAt } : e))
      updateSchedule(scheduleId, { ...getScheduleEditorInfo(), vehicleEntries: nextEntries, vehicleReturnMileageChangeRequests: nextRequests })
    }
    const allSchedulesVehicle = getSchedules()
    setSchedules(allSchedulesVehicle)
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === String(scheduleId)) {
      const updated = allSchedulesVehicle.find((s) => String(s?.id) === String(scheduleId))
      if (updated) setSelectedDetailItem(updated)
    }
  }

  const rejectVehicleReturnMileageChangeRequest = (scheduleId, request) => {
    if (currentRole !== 'admin') return
    if (String(request?.status || '') !== 'pending') return
    const schedule = schedules.find((s) => String(s?.id) === String(scheduleId))
    if (!schedule) return
    const vehicle = String(request?.vehicle || '').trim()
    const nextRequests = (Array.isArray(schedule.vehicleReturnMileageChangeRequests) ? schedule.vehicleReturnMileageChangeRequests : []).map((r) =>
      String(r?.vehicle || '').trim() === vehicle && r?.requestedAt === request?.requestedAt
        ? { ...r, status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: currentUser || '' }
        : r
    )
    updateSchedule(scheduleId, { ...getScheduleEditorInfo(), vehicleReturnMileageChangeRequests: nextRequests })
    const allSchedulesRejectVehicle = getSchedules()
    setSchedules(allSchedulesRejectVehicle)
    if (selectedDetailType === 'schedule' && selectedDetailItem && String(selectedDetailItem?.id) === String(scheduleId)) {
      const updated = allSchedulesRejectVehicle.find((s) => String(s?.id) === String(scheduleId))
      if (updated) setSelectedDetailItem(updated)
    }
  }

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
  useRealtimeKeys(['jiameng_leave_applications'], refetchForRealtime)
  useRealtimeKeys(['jiameng_overtime_applications'], () => setOvertimeReviewRevision((r) => r + 1))
  useRealtimeKeys(['jiameng_trip_reports'], () => setTripReportsRevision((r) => r + 1))

  // 編輯表單開啟時：從排程列表同步表單資料（避免點編輯後表單空白）
  useEffect(() => {
    if (!showScheduleForm || !editingScheduleId) {
      if (!showScheduleForm) editFormSyncedRef.current = false
      return
    }
    if (editFormSyncedRef.current) return
    const schedule = schedules.find((s) => String(s?.id) === String(editingScheduleId))
    if (!schedule || isLeaveScheduleItem(schedule)) return
    editFormSyncedRef.current = true
    const segs = getScheduleSegments(schedule)
    const first = segs[0] || {}
    const entries = Array.isArray(first.vehicleEntries) && first.vehicleEntries.length > 0
      ? first.vehicleEntries.map((e) => ({ ...emptyVehicleEntry(), ...e, vehicle: e.vehicle || '' }))
      : (() => {
          const vehicleStr = schedule.vehicle || ''
          return vehicleStr.split(',').map((s) => s.trim()).filter(Boolean).map((v) => ({
            ...emptyVehicleEntry(),
            vehicle: v,
            departureDriver: schedule.departureDriver || '',
            returnDriver: schedule.returnDriver || '',
            departureMileage: schedule.departureMileage || '',
            returnMileage: schedule.returnMileage || '',
            needRefuel: schedule.needRefuel || false,
            fuelCost: schedule.fuelCost || '',
            invoiceReturned: schedule.invoiceReturned || false
          }))
        })()
    setScheduleFormData({
      siteName: schedule.siteName || '',
      date: schedule.date || '',
      isAllDay: schedule.isAllDay !== undefined ? schedule.isAllDay : true,
      startTime: schedule.startTime || '',
      endTime: schedule.endTime || '',
      participants: schedule.participants || '',
      vehicle: schedule.vehicle || '',
      vehicleEntries: entries,
      departureDriver: schedule.departureDriver || '',
      returnDriver: schedule.returnDriver || '',
      departureMileage: schedule.departureMileage || '',
      returnMileage: schedule.returnMileage || '',
      needRefuel: schedule.needRefuel || false,
      fuelCost: schedule.fuelCost || '',
      invoiceReturned: schedule.invoiceReturned || false,
      workItems: first.workItems || schedule.workItems || [],
      segments: segs.length > 0 ? segs : undefined,
      createdBy: schedule.createdBy || '',
      createdAt: schedule.createdAt || '',
      tag: schedule.tag || 'blue',
      progressSheet: schedule.progressSheet === true,
      constructionPhotos: schedule.constructionPhotos === true
    })
    setEditingFormSegmentIndex(0)
    const baseIds = {}
    ;(Array.isArray(first.workItems) ? first.workItems : (Array.isArray(schedule.workItems) ? schedule.workItems : [])).forEach((wi) => {
      const id = String(wi?.id || '').trim()
      if (id) baseIds[id] = true
    })
    setOriginalWorkItemIdMap(baseIds)
    const vehiclesWithReturnMileage = new Set(
      (Array.isArray(first.vehicleEntries) ? first.vehicleEntries : [])
        .filter((e) => e?.returnMileage != null && String(e.returnMileage).trim() !== '')
        .map((e) => String(e.vehicle || '').trim())
        .filter(Boolean)
    )
    originalVehicleReturnMileageLockedRef.current = vehiclesWithReturnMileage
  }, [showScheduleForm, editingScheduleId, schedules])

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

  const scrollModalToRef = (ref, { offsetTop = 12 } = {}) => {
    const container = scheduleModalBodyRef.current
    const target = ref?.current
    if (!container || !target) return

    // 只捲動彈窗本體（避免 web 版把整個頁面捲到底）
    const cRect = container.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    const desired = container.scrollTop + (tRect.top - cRect.top) - offsetTop
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const nextTop = Math.max(0, Math.min(desired, maxTop))

    // 若已在可視範圍就不動，避免「跳太遠」
    const visibleTop = cRect.top + offsetTop
    const visibleBottom = cRect.bottom - 12
    const isVisible = tRect.top >= visibleTop && tRect.bottom <= visibleBottom
    if (isVisible) return

    container.scrollTo({ top: nextTop, behavior: 'smooth' })
  }

  // 处理參與人員选择
  const splitCsv = (csv) => (String(csv || '').split(',').map((v) => String(v || '').trim()).filter(Boolean))

  // 以「當日請假排程」為準：只排除當天行事曆上仍有請假卡的人員；管理員刪除請假卡後該人員即恢復可勾選
  const buildLeaveNameSetForDate = (ymd) => {
    const date = String(ymd || '').slice(0, 10)
    const set = new Set()
    if (!date) return set
    const allSchedules = getSchedules()
    const leaveSchedulesOnDate = (Array.isArray(allSchedules) ? allSchedules : []).filter(
      (s) => String(s?.date || '').slice(0, 10) === date && isLeaveScheduleItem(s)
    )
    leaveSchedulesOnDate.forEach((s) => {
      const info = getLeaveInfoForSchedule(s)
      const person = String(info?.person || '').trim()
      if (person) set.add(person)
      const leaveId = String(s?.leaveApplicationId || '').trim()
      const apps = Array.isArray(getLeaveApplications()) ? getLeaveApplications() : []
      const app = leaveId ? apps.find((r) => String(r?.id || '').trim() === leaveId) : null
      const acc = String(app?.userId || '').trim()
      if (acc) {
        try { const dn = getDisplayNameForAccount(acc); if (dn && String(dn).trim()) set.add(String(dn).trim()) } catch (_) {}
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

  // 已選車輛（從字串解析，供勾選用）
  const selectedVehicleList = (scheduleFormData.vehicle || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // 勾選/取消車輛（可多選，例如案場兩台車）；同步 vehicleEntries 每台車一組駕駛/里程
  const handleVehicleCheckToggle = (option) => {
    const nextList = selectedVehicleList.includes(option)
      ? selectedVehicleList.filter((v) => v !== option)
      : [...selectedVehicleList, option]
    const prevEntries = Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []
    const nextEntries = nextList.map((v) => {
      const existing = prevEntries.find((e) => String(e?.vehicle || '').trim() === v)
      return existing ? { ...emptyVehicleEntry(), ...existing, vehicle: v } : { ...emptyVehicleEntry(), vehicle: v }
    })
    setScheduleFormData((prev) => ({ ...prev, vehicle: nextList.join(', '), vehicleEntries: nextEntries }))
  }

  // 處理車輛選擇（下拉單選，保留以相容既有邏輯；若需多選請用勾選）
  const handleVehicleSelect = (value) => {
    const next = selectedVehicleList.includes(value)
      ? selectedVehicleList.filter((v) => v !== value)
      : [...selectedVehicleList, value]
    setScheduleFormData((prev) => ({ ...prev, vehicle: next.join(', ') }))
    setShowVehicleDropdown(false)
  }

  // 处理參與人員输入
  const handleParticipantInput = (e) => {
    const value = e.target.value
    setScheduleFormData(prev => ({ ...prev, participants: value }))
  }

  // 處理「新增車輛到選單」的輸入（不直接寫入排程 vehicle）
  const handleNewVehicleInput = (e) => {
    setNewVehicleInput(e.target.value)
  }

  // 解析活動名稱為案場陣列（支援 、，, 與空白分隔）
  const parseSiteNameToArray = (name) => {
    if (!name || typeof name !== 'string') return []
    return name.split(/[,、，\s]+/).map((s) => s.trim()).filter(Boolean)
  }

  // 開啟多案場勾選：從目前 siteName 帶入已選
  const openSitePicker = () => {
    setSelectedSiteNamesForPicker(parseSiteNameToArray(scheduleFormData.siteName))
    setSiteSearchQuery('')
    setShowSiteDropdown(true)
  }

  // 多案場勾選：切換單一案場
  const toggleSiteInPicker = (siteName) => {
    const s = String(siteName || '').trim()
    if (!s) return
    setSelectedSiteNamesForPicker((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s)
      return [...prev, s]
    })
  }

  // 套用多案場 → 寫入排程活動名稱；若多處案場則建立 segments（每案場一張卡片）
  const applySitePicker = () => {
    const names = selectedSiteNamesForPicker
    const name = names.length > 0 ? names.join('、') : ''
    setScheduleFormData((prev) => {
      if (names.length > 1) {
        const existingSegments = Array.isArray(prev.segments) ? prev.segments : []
        const bySite = new Map(existingSegments.map((s) => [String(s?.siteName || '').trim(), s]))
        const segments = names.map((siteName) => {
          const existing = bySite.get(siteName)
          return existing
            ? { siteName, workItems: existing.workItems || [], vehicleEntries: existing.vehicleEntries || [] }
            : { siteName, workItems: [], vehicleEntries: [] }
        })
        return { ...prev, siteName: name, segments }
      }
      if (names.length === 1) {
        return {
          ...prev,
          siteName: name,
          segments: [{ siteName: name, workItems: prev.workItems || [], vehicleEntries: prev.vehicleEntries || [] }]
        }
      }
      return { ...prev, siteName: name, segments: [] }
    })
    setShowSiteDropdown(false)
  }

  // 保留：手動輸入活動（單一或逗號分隔）時仍可編輯
  const handleSiteInput = (e) => {
    setScheduleFormData(prev => ({ ...prev, siteName: e.target.value }))
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

  // 添加新的車輛到選單，並可選擇是否同時勾選；同步 vehicleEntries
  const handleAddVehicle = () => {
    const value = newVehicleInput.trim()
    if (!value) return
    const added = !vehicleOptions.includes(value)
    if (added) {
      addDropdownOption(value, 'vehicles')
      loadDropdownOptions()
    }
    const nextList = selectedVehicleList.includes(value) ? selectedVehicleList : [...selectedVehicleList, value]
    const prevEntries = Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []
    const nextEntries = nextList.map((v) => {
      const existing = prevEntries.find((e) => String(e?.vehicle || '').trim() === v)
      return existing ? { ...emptyVehicleEntry(), ...existing, vehicle: v } : { ...emptyVehicleEntry(), vehicle: v }
    })
    setScheduleFormData((prev) => ({ ...prev, vehicle: nextList.join(', '), vehicleEntries: nextEntries }))
    setNewVehicleInput('')
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
        vehicleEntries: [],
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
      setNewVehicleInput('')
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
        vehicleEntries: [],
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: []
      })
      setNewVehicleInput('')
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

  /** 將排程正規化為「依案場分段」陣列，供詳情 modal 切換案場與依案場顯示工作項目／車輛。有 segments 用 segments，否則單一 segment。 */
  const getScheduleSegments = (schedule) => {
    if (!schedule) return []
    const segs = Array.isArray(schedule.segments) ? schedule.segments : null
    if (segs && segs.length > 0) {
      return segs.map((s) => ({
        siteName: String(s?.siteName ?? '').trim(),
        workItems: Array.isArray(s?.workItems) ? s.workItems : [],
        vehicleEntries: Array.isArray(s?.vehicleEntries) ? s.vehicleEntries : []
      }))
    }
    const siteName = String(schedule.siteName ?? '').trim()
    const workItems = Array.isArray(schedule.workItems) ? schedule.workItems : []
    const vehicleEntries = Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0
      ? schedule.vehicleEntries
      : (() => {
          const v = String(schedule.vehicle ?? '').trim()
          if (!v) return []
          return v.split(',').map((s) => s.trim()).filter(Boolean).map((vehicle) => ({
            vehicle,
            departureDriver: schedule.departureDriver || '',
            returnDriver: schedule.returnDriver || '',
            departureMileage: schedule.departureMileage || '',
            returnMileage: schedule.returnMileage || '',
            needRefuel: schedule.needRefuel || false,
            fuelCost: schedule.fuelCost || '',
            invoiceReturned: schedule.invoiceReturned || false
          }))
        })()
    return [{ siteName, workItems, vehicleEntries }]
  }

  const handleScheduleClick = (e, schedule) => {
    e.stopPropagation()
    setSelectedDetailItem(schedule)
    setSelectedDetailType('schedule')
    setSelectedDetailSegmentIndex(0)
    setShowDetailModal(true)
  }

  const isLeaveScheduleItem = (schedule) => {
    const tag = String(schedule?.tag || '').trim()
    const siteName = String(schedule?.siteName || '').trim()
    // 兼容不同資料來源：tag=leave 或 siteName 以「請假」開頭（例如：請假 - account - 事假）
    return tag === 'leave' || /^請假(\s|[-—])/u.test(siteName) || siteName === '請假'
  }

  /** 月曆上該排程列：凡有此排程之加班申請（同一 scheduleId）即顯示，不依賴申請單「申請日期」是否等於排程日（避免預設成今天導致不顯示） */
  const getOvertimeStatusLabelForCell = (schedule, cellDateStr) => {
    if (!schedule || isLeaveScheduleItem(schedule)) return ''
    const sid = String(schedule?.id || '').trim()
    const cell = String(cellDateStr || '').trim().replace(/\//g, '-')
    const norm = (d) => String(d || '').trim().replace(/\//g, '-')
    if (!sid || !cell) return ''
    // 排程只會出現在 schedule.date 那一格；僅在該格顯示（防資料異常時誤顯於他日）
    if (norm(schedule?.date) !== cell) return ''
    const list = getOvertimeApplicationsByScheduleId(sid)
    if (list.length === 0) return ''
    const hasPending = list.some((oa) => String(oa?.status || 'pending').trim() === 'pending')
    if (hasPending) return '加班待審核'
    if (list.some((oa) => String(oa?.status || '').trim() === 'approved')) return '當日有加班'
    return ''
  }

  const parseLeaveSiteName = (siteName) => {
    const s = String(siteName || '').trim()
    const m = s.match(/^請假\s*(?:-|—)\s*(.+?)(?:\s*(?:-|—)\s*(.+))?$/u)
    return {
      personRaw: String(m?.[1] || '').trim(),
      typeRaw: String(m?.[2] || '').trim()
    }
  }

  const resolveDisplayName = (raw) => {
    const t = String(raw || '').trim()
    if (!t) return ''
    try {
      const dn = getDisplayNameForAccount(t)
      if (dn && String(dn).trim() && String(dn).trim() !== t) return String(dn).trim()
    } catch (_) {}
    try {
      const aliases = (getDisplayNamesForAccount(t) || []).map((x) => String(x || '').trim()).filter(Boolean)
      if (aliases.length > 0) return aliases[0]
    } catch (_) {}
    return t
  }

  const getLeaveInfoForSchedule = (schedule) => {
    const leaveId = String(schedule?.leaveApplicationId || '').trim()
    const apps = Array.isArray(getLeaveApplications()) ? getLeaveApplications() : []
    const app = leaveId ? apps.find((r) => String(r?.id || '').trim() === leaveId) : null
    const parsed = parseLeaveSiteName(schedule?.siteName)
    const acc = String(app?.userId || '').trim()
    const appName = String(app?.userName || '').trim()
    const person = resolveDisplayName(acc) || resolveDisplayName(appName) || resolveDisplayName(parsed.personRaw) || appName || parsed.personRaw || acc || '—'
    const leaveType = String(app?.reason || '').trim() || parsed.typeRaw || ''
    return { person, leaveType }
  }

  const getScheduleDisplayTitle = (schedule) => {
    if (isLeaveScheduleItem(schedule)) {
      const info = getLeaveInfoForSchedule(schedule)
      const type = info.leaveType ? ` - ${info.leaveType}` : ''
      return `請假 - ${info.person}${type}`
    }
    return String(schedule?.siteName || '').trim()
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

  /** 每次更新排程時帶入，供「最後編輯者」顯示 */
  const getScheduleEditorInfo = () => ({ lastEditedBy: getCurrentUser(), lastEditedAt: new Date().toISOString() })

  /** 比較欄位新舊值是否相同 */
  const fieldEq = (a, b) => {
    if (a === b) return true
    if (a == null && (b === '' || b == null)) return true
    if (b == null && (a === '' || a == null)) return true
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b
    return String(a).trim() === String(b).trim()
  }

  /** 為車輛欄位每一列寫入「誰在何時編輯」；僅「有變更」的欄位才寫入本次編輯者，未變更欄位保留原本的 *_By / *_At */
  const addVehicleEntryEditorInfo = (entry, prevEntry) => {
    const by = getCurrentUser()
    const at = new Date().toISOString()
    const prev = prevEntry || {}
    const next = { ...entry }
    if (entry.departureDriver != null && String(entry.departureDriver).trim() !== '') {
      if (!fieldEq(entry.departureDriver, prev.departureDriver)) { next.departureDriverBy = by; next.departureDriverAt = at }
      else if (prev.departureDriverBy != null || prev.departureDriverAt != null) { next.departureDriverBy = prev.departureDriverBy; next.departureDriverAt = prev.departureDriverAt }
    }
    if (entry.returnDriver != null && String(entry.returnDriver).trim() !== '') {
      if (!fieldEq(entry.returnDriver, prev.returnDriver)) { next.returnDriverBy = by; next.returnDriverAt = at }
      else if (prev.returnDriverBy != null || prev.returnDriverAt != null) { next.returnDriverBy = prev.returnDriverBy; next.returnDriverAt = prev.returnDriverAt }
    }
    if (entry.departureMileage != null && String(entry.departureMileage).trim() !== '') {
      if (!fieldEq(entry.departureMileage, prev.departureMileage)) { next.departureMileageBy = by; next.departureMileageAt = at }
      else if (prev.departureMileageBy != null || prev.departureMileageAt != null) { next.departureMileageBy = prev.departureMileageBy; next.departureMileageAt = prev.departureMileageAt }
    }
    if (entry.returnMileage != null && String(entry.returnMileage).trim() !== '') {
      if (!fieldEq(entry.returnMileage, prev.returnMileage)) { next.returnMileageBy = by; next.returnMileageAt = at }
      else if (prev.returnMileageBy != null || prev.returnMileageAt != null) { next.returnMileageBy = prev.returnMileageBy; next.returnMileageAt = prev.returnMileageAt }
    }
    if (typeof entry.needRefuel === 'boolean') {
      if (!fieldEq(entry.needRefuel, prev.needRefuel)) { next.needRefuelBy = by; next.needRefuelAt = at }
      else if (prev.needRefuelBy != null || prev.needRefuelAt != null) { next.needRefuelBy = prev.needRefuelBy; next.needRefuelAt = prev.needRefuelAt }
    }
    if (entry.fuelCost != null && String(entry.fuelCost).trim() !== '') {
      if (!fieldEq(entry.fuelCost, prev.fuelCost)) { next.fuelCostBy = by; next.fuelCostAt = at }
      else if (prev.fuelCostBy != null || prev.fuelCostAt != null) { next.fuelCostBy = prev.fuelCostBy; next.fuelCostAt = prev.fuelCostAt }
    }
    if (typeof entry.invoiceReturned === 'boolean') {
      if (!fieldEq(entry.invoiceReturned, prev.invoiceReturned)) { next.invoiceReturnedBy = by; next.invoiceReturnedAt = at }
      else if (prev.invoiceReturnedBy != null || prev.invoiceReturnedAt != null) { next.invoiceReturnedBy = prev.invoiceReturnedBy; next.invoiceReturnedAt = prev.invoiceReturnedAt }
    }
    return next
  }

  const renderFieldEditor = (by, at) => {
    if (!by && !at) return null
    return <span className="text-gray-400 text-xs ml-1">（{getDisplayNameForAccount(by) || by || '—'}{at ? ` ${new Date(at).toLocaleString('zh-TW')}` : ''}）</span>
  }

  const handleEditSchedule = () => {
    if (selectedDetailItem && selectedDetailType === 'schedule') {
      if (isLeaveScheduleItem(selectedDetailItem)) {
        alert('請假排程為自動帶入紀錄，無需編輯。')
        return
      }
      // 由 useEffect（編輯表單開啟時）從 schedules 同步表單資料，避免表單空白
      editFormSyncedRef.current = false
      setShowDetailModal(false)
      setShowScheduleForm(true)
      setEditingScheduleId(selectedDetailItem.id)
    }
  }

  const handleDeleteSchedule = () => {
    if (selectedDetailItem && selectedDetailType === 'schedule') {
      // 一般排程：只有管理員可刪除
      if (!isLeaveScheduleItem(selectedDetailItem)) {
        const role = getCurrentUserRole()
        if (role !== 'admin') {
          alert('只有管理員可以刪除工程排程。')
          return
        }
      }
      if (isLeaveScheduleItem(selectedDetailItem)) {
        const role = getCurrentUserRole()
        if (role !== 'admin') {
          alert('請假排程為自動帶入紀錄，只有管理員可以刪除。')
          return
        }
        const leaveId = String(selectedDetailItem?.leaveApplicationId || '').trim()
        const msg = leaveId
          ? '確定要刪除此「請假」紀錄嗎？\n（將同時刪除這筆請假申請與所有請假排程天數）'
          : '確定要刪除此「請假」排程嗎？'
        if (!window.confirm(msg)) return

        if (leaveId) {
          // 1) 刪除所有由該 leaveApplicationId 產生的請假排程
          deleteSchedulesByLeaveApplicationId(leaveId)
          // 2) 刪除請假申請
          deleteLeaveApplication(leaveId)
        } else {
          // fallback：只刪單天排程，一併刪除該排程的加班申請
          const scheduleId = selectedDetailItem.id
          getOvertimeApplicationsByScheduleId(scheduleId).forEach((oa) => deleteOvertimeApplication(oa.id))
          deleteSchedule(scheduleId)
        }
        const allSchedules = getSchedules()
        setSchedules(allSchedules)
        setShowDetailModal(false)
        setSelectedDetailItem(null)
        setSelectedDetailType(null)
        return
      }
      if (window.confirm('確定要刪除此工程排程嗎？')) {
        const scheduleId = selectedDetailItem.id
        // 一併刪除該排程的所有加班申請，讓「加班時數明細」同步消失
        getOvertimeApplicationsByScheduleId(scheduleId).forEach((oa) => deleteOvertimeApplication(oa.id))
        const result = deleteSchedule(scheduleId)
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

  /** 複製排程：產生新 id、指定新日期，並清除當日專屬欄位（施工照片、里程異動申請）；工作項目與 contentRows 重新產生 id */
  const duplicateScheduleWithNewDate = (source, newDate) => {
    const newId = `schedule-${Date.now()}`
    const lockAt = new Date().toISOString()
    const idBase = Date.now()
    const cloneWorkItems = (items) => {
      if (!Array.isArray(items)) return items
      return items.map((wi, idx) => {
        const id = wi?.id ? `wi-${idBase}-${idx}` : wi?.id
        const next = { ...wi, id }
        if (Array.isArray(wi.contentRows) && wi.contentRows.length > 0) {
          next.contentRows = wi.contentRows.map((row, ri) => ({
            ...row,
            id: row?.id ? `row-${idBase}-${idx}-${ri}` : undefined
          }))
        }
        return next
      })
    }
    const cloneSegment = (seg) => ({
      ...seg,
      workItems: cloneWorkItems(seg?.workItems),
      vehicleEntries: Array.isArray(seg?.vehicleEntries) ? seg.vehicleEntries.map((e) => ({ ...e })) : seg?.vehicleEntries
    })
    const segs = Array.isArray(source.segments) && source.segments.length > 0 ? source.segments : null
    const base = {
      ...source,
      id: newId,
      date: newDate,
      createdAt: lockAt,
      constructionPhotos: false,
      vehicleReturnMileageChangeRequests: [],
      leaveApplicationId: undefined
    }
    if (segs) {
      base.segments = segs.map(cloneSegment)
    } else {
      base.workItems = cloneWorkItems(source.workItems || [])
      base.vehicleEntries = Array.isArray(source.vehicleEntries) ? source.vehicleEntries.map((e) => ({ ...e })) : source.vehicleEntries
    }
    return base
  }

  const handleConfirmCopySchedule = () => {
    const target = copyScheduleTarget
    const newDate = String(copyScheduleNewDate || '').trim()
    if (!target || !newDate) {
      alert('請選擇新日期')
      return
    }
    if (isLeaveScheduleItem(target)) {
      alert('請假排程不支援複製')
      return
    }
    const copy = duplicateScheduleWithNewDate(target, newDate)
    const result = saveSchedule(copy)
    if (result.success) {
      setSchedules(getSchedules())
      setShowCopyScheduleModal(false)
      setCopyScheduleTarget(null)
      setCopyScheduleNewDate('')
      setShowDetailModal(false)
      setSelectedDetailItem(null)
      setSelectedDetailType(null)
      alert('已複製排程至新日期')
    } else {
      alert(result.message || '複製失敗')
    }
  }

  const escapeHtml = (s) => {
    const div = document.createElement('div')
    div.textContent = s ?? ''
    return div.innerHTML
  }

  /** 卡片樣式（PDF/列印一致）：淺灰底、圓角、留白；word-break 避免 PDF 擷圖時右側裁切 */
  const cardStyle = 'margin-bottom:14px;padding:12px 14px;background:#f0f0f0;border-radius:8px;border:1px solid #e0e0e0;max-width:100%;word-break:break-word;overflow-wrap:break-word;'
  /** 工作項目卡片：與畫面上同款，僅縮小卡片間距讓一頁可排 3 格（PDF 每頁 3 格分頁） */
  const workItemCardStyle = 'margin-bottom:6px;padding:10px 12px;background:#f0f0f0;border-radius:8px;border:1px solid #e0e0e0;max-width:100%;word-break:break-word;overflow-wrap:break-word;'
  const cardTitleStyle = 'margin:0 0 8px 0;font-size:15px;font-weight:bold;word-break:break-word;'
  const cardLineStyle = 'margin:4px 0;font-size:13px;word-break:break-word;overflow-wrap:break-word;'

  /** 與列印相同的內容。options: { workItemFrom, workItemTo, continuation } 用於 PDF 分頁（第一頁 3 格，第二頁起每頁 6 格） */
  const getDetailPrintBody = (item, segmentIndex, options) => {
    const title = getScheduleDisplayTitle(item)
    const dateStr = item.date ? String(item.date).replace(/-/g, '/') : '—'
    const timeStr = item.isAllDay === false
      ? `${item.startTime || ''}${(item.startTime && item.endTime) ? ' - ' : ''}${item.endTime || ''}`
      : '全天'
    const segments = getScheduleSegments(item)
    const idx = segmentIndex !== undefined ? segmentIndex : selectedDetailSegmentIndex
    const seg = segments[idx] || segments[0]
    const activityName = seg?.siteName ? String(seg.siteName).trim() : ''
    const showActivitySubtitle = segmentIndex !== undefined && segments.length > 1 && activityName
    const workItemRange = options?.workItemFrom != null && options?.workItemTo != null ? { from: options.workItemFrom, to: options.workItemTo } : null
    const continuation = !!options?.continuation

    if (continuation && workItemRange) {
      const segs = getScheduleSegments(item)
      const idx = segmentIndex !== undefined ? segmentIndex : selectedDetailSegmentIndex
      const seg = segs[idx] || segs[0]
      const workItems = Array.isArray(seg?.workItems) ? seg.workItems : []
      const expanded = expandWorkItemsToLogical(workItems)
      const slice = expanded.slice(workItemRange.from, workItemRange.to)
      let out = `<div style="max-width:100%;word-break:break-word;overflow-wrap:break-word;">`
      out += '<h3 style="margin:0 0 8px 0;font-size:1rem;">預排工作項目 (續)</h3>'
      slice.forEach((wi) => {
        const it = normalizeWorkItem(wi)
        const isCollab = !!it?.isCollaborative
        const collabs = getWorkItemCollaborators(it)
        const mode = isCollab ? getWorkItemCollabMode(it) : 'separate'
        const workTitle = wi.workContent || wi.content || '工作項目'
        const hasContentRows = Array.isArray(wi.contentRows) && wi.contentRows.length > 0
        out += `<div style="${workItemCardStyle}">`
        out += `<p style="${cardTitleStyle}">・ ${escapeHtml(workTitle)}</p>`
        if (hasContentRows) {
          if (isCollab) out += `<p style="${cardLineStyle}"><strong>協作:</strong> ${escapeHtml(collabs.map((c) => c.name).join(', ') || '—')}</p>`
          else out += `<p style="${cardLineStyle}"><strong>負責人:</strong> ${escapeHtml(wi.responsiblePerson || '—')}</p>`
          wi.contentRows.forEach((row) => {
            const tw = row.targetQuantity != null && row.targetQuantity !== '' ? row.targetQuantity : '—'
            const aw = row.actualQuantity != null && row.actualQuantity !== '' ? row.actualQuantity : '—'
            out += `<p style="margin:2px 0 2px 12px;font-size:13px;">・ ${escapeHtml(row.workContent || '未填')} — 目標 ${escapeHtml(String(tw))} / 實際 ${escapeHtml(String(aw))}</p>`
          })
        } else {
          if (isCollab) out += `<p style="${cardLineStyle}"><strong>協作:</strong> ${escapeHtml(collabs.map((c) => c.name).join(', ') || '—')}</p>`
          else if (it?.responsiblePerson) out += `<p style="${cardLineStyle}"><strong>負責人:</strong> ${escapeHtml(it.responsiblePerson)}</p>`
        }
        out += `<p style="${cardLineStyle}">建立者: ${escapeHtml(displayCreator(it?.createdBy))}</p>`
        if (!hasContentRows) {
          const t = parseFloat(it?.targetQuantity) || 0
          const a = parseFloat(it?.actualQuantity) || 0
          const sharedA = getWorkItemSharedActual(it)
          if (isCollab && mode === 'shared' && (t > 0 || sharedA > 0)) {
            out += `<p style="${cardLineStyle}">共同: 目標 ${t > 0 ? t : 'N/A'} / 實際 ${sharedA > 0 ? sharedA : 'N/A'}</p>`
          } else if (isCollab && mode === 'separate' && collabs.length > 0) {
            collabs.forEach((c) => {
              const cn = String(c?.name || '').trim() || '—'
              const ct = parseFloat(c?.targetQuantity) || 0
              const ca = parseFloat(c?.actualQuantity) || 0
              const cr = ct > 0 ? ((ca / ct) * 100).toFixed(1) : ''
              out += `<p style="margin:2px 0;font-size:13px;">- ${escapeHtml(cn)}：目標 ${ct || 'N/A'} / 實際 ${ca || 'N/A'}${cr ? `（${cr}%）` : ''}</p>`
            })
          } else if (!isCollab && (t > 0 || a > 0)) {
            out += `<p style="${cardLineStyle}">共同: 目標 ${t > 0 ? t : 'N/A'} / 實際 ${a > 0 ? a : 'N/A'}</p>`
          }
        }
        out += '</div>'
      })
      out += '</div>'
      return out
    }

    let body = `<div style="max-width:100%;word-break:break-word;overflow-wrap:break-word;">`
    body += `<h1 style="font-size:1.35rem;margin:0 0 6px 0;">工程排程詳情</h1>`
    body += `<p style="font-size:1.05rem;font-weight:600;margin:0 0 10px 0;">${escapeHtml(title)}</p>`
    if (showActivitySubtitle) body += `<p style="font-size:1rem;font-weight:600;margin:0 0 8px 0;color:#333;">活動：${escapeHtml(activityName)}</p>`
    body += `<p style="margin:4px 0;"><strong>日期:</strong> ${escapeHtml(dateStr)} ${timeStr}</p>`
    body += `<p style="margin:4px 0;"><strong>建立者:</strong> ${escapeHtml(displayCreator(item.createdBy))}</p>`
    if (item.participants) body += `<p style="margin:4px 0;"><strong>參與人員:</strong> ${escapeHtml(item.participants)}</p>`
    if (seg) {
      const entries = Array.isArray(seg.vehicleEntries) ? seg.vehicleEntries : []
      const vehicleLabel = entries.length > 0 ? entries.map((e) => e.vehicle).filter(Boolean).join(', ') : item.vehicle
      if (vehicleLabel) body += `<p style="margin:4px 0;"><strong>車輛:</strong> ${escapeHtml(vehicleLabel)}</p>`
      if (entries.length > 0) {
        entries.forEach((entry, idx) => {
          const dep = parseFloat(entry.departureMileage) || 0
          const ret = parseFloat(entry.returnMileage) || 0
          const segmentKm = dep > 0 || ret > 0 ? Math.max(0, ret - dep) : null
          body += `<div style="${cardStyle}">`
          body += `<p style="${cardTitleStyle}">車輛 ${idx + 1} : ${escapeHtml(entry.vehicle || '—')}</p>`
          if (entry.departureDriver) body += `<p style="${cardLineStyle}">出發駕駛: ${escapeHtml(entry.departureDriver)}</p>`
          if (entry.returnDriver) body += `<p style="${cardLineStyle}">回程駕駛: ${escapeHtml(entry.returnDriver)}</p>`
          if (entry.departureMileage) body += `<p style="${cardLineStyle}">出發里程: ${escapeHtml(entry.departureMileage)} km</p>`
          if (entry.returnMileage) body += `<p style="${cardLineStyle}">回程里程: ${escapeHtml(entry.returnMileage)} km</p>`
          if (segmentKm != null) body += `<p style="${cardLineStyle}">本段里程: ${segmentKm} km</p>`
          body += `<p style="${cardLineStyle}">是否加油: ${entry.needRefuel ? '是' : '否'}</p>`
          if (entry.fuelCost) body += `<p style="${cardLineStyle}">油資: NT$ ${parseFloat(entry.fuelCost).toLocaleString()}</p>`
          body += `<p style="${cardLineStyle}">發票是否繳回: ${entry.invoiceReturned ? '是' : '否'}</p>`
          body += '</div>'
        })
      } else {
        if (item.departureDriver || item.returnDriver || item.departureMileage || item.returnMileage || item.needRefuel || item.fuelCost) {
          body += `<div style="${cardStyle}">`
          body += `<p style="${cardTitleStyle}">車輛</p>`
          if (item.departureDriver) body += `<p style="${cardLineStyle}">出發駕駛: ${escapeHtml(item.departureDriver)}</p>`
          if (item.returnDriver) body += `<p style="${cardLineStyle}">回程駕駛: ${escapeHtml(item.returnDriver)}</p>`
          if (item.departureMileage) body += `<p style="${cardLineStyle}">出發里程: ${escapeHtml(item.departureMileage)} km</p>`
          if (item.returnMileage) body += `<p style="${cardLineStyle}">回程里程: ${escapeHtml(item.returnMileage)} km</p>`
          body += `<p style="${cardLineStyle}">是否加油: ${item.needRefuel ? '是' : '否'}</p>`
          if (item.fuelCost) body += `<p style="${cardLineStyle}">油資: NT$ ${parseFloat(item.fuelCost).toLocaleString()}</p>`
          body += '</div>'
        }
      }
      const overtimeList = getOvertimeApplicationsByScheduleId(item.id)
      if (overtimeList.length > 0) {
        body += '<h3 style="margin:16px 0 8px 0;font-size:1rem;">加班申請</h3>'
        overtimeList.forEach((oa) => {
          const status = (oa.status || 'pending').trim()
          const statusText = status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核'
          const timeRange = oa.startTime && oa.endTime ? ` ${oa.startTime}～${oa.endTime}` : ''
          const hoursStr = oa.hours != null && oa.hours !== '' ? `（${oa.hours}小時）` : ''
          const personnelStr = oa.overtimePersonnel && oa.overtimePersonnel.length > 0 ? ` | 加班人員: ${oa.overtimePersonnel.join(', ')}` : ''
          body += `<p style="margin:4px 0;"><strong>申請人:</strong> ${escapeHtml(oa.applicant || '—')} | ${escapeHtml(oa.date || '—')}${timeRange}${hoursStr}${personnelStr} | <strong>${statusText}</strong></p>`
        })
      }
      const workItems = Array.isArray(seg.workItems) ? seg.workItems : []
      if (workItems.length > 0) {
        body += '<h3 style="margin:16px 0 8px 0;font-size:1rem;">預排工作項目</h3>'
        const expanded = expandWorkItemsToLogical(workItems)
        const from = workItemRange ? workItemRange.from : 0
        const to = workItemRange ? workItemRange.to : expanded.length
        const slice = expanded.slice(from, to)
        slice.forEach((wi) => {
          const it = normalizeWorkItem(wi)
          const isCollab = !!it?.isCollaborative
          const collabs = getWorkItemCollaborators(it)
          const mode = isCollab ? getWorkItemCollabMode(it) : 'separate'
          const workTitle = wi.workContent || wi.content || '工作項目'
          const hasContentRows = Array.isArray(wi.contentRows) && wi.contentRows.length > 0
          body += `<div style="${workItemCardStyle}">`
          body += `<p style="${cardTitleStyle}">・ ${escapeHtml(workTitle)}</p>`
          if (hasContentRows) {
            if (isCollab) body += `<p style="${cardLineStyle}"><strong>協作:</strong> ${escapeHtml(collabs.map((c) => c.name).join(', ') || '—')}</p>`
            else body += `<p style="${cardLineStyle}"><strong>負責人:</strong> ${escapeHtml(wi.responsiblePerson || '—')}</p>`
            wi.contentRows.forEach((row) => {
              const tw = row.targetQuantity != null && row.targetQuantity !== '' ? row.targetQuantity : '—'
              const aw = row.actualQuantity != null && row.actualQuantity !== '' ? row.actualQuantity : '—'
              body += `<p style="margin:2px 0 2px 12px;font-size:13px;">・ ${escapeHtml(row.workContent || '未填')} — 目標 ${escapeHtml(String(tw))} / 實際 ${escapeHtml(String(aw))}</p>`
            })
          } else {
            if (isCollab) body += `<p style="${cardLineStyle}"><strong>協作:</strong> ${escapeHtml(collabs.map((c) => c.name).join(', ') || '—')}</p>`
            else if (it?.responsiblePerson) body += `<p style="${cardLineStyle}"><strong>負責人:</strong> ${escapeHtml(it.responsiblePerson)}</p>`
          }
          body += `<p style="${cardLineStyle}">建立者: ${escapeHtml(displayCreator(it?.createdBy))}</p>`
          if (!hasContentRows) {
            const t = parseFloat(it?.targetQuantity) || 0
            const a = parseFloat(it?.actualQuantity) || 0
            const sharedA = getWorkItemSharedActual(it)
            if (isCollab && mode === 'shared' && (t > 0 || sharedA > 0)) {
              body += `<p style="${cardLineStyle}">共同: 目標 ${t > 0 ? t : 'N/A'} / 實際 ${sharedA > 0 ? sharedA : 'N/A'}</p>`
            } else if (isCollab && mode === 'separate' && collabs.length > 0) {
              collabs.forEach((c) => {
                const cn = String(c?.name || '').trim() || '—'
                const ct = parseFloat(c?.targetQuantity) || 0
                const ca = parseFloat(c?.actualQuantity) || 0
                const cr = ct > 0 ? ((ca / ct) * 100).toFixed(1) : ''
                body += `<p style="margin:2px 0;font-size:13px;">- ${escapeHtml(cn)}：目標 ${ct || 'N/A'} / 實際 ${ca || 'N/A'}${cr ? `（${cr}%）` : ''}</p>`
              })
            } else if (!isCollab && (t > 0 || a > 0)) {
              body += `<p style="${cardLineStyle}">共同: 目標 ${t > 0 ? t : 'N/A'} / 實際 ${a > 0 ? a : 'N/A'}</p>`
            }
          }
          body += '</div>'
        })
      }
    }
    body += '</div>'
    return body
  }

  const handleExportDetailPdf = async () => {
    if (selectedDetailType !== 'schedule' || !selectedDetailItem || exportingPdf) return
    setExportingPdf(true)
    const item = selectedDetailItem
    const title = getScheduleDisplayTitle(item)
    const segments = getScheduleSegments(item)
    const segmentCount = Array.isArray(segments) ? segments.length : 0
    const onePagePerActivity = segmentCount > 1
    try {
      const [jspdfMod, h2cMod] = await Promise.all([import('jspdf'), import('html2canvas')])
      const jsPDF = jspdfMod.jsPDF
      const html2canvas = h2cMod.default
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const wrapStyle = 'position:fixed;left:-9999px;top:0;width:595px;max-width:595px;background:#fff;padding:28px;padding-bottom:48px;font-family:system-ui,sans-serif;font-size:14px;box-sizing:border-box;color:#000;overflow:visible;word-break:break-word;overflow-wrap:break-word;height:auto;min-height:0;'

      const renderOnePage = async (html, onePageOnly = false) => {
        const wrap = document.createElement('div')
        wrap.style.cssText = wrapStyle
        wrap.innerHTML = html
        document.body.appendChild(wrap)
        await new Promise(r => setTimeout(r, 150))
        const w = Math.max(wrap.scrollWidth, 1)
        const h = Math.max(wrap.scrollHeight, 1)
        const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff', logging: false, width: w, height: h, windowWidth: w, windowHeight: h })
        document.body.removeChild(wrap)
        const img = canvas.toDataURL('image/png')
        const imgW = pageW
        let imgH = (canvas.height * pageW) / canvas.width
        if (onePageOnly && imgH > pageH) imgH = pageH
        let y = 0
        let hLeft = imgH
        pdf.addImage(img, 'PNG', 0, y, imgW, imgH)
        hLeft -= pageH
        if (!onePageOnly) {
          while (hLeft > 0) {
            y = hLeft - imgH
            pdf.addPage()
            pdf.addImage(img, 'PNG', 0, y, imgW, imgH)
            hLeft -= pageH
          }
        }
      }

      const renderWorkItemPages = async (segmentIndex, seg) => {
        const workItems = Array.isArray(seg?.workItems) ? seg.workItems : []
        const expanded = expandWorkItemsToLogical(workItems)
        const count = expanded.length
        if (count === 0) {
          await renderOnePage(getDetailPrintBody(item, segmentIndex))
          return
        }
        const firstPageSize = 3
        const laterPageSize = 6
        const pages = count <= firstPageSize ? 1 : 1 + Math.ceil((count - firstPageSize) / laterPageSize)
        for (let p = 0; p < pages; p++) {
          const from = p === 0 ? 0 : firstPageSize + (p - 1) * laterPageSize
          const to = p === 0 ? Math.min(firstPageSize, count) : Math.min(firstPageSize + p * laterPageSize, count)
          if (p > 0) pdf.addPage()
          const html = p === 0
            ? getDetailPrintBody(item, segmentIndex, { workItemFrom: 0, workItemTo: to })
            : getDetailPrintBody(item, segmentIndex, { workItemFrom: from, workItemTo: to, continuation: true })
          await renderOnePage(html, true)
        }
      }

      if (onePagePerActivity) {
        for (let i = 0; i < segmentCount; i++) {
          if (i > 0) pdf.addPage()
          const seg = segments[i] || segments[0]
          await renderWorkItemPages(i, seg)
        }
      } else {
        const seg = segments[0]
        await renderWorkItemPages(0, seg)
      }
      const fileName = (title || '工程排程詳情').replace(/[/\\?%*:|"<>]/g, '-')
      pdf.save(`${fileName}.pdf`)
    } catch (err) {
      console.error('PDF 匯出失敗', err)
      alert('匯出失敗：' + (err?.message || String(err)))
    } finally {
      setExportingPdf(false)
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
        vehicleEntries: [],
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
      setNewVehicleInput('')
    }
    setOriginalWorkItemIdMap({})
    setEditingScheduleId(null)
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

  /** 每台車一組的駕駛/里程/加油/發票 */
  const handleVehicleEntryChange = (index, field, value) => {
    setScheduleFormData((prev) => {
      const list = Array.isArray(prev.vehicleEntries) ? [...prev.vehicleEntries] : []
      if (index < 0 || index >= list.length) return prev
      list[index] = { ...list[index], [field]: value }
      return { ...prev, vehicleEntries: list }
    })
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

  // 獨立負責或協作時：同一張卡新增多項工作內容（contentRows）
  const handleAddContentRow = (itemIndex) => {
    setScheduleFormData((prev) => {
      const list = Array.isArray(prev.workItems) ? prev.workItems : []
      if (itemIndex < 0 || itemIndex >= list.length) return prev
      const item = list[itemIndex]
      const rows = Array.isArray(item.contentRows) ? [...item.contentRows] : []
      const isCollab = !!item.isCollaborative
      const collabShared = getWorkItemCollabMode(item) === 'shared'
      if (rows.length === 0) {
        if (isCollab && collabShared) {
          rows.push(
            { id: `row-${Date.now()}-1`, workContent: item.workContent || '', targetQuantity: item.targetQuantity ?? '', actualQuantity: item.sharedActualQuantity ?? item.actualQuantity ?? '' },
            { id: `row-${Date.now()}-2`, workContent: '', targetQuantity: '', actualQuantity: '' }
          )
        } else if (isCollab && !collabShared) {
          rows.push(
            { id: `row-${Date.now()}-1`, workContent: item.workContent || '' },
            { id: `row-${Date.now()}-2`, workContent: '' }
          )
        } else {
          rows.push(
            { id: `row-${Date.now()}-1`, workContent: item.workContent || '', targetQuantity: item.targetQuantity ?? '', actualQuantity: item.actualQuantity ?? '' },
            { id: `row-${Date.now()}-2`, workContent: '', targetQuantity: '', actualQuantity: '' }
          )
        }
      } else {
        if (isCollab && !collabShared) {
          rows.push({ id: `row-${Date.now()}`, workContent: '' })
        } else {
          rows.push({ id: `row-${Date.now()}`, workContent: '', targetQuantity: '', actualQuantity: '' })
        }
      }
      const newWorkItems = [...list]
      newWorkItems[itemIndex] = { ...item, contentRows: rows }
      return { ...prev, workItems: newWorkItems }
    })
  }

  const handleRemoveContentRow = (itemIndex, rowIndex) => {
    setScheduleFormData((prev) => {
      const list = Array.isArray(prev.workItems) ? prev.workItems : []
      if (itemIndex < 0 || itemIndex >= list.length) return prev
      const item = list[itemIndex]
      const rows = Array.isArray(item.contentRows) ? [...item.contentRows] : []
      if (rowIndex < 0 || rowIndex >= rows.length) return prev
      const removed = rows[rowIndex]
      const newRows = rows.filter((_, i) => i !== rowIndex)
      const newWorkItems = [...list]
      const isCollab = !!item.isCollaborative
      const collabShared = getWorkItemCollabMode(item) === 'shared'
      if (newRows.length === 0) {
        if (isCollab && collabShared) {
          newWorkItems[itemIndex] = {
            ...item,
            contentRows: undefined,
            workContent: removed.workContent ?? '',
            targetQuantity: removed.targetQuantity ?? '',
            sharedActualQuantity: removed.actualQuantity ?? '',
            actualQuantity: removed.actualQuantity ?? ''
          }
        } else if (isCollab && !collabShared) {
          newWorkItems[itemIndex] = { ...item, contentRows: undefined, workContent: removed.workContent ?? '' }
        } else {
          newWorkItems[itemIndex] = { ...item, contentRows: undefined, workContent: removed.workContent ?? '', targetQuantity: removed.targetQuantity ?? '', actualQuantity: removed.actualQuantity ?? '' }
        }
      } else {
        newWorkItems[itemIndex] = { ...item, contentRows: newRows }
      }
      return { ...prev, workItems: newWorkItems }
    })
  }

  const handleContentRowChange = (itemIndex, rowIndex, field, value) => {
    setScheduleFormData((prev) => {
      const list = Array.isArray(prev.workItems) ? prev.workItems : []
      if (itemIndex < 0 || itemIndex >= list.length) return prev
      const item = list[itemIndex]
      const rows = Array.isArray(item.contentRows) ? [...item.contentRows] : []
      if (rowIndex < 0 || rowIndex >= rows.length) return prev
      const newRows = rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r))
      const newWorkItems = [...list]
      newWorkItems[itemIndex] = { ...item, contentRows: newRows }
      return { ...prev, workItems: newWorkItems }
    })
  }

  const handleAddWorkItem = () => {
    const now = new Date().toISOString()
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
          sharedActualQuantity: '',
          createdAt: now,
          createdBy: currentUser || ''
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
      // 遍歷所有工作項目（含多處行程各案場、contentRows 展開）
      const allWorkItemsForLb = (Array.isArray(scheduleFormData.segments) && scheduleFormData.segments.length > 1)
        ? scheduleFormData.segments.flatMap((s) => s.workItems || [])
        : (scheduleFormData.workItems || [])
      const logicalItems = expandWorkItemsToLogical(allWorkItemsForLb)
      logicalItems.forEach(rawItem => {
        const workItem = normalizeWorkItem(rawItem)
        if (!workItem.workContent) return

        const contributors = workItem.isCollaborative
          ? getWorkItemCollaborators(workItem)
          : [{
            name: String(workItem.responsiblePerson || '').trim(),
            actualQuantity: workItem.actualQuantity ?? ''
          }].filter((c) => !!c.name)

        if (contributors.length === 0) return
        
        // 查找匹配的排行榜項目。支援逗號分隔多關鍵字，任一個符合即匹配（例：RJ,RJ45,水晶頭）
        const matchKeywords = (itemContent, filterStr) => {
          if (!filterStr || !itemContent) return false
          const keywords = String(filterStr).split(',').map((k) => String(k).trim()).filter(Boolean)
          return keywords.some((k) => itemContent.includes(k) || k.includes(itemContent))
        }
        const matchedLeaderboard = leaderboardItems.find(lb => {
          if (lb.workContent && lb.workContent.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.workContent)) return true
          }
          if (lb.title && lb.title.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.title)) return true
          }
          if (lb.name && lb.name.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.name)) return true
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
            // shared 共同完成：總數量/人數，每人累加一份，總和=總數量不重複
            // separate：各自累加自己的實際數量
            const isShared = getWorkItemCollabMode(workItem) === 'shared'
            const rawQty = getWorkItemActualForNameForPerformance(workItem, name)
            const quantity = isShared && contributors.length > 0
              ? rawQty / contributors.length
              : rawQty
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

            const target = rawItem._parentItem || rawItem
            target.lastAccumulatedBy = lastBy
            target.lastAccumulatedAt = scheduleDate.toISOString()
          }
        }
      })
    }

    // 多處行程（或單一案場）：將目前編輯中的案場的 workItems/vehicleEntries 同步回 segments；車輛每欄僅對「有變更」的欄位寫入編輯者
    const prevSchedule = editingScheduleId ? schedules.find((s) => String(s?.id) === String(editingScheduleId)) : null
    const prevEntries = prevSchedule && (Array.isArray(prevSchedule.segments) && prevSchedule.segments.length > 0)
      ? (prevSchedule.segments[editingFormSegmentIndex] || prevSchedule.segments[0])?.vehicleEntries || []
      : (prevSchedule?.vehicleEntries || [])
    const formEntries = Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []
    const enrichedVehicleEntries = formEntries.map((entry, i) => {
      const prevEntry = prevEntries[i] ?? prevEntries.find((e) => String(e?.vehicle || '').trim() === String(entry?.vehicle || '').trim())
      return addVehicleEntryEditorInfo(entry, prevEntry)
    })
    let segmentsToSave = scheduleFormData.segments
    if (Array.isArray(segmentsToSave) && segmentsToSave.length >= 1) {
      segmentsToSave = segmentsToSave.map((s, i) => (i === editingFormSegmentIndex
        ? { ...s, workItems: scheduleFormData.workItems || [], vehicleEntries: enrichedVehicleEntries }
        : s))
    }

    let result
    if (editingScheduleId) {
      const prev = schedules.find((s) => String(s?.id) === String(editingScheduleId))
      const entriesEdit = enrichedVehicleEntries
      const payloadEdit = {
        ...scheduleFormData,
        vehicleEntries: entriesEdit,
        id: editingScheduleId,
        createdBy: scheduleFormData?.createdBy || prev?.createdBy || '',
        createdAt: scheduleFormData?.createdAt || prev?.createdAt || '',
        progressSheet: scheduleFormData.progressSheet === true,
        constructionPhotos: scheduleFormData.constructionPhotos === true
      }
      if (Array.isArray(segmentsToSave) && segmentsToSave.length >= 1) {
        payloadEdit.segments = segmentsToSave
        payloadEdit.siteName = segmentsToSave.length > 1
          ? segmentsToSave.map((s) => s.siteName).join('、')
          : (segmentsToSave[0]?.siteName || payloadEdit.siteName || '')
        payloadEdit.workItems = segmentsToSave.flatMap((s) => s.workItems || [])
      }
      if (entriesEdit.length === 1) {
        payloadEdit.departureDriver = entriesEdit[0].departureDriver || ''
        payloadEdit.returnDriver = entriesEdit[0].returnDriver || ''
        payloadEdit.departureMileage = entriesEdit[0].departureMileage || ''
        payloadEdit.returnMileage = entriesEdit[0].returnMileage || ''
        payloadEdit.needRefuel = !!entriesEdit[0].needRefuel
        payloadEdit.fuelCost = entriesEdit[0].fuelCost || ''
        payloadEdit.invoiceReturned = !!entriesEdit[0].invoiceReturned
      }
      result = updateSchedule(editingScheduleId, { ...getScheduleEditorInfo(), ...payloadEdit })
    } else {
      const entriesNew = (Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []).map(addVehicleEntryEditorInfo)
      const payloadNew = {
        ...scheduleFormData,
        createdBy: scheduleFormData?.createdBy || currentUser || '',
        vehicleEntries: entriesNew,
        progressSheet: scheduleFormData.progressSheet === true,
        constructionPhotos: scheduleFormData.constructionPhotos === true
      }
      if (Array.isArray(segmentsToSave) && segmentsToSave.length >= 1) {
        payloadNew.segments = segmentsToSave
        payloadNew.siteName = segmentsToSave.length > 1
          ? segmentsToSave.map((s) => s.siteName).join('、')
          : (segmentsToSave[0]?.siteName || payloadNew.siteName || '')
        payloadNew.workItems = segmentsToSave.flatMap((s) => s.workItems || [])
      }
      if (entriesNew.length === 1) {
        payloadNew.departureDriver = entriesNew[0].departureDriver || ''
        payloadNew.returnDriver = entriesNew[0].returnDriver || ''
        payloadNew.departureMileage = entriesNew[0].departureMileage || ''
        payloadNew.returnMileage = entriesNew[0].returnMileage || ''
        payloadNew.needRefuel = !!entriesNew[0].needRefuel
        payloadNew.fuelCost = entriesNew[0].fuelCost || ''
        payloadNew.invoiceReturned = !!entriesNew[0].invoiceReturned
      }
      result = saveSchedule(payloadNew)
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
        vehicleEntries: [],
        departureDriver: '',
        returnDriver: '',
        departureMileage: '',
        returnMileage: '',
        needRefuel: false,
        fuelCost: '',
        invoiceReturned: false,
        workItems: [],
        segments: undefined,
        tag: 'blue',
        progressSheet: false,
        constructionPhotos: false
      })
      setNewVehicleInput('')
      setShowScheduleForm(false)
      setShowScheduleModal(false)
      setEditingScheduleId(null)
      setEditingFormSegmentIndex(0)
      setOriginalWorkItemIdMap({})
      originalVehicleReturnMileageLockedRef.current = new Set()
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
      vehicleEntries: [],
      departureDriver: '',
      returnDriver: '',
      departureMileage: '',
      returnMileage: '',
      needRefuel: false,
      fuelCost: '',
      invoiceReturned: false,
      workItems: [],
      segments: undefined,
      tag: 'blue',
      progressSheet: false,
      constructionPhotos: false
    })
    setNewVehicleInput('')
    setEditingScheduleId(null)
    setEditingFormSegmentIndex(0)
    setOriginalWorkItemIdMap({})
    originalVehicleReturnMileageLockedRef.current = new Set()
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
      // 只有當天或之後的排程才會執行累加邏輯；遍歷所有工作項目（含 contentRows 展開）
      const logicalItems = expandWorkItemsToLogical(scheduleFormData.workItems)
      logicalItems.forEach(workItem => {
        if (!workItem.workContent || !workItem.responsiblePerson) return
        
        // 檢查該工作項目是否已經在排程日期當天或之後累加過
        const lastAccumulatedAt = workItem.lastAccumulatedAt ? new Date(workItem.lastAccumulatedAt) : null
        const lastAccumulatedDateStr = lastAccumulatedAt ? lastAccumulatedAt.toISOString().split('T')[0] : null
        
        // 如果已經在排程日期當天或之後累加過，跳過（避免重複累加）
        if (lastAccumulatedDateStr && lastAccumulatedDateStr >= scheduleDateStr) {
          return // 已經累加過，不重複計算
        }
        
        // 查找匹配的排行榜項目。支援逗號分隔多關鍵字，任一個符合即匹配（例：RJ,RJ45,水晶頭）
        const matchKeywords = (itemContent, filterStr) => {
          if (!filterStr || !itemContent) return false
          const keywords = String(filterStr).split(',').map((k) => String(k).trim()).filter(Boolean)
          return keywords.some((k) => itemContent.includes(k) || k.includes(itemContent))
        }
        const matchedLeaderboard = leaderboardItems.find(lb => {
          if (lb.workContent && lb.workContent.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.workContent)) return true
          }
          if (lb.title && lb.title.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.title)) return true
          }
          if (lb.name && lb.name.trim() !== '') {
            if (matchKeywords(workItem.workContent, lb.name)) return true
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
            
            // 標記該工作項目已經累加過（使用排程日期）；若有 _parentItem 則寫回父項
            const targetItem = workItem._parentItem || workItem
            targetItem.lastAccumulatedAt = scheduleDate.toISOString()
          }
        }
      })
    }

    const entries = Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []
    const payload = {
      ...scheduleFormData,
      createdBy: scheduleFormData?.createdBy || currentUser || '',
      vehicleEntries: entries
    }
    if (entries.length === 1) {
      payload.departureDriver = entries[0].departureDriver || ''
      payload.returnDriver = entries[0].returnDriver || ''
      payload.departureMileage = entries[0].departureMileage || ''
      payload.returnMileage = entries[0].returnMileage || ''
      payload.needRefuel = !!entries[0].needRefuel
      payload.fuelCost = entries[0].fuelCost || ''
      payload.invoiceReturned = !!entries[0].invoiceReturned
    }
    const result = saveSchedule(payload)
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
        vehicleEntries: [],
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
      setNewVehicleInput('')
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
        title: getScheduleDisplayTitle(schedule),
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
      // 一併刪除實際排程與該排程的加班申請，績效頁加班時數明細會同步移除
      const sid = String(scheduleId || '').trim()
      if (sid) {
        getOvertimeApplicationsByScheduleId(sid).forEach((oa) => deleteOvertimeApplication(oa.id))
        deleteSchedule(sid)
        setSchedules(getSchedules())
      }
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
    
    // 刪除排程（並一併刪除該排程的加班申請）
    toDelete.forEach(s => {
      getOvertimeApplicationsByScheduleId(s.id).forEach((oa) => deleteOvertimeApplication(oa.id))
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

        {/* 管理員：待審核加班集中清單（審核按鈕原僅在「點開排程詳情」內，易被忽略） */}
        {currentRole === 'admin' && (() => {
          void overtimeReviewRevision
          const pendingOt = getPendingOvertimeApplications().slice().sort((a, b) => {
            const da = String(a?.date || '').localeCompare(String(b?.date || ''))
            if (da !== 0) return da
            return String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''))
          })
          if (pendingOt.length === 0) return null
          return (
            <div className="mb-3 rounded-lg border border-amber-500/60 bg-amber-950/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setOvertimePendingBannerOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-amber-200 text-sm font-semibold hover:bg-amber-900/30"
              >
                <span>待審核加班（{pendingOt.length}）— 點此{overtimePendingBannerOpen ? '收合' : '展開'}</span>
                <span className="text-amber-400/90">{overtimePendingBannerOpen ? '▼' : '▶'}</span>
              </button>
              {overtimePendingBannerOpen && (
                <div className="px-3 pb-3 space-y-2 max-h-56 overflow-y-auto border-t border-amber-600/30">
                  {pendingOt.map((oa) => {
                    const sch = schedules.find((s) => String(s?.id) === String(oa?.scheduleId))
                    const siteLabel = sch ? getScheduleDisplayTitle(sch) : '（找不到對應排程，可能已刪除）'
                    const timeStr = oa.startTime && oa.endTime ? `${oa.startTime}～${oa.endTime}` : ''
                    return (
                      <div key={oa.id} className="rounded-md bg-gray-900/80 border border-amber-700/40 p-2 text-xs text-gray-200">
                        <div className="font-medium text-amber-100/95">{siteLabel}</div>
                        <div className="text-gray-400 mt-0.5">
                          {oa.date || '—'}
                          {timeStr ? ` ${timeStr}` : ''}
                          {oa.hours != null && oa.hours !== '' ? ` · ${oa.hours} 小時` : ''}
                        </div>
                        <div>申請人：{oa.applicant || '—'}</div>
                        {oa.overtimePersonnel && oa.overtimePersonnel.length > 0 && (
                          <div className="text-gray-400">加班人員：{oa.overtimePersonnel.join(', ')}</div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {sch && (
                            <button
                              type="button"
                              onClick={(e) => handleScheduleClick(e, sch)}
                              className="px-2 py-1 rounded bg-gray-600 text-white hover:bg-gray-500"
                            >
                              開啟排程詳情
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const res = updateOvertimeApplicationStatus(oa.id, 'approved', getCurrentUser())
                              if (res.success) setOvertimeReviewRevision((r) => r + 1)
                              else alert(res.message || '操作失敗')
                            }}
                            className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500"
                          >
                            核准
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const res = updateOvertimeApplicationStatus(oa.id, 'rejected', getCurrentUser())
                              if (res.success) setOvertimeReviewRevision((r) => r + 1)
                              else alert(res.message || '操作失敗')
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                          >
                            駁回
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

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
                className="min-h-[100px] bg-gray-900 border border-gray-700 rounded p-0.5 text-gray-600 overflow-hidden min-w-0"
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
                className={`min-h-[100px] sm:min-h-[100px] bg-gray-800 border rounded p-0.5 cursor-pointer hover:bg-gray-750 transition-colors overflow-hidden min-w-0 ${
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
                    // 施工照片未勾選：活動框內字體周遭紅框描邊閃爍（請假排程不套用）
                    const docIncomplete = !isLeaveScheduleItem(schedule) && schedule.constructionPhotos !== true
                    const textClass = typeTextColors[scheduleTag] || 'text-white'
                    const timeTextClass = typeTimeColors[scheduleTag] || 'text-blue-400'
                    // 全天：显示标签底色；非全天：只修改字体颜色
                    const displayClass = isAllDay
                      ? `${typeColors[scheduleTag] || 'bg-blue-500'} ${textClass}`
                      : `bg-gray-700 ${timeTextClass}`
                    
                    // 显示时间信息
                    const timeDisplay = !isAllDay && schedule.startTime
                      ? ` ${schedule.startTime}${schedule.endTime ? ` - ${schedule.endTime}` : ''}`
                      : ''
                    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const overtimeCellLabel = getOvertimeStatusLabelForCell(schedule, cellDateStr)
                    const overtimeTitleSuffix = overtimeCellLabel ? ` · ${overtimeCellLabel}` : ''
                    
                    return (
                      <div 
                        key={schedule.id} 
                        className={`${displayClass} text-[8px] sm:text-[10px] px-0.5 py-0.5 rounded cursor-pointer hover:opacity-80 flex items-start justify-between gap-0.5 min-w-0 overflow-hidden leading-tight`}
                        onClick={(e) => handleScheduleClick(e, schedule)}
                        title={`${getScheduleDisplayTitle(schedule)}${overtimeTitleSuffix}${timeDisplay} - 工程排程${docIncomplete ? '（施工照片未勾選）' : ''}`}
                      >
                        <span className="flex-1 min-w-0 line-clamp-2 break-words overflow-hidden">
                          {getScheduleDisplayTitle(schedule)}
                          {overtimeCellLabel === '加班待審核' && (
                            <span className="text-amber-200 font-bold"> · 加班待審核</span>
                          )}
                          {overtimeCellLabel === '當日有加班' && (
                            <span className="text-emerald-200 font-bold"> · 當日有加班</span>
                          )}
                          {timeDisplay}
                        </span>
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                          {/* 異動待審提示 */}
                          {hasPendingChangeRequest(schedule) && (
                            <div
                              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-purple-400 shadow-[0_0_4px_1px_rgba(168,85,247,0.9)]"
                              title="有工作項目異動待審（暫不計分）"
                            />
                          )}
                          {/* 出發或回程公里數未填時顯示小車圖示提醒 */}
                          {!isLeaveScheduleItem(schedule) && (() => {
                            const entries = Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0
                            const hasVehicle = entries ? schedule.vehicleEntries.some((e) => String(e?.vehicle || '').trim() !== '') : (String(schedule.vehicle || '').trim() !== '')
                            const missingFromEntries = entries && schedule.vehicleEntries.some((e) => {
                              const v = String(e?.vehicle || '').trim()
                              if (!v) return false
                              const dep = String(e?.departureMileage ?? '').trim()
                              const ret = String(e?.returnMileage ?? '').trim()
                              return dep === '' || ret === ''
                            })
                            const missingFlat = !entries && (String(schedule.departureMileage ?? '').trim() === '' || String(schedule.returnMileage ?? '').trim() === '')
                            const hasMissingMileage = hasVehicle && (!!missingFromEntries || missingFlat)
                            return hasMissingMileage ? (
                              <div className="flex-shrink-0 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex items-center justify-center" title="出發或回程公里數未填">
                                <svg className="w-full h-full text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.9)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                                </svg>
                              </div>
                            ) : null
                          })()}
                          {/* 請假卡片無燈號：右側留與燈號同寬佔位，避免卡片縮小、手機板內容看不完整 */}
                          {isLeaveScheduleItem(schedule) && (
                            <div className="w-2.5 min-h-[1.25rem] sm:w-3 sm:min-h-[1.75rem] flex-shrink-0" aria-hidden="true" />
                          )}
                          {/* 卡片燈號：僅工程排程顯示；請假卡片不顯示燈號。上方＝加油紅／發票綠；下方＝施工照片 */}
                          {!isLeaveScheduleItem(schedule) && (() => {
                            const toBool = (v) => v === true || v === 'true'
                            const entries = Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0
                            const refuelFromEntries = entries && schedule.vehicleEntries.some((e) => toBool(e.needRefuel))
                            const invoiceFromEntries = entries && schedule.vehicleEntries.some((e) => toBool(e.invoiceReturned))
                            const refuelFlat = toBool(schedule.needRefuel)
                            const invoiceFlat = toBool(schedule.invoiceReturned)
                            const hasRefuel = !!refuelFromEntries || refuelFlat
                            const hasInvoiceReturned = !!invoiceFromEntries || invoiceFlat
                            const docChecked = schedule.constructionPhotos === true
                            const upperRed = hasRefuel && !hasInvoiceReturned
                            const upperGreen = hasInvoiceReturned
                            const upperClass = upperGreen ? 'bg-green-400 ring-2 ring-green-300 shadow-[0_0_8px_2px_rgba(74,222,128,0.95)]' : upperRed ? 'bg-red-400 ring-2 ring-red-300 shadow-[0_0_8px_2px_rgba(248,113,113,0.95)]' : 'bg-gray-500'
                            const lowerClass = docChecked ? 'bg-green-400 ring-2 ring-green-300 shadow-[0_0_8px_2px_rgba(74,222,128,0.95)]' : 'bg-red-400 ring-2 ring-red-300 shadow-[0_0_8px_2px_rgba(248,113,113,0.95)]'
                            return (
                              <>
                                <div className={`relative w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0 animate-light-blink ${upperClass}`} title={upperGreen ? '發票已繳回' : upperRed ? '已加油，發票未繳回' : '未加油'} />
                                <div className={`relative w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0 animate-light-blink ${lowerClass}`} title={docChecked ? '施工照片已勾選' : '施工照片未勾選'} />
                              </>
                            )
                          })()}
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
                              <div className="text-white font-semibold">{getScheduleDisplayTitle(schedule)}</div>
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
            ref={detailCardRef}
            className={`${selectedDetailType === 'schedule' ? 'bg-blue-900 border-blue-500 flex flex-col' : 'bg-charcoal border-yellow-400'} border rounded-lg shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] ${selectedDetailType === 'schedule' ? '' : 'overflow-y-auto'}`}
            // 點擊彈窗本體不收合
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className={`text-xl font-bold ${selectedDetailType === 'schedule' ? 'text-white' : 'text-yellow-400'}`}>
                  {selectedDetailType === 'topic' ? '主題詳情' : 
                   selectedDetailType === 'schedule' ? '工程排程詳情' : 
                   '活動詳情'}
                </h3>
                {selectedDetailType === 'schedule' && selectedDetailItem && !isLeaveScheduleItem(selectedDetailItem) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!showOvertimeForm) {
                        const schedDay = String(selectedDetailItem?.date || '').trim().replace(/\//g, '-')
                        const today = new Date().toISOString().slice(0, 10)
                        setOvertimeFormData({
                          applicant: getDisplayNameForAccount(getCurrentUser()) || '',
                          date: schedDay || today,
                          startTime: '',
                          endTime: '',
                          overtimePersonnel: []
                        })
                      }
                      setShowOvertimeForm((v) => !v)
                    }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showOvertimeForm ? 'bg-blue-600 text-white' : 'bg-blue-700/80 text-blue-200 hover:bg-blue-600'}`}
                  >
                    加班申請 {showOvertimeForm ? '▼' : '▶'}
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {selectedDetailType === 'schedule' && (
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={(e) => { e.stopPropagation(); handleExportDetailPdf(); }}
                    className="bg-emerald-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {exportingPdf ? '匯出中…' : '匯出 PDF'}
                  </button>
                )}
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

            <div className={`space-y-4 ${selectedDetailType === 'schedule' ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
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
                              <div className="text-white font-semibold text-lg">{getScheduleDisplayTitle(schedule)}</div>
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
                                  <span className="text-blue-300">預排工作項目:</span>
                                  <div className="mt-1 space-y-1 pl-4">
                                    {expandWorkItemsToLogical(schedule.workItems).map((item, idx) => (
                                      <div key={item.id || idx} className="text-blue-100">
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
                                          const hasContentRows = !!(item?.contentRows?.length || item?._parentItem?.contentRows?.length)
                                          return (
                                            <>
                                              {names ? ` (${names})` : ''}
                                              {mode === 'shared' && !hasContentRows && (
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

              {selectedDetailType === 'schedule' && (() => {
                const isLeave = isLeaveScheduleItem(selectedDetailItem)
                const leaveInfo = isLeave ? getLeaveInfoForSchedule(selectedDetailItem) : null
                const dateText = selectedDetailItem?.date ? String(selectedDetailItem.date).replace(/-/g, '/') : '—'
                const timeText = selectedDetailItem?.isAllDay === false
                  ? `${selectedDetailItem?.startTime || ''}${(selectedDetailItem?.startTime && selectedDetailItem?.endTime) ? ' - ' : ''}${selectedDetailItem?.endTime || ''}`
                  : '全天'
                return (
                  <div className="space-y-3 text-white">
                    {isLeave && (
                      <div className="bg-teal-600/20 border border-teal-400/40 rounded-lg p-3 text-teal-100 text-sm">
                        此為「請假」紀錄（由請假申請自動帶入），僅供查看狀態，不提供編輯；管理員可刪除。
                      </div>
                    )}

                    {isLeave ? (
                      <div className="bg-blue-950/30 border border-blue-700 rounded-lg p-4">
                        <div className="text-3xl font-extrabold text-white mb-3">請假</div>
                        <div className="space-y-2 text-base">
                          <div>
                            <span className="text-blue-300">請假人員:</span>
                            <span className="ml-2 text-white font-semibold">{leaveInfo?.person || '—'}</span>
                          </div>
                          <div>
                            <span className="text-blue-300">日期:</span>
                            <span className="ml-2">{dateText}</span>
                            <span className="ml-2 text-gray-300">{timeText}</span>
                          </div>
                          <div>
                            <span className="text-blue-300">假別:</span>
                            <span className="ml-2">{leaveInfo?.leaveType || '—'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 多處行程：案場切換按鈕（紅框位置） */}
                        {(() => {
                          const segments = getScheduleSegments(selectedDetailItem)
                          const currentSegment = segments[selectedDetailSegmentIndex] || segments[0]
                          return (
                            <>
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                {segments.map((seg, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setSelectedDetailSegmentIndex(idx)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                      selectedDetailSegmentIndex === idx
                                        ? 'bg-yellow-500 text-black ring-2 ring-yellow-300'
                                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                    }`}
                                  >
                                    {seg.siteName || `案場 ${idx + 1}`}
                                  </button>
                                ))}
                              </div>
                              {currentSegment && (
                                <div className="flex flex-wrap items-center gap-3 mb-1">
                                  <div className="text-lg font-semibold text-yellow-400">
                                    活動：{currentSegment.siteName || '未命名'}
                                  </div>
                                  {!isLeaveScheduleItem(selectedDetailItem) && (
                                    <div className="flex items-center gap-4 text-sm">
                                      <label className="flex items-center gap-2 cursor-pointer text-blue-200">
                                        <input
                                          type="checkbox"
                                          checked={selectedDetailItem.constructionPhotos === true}
                                          onChange={(e) => {
                                            const v = e.target.checked
                                            const editorInfo = getScheduleEditorInfo()
                                            updateSchedule(selectedDetailItem.id, { ...editorInfo, constructionPhotos: v })
                                            setSchedules(getSchedules())
                                            setSelectedDetailItem((prev) => (prev ? { ...prev, constructionPhotos: v, ...editorInfo } : prev))
                                          }}
                                          className="rounded border-gray-500 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
                                        />
                                        施工照片
                                      </label>
                                      {selectedDetailItem.constructionPhotos !== true && (
                                        <span className="text-red-400 text-xs">繳交完成後請勾選</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        })()}

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

                        {/* 建立者 */}
                        <div>
                          <span className="text-blue-300">建立者:</span>
                          <span className="ml-2">{displayCreator(selectedDetailItem?.createdBy)}</span>
                        </div>

                        {/* 參與人員 */}
                        {selectedDetailItem.participants && (
                          <div>
                            <span className="text-blue-300">參與人員:</span>
                            <span className="ml-2">{selectedDetailItem.participants}</span>
                          </div>
                        )}

                        {/* 車輛：依目前選擇的案場顯示該案場的車輛資訊（個別計算，非平均） */}
                        {(() => {
                          const seg = getScheduleSegments(selectedDetailItem)[selectedDetailSegmentIndex] || getScheduleSegments(selectedDetailItem)[0]
                          const entries = Array.isArray(seg?.vehicleEntries) ? seg.vehicleEntries : []
                          const vehicleLabel = entries.length > 0 ? entries.map((e) => e.vehicle).filter(Boolean).join(', ') : selectedDetailItem.vehicle
                          return (
                            <>
                              {vehicleLabel && (
                                <div>
                                  <span className="text-blue-300">車輛:</span>
                                  <span className="ml-2">{vehicleLabel}</span>
                                </div>
                              )}
                              {entries.length > 0 ? (
                                entries.map((entry, idx) => (
                                  <div key={idx} className="bg-gray-800/60 border border-gray-600 rounded-lg p-3 space-y-2">
                                    <div className="text-yellow-400 font-medium text-sm">車輛 {idx + 1}：{entry.vehicle || '—'}</div>
                                    {entry.departureDriver != null && String(entry.departureDriver).trim() !== '' && <div><span className="text-blue-300">出發駕駛:</span><span className="ml-2">{entry.departureDriver}</span>{renderFieldEditor(entry.departureDriverBy, entry.departureDriverAt)}</div>}
                                    {entry.returnDriver != null && String(entry.returnDriver).trim() !== '' && <div><span className="text-blue-300">回程駕駛:</span><span className="ml-2">{entry.returnDriver}</span>{renderFieldEditor(entry.returnDriverBy, entry.returnDriverAt)}</div>}
                                    {entry.departureMileage != null && String(entry.departureMileage).trim() !== '' && <div><span className="text-blue-300">出發里程:</span><span className="ml-2">{entry.departureMileage} km</span>{renderFieldEditor(entry.departureMileageBy, entry.departureMileageAt)}</div>}
                                    {entry.returnMileage != null && String(entry.returnMileage).trim() !== '' && <div><span className="text-blue-300">回程里程:</span><span className="ml-2">{entry.returnMileage} km</span>{renderFieldEditor(entry.returnMileageBy, entry.returnMileageAt)}</div>}
                                    {entry.departureMileage != null && entry.returnMileage != null && (
                                      <div><span className="text-blue-300">本段里程:</span><span className="ml-2">{Math.max(0, (parseFloat(entry.returnMileage) || 0) - (parseFloat(entry.departureMileage) || 0))} km</span>{renderFieldEditor(entry.returnMileageBy, entry.returnMileageAt)}</div>
                                    )}
                                    <div className="flex items-center"><span className="text-blue-300">是否加油:</span><span className="ml-2">{entry.needRefuel ? '是' : '否'}</span>{renderFieldEditor(entry.needRefuelBy, entry.needRefuelAt)}</div>
                                    {entry.fuelCost != null && String(entry.fuelCost).trim() !== '' && <div><span className="text-blue-300">油資:</span><span className="ml-2">NT$ {parseFloat(entry.fuelCost).toLocaleString()}</span>{renderFieldEditor(entry.fuelCostBy, entry.fuelCostAt)}</div>}
                                    <div className="flex items-center"><span className="text-blue-300">發票是否繳回:</span><span className="ml-2">{entry.invoiceReturned ? '是' : '否'}</span>{renderFieldEditor(entry.invoiceReturnedBy, entry.invoiceReturnedAt)}</div>
                                  </div>
                                ))
                              ) : (
                                <>
                                  {selectedDetailItem.departureDriver && <div><span className="text-blue-300">出發駕駛:</span><span className="ml-2">{selectedDetailItem.departureDriver}</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>}
                                  {selectedDetailItem.returnDriver && <div><span className="text-blue-300">回程駕駛:</span><span className="ml-2">{selectedDetailItem.returnDriver}</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>}
                                  {selectedDetailItem.departureMileage && <div><span className="text-blue-300">出發里程:</span><span className="ml-2">{selectedDetailItem.departureMileage} km</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>}
                                  {selectedDetailItem.returnMileage && <div><span className="text-blue-300">回程里程:</span><span className="ml-2">{selectedDetailItem.returnMileage} km</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>}
                                  {selectedDetailItem.departureMileage && selectedDetailItem.returnMileage && (
                                    <div><span className="text-blue-300">今日總里程:</span><span className="ml-2">{Math.max(0, (parseFloat(selectedDetailItem.returnMileage) || 0) - (parseFloat(selectedDetailItem.departureMileage) || 0))} km</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>
                                  )}
                                  <div className="flex items-center"><span className="text-blue-300">是否加油:</span><span className="ml-2">{selectedDetailItem.needRefuel ? '是' : '否'}</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>
                                  {selectedDetailItem.fuelCost && <div><span className="text-blue-300">油資:</span><span className="ml-2">NT$ {parseFloat(selectedDetailItem.fuelCost).toLocaleString()}</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>}
                                  <div className="flex items-center"><span className="text-blue-300">發票是否繳回:</span><span className="ml-2">{selectedDetailItem.invoiceReturned ? '是' : '否'}</span>{renderFieldEditor(selectedDetailItem.lastEditedBy, selectedDetailItem.lastEditedAt)}</div>
                                </>
                              )}
                            </>
                          )
                        })()}

                  {/* 加班申請表單與已送出的申請（按鈕已移至標題列「工程排程詳情」旁） */}
                  {!isLeaveScheduleItem(selectedDetailItem) && (
                    <div className="mt-2">
                      {/* 已送出的申請：直接顯示，點開卡片即可看到今天有無加班，不需展開 */}
                      {getOvertimeApplicationsByScheduleId(selectedDetailItem.id).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-blue-700">
                          <div className="text-blue-300 text-sm mb-2">已送出的申請</div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {getOvertimeApplicationsByScheduleId(selectedDetailItem.id).map((oa) => {
                              const status = (oa.status || 'pending').trim()
                              const statusText = status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核'
                              const statusColor = status === 'approved' ? 'text-green-400' : status === 'rejected' ? 'text-red-400' : 'text-yellow-400'
                              return (
                                <div key={oa.id} className="text-blue-200 text-xs bg-blue-800/50 rounded p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div>申請人：{oa.applicant || '—'}</div>
                                      <div>
                                        {oa.date || (oa.applicationTime ? new Date(oa.applicationTime).toLocaleDateString('zh-TW') : '—')}
                                        {oa.startTime && oa.endTime ? ` ${oa.startTime}～${oa.endTime}` : (oa.applicationTime ? ` ${new Date(oa.applicationTime).toLocaleTimeString('zh-TW')}` : '')}
                                        {oa.hours != null && oa.hours !== '' ? `（${oa.hours}小時）` : ''}
                                      </div>
                                      {oa.overtimePersonnel && oa.overtimePersonnel.length > 0 && (
                                        <div>加班人員：{oa.overtimePersonnel.join(', ')}</div>
                                      )}
                                    </div>
                                    <div className={`flex-shrink-0 font-medium ${statusColor}`}>{statusText}</div>
                                  </div>
                                  {(currentRole === 'admin' && status === 'pending') && (
                                    <div className="flex gap-2 mt-2 pt-2 border-t border-blue-700/50">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const res = updateOvertimeApplicationStatus(oa.id, 'approved', getCurrentUser())
                                          if (res.success) setOvertimeReviewRevision((r) => r + 1)
                                          else alert(res.message || '操作失敗')
                                        }}
                                        className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-500"
                                      >
                                        核准
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const res = updateOvertimeApplicationStatus(oa.id, 'rejected', getCurrentUser())
                                          if (res.success) setOvertimeReviewRevision((r) => r + 1)
                                          else alert(res.message || '操作失敗')
                                        }}
                                        className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-500"
                                      >
                                        駁回
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!window.confirm('確定要刪除此筆加班申請？')) return
                                          const res = deleteOvertimeApplication(oa.id)
                                          if (res.success) setOvertimeReviewRevision((r) => r + 1)
                                          else alert(res.message || '刪除失敗')
                                        }}
                                        className="px-2 py-1 rounded bg-gray-600 text-white text-xs hover:bg-gray-500"
                                      >
                                        刪除
                                      </button>
                                    </div>
                                  )}
                                  {currentRole === 'admin' && status !== 'pending' && (
                                    <div className="flex gap-2 mt-2 pt-2 border-t border-blue-700/50">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!window.confirm('確定要刪除此筆加班申請？')) return
                                          const res = deleteOvertimeApplication(oa.id)
                                          if (res.success) setOvertimeReviewRevision((r) => r + 1)
                                          else alert(res.message || '刪除失敗')
                                        }}
                                        className="px-2 py-1 rounded bg-gray-600 text-white text-xs hover:bg-gray-500"
                                      >
                                        刪除
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {showOvertimeForm && (
                        <div className="mt-2 p-3 bg-blue-900/50 border border-blue-700 rounded-lg space-y-3">
                          <div>
                            <label className="block text-blue-300 text-sm mb-1">申請人</label>
                            <input
                              type="text"
                              readOnly
                              value={overtimeFormData.applicant}
                              className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 text-gray-300 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-blue-300 text-sm mb-1">申請日期</label>
                            <input
                              type="date"
                              value={overtimeFormData.date}
                              onChange={(e) => setOvertimeFormData((p) => ({ ...p, date: e.target.value }))}
                              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-blue-300 text-sm mb-1">開始時間</label>
                              <input
                                type="time"
                                value={overtimeFormData.startTime}
                                onChange={(e) => setOvertimeFormData((p) => ({ ...p, startTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-blue-300 text-sm mb-1">結束時間</label>
                              <input
                                type="time"
                                value={overtimeFormData.endTime}
                                onChange={(e) => setOvertimeFormData((p) => ({ ...p, endTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm"
                              />
                            </div>
                          </div>
                          {(() => {
                            const start = overtimeFormData.startTime && overtimeFormData.endTime
                              ? overtimeFormData.startTime.split(':').map(Number)
                              : null
                            const end = overtimeFormData.startTime && overtimeFormData.endTime
                              ? overtimeFormData.endTime.split(':').map(Number)
                              : null
                            let hours = null
                            if (start && end && start.length >= 2 && end.length >= 2) {
                              const minStart = start[0] * 60 + start[1]
                              let minEnd = end[0] * 60 + end[1]
                              if (minEnd <= minStart) minEnd += 24 * 60
                              hours = ((minEnd - minStart) / 60).toFixed(1)
                            }
                            return hours != null ? (
                              <p className="text-blue-200 text-sm">共 <strong className="text-yellow-300">{hours}</strong> 小時</p>
                            ) : null
                          })()}
                          <div>
                            <label className="block text-blue-300 text-sm mb-1">加班人員（選填）</label>
                            <div className="max-h-32 overflow-y-auto border border-gray-600 rounded bg-gray-800 p-2 space-y-1">
                              {(() => {
                                const participantsStr = String(selectedDetailItem?.participants || '').trim()
                                const names = participantsStr ? participantsStr.split(',').map((s) => s.trim()).filter(Boolean) : []
                                if (names.length === 0) return <span className="text-gray-500 text-xs">此排程尚無參與人員可勾選</span>
                                return names.map((name) => (
                                  <label key={name} className="flex items-center gap-2 cursor-pointer text-blue-200 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={(overtimeFormData.overtimePersonnel || []).includes(name)}
                                      onChange={(e) => {
                                        const arr = [...(overtimeFormData.overtimePersonnel || [])]
                                        if (e.target.checked) arr.push(name)
                                        else arr.splice(arr.indexOf(name), 1)
                                        setOvertimeFormData((p) => ({ ...p, overtimePersonnel: arr }))
                                      }}
                                      className="rounded border-gray-500 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
                                    />
                                    {name}
                                  </label>
                                ))
                              })()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const applicant = overtimeFormData.applicant.trim() || getDisplayNameForAccount(getCurrentUser()) || ''
                              const start = overtimeFormData.startTime && overtimeFormData.endTime ? overtimeFormData.startTime.split(':').map(Number) : null
                              const end = overtimeFormData.startTime && overtimeFormData.endTime ? overtimeFormData.endTime.split(':').map(Number) : null
                              let hours = null
                              if (start && end && start.length >= 2 && end.length >= 2) {
                                const minStart = start[0] * 60 + start[1]
                                let minEnd = end[0] * 60 + end[1]
                                if (minEnd <= minStart) minEnd += 24 * 60
                                hours = (minEnd - minStart) / 60
                              }
                              const result = addOvertimeApplication({
                                scheduleId: selectedDetailItem.id,
                                applicant,
                                date: overtimeFormData.date.trim(),
                                startTime: overtimeFormData.startTime.trim(),
                                endTime: overtimeFormData.endTime.trim(),
                                hours: hours != null ? Number(hours.toFixed(1)) : null,
                                overtimePersonnel: overtimeFormData.overtimePersonnel || []
                              })
                              if (result.success) {
                                const nextDay = String(selectedDetailItem?.date || '').trim().replace(/\//g, '-') || new Date().toISOString().slice(0, 10)
                                setOvertimeFormData({ applicant: getDisplayNameForAccount(getCurrentUser()) || '', date: nextDay, startTime: '', endTime: '', overtimePersonnel: [] })
                                setOvertimeReviewRevision((r) => r + 1)
                              } else alert(result.message || '送出失敗')
                            }}
                            className="w-full py-2 rounded-lg bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition-colors text-sm"
                          >
                            送出申請
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 工作項目：依目前選擇的案場顯示該案場的卡片 */}
                  {(() => {
                    const seg = getScheduleSegments(selectedDetailItem)[selectedDetailSegmentIndex] || getScheduleSegments(selectedDetailItem)[0]
                    const workItems = Array.isArray(seg?.workItems) ? seg.workItems : []
                    return workItems.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-blue-300 mb-2">預排工作項目:</div>
                      <div className="space-y-2">
                        {workItems.map((item, idx) => {
                          const it = normalizeWorkItem(item)
                          const collabs = getWorkItemCollaborators(it)
                          const isCollab = !!it?.isCollaborative
                          const crKind = String(it?.changeRequest?.kind || it?.changeRequest?.type || 'change').trim() || 'change'
                          const crStatus = String(it?.changeRequest?.status || '')
                          const isPendingChange = crStatus === 'pending'
                          const isLocked = true
                          return (
                          <div key={idx} className="bg-blue-800 rounded-lg p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-white">
                                {item.contentRows && item.contentRows.length > 0 ? (
                                  <>
                                    {item.isCollaborative ? (
                                      <div className="text-blue-200 text-sm">協作: {getWorkItemCollaborators(it).map((c) => c.name).join(', ') || '—'}</div>
                                    ) : (
                                      <div className="text-blue-200 text-sm">負責人: {item.responsiblePerson || '—'}</div>
                                    )}
                                    {item.contentRows.map((row, ri) => (
                                      <div key={row.id || ri} className="text-sm mt-1">
                                        • {row.workContent || '未填'}
                                        {(row.targetQuantity != null && row.targetQuantity !== '') || (row.actualQuantity != null && row.actualQuantity !== '') ? ` — 目標 ${row.targetQuantity ?? '—'} / 實際 ${row.actualQuantity ?? '—'}` : ''}
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  item.workContent || item.content || `工作項目 ${idx + 1}`
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isPendingChange && (
                                  <span className="text-xs px-2 py-1 rounded bg-purple-600/30 text-purple-200 border border-purple-500/40">
                                    {crKind === 'cancel' ? '取消待審（不計分）' : '異動待審（不計分）'}
                                  </span>
                                )}
                                {isLocked && !isPendingChange && (
                                  <button
                                    type="button"
                                    onClick={() => openChangeActionModal(selectedDetailItem.id, it)}
                                    className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40 hover:bg-blue-600/40"
                                  >
                                    異動申請
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-blue-200 text-xs mt-1">
                              建立者：{displayCreator(it?.createdBy || selectedDetailItem?.createdBy)}
                            </div>
                            {(() => {
                              const hasContentRows = item.contentRows && item.contentRows.length > 0
                              const mode = isCollab ? getWorkItemCollabMode(it) : 'separate'
                              const name = String(it?.responsiblePerson || '').trim()
                              const t = parseFloat(it?.targetQuantity) || 0
                              const a = parseFloat(it?.actualQuantity) || 0
                              const sharedT = t
                              const sharedA = getWorkItemSharedActual(it)
                              return (
                                <>
                                  {!isCollab && !hasContentRows && name && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      負責人: {name}
                                    </div>
                                  )}
                                  {!isCollab && !hasContentRows && (t > 0 || a > 0) && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      目標: {t > 0 ? t : 'N/A'} / 實際: {a > 0 ? a : 'N/A'}
                                    </div>
                                  )}
                                  {isCollab && (
                                    <div className="text-blue-200 text-sm mt-1">
                                      負責人: {collabs.map((c) => String(c?.name || '').trim()).filter(Boolean).join(', ') || '—'}
                                    </div>
                                  )}
                                  {isCollab && mode === 'shared' && !hasContentRows && (
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
                            {currentRole === 'admin' && isPendingChange && (
                              <div className="mt-3 bg-blue-950/30 border border-purple-500/30 rounded-lg p-3">
                                <div className="text-purple-200 font-semibold text-sm mb-2">異動申請審核</div>
                                <div className="text-blue-100 text-sm space-y-1">
                                  <div><span className="text-blue-300">申請人:</span> {String(it?.changeRequest?.requestedBy || '').trim() || '—'}</div>
                                  <div><span className="text-blue-300">原因:</span> {String(it?.changeRequest?.reason || '').trim() || '—'}</div>
                                  <div>
                                    <span className="text-blue-300">申請內容:</span>{' '}
                                    {crKind === 'cancel' ? '申請取消此工作項目（核准後自動刪除）' : '申請變更內容'}
                                  </div>
                                  {crKind !== 'cancel' && (
                                    <div className="mt-1 text-blue-200 text-xs space-y-1">
                                      {Array.isArray(it?.changeRequest?.proposed?.contentRows) && it.changeRequest.proposed.contentRows.length > 0 ? (
                                        <>
                                          <div>模式：{it?.changeRequest?.proposed?.isCollaborative ? '協作' : '單人'}</div>
                                          <div className="mt-1">多列工作內容（申請改為）：</div>
                                          {it.changeRequest.proposed.contentRows.map((row, ri) => (
                                            <div key={ri} className="pl-2 border-l border-gray-500">
                                              • {String(row?.workContent || '').trim() || '—'} 目標 {row?.targetQuantity ?? '—'} / 實際 {row?.actualQuantity ?? '—'}
                                            </div>
                                          ))}
                                          {!it?.changeRequest?.proposed?.isCollaborative && (
                                            <div>負責人：{String(it?.responsiblePerson || '').trim() || '—'} → {String(it?.changeRequest?.proposed?.responsiblePerson || '').trim() || '—'}</div>
                                          )}
                                          {it?.changeRequest?.proposed?.isCollaborative && (
                                            <div>協作人員：{(Array.isArray(it?.changeRequest?.proposed?.collaborators) ? it.changeRequest.proposed.collaborators : []).map((c) => c?.name).filter(Boolean).join('、') || '—'}</div>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <div>工作內容：{String(it?.workContent || '').trim() || '—'} → {String(it?.changeRequest?.proposed?.workContent || '').trim() || '—'}</div>
                                          <div>模式：{it?.changeRequest?.proposed?.isCollaborative ? '協作' : '單人'}</div>
                                          {!it?.changeRequest?.proposed?.isCollaborative ? (
                                            <>
                                              <div>負責人：{String(it?.responsiblePerson || '').trim() || '—'} → {String(it?.changeRequest?.proposed?.responsiblePerson || '').trim() || '—'}</div>
                                              <div>目標：{String(it?.targetQuantity ?? '').trim() || '—'} → {String(it?.changeRequest?.proposed?.targetQuantity ?? '').trim() || '—'}</div>
                                            </>
                                          ) : (
                                            <>
                                              <div>協作方式：{String(it?.changeRequest?.proposed?.collabMode || 'shared')}</div>
                                              <div>協作人員/目標：{(Array.isArray(it?.changeRequest?.proposed?.collaborators) ? it.changeRequest.proposed.collaborators : [])
                                                .map((c) => `${String(c?.name || '').trim()}(${String(c?.targetQuantity ?? '').trim() || '—'})`)
                                                .filter(Boolean)
                                                .join('、') || '—'}
                                              </div>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button
                                    type="button"
                                    onClick={() => approveChangeRequest(selectedDetailItem.id, it)}
                                    className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded cursor-pointer"
                                  >
                                    {crKind === 'cancel' ? '核准（刪除）' : '核准'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rejectChangeRequest(selectedDetailItem.id, it)}
                                    className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded cursor-pointer"
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
                    </div>
                  ) : null
                  })()}

                  {/* 回程里程異動申請審核（管理員） */}
                  {selectedDetailType === 'schedule' && !isLeaveScheduleItem(selectedDetailItem) && currentRole === 'admin' && (() => {
                    const reqs = Array.isArray(selectedDetailItem?.vehicleReturnMileageChangeRequests) ? selectedDetailItem.vehicleReturnMileageChangeRequests : []
                    const pendingReqs = reqs.filter((r) => String(r?.status || '') === 'pending')
                    if (pendingReqs.length === 0) return null
                    return (
                      <div className="mt-3 bg-blue-950/30 border border-purple-500/30 rounded-lg p-3">
                        <div className="text-purple-200 font-semibold text-sm mb-2">回程里程異動申請審核</div>
                        <div className="space-y-2">
                          {pendingReqs.map((r, ri) => (
                            <div key={ri} className="text-blue-100 text-sm space-y-1 border border-gray-600 rounded p-2 bg-gray-800/50">
                              <div><span className="text-blue-300">車輛:</span> {String(r?.vehicle || '').trim() || '—'}</div>
                              <div><span className="text-blue-300">申請人:</span> {String(getDisplayNameForAccount(r?.requestedBy || '') || r?.requestedBy || '').trim() || '—'}</div>
                              <div><span className="text-blue-300">異動原因:</span> {String(r?.reason || '').trim() || '—'}</div>
                              <div><span className="text-blue-300">申請改為回程里程:</span> {String(r?.proposedReturnMileage ?? '').trim() || '—'} km</div>
                              <div className="flex gap-2 mt-2">
                                <button type="button" onClick={() => approveVehicleReturnMileageChangeRequest(selectedDetailItem.id, r)} className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">核准</button>
                                <button type="button" onClick={() => rejectVehicleReturnMileageChangeRequest(selectedDetailItem.id, r)} className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded">退回</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* 行程回報紀錄：依此排程＋段落＋日期顯示，各卡片各自回報，不會抓到其他卡片或他日資料 */}
                  {selectedDetailType === 'schedule' && !isLeaveScheduleItem(selectedDetailItem) && (() => {
                    const seg = getScheduleSegments(selectedDetailItem)[selectedDetailSegmentIndex] || getScheduleSegments(selectedDetailItem)[0]
                    const siteName = (seg?.siteName || selectedDetailItem?.siteName || '').trim()
                    const scheduleId = String(selectedDetailItem?.id ?? '').trim()
                    const segmentIndex = Number.isInteger(selectedDetailSegmentIndex) && selectedDetailSegmentIndex >= 0 ? selectedDetailSegmentIndex : 0
                    const ymd = String(selectedDetailItem?.date || '').slice(0, 10)
                    const tripReports = scheduleId && ymd ? getTripReportsBySchedule(scheduleId, segmentIndex, ymd) : []
                    const order = Array.isArray(tripReportActionTypes) ? tripReportActionTypes : ['出發', '抵達', '休息', '上工', '收工', '離場']
                    const latestAction = tripReports.length > 0 ? tripReports[0].actionType : null
                    const latestIndex = order.indexOf(latestAction)
                    const nextAction = latestIndex === -1 || latestIndex === order.length - 1 ? (tripReports.length === 0 ? '出發' : null) : order[latestIndex + 1]
                    const currentUser = getCurrentUser()
                    const role = getCurrentUserRole()
                    const participantsStr = String(selectedDetailItem?.participants || '').trim()
                    const participantNames = new Set(participantsStr.split(',').map((p) => String(p || '').trim()).filter(Boolean))
                    const userNames = currentUser ? (getDisplayNamesForAccount(currentUser) || []).map((n) => String(n || '').trim()).filter(Boolean) : []
                    const isParticipant = userNames.some((n) => participantNames.has(n)) || participantNames.has(currentUser || '')
                    const canReport = !!currentUser && !!scheduleId && !!siteName && (role === 'admin' || isParticipant)
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
                    const handleTripReportAction = (actionType) => {
                      if (!canReport || !nextAction || actionType !== nextAction) return
                      setTripReportFlashAt(Date.now())
                      const result = addTripReport({
                        scheduleId,
                        segmentIndex,
                        projectId: siteName,
                        projectName: siteName,
                        actionType,
                        userId: currentUser,
                        userName: getDisplayNameForAccount(currentUser || ''),
                        ymd
                      })
                      if (result.success) setTripReportsRevision((r) => r + 1)
                    }
                    return (
                      <div className="mt-4" key={`trip-${scheduleId}-${segmentIndex}-${ymd}-${tripReportsRevision}`}>
                        <div className="text-blue-300 mb-2">行程回報紀錄:</div>
                        {nextAction && canReport && (
                          <div className="mb-2">
                            <div className="text-blue-200 text-xs mb-1">點擊卡片回報下一狀態（依序：出發→抵達→休息→上工→收工→離場）</div>
                            <button
                              type="button"
                              onClick={() => handleTripReportAction(nextAction)}
                              className="relative w-full bg-yellow-500/20 border-2 border-yellow-400 rounded-lg p-3 flex items-center justify-center gap-2 hover:bg-yellow-500/30 active:bg-yellow-500/40 transition-colors touch-manipulation overflow-hidden"
                            >
                              {tripReportFlashAt > 0 && (
                                <span
                                  className="trip-report-flame-burst absolute inset-0 pointer-events-none rounded-lg"
                                  onAnimationEnd={() => setTripReportFlashAt(0)}
                                  aria-hidden
                                />
                              )}
                              <span className="font-bold text-yellow-300 text-lg relative z-10">回報：{nextAction}</span>
                            </button>
                          </div>
                        )}
                        {tripReports.length === 0 && !canReport && (
                          <div className="bg-blue-800 rounded-lg p-3 text-blue-200 text-sm">尚無行程回報。參與人員可於此排程詳情內點選回報。</div>
                        )}
                        {tripReports.length > 0 && (
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

                  {selectedDetailType === 'schedule' && hasPendingChangeRequest(selectedDetailItem) && (
                    <div className="mt-3 bg-purple-600/20 border border-purple-500/40 rounded-lg p-3 text-purple-100 text-sm">
                      此排程有工作項目或回程里程「異動/取消」待審，待審期間暫不列入績效評分。
                    </div>
                  )}
                      </>
                    )}
                  </div>
                )
              })()}

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

            {/* 排程詳情：編輯／刪除按鈕固定在彈窗底部，不隨內容捲動，確保可點擊 */}
            {selectedDetailType === 'schedule' && selectedDetailItem && (!isLeaveScheduleItem(selectedDetailItem) || getCurrentUserRole() === 'admin') && (
              <div className="flex space-x-3 pt-4 mt-4 border-t border-blue-700 flex-shrink-0 bg-blue-900 rounded-b-lg -mb-6 -mx-6 px-6 pb-6">
                {!isLeaveScheduleItem(selectedDetailItem) && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleEditSchedule(); }}
                      className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500 active:bg-yellow-600 transition-colors touch-manipulation cursor-pointer"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCopyScheduleTarget(selectedDetailItem)
                        setCopyScheduleNewDate(selectedDetailItem?.date ? String(selectedDetailItem.date).slice(0, 10) : new Date().toISOString().slice(0, 10))
                        setShowCopyScheduleModal(true)
                      }}
                      className="flex-1 bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors touch-manipulation cursor-pointer"
                    >
                      複製
                    </button>
                  </>
                )}
                {getCurrentUserRole() === 'admin' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(); }}
                    className="flex-1 bg-red-500 text-white font-semibold py-2 rounded-lg hover:bg-red-600 active:bg-red-700 transition-colors touch-manipulation cursor-pointer"
                  >
                    刪除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 複製排程：指定新日期 */}
      {showCopyScheduleModal && copyScheduleTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={() => { setShowCopyScheduleModal(false); setCopyScheduleTarget(null); }}>
          <div className="bg-blue-900 border border-blue-500 rounded-lg shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-3">複製排程並指定新日期</h3>
            <p className="text-blue-200 text-sm mb-3">將整張卡片複製到新日期，活動、參與人員、車輛、預排工作項目等一併複製；施工照片與里程異動申請會清除。</p>
            <label className="block text-gray-300 text-sm mb-1">新日期</label>
            <input
              type="date"
              value={copyScheduleNewDate}
              onChange={(e) => setCopyScheduleNewDate(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCopyScheduleModal(false); setCopyScheduleTarget(null); }}
                className="flex-1 py-2 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-500"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmCopySchedule}
                className="flex-1 py-2 rounded-lg bg-yellow-500 text-black font-semibold hover:bg-yellow-400"
              >
                確定複製
              </button>
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

                      {/* 出發駕駛／回程駕駛：多台車時依 vehicleEntries 顯示 */}
                      {(Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0)
                        ? schedule.vehicleEntries.map((entry, idx) => (
                            (entry.departureDriver || entry.returnDriver) && (
                              <div key={idx} className="text-white text-sm">
                                {entry.vehicle && <span className="text-yellow-300">{entry.vehicle}: </span>}
                                {entry.departureDriver && <span><span className="text-blue-300">出發</span> {entry.departureDriver}</span>}
                                {entry.departureDriver && entry.returnDriver && ' / '}
                                {entry.returnDriver && <span><span className="text-blue-300">回程</span> {entry.returnDriver}</span>}
                              </div>
                            )
                          ))
                        : (schedule.departureDriver || schedule.returnDriver) && (
                            <>
                              {schedule.departureDriver && (
                                <div className="text-white text-sm"><span className="text-blue-300">出發駕駛:</span> {schedule.departureDriver}</div>
                              )}
                              {schedule.returnDriver && (
                                <div className="text-white text-sm"><span className="text-blue-300">回程駕駛:</span> {schedule.returnDriver}</div>
                              )}
                            </>
                          )}

                      {/* 工作項目 */}
                      {schedule.workItems && schedule.workItems.length > 0 && (
                        <div className="text-white text-sm">
                          <div 
                            className="flex items-center justify-between cursor-pointer hover:text-blue-200"
                            onClick={() => handleToggleWorkItems(schedule.id)}
                          >
                            <span className="text-blue-300">預排工作項目:</span>
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
                              {expandWorkItemsToLogical(schedule.workItems).map((item, idx) => (
                                <div key={item.id || idx} className="text-blue-100">
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

      {/* 異動方式選擇（先選：申請取消 / 變更內容） */}
      {changeAction.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold">異動申請</div>
              <button
                type="button"
                onClick={closeChangeActionModal}
                className="text-gray-300 hover:text-white"
              >
                關閉
              </button>
            </div>
            <div className="text-gray-300 text-sm">
              先選擇你要申請的類型：
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  submitCancelRequest(changeAction.scheduleId, changeAction.itemId)
                  closeChangeActionModal()
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded-lg transition-colors"
              >
                申請取消
              </button>
              <button
                type="button"
                onClick={() => {
                  // 先關選擇，再開「變更內容」表單
                  const sid = changeAction.scheduleId
                  const wid = changeAction.itemId
                  closeChangeActionModal()
                  const schedule = (editingScheduleId === sid)
                    ? { ...scheduleFormData, id: sid }
                    : (selectedDetailItem && selectedDetailType === 'schedule' && String(selectedDetailItem?.id) === sid)
                      ? selectedDetailItem
                      : schedules.find((s) => String(s?.id) === sid)
                  const baseItems = !schedule
                    ? []
                    : (editingScheduleId === sid && Array.isArray(scheduleFormData.workItems))
                      ? scheduleFormData.workItems
                      : (() => {
                          const segs = Array.isArray(schedule?.segments) && schedule.segments.length > 0 ? schedule.segments : null
                          return segs
                            ? segs.flatMap((seg) => Array.isArray(seg?.workItems) ? seg.workItems : [])
                            : (Array.isArray(schedule?.workItems) ? schedule.workItems : [])
                        })()
                  const item = (Array.isArray(baseItems) ? baseItems : []).find((x) => String(x?.id || '') === String(wid || ''))
                  if (item) openChangeRequest(sid, item)
                }}
                className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-2 rounded-lg transition-colors"
              >
                變更內容
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-3">
              「申請取消」送出後會進入待審，核准後系統會自動刪除此工作項目，且待審期間不計分。
            </p>
          </div>
        </div>
      )}

      {/* 異動申請 Modal（行事曆） */}
      {changeReq.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-5 overscroll-contain">
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

              {/* 多列工作內容（申請改為）：單人 或 協作一起完成 時顯示 */}
              {(!changeReq.proposedIsCollaborative || changeReq.proposedCollabMode === 'shared') && (
                <div className="space-y-2">
                  <label className="block text-gray-300 text-sm mb-1">工作內容多列（申請改為）</label>
                  {(Array.isArray(changeReq.proposedContentRows) ? changeReq.proposedContentRows : []).map((row, rowIndex) => (
                    <div key={row.id || rowIndex} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-gray-600 rounded p-2 bg-gray-800/50">
                      <div className="md:col-span-5">
                        <input
                          type="text"
                          value={row.workContent ?? ''}
                          onChange={(e) => {
                            const next = (changeReq.proposedContentRows || []).map((r, i) => (i === rowIndex ? { ...r, workContent: e.target.value } : r))
                            setChangeReq((prev) => ({ ...prev, proposedContentRows: next }))
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          placeholder="工作內容"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="number"
                          value={row.targetQuantity ?? ''}
                          onChange={(e) => {
                            const next = (changeReq.proposedContentRows || []).map((r, i) => (i === rowIndex ? { ...r, targetQuantity: e.target.value } : r))
                            setChangeReq((prev) => ({ ...prev, proposedContentRows: next }))
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          min="0"
                          step="0.01"
                          placeholder={changeReq.proposedIsCollaborative ? '共同目標' : '目標'}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="number"
                          value={row.actualQuantity ?? ''}
                          onChange={(e) => {
                            const next = (changeReq.proposedContentRows || []).map((r, i) => (i === rowIndex ? { ...r, actualQuantity: e.target.value } : r))
                            setChangeReq((prev) => ({ ...prev, proposedContentRows: next }))
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                          min="0"
                          step="0.01"
                          placeholder="實際"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            const next = (changeReq.proposedContentRows || []).filter((_, i) => i !== rowIndex)
                            setChangeReq((prev) => ({ ...prev, proposedContentRows: next.length > 0 ? next : [{ id: `row-${Date.now()}`, workContent: '', targetQuantity: '', actualQuantity: '' }] }))
                          }}
                          className="text-red-400 hover:text-red-500 text-sm py-2"
                        >
                          刪除本項
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setChangeReq((prev) => ({
                      ...prev,
                      proposedContentRows: [...(prev.proposedContentRows || []), { id: `row-${Date.now()}`, workContent: '', targetQuantity: '', actualQuantity: '' }]
                    }))}
                    className="text-green-400 hover:text-green-300 text-sm py-1"
                  >
                    + 新增一列
                  </button>
                </div>
              )}

              {/* 協作分開完成：單一工作內容欄位 */}
              {changeReq.proposedIsCollaborative && changeReq.proposedCollabMode === 'separate' && (
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
              )}

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
                    {responsiblePersonOptions.length > 0 && (
                      <div className="mt-2">
                        <div className="text-gray-400 text-xs mb-1">下拉快速選擇</div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-24 overflow-y-auto pr-1">
                          {responsiblePersonOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              title={opt}
                              onClick={() => setChangeReq((prev) => ({ ...prev, proposedResponsiblePerson: String(opt || '').trim() }))}
                              className={`w-full text-[11px] leading-tight px-2 py-1 rounded border transition-colors truncate ${
                                String(changeReq.proposedResponsiblePerson || '').trim() === String(opt || '').trim()
                                  ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-yellow-400 hover:text-yellow-200'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
                      {responsiblePersonOptions.length > 0 && (
                        <div className="mt-2">
                          <div className="text-gray-400 text-xs mb-1">下拉快速選擇（可多選）</div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-24 overflow-y-auto pr-1">
                            {responsiblePersonOptions.map((opt) => {
                              const name = String(opt || '').trim()
                              const selected = (changeReq.proposedCollaborators || []).some((c) => String(c?.name || '').trim() === name)
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  title={opt}
                                  onClick={() => {
                                    if (!name) return
                                    const prev = Array.isArray(changeReq.proposedCollaborators) ? changeReq.proposedCollaborators : []
                                    const next = selected
                                      ? prev.filter((c) => String(c?.name || '').trim() !== name)
                                      : [...prev, { name, targetQuantity: '' }]
                                    setChangeReq((p) => ({ ...p, proposedCollaborators: next }))
                                  }}
                                  className={`w-full text-[11px] leading-tight px-2 py-1 rounded border transition-colors truncate ${
                                    selected
                                      ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                      : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-yellow-400 hover:text-yellow-200'
                                  }`}
                                >
                                  {opt}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
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
                    <p className="text-gray-500 text-xs">一起完成時，目標／實際請在上方「工作內容多列」各列填寫即可，不需再填總數量。</p>
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

      {/* 回程里程異動申請 Modal */}
      {vehicleReturnMileageChangeReq.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[105] p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">回程里程異動申請</h3>
              <button type="button" onClick={closeVehicleReturnMileageChangeReq} className="text-gray-300 hover:text-white">關閉</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-gray-400 text-sm">車輛：</span>
                <span className="text-yellow-400 font-medium">{vehicleReturnMileageChangeReq.vehicle || '—'}</span>
              </div>
              <div>
                <span className="text-gray-400 text-sm">目前回程里程：</span>
                <span className="text-white">{vehicleReturnMileageChangeReq.currentReturnMileage || '—'} km</span>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">異動原因 *</label>
                <textarea
                  value={vehicleReturnMileageChangeReq.reason}
                  onChange={(e) => setVehicleReturnMileageChangeReq((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  rows={3}
                  placeholder="請說明為何需要異動回程里程"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">申請改為（回程里程）</label>
                <input
                  type="number"
                  value={vehicleReturnMileageChangeReq.proposedReturnMileage}
                  onChange={(e) => setVehicleReturnMileageChangeReq((prev) => ({ ...prev, proposedReturnMileage: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  min="0"
                  step="0.1"
                  placeholder="請輸入新的回程里程"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={submitVehicleReturnMileageChangeReq} className="flex-1 bg-yellow-400 text-black font-semibold py-2 rounded-lg hover:bg-yellow-500">
                  送出申請
                </button>
                <button type="button" onClick={closeVehicleReturnMileageChangeReq} className="flex-1 bg-gray-800 text-white font-semibold py-2 rounded-lg hover:bg-gray-700">
                  取消
                </button>
              </div>
              <p className="text-gray-500 text-xs">送出後將進入待審，由管理員核准後套用新回程里程。</p>
            </div>
          </div>
        </div>
      )}

      {/* 新增/编辑排程模态框 */}
      {(showScheduleForm || showScheduleModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div ref={scheduleModalBodyRef} className="bg-charcoal border border-yellow-400 rounded-lg shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-yellow-400">
                  {editingScheduleId ? '編輯排程' : '新增排程'}
                </h3>
                {editingScheduleId && (
                  <div className="text-gray-400 text-xs mt-1">
                    建立者：{displayCreator(scheduleFormData?.createdBy)}
                  </div>
                )}
              </div>
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
                {/* 活動（多案場勾選，套用後為排程內活動名稱） */}
                <div className="relative" ref={siteDropdownRef}>
                  <label className="block text-gray-300 text-sm mb-2">
                    活動 <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="siteName"
                      value={scheduleFormData.siteName}
                      onChange={handleSiteInput}
                      placeholder="請選擇案場（可多選）或直接輸入"
                      className="flex-1 bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                      required
                    />
                    <button
                      type="button"
                      onClick={openSitePicker}
                      className="shrink-0 px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 text-black font-medium text-sm whitespace-nowrap"
                    >
                      選擇案場
                    </button>
                  </div>
                  {scheduleFormData.siteName && (
                    <p className="text-gray-500 text-xs mt-1">排程內活動名稱：{scheduleFormData.siteName}</p>
                  )}
                  {showSiteDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg overflow-hidden min-w-[280px] max-h-[320px] flex flex-col">
                      <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/40 shrink-0">
                        <div className="flex flex-wrap gap-2 mb-2">
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
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={siteSearchQuery}
                            onChange={(e) => setSiteSearchQuery(e.target.value)}
                            placeholder="搜尋案場名稱"
                            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400"
                          />
                          <button
                            type="button"
                            onClick={applySitePicker}
                            className="shrink-0 px-3 py-1.5 rounded bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-sm"
                          >
                            套用
                          </button>
                        </div>
                        {selectedSiteNamesForPicker.length > 0 && (
                          <p className="text-amber-200/90 text-xs mt-1.5">已選 {selectedSiteNamesForPicker.length} 個案場</p>
                        )}
                      </div>
                      <div className="overflow-y-auto max-h-48 p-2">
                        {(() => {
                          const filtered = projectSiteOptions
                            .filter((opt) => {
                              if (siteStatusFilter !== 'all' && String(opt?.status || '') !== siteStatusFilter) return false
                              const q = (siteSearchQuery || '').trim()
                              if (!q) return true
                              const name = String(opt?.name || '')
                              const label = String(opt?.label || '')
                              return name.includes(q) || label.includes(q)
                            })
                            .slice(0, 200)
                          if (filtered.length === 0) {
                            return (
                              <p className="text-gray-500 text-sm py-4 text-center">
                                {projectSiteOptions.length === 0 ? '尚無案場，請至專案管理新增' : '無符合的案場'}
                              </p>
                            )
                          }
                          return filtered.map((option) => {
                            const name = option?.name || ''
                            const checked = selectedSiteNamesForPicker.includes(name)
                            return (
                              <label
                                key={name}
                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded cursor-pointer text-white text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSiteInPicker(name)}
                                  className="w-4 h-4 rounded border-gray-500 text-yellow-400 focus:ring-yellow-400"
                                />
                                <span className="truncate flex-1">{name}</span>
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
                              </label>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )}
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

                {/* 多處行程：切換編輯案場（每個案場獨自一張卡片：工作項目 + 車輛） */}
                {Array.isArray(scheduleFormData.segments) && scheduleFormData.segments.length > 1 && (
                  <div className="md:col-span-2">
                    <label className="block text-gray-300 text-sm mb-2">目前編輯案場</label>
                    <div className="flex flex-wrap gap-2">
                      {scheduleFormData.segments.map((seg, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setScheduleFormData((prev) => {
                              const segs = [...(prev.segments || [])]
                              if (segs[editingFormSegmentIndex]) {
                                segs[editingFormSegmentIndex] = {
                                  ...segs[editingFormSegmentIndex],
                                  workItems: prev.workItems || [],
                                  vehicleEntries: prev.vehicleEntries || []
                                }
                              }
                              const next = segs[idx] || {}
                              let entries = Array.isArray(next.vehicleEntries) ? next.vehicleEntries : []
                              if (entries.length === 0 && idx > 0 && Array.isArray(segs[0]?.vehicleEntries) && segs[0].vehicleEntries.length > 0) {
                                entries = segs[0].vehicleEntries.map((e) => ({ ...emptyVehicleEntry(), vehicle: String(e?.vehicle || '').trim() }))
                              }
                              return {
                                ...prev,
                                segments: segs,
                                workItems: next.workItems || [],
                                vehicleEntries: entries
                              }
                            })
                            setEditingFormSegmentIndex(idx)
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            editingFormSegmentIndex === idx
                              ? 'bg-yellow-500 text-black ring-2 ring-yellow-300'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {seg.siteName || `案場 ${idx + 1}`}
                        </button>
                      ))}
                    </div>
                    <p className="text-gray-500 text-xs mt-1">下方「預排工作項目」與「車輛」屬於目前選擇的案場，切換案場可編輯另一張卡片。</p>
                  </div>
                )}

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
                        requestAnimationFrame(() => scrollModalToRef(participantDropdownRef, { offsetTop: 12 }))
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

                {/* 車輛（可勾選多台，例如案場兩台車） */}
                <div className="relative" ref={vehicleDropdownRef}>
                  <label className="block text-gray-300 text-sm mb-2">
                    車輛（可勾選多台）
                  </label>
                  {/* 勾選清單：選單項目 + 已選但尚未在選單中的項目 */}
                  {(vehicleOptions.length > 0 || selectedVehicleList.length > 0) && (
                    <div className="mb-3 p-3 bg-gray-800/60 border border-gray-600 rounded-lg">
                      <span className="text-gray-400 text-xs block mb-2">已選：{selectedVehicleList.length ? selectedVehicleList.join('、') : '無'}</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {[...new Set([...vehicleOptions, ...selectedVehicleList])].map((option) => (
                          <label key={option} className="inline-flex items-center gap-2 cursor-pointer text-white text-sm">
                            <input
                              type="checkbox"
                              checked={selectedVehicleList.includes(option)}
                              onChange={() => handleVehicleCheckToggle(option)}
                              className="rounded border-gray-500 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newVehicleInput}
                      onChange={handleNewVehicleInput}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddVehicle())}
                      placeholder="請輸入車輛資訊"
                      className="flex-1 bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddVehicle}
                      className="shrink-0 px-3 py-2 rounded bg-gray-600 hover:bg-gray-500 text-yellow-400 text-sm whitespace-nowrap"
                    >
                      + 加入選單
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">輸入後按「加入選單」可新增選項，再從上方勾選一或多台車輛</p>
                </div>

                {/* 每台車一組：出發/回程駕駛、里程、加油、發票；多案場時每案場的車輛里程個別填寫 */}
                {Array.isArray(scheduleFormData.segments) && scheduleFormData.segments.length > 1 && (
                  <p className="text-amber-200/90 text-sm mb-2">
                    以下為目前編輯案場「{scheduleFormData.segments[editingFormSegmentIndex]?.siteName || '案場'}」的車輛，出發／回程里程請依案場個別填寫。
                  </p>
                )}
                {(() => {
                  const excludeOptions = (editingFormSegmentIndex > 0 && editingScheduleId)
                    ? { excludeScheduleId: editingScheduleId, excludeSegmentIndexMax: editingFormSegmentIndex - 1 }
                    : {}
                  const lastReturnMap = getLastReturnMileageByVehicle(excludeOptions)
                  const editingSchedule = schedules.find((s) => String(s?.id) === editingScheduleId)
                  const pendingReturnMileageReqs = (Array.isArray(editingSchedule?.vehicleReturnMileageChangeRequests) ? editingSchedule.vehicleReturnMileageChangeRequests : []).filter((r) => String(r?.status || '') === 'pending')
                  return (Array.isArray(scheduleFormData.vehicleEntries) ? scheduleFormData.vehicleEntries : []).map((entry, idx) => {
                    const lastReturn = entry.vehicle ? lastReturnMap[String(entry.vehicle).trim()] : null
                    const hasPendingReturnMileageReq = pendingReturnMileageReqs.some((r) => String(r?.vehicle || '').trim() === String(entry.vehicle || '').trim())
                    return (
                  <div key={entry.vehicle || idx} className="space-y-3 p-4 bg-gray-800/50 border border-gray-600 rounded-lg">
                    <h3 className="text-yellow-400 font-medium text-sm border-b border-gray-600 pb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span>車輛 {idx + 1}：{entry.vehicle || '(未命名)'}</span>
                      {lastReturn != null && !Number.isNaN(lastReturn) && (
                        <span className="text-gray-400 font-normal text-xs">
                          上次回程：<span className="text-amber-300 font-semibold">{Number(lastReturn).toLocaleString(undefined, { maximumFractionDigits: 0 })} km</span>
                          <span className="text-gray-500 ml-0.5">（可作出發里程參考）</span>
                        </span>
                      )}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">出發駕駛</label>
                        <select
                          value={entry.departureDriver || ''}
                          onChange={(e) => handleVehicleEntryChange(idx, 'departureDriver', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                        >
                          <option value="">請選擇</option>
                          {responsiblePersonOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">回程駕駛</label>
                        <select
                          value={entry.returnDriver || ''}
                          onChange={(e) => handleVehicleEntryChange(idx, 'returnDriver', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                        >
                          <option value="">請選擇</option>
                          {responsiblePersonOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">出發里程</label>
                        <input
                          type="number"
                          value={entry.departureMileage || ''}
                          onChange={(e) => handleVehicleEntryChange(idx, 'departureMileage', e.target.value)}
                          placeholder="請輸入出發里程"
                          className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                          min="0"
                          step="0.1"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">回程里程</label>
                        {(() => {
                          const isReturnMileageLocked = !!editingScheduleId && originalVehicleReturnMileageLockedRef.current.has(String(entry.vehicle || '').trim())
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                value={entry.returnMileage || ''}
                                onChange={(e) => handleVehicleEntryChange(idx, 'returnMileage', e.target.value)}
                                placeholder="請輸入回程里程"
                                className={`w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm ${isReturnMileageLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                                min="0"
                                step="0.1"
                                disabled={isReturnMileageLocked}
                                readOnly={isReturnMileageLocked}
                              />
                              {isReturnMileageLocked && (
                                <>
                                  {hasPendingReturnMileageReq && (
                                    <span className="text-xs px-2 py-1 rounded bg-purple-600/30 text-purple-200 border border-purple-500/40">回程里程異動待審</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openVehicleReturnMileageChangeReq(editingScheduleId, entry)}
                                    className="shrink-0 text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40 hover:bg-blue-600/40"
                                  >
                                    異動申請
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!entry.needRefuel}
                          onChange={(e) => handleVehicleEntryChange(idx, 'needRefuel', e.target.checked)}
                          className="w-4 h-4 text-yellow-400 bg-gray-700 border-gray-500 rounded focus:ring-yellow-400"
                        />
                        <span className="text-gray-300 text-sm">是否加油</span>
                      </label>
                      {entry.needRefuel && (
                        <input
                          type="number"
                          value={entry.fuelCost || ''}
                          onChange={(e) => handleVehicleEntryChange(idx, 'fuelCost', e.target.value)}
                          placeholder="油資金額"
                          className="w-28 bg-gray-700 border border-gray-500 rounded px-2 py-1 text-white text-sm"
                          min="0"
                          step="0.01"
                        />
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!entry.invoiceReturned}
                          onChange={(e) => handleVehicleEntryChange(idx, 'invoiceReturned', e.target.checked)}
                          className="w-4 h-4 text-yellow-400 bg-gray-700 border-gray-500 rounded focus:ring-yellow-400"
                        />
                        <span className="text-gray-300 text-sm">發票是否繳回</span>
                      </label>
                    </div>
                  </div>
                    );
                  });
                })()}
                {(!scheduleFormData.vehicleEntries || scheduleFormData.vehicleEntries.length === 0) && (
                  <p className="text-gray-500 text-sm">請先在上方勾選一或多台車輛，此處會顯示每台車的出發/回程駕駛與里程。</p>
                )}
              </div>

              {/* 工作項目列表 */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-gray-300 text-sm font-semibold">
                    預排工作項目
                  </label>
                </div>

                <div className="space-y-3 pb-24">
                  {scheduleFormData.workItems.map((item, index) => {
                    const plannedLocked = isPlannedLocked(item)
                    const crKind = String(normalizeWorkItem(item)?.changeRequest?.kind || normalizeWorkItem(item)?.changeRequest?.type || 'change').trim() || 'change'
                    const crStatus = String(normalizeWorkItem(item)?.changeRequest?.status || '')
                    const isPendingChange = crStatus === 'pending'
                    return (
                    <div key={item.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-yellow-400 font-semibold text-sm">工作項目 {index + 1}</span>
                        <div className="flex items-center gap-2">
                          {isPendingChange && (
                            <span className="text-xs px-2 py-1 rounded bg-purple-600/30 text-purple-200 border border-purple-500/40">
                              {crKind === 'cancel' ? '取消待審（不計分）' : '異動待審（不計分）'}
                            </span>
                          )}
                          {plannedLocked && !isPendingChange && editingScheduleId && (
                            <button
                              type="button"
                              onClick={() => openChangeActionModal(editingScheduleId, item)}
                              className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-200 border border-blue-500/40 hover:bg-blue-600/40"
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
                        {/* 已展開多項（獨立負責 或 協作）：負責人/協作區 + 多筆工作內容列 */}
                        {item.contentRows && item.contentRows.length > 0 ? (
                          <>
                            {!item.isCollaborative ? (
                              <div className="md:col-span-2 relative" ref={(el) => { if (el) responsiblePersonDropdownRefs.current[item.id] = el }}>
                                <label className="block text-gray-300 text-xs mb-1">負責人 *</label>
                                <input
                                  type="text"
                                  value={item.responsiblePerson || ''}
                                  onChange={(e) => handleResponsiblePersonInput(item.id, e.target.value)}
                                  onFocus={() => setShowResponsiblePersonDropdown(prev => ({ ...prev, [item.id]: true }))}
                                  placeholder="請輸入負責人"
                                  className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                  required
                                  disabled={plannedLocked}
                                />
                                {showResponsiblePersonDropdown[item.id] && responsiblePersonOptions.length > 0 && (
                                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {responsiblePersonOptions.map((option, optIndex) => (
                                      <div key={optIndex} onClick={() => handleResponsiblePersonSelect(item.id, option)} className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white text-sm">{option}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="md:col-span-2 space-y-2">
                                <div>
                                  <label className="block text-gray-300 text-xs mb-1">協作計算方式</label>
                                  <select
                                    value={getWorkItemCollabMode(item)}
                                    onChange={(e) => { handleWorkItemChange(index, 'collabMode', e.target.value) }}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                                    disabled={plannedLocked}
                                  >
                                    <option value="shared">一起完成（算總數）</option>
                                    <option value="separate">分開完成（各自算）</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-gray-300 text-xs mb-1">協作負責人 *</label>
                                  <input
                                    type="text"
                                    value={toCollaboratorsCsv(item)}
                                    onChange={(e) => {
                                      const next = parseCollaboratorsCsv(e.target.value)
                                      const prev = getWorkItemCollaborators(item)
                                      const prevTarget = new Map(prev.map((c) => [String(c.name).trim(), c.targetQuantity]))
                                      const prevActual = new Map(prev.map((c) => [String(c.name).trim(), c.actualQuantity]))
                                      handleWorkItemChange(index, 'collaborators', next.map((c) => ({ ...c, targetQuantity: prevTarget.get(String(c.name).trim()) ?? '', actualQuantity: prevActual.get(String(c.name).trim()) ?? '' })))
                                    }}
                                    placeholder="輸入協作負責人（可逗號分隔/可手打）"
                                    className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                    required
                                    disabled={plannedLocked}
                                  />
                                  {responsiblePersonOptions.length > 0 && (
                                    <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-24 overflow-y-auto">
                                      {responsiblePersonOptions.map((opt) => {
                                        const selected = (getWorkItemCollaborators(item) || []).some((c) => String(c?.name || '').trim() === String(opt || '').trim())
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                              const prev = getWorkItemCollaborators(item)
                                              const name = String(opt || '').trim()
                                              if (!name) return
                                              const next = selected ? prev.filter((c) => String(c?.name || '').trim() !== name) : [...prev, { name, targetQuantity: '', actualQuantity: '' }]
                                              handleWorkItemChange(index, 'collaborators', next)
                                            }}
                                            className={`w-full text-[11px] px-2 py-1 rounded border truncate ${selected ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200' : 'bg-gray-700 border-gray-600 text-gray-200 hover:border-yellow-400'}`}
                                          >
                                            {opt}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {item.contentRows.map((row, rowIndex) => {
                              const collabShared = getWorkItemCollabMode(item) === 'shared'
                              const showQty = !item.isCollaborative || collabShared
                              return (
                                <div key={row.id || rowIndex} className="md:col-span-2 grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-gray-600 rounded p-2 bg-gray-600/50">
                                  <div className={showQty ? 'md:col-span-5' : 'md:col-span-9'}>
                                    <label className="block text-gray-300 text-xs mb-1">工作內容 *</label>
                                    <input
                                      type="text"
                                      value={row.workContent ?? ''}
                                      onChange={(e) => handleContentRowChange(index, rowIndex, 'workContent', e.target.value)}
                                      placeholder="請輸入工作內容"
                                      className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                      disabled={plannedLocked}
                                    />
                                  </div>
                                  {showQty && (
                                    <>
                                      <div className="md:col-span-2">
                                        <label className="block text-gray-300 text-xs mb-1">{item.isCollaborative && collabShared ? '共同目標' : '目標數量'}</label>
                                        <input
                                          type="number"
                                          value={row.targetQuantity ?? ''}
                                          onChange={(e) => handleContentRowChange(index, rowIndex, 'targetQuantity', e.target.value)}
                                          placeholder="目標"
                                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                          min="0"
                                          step="0.01"
                                          disabled={plannedLocked}
                                        />
                                      </div>
                                      <div className="md:col-span-2">
                                        <label className="block text-gray-300 text-xs mb-1">{item.isCollaborative && collabShared ? '共同實際' : '實際達成數量'}</label>
                                        <input
                                          type="number"
                                          value={row.actualQuantity ?? ''}
                                          onChange={(e) => handleContentRowChange(index, rowIndex, 'actualQuantity', e.target.value)}
                                          placeholder="實際"
                                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                                          min="0"
                                          step="0.01"
                                        />
                                      </div>
                                    </>
                                  )}
                                  <div className="md:col-span-2 flex items-end">
                                    <button type="button" onClick={() => handleRemoveContentRow(index, rowIndex)} className="text-red-400 hover:text-red-500 text-sm py-2" disabled={plannedLocked}>刪除本項</button>
                                  </div>
                                </div>
                              )
                            })}
                            {item.isCollaborative && getWorkItemCollabMode(item) === 'separate' && (getWorkItemCollaborators(item) || []).length > 0 && (
                              <div className="md:col-span-2 space-y-2 border border-gray-600 rounded p-2 bg-gray-600/30">
                                <div className="text-gray-300 text-xs">分開完成：每位負責人目標/實際（整張卡一組）</div>
                                {getWorkItemCollaborators(item).map((c) => (
                                  <div key={c.name} className="grid grid-cols-3 gap-2 items-center">
                                    <span className="text-gray-200 text-xs truncate">{c.name}</span>
                                    <input type="number" value={c.targetQuantity ?? ''} onChange={(e) => { const prev = getWorkItemCollaborators(item); const next = prev.map((x) => String(x.name).trim() === String(c.name).trim() ? { ...x, targetQuantity: e.target.value } : x); handleWorkItemChange(index, 'collaborators', next) }} placeholder="目標" className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white text-sm" min="0" step="0.01" disabled={plannedLocked} />
                                    <input type="number" value={c.actualQuantity ?? ''} onChange={(e) => { const prev = getWorkItemCollaborators(item); const next = prev.map((x) => String(x.name).trim() === String(c.name).trim() ? { ...x, actualQuantity: e.target.value } : x); handleWorkItemChange(index, 'collaborators', next) }} placeholder="實際" className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-white text-sm" min="0" step="0.01" />
                                  </div>
                                ))}
                              </div>
                            )}
                            {!plannedLocked && (
                              <div className="md:col-span-2">
                                <button type="button" onClick={() => handleAddContentRow(index)} className="text-green-400 hover:text-green-300 text-sm py-1">
                                  {item.isCollaborative ? '+ 新增同一張卡的工作內容' : '+ 新增同一負責人的項目'}
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                        <div>
                          <label className="block text-gray-300 text-xs mb-1">工作內容 *</label>
                          <input
                            type="text"
                            value={item.workContent}
                            onChange={(e) => handleWorkItemChange(index, 'workContent', e.target.value)}
                            placeholder="請輸入工作內容"
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                            required
                            disabled={plannedLocked}
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
                                disabled={plannedLocked}
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
                                    disabled={plannedLocked}
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
                                  disabled={plannedLocked}
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
                                disabled={plannedLocked}
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
                                disabled={plannedLocked}
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
                              disabled={plannedLocked}
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
                                          disabled={plannedLocked}
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
                        {!plannedLocked && (
                          <div className="md:col-span-2">
                            <button
                              type="button"
                              onClick={() => handleAddContentRow(index)}
                              className="text-green-400 hover:text-green-300 text-sm py-1"
                            >
                              {item.isCollaborative ? '+ 新增同一張卡的工作內容' : '+ 新增同一負責人的項目'}
                            </button>
                          </div>
                        )}
                          </>
                        )}
                      </div>
                    </div>
                    )
                  })}
                  {scheduleFormData.workItems.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      尚未添加工作項目，點擊「新增工作項目」開始添加
                    </div>
                  )}
                </div>

                {/* 手機友善：底部固定新增按鈕，避免每次都要捲回上方再點 */}
                <div className="sticky bottom-0 pt-3 bg-charcoal border-t border-gray-700">
                  <button
                    type="button"
                    onClick={handleAddWorkItem}
                    className="w-full bg-green-500 hover:bg-green-600 text-white text-sm py-2 rounded transition-colors"
                  >
                    + 新增工作項目
                  </button>
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
