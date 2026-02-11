import { useState, useEffect, useCallback } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { getSchedules } from '../utils/scheduleStorage'
import { getProjects } from '../utils/projectStorage'
import { getProjectRecords } from '../utils/projectRecordStorage'
import { getUserLateRecords, getUserPerformanceRecords, savePerformanceRecord, deletePerformanceRecord, getPerformanceRecords, saveLateRecord, saveAttendanceRecord, getUserAttendanceRecords } from '../utils/performanceStorage'
import { getCompletionRateRules, saveCompletionRateRules, calculateCompletionRateAdjustment } from '../utils/completionRateConfigStorage'
import { getLatePerformanceConfig, saveLatePerformanceConfig, calculateLateCountAdjustment, calculateLateMinutesAdjustment, calculateNoClockInAdjustment } from '../utils/latePerformanceConfigStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { isSupabaseEnabled as isAuthSupabase, getPublicProfiles } from '../utils/authSupabase'
import { getLeaveApplications } from '../utils/leaveApplicationStorage'
import { normalizeWorkItem, getWorkItemCollaborators, getWorkItemTargetForNameForPerformance, getWorkItemActualForNameForPerformance, expandWorkItemsToLogical } from '../utils/workItemCollaboration'

function PersonalPerformance() {
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  // 管理者查看其他用戶績效時選擇的用戶（null表示查看當前用戶）
  const [selectedViewUser, setSelectedViewUser] = useState(null)
  // 改為年月選擇（每個月結算）
  const today = new Date()
  const currentYear = today.getFullYear()
  const defaultYear = currentYear >= 2026 ? currentYear : 2026 // 如果當前年份小於2026，預設為2026
  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1) // 1-12
  const [performanceData, setPerformanceData] = useState({
    totalWorkItems: 0,          // 總工作項目數
    completedItems: 0,          // 完成的工作項目數（完成率>=100%）
    partialItems: 0,            // 部分完成的工作項目數（完成率>0但<100%）
    uncompletedItems: 0,        // 未完成的工作項目數（完成率=0%）
    averageCompletionRate: 0,   // 平均完成率
    lateCount: 0,               // 遲到次數
    performanceScore: 100,      // 績效評分（初始100分）
    totalAdjustment: 0,         // 總調整分數（管理者+達成率）
    adjustmentDisplay: '',       // 調整顯示文字
    managerAdjustment: 0,       // 管理者調整分數
    completionRateAdjustment: 0, // 達成率調整分數（完成率→績效分數→統計至績效評分）
    lateAdjustment: 0,          // 遲到調整分數
    noClockInAdjustment: 0,     // 未打卡調整分數
    workDays: 0,                // 工作天數
    workDetails: [],            // 工作明細
    workItemStats: {},          // 按工作項目類型統計
    performanceRecords: [],     // 平時表現評分記錄（當前用戶）
    allPerformanceRecords: [], // 所有評分記錄（管理者視圖）
    recordsByMonth: {},         // 按月份分組的記錄
    lateRecords: [],            // 遲到記錄列表（用於點擊查看詳情）
    attendanceRecords: [],      // 出勤記錄列表（所有打卡記錄，包括正常和遲到）
    totalLateMinutes: 0,         // 總遲到分鐘數
    normalAttendanceCount: 0,    // 正常出勤次數
    lateAttendanceCount: 0,      // 遲到次數
    noClockInCount: 0,          // 未打卡次數
    noClockInRecords: []         // 未打卡記錄列表（用於詳情顯示）
  })
  
  // 管理者評分表單狀態
  const [showScoreForm, setShowScoreForm] = useState(false)
  const [scoreForm, setScoreForm] = useState({
    selectedUserNames: [], // 可多選員工（帳號陣列）
    date: new Date().toISOString().split('T')[0],
    adjustmentType: '+', // + 或 -
    adjustment: '', // 調整分數
    details: ''
  })
  const [users, setUsers] = useState([])
  
  // 達成率調整規則配置狀態（僅管理者）
  const [showCompletionRateConfig, setShowCompletionRateConfig] = useState(false)
  const [completionRateRules, setCompletionRateRules] = useState([])
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [newRule, setNewRule] = useState({ minRate: '', maxRate: '', adjustment: '', label: '' })
  
  // 遲到績效評分配置狀態（僅管理者）
  const [showLatePerformanceConfig, setShowLatePerformanceConfig] = useState(false)
  const [latePerformanceConfig, setLatePerformanceConfig] = useState({ enabled: true, latePenaltyPerTime: -2, noClockInPenaltyPerTime: -2 })
  const [penaltyConfig, setPenaltyConfig] = useState({ latePenalty: '-2', noClockInPenalty: '-2' })
  
  // 每日績效表現狀態（僅管理者）
  const [showDailyPerformance, setShowDailyPerformance] = useState(false)
  const [dailyPerformanceData, setDailyPerformanceData] = useState([]) // [{ date, userName, workItems, completionRate, performanceScore, ... }]
  
  // 遲到記錄詳情狀態
  const [showLateRecords, setShowLateRecords] = useState(false)
  
  // 刷卡記錄導入狀態（僅管理者）
  const [showAttendanceImport, setShowAttendanceImport] = useState(false)
  const [workStartTime, setWorkStartTime] = useState('08:00') // 預設上班時間 08:00
  const [importData, setImportData] = useState('') // CSV 數據文本
  const [importPreview, setImportPreview] = useState([]) // 預覽數據
  const [importResult, setImportResult] = useState(null) // 導入結果
  const [dataRevision, setDataRevision] = useState(0)

  const loadUsersForAdmin = useCallback(async () => {
    try {
      const me = getCurrentUser()
      // 管理員用戶清單：只顯示非管理員（員工），且排除自己，避免評分時誤選到自己
      if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
        const profiles = await getPublicProfiles()
        const list = (Array.isArray(profiles) ? profiles : [])
          .filter((p) => !p?.is_admin && p?.account !== me)
          .map((p) => ({
            account: p.account,
            name: p.display_name || p.account,
            role: p.is_admin ? 'admin' : 'user'
          }))
        setUsers(list)
        return
      }
      const allUsers = getUsers()
      setUsers((allUsers || []).filter(u => u.role !== 'admin' && u.account !== me))
    } catch (e) {
      console.warn('loadUsersForAdmin failed', e)
      const allUsers = getUsers()
      const me = getCurrentUser()
      setUsers((allUsers || []).filter(u => u.role !== 'admin' && u.account !== me))
    }
  }, [])

  const refetchPerformance = () => {
    const role = getCurrentUserRole()
    if (role === 'admin') {
      // Supabase 模式也要能取得員工清單，避免「評分/查看用戶」下拉只看到自己
      loadUsersForAdmin()
      setCompletionRateRules(getCompletionRateRules())
      const lateConfig = getLatePerformanceConfig()
      setLatePerformanceConfig(lateConfig)
      setPenaltyConfig({
        latePenalty: (lateConfig.latePenaltyPerTime ?? -2).toString(),
        noClockInPenalty: (lateConfig.noClockInPenaltyPerTime ?? -2).toString()
      })
    }
    setDataRevision(r => r + 1)
  }
  useRealtimeKeys(
    ['jiameng_users', 'jiameng_dropdown_options', 'jiameng_engineering_schedules', 'jiameng_projects', 'jiameng_project_records:*', 'jiameng_project_records__*', 'jiameng_personal_performance', 'jiameng_completion_rate_config', 'jiameng_late_performance_config'],
    refetchPerformance
  )

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    
    // 如果是管理者，載入用戶列表和達成率規則
    if (role === 'admin') {
      loadUsersForAdmin()
      // 載入達成率調整規則
      const rules = getCompletionRateRules()
      setCompletionRateRules(rules)
      
      // 載入遲到績效評分配置
      const lateConfig = getLatePerformanceConfig()
      setLatePerformanceConfig(lateConfig)
      setPenaltyConfig({
        latePenalty: (lateConfig.latePenaltyPerTime || -2).toString(),
        noClockInPenalty: (lateConfig.noClockInPenaltyPerTime || -2).toString()
      })
      setPenaltyConfig({
        latePenalty: (lateConfig.latePenaltyPerTime || -2).toString(),
        noClockInPenalty: (lateConfig.noClockInPenaltyPerTime || -2).toString()
      })
    }
    
    if (user) {
      // 如果有選擇查看的用戶，使用選擇的用戶；否則使用當前登錄用戶
      const viewUser = selectedViewUser || user
      calculatePerformance(viewUser)
    }
  }, [selectedYear, selectedMonth, selectedViewUser, dataRevision, loadUsersForAdmin])
  

  // 取得當前查看的用戶（管理者可以選擇查看其他用戶）
  const getViewUser = () => {
    return selectedViewUser || currentUser
  }

  // 取得每月結算用的時間範圍（依選擇的年月）
  const getDateRange = () => {
    // 根據選擇的年月計算該月的第一天和最後一天
    const y = selectedYear
    const m = selectedMonth // 1-12
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate() // 當月最後一天
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate, endDate }
  }

  const calculatePerformance = (userName) => {
    const { startDate, endDate } = getDateRange()
    const currentRole = getCurrentUserRole()
    // 只計算至當日：不把未來日期的排程算進績效
    const todayStr = new Date().toISOString().slice(0, 10)
    const effectiveEndDate = endDate > todayStr ? todayStr : endDate

    // 帳號對應的顯示名稱（含綁定）：行事曆存的是參與人員/負責人的顯示名稱
    const displayNames = getDisplayNamesForAccount(userName || '')

    // 從工程排程（行事曆）統計工作項目：依據 目標數 targetQuantity、實際數量 actualQuantity
    const schedules = getSchedules()
    const workDays = new Set()
    const workDetails = []
    const workItemStats = {} // 按工作項目類型統計

    let totalItems = 0
    let completedItems = 0
    let partialItems = 0
    let uncompletedItems = 0
    let totalCompletionRate = 0
    let itemsWithRate = 0
    let totalCompletionRateAdjustment = 0 // 每天每條工項依完成率各算加減分，再加總（不用整月平均）

    // 依據行事曆排程中的工作項目（目標數、實際數量）計算 平均完成率、完成項目、部分完成；每條工項依完成率查表加減分後加總；只算到當日為止
    schedules.forEach(schedule => {
      if (startDate && schedule.date && schedule.date < startDate) return
      if (schedule.date && schedule.date > effectiveEndDate) return

      if (!schedule.workItems || schedule.workItems.length === 0) return

      const logicalItems = expandWorkItemsToLogical(schedule.workItems)
      logicalItems.forEach(item => {
        // 有異動申請待審：暫不列入績效評分
        if (String(item?.changeRequest?.status || '') === 'pending') return
        const it = normalizeWorkItem(item)
        const collabs = it.isCollaborative
          ? getWorkItemCollaborators(it)
          : [{
            name: String(it.responsiblePerson || '').trim(),
            actualQuantity: it.actualQuantity ?? ''
          }].filter((c) => !!c.name)

        collabs.forEach((c) => {
          const resp = String(c?.name || '').trim()
          const isResponsible = resp && displayNames.includes(resp)
          if (!isResponsible) return

          const target = getWorkItemTargetForNameForPerformance(it, resp)
          const actual = getWorkItemActualForNameForPerformance(it, resp)
          const completionRate = target > 0 ? (actual / target * 100) : 0

          workDays.add(schedule.date)
          totalItems++
          totalCompletionRate += completionRate
          itemsWithRate++
          totalCompletionRateAdjustment += calculateCompletionRateAdjustment(completionRate)

          if (completionRate >= 100) {
            completedItems++
          } else if (completionRate > 0) {
            partialItems++
          } else {
            uncompletedItems++
          }

          const workType = it.workContent || '未分類'
          if (!workItemStats[workType]) {
            workItemStats[workType] = {
              count: 0,
              completed: 0,
              partial: 0,
              uncompleted: 0,
              totalCompletionRate: 0
            }
          }
          workItemStats[workType].count++
          workItemStats[workType].totalCompletionRate += completionRate
          if (completionRate >= 100) {
            workItemStats[workType].completed++
          } else if (completionRate > 0) {
            workItemStats[workType].partial++
          } else {
            workItemStats[workType].uncompleted++
          }

          workDetails.push({
            date: schedule.date,
            siteName: schedule.siteName,
            workContent: it.workContent || '未填寫',
            targetQuantity: target,
            actualQuantity: actual,
            completionRate: completionRate.toFixed(1)
          })
        })
      })
    })

    // 統計遲到次數
    const lateRecords = getUserLateRecords(userName, startDate, endDate)
    const lateCount = lateRecords.length
    
    // 獲取出勤記錄（所有打卡記錄，包括正常和遲到）
    const attendanceRecords = getUserAttendanceRecords(userName, startDate, endDate)

    // 同一天可能同時存在「缺少打卡」與「請假」等多筆資料（歷史匯入/先未打卡後補請假）
    // 顯示/統計時以「請假 > 有時間 > 未打卡」合併成每天最多一筆，避免重複日期
    const normalizeYMD = (d) => String(d || '').slice(0, 10)
    const isLeaveAttendance = (r) => {
      const s = String(r?.details || '').trim()
      return s === '請假' || s === '特休' || s.includes('請假') || s.includes('特休')
    }
    const isNoClockInAttendance = (r) => {
      // 請假/特休：視為有紀錄，不應被算成未打卡
      if (isLeaveAttendance(r) || r?.type === 'leave') return false
      return !r?.clockInTime ||
        r?.details === '缺少打卡時間' ||
        r?.details === '匯入檔案後無記錄' ||
        r?.details === '匯入檔案後無紀錄'
    }
    const toMinutes = (t) => {
      const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
      if (!m) return Number.POSITIVE_INFINITY
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
    }
    const betterAttendance = (a, b) => {
      const score = (x) => (isLeaveAttendance(x) ? 3 : (x?.clockInTime ? 2 : (isNoClockInAttendance(x) ? 1 : 0)))
      const sa = score(a)
      const sb = score(b)
      if (sa !== sb) return sa > sb ? a : b
      // 同等：若都有時間，取最早
      const ta = toMinutes(a?.clockInTime)
      const tb = toMinutes(b?.clockInTime)
      if (ta !== tb) return ta < tb ? a : b
      return a
    }
    const mergeAttendanceByDay = (list) => {
      const map = new Map() // ymd -> record
      ;(Array.isArray(list) ? list : []).forEach((r) => {
        const ymd = normalizeYMD(r?.date)
        if (!ymd) return
        if (!map.has(ymd)) {
          map.set(ymd, r)
          return
        }
        map.set(ymd, betterAttendance(map.get(ymd), r))
      })
      return Array.from(map.values())
    }
    const mergedAttendanceRecords = mergeAttendanceByDay(attendanceRecords)
    
    // 保存遲到記錄列表（用於點擊查看詳情）
    // 按日期降序排序
    const sortedLateRecords = [...lateRecords].sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateB - dateA
    })
    
    // 保存出勤記錄列表（按日期降序排序）
    // 週末未打卡（通常是舊版 toISOString 時區錯位留下的資料）不顯示
    const visibleAttendanceRecords = mergedAttendanceRecords.filter((r) => {
      const ymd = normalizeYMD(r?.date)
      if (!ymd) return true
      const d = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(d.getTime())) return true
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      if (!isWeekend) return true
      // 週末只有「未打卡」才隱藏；若真的週末有刷卡/請假仍顯示
      if (isNoClockInAttendance(r) && !isLeaveAttendance(r) && !r?.clockInTime) return false
      return true
    })

    const sortedAttendanceRecords = [...visibleAttendanceRecords].sort((a, b) => {
      const dateA = new Date(`${normalizeYMD(a?.date)}T00:00:00`)
      const dateB = new Date(`${normalizeYMD(b?.date)}T00:00:00`)
      return dateB - dateA
    })
    
    // 計算總遲到分鐘數
    let totalLateMinutes = 0
    let normalAttendanceCount = 0
    let lateAttendanceCount = 0
    let noClockInCountFromRecords = 0
    
    // 使用當前月份的出勤記錄計算遲到和正常出勤
    sortedAttendanceRecords.forEach(record => {
      // 判斷是否為未打卡記錄
      const isNoClockIn = isNoClockInAttendance(record)
      
      if (isNoClockIn) {
        // 判斷日期是否為週六或週日
        const recordDate = new Date(`${normalizeYMD(record?.date)}T00:00:00`)
        const dayOfWeek = recordDate.getDay() // 0 = 週日, 6 = 週六
        
        // 只統計非週末的未打卡記錄（但這裡只統計當前月份的）
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          noClockInCountFromRecords++
        }
      } else if (record.isLate && record.clockInTime) {
        // 解析打卡時間和上班時間
        const clockInTimeStr = record.clockInTime
        const [clockHour, clockMinute] = clockInTimeStr.split(':').map(Number)
        const clockInDate = new Date(`${normalizeYMD(record?.date)}T00:00:00`)
        clockInDate.setHours(clockHour, clockMinute, 0, 0)
        
        const [startHour, startMinute] = workStartTime.split(':').map(Number)
        const startTime = new Date(`${normalizeYMD(record?.date)}T00:00:00`)
        startTime.setHours(startHour, startMinute, 0, 0)
        
        const diffMs = clockInDate.getTime() - startTime.getTime()
        const lateMinutes = Math.floor(diffMs / (1000 * 60))
        totalLateMinutes += lateMinutes
        lateAttendanceCount++
      } else if (!record.isLate) {
        normalAttendanceCount++
      }
    })
    
    // 計算未打卡次數與未打卡記錄列表
    // 從已保存的出勤記錄中統計未打卡記錄（排除週末）
    // 未打卡記錄包括：缺少打卡時間、匯入檔案後無記錄
    const noClockInCount = noClockInCountFromRecords
    
    // 建構未打卡記錄列表（排除週末）
    const noClockInRecords = sortedAttendanceRecords.filter(record => {
      const isNoClockIn = isNoClockInAttendance(record)
      if (!isNoClockIn) return false
      const recordDate = new Date(`${normalizeYMD(record?.date)}T00:00:00`)
      const dayOfWeek = recordDate.getDay() // 0 = 週日, 6 = 週六
      return dayOfWeek !== 0 && dayOfWeek !== 6
    })

    // 統計績效評分（初始100分 + 該時間範圍內的所有加減分）
    const performanceRecords = getUserPerformanceRecords(userName, startDate, endDate)
    let totalAdjustment = 0 // 該時間範圍內所有加減分的總和
    
    performanceRecords.forEach(record => {
      if (record.adjustment !== undefined && record.adjustment !== null) {
        const adjustment = parseFloat(record.adjustment) || 0
        totalAdjustment += adjustment
      }
    })
    
    // 排序評分記錄（最新的在前）
    const sortedRecords = [...performanceRecords].sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateB - dateA
    })
    
    // 如果是管理者，載入所有評分記錄（按月份分組）
    // 但只顯示當前查看用戶的記錄
    let allPerformanceRecords = []
    let recordsByMonth = {} // 按月份分組的記錄
    if (currentRole === 'admin') {
      const { startDate: rangeStart, endDate: rangeEnd } = getDateRange()
      const allRecords = getPerformanceRecords()
      // 只過濾當前查看用戶的記錄
      let filtered = allRecords.filter(r => r.type === 'performance' && r.userName === userName)
      
      if (rangeStart) {
        filtered = filtered.filter(r => new Date(r.date) >= new Date(rangeStart))
      }
      if (rangeEnd) {
        filtered = filtered.filter(r => new Date(r.date) <= new Date(rangeEnd))
      }
      
      // 按月份分組
      filtered.forEach(record => {
        if (record.date) {
          const date = new Date(record.date)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (!recordsByMonth[monthKey]) {
            recordsByMonth[monthKey] = []
          }
          recordsByMonth[monthKey].push(record)
        }
      })
      
      // 對每個月的記錄進行排序（最新的在前）
      Object.keys(recordsByMonth).forEach(monthKey => {
        recordsByMonth[monthKey].sort((a, b) => {
          const dateA = new Date(a.date || 0)
          const dateB = new Date(b.date || 0)
          return dateB - dateA
        })
      })
      
      allPerformanceRecords = filtered.sort((a, b) => {
        const dateA = new Date(a.date || 0)
        const dateB = new Date(b.date || 0)
        return dateB - dateA
      })
    } else {
      // 非管理者也按月份分組自己的記錄
      performanceRecords.forEach(record => {
        if (record.date) {
          const date = new Date(record.date)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (!recordsByMonth[monthKey]) {
            recordsByMonth[monthKey] = []
          }
          recordsByMonth[monthKey].push(record)
        }
      })
      
      // 對每個月的記錄進行排序
      Object.keys(recordsByMonth).forEach(monthKey => {
        recordsByMonth[monthKey].sort((a, b) => {
          const dateA = new Date(a.date || 0)
          const dateB = new Date(b.date || 0)
          return dateB - dateA
        })
      })
    }

    // 計算平均完成率（僅供顯示用）
    const averageCompletionRate = itemsWithRate > 0 ? (totalCompletionRate / itemsWithRate) : 0

    // 達成率調整分數：每天每條工項依完成率查表加減分後加總（不再用整月平均完成率算一次）
    const completionRateAdjustment = totalCompletionRateAdjustment

    // 分別計算遲到調整分數和未打卡調整分數
    const lateConfig = getLatePerformanceConfig()
    let lateAdjustment = 0
    let noClockInAdjustment = 0
    
    if (lateConfig.enabled) {
      // 遲到扣分：使用固定扣分（遲到次數 × 每次扣分）
      lateAdjustment = calculateLateCountAdjustment(lateCount)
      // 未打卡扣分：使用固定扣分（未打卡次數 × 每次扣分）
      noClockInAdjustment = calculateNoClockInAdjustment(noClockInCount)
    }

    // 績效評分 = 初始100分 + 管理者調整分數 + 工作項目達成率調整分數 + 遲到調整分數 + 未打卡調整分數
    const performanceScore = 100 + totalAdjustment + completionRateAdjustment + lateAdjustment + noClockInAdjustment
    const totalAdjustmentWithCompletion = totalAdjustment + completionRateAdjustment + lateAdjustment + noClockInAdjustment
    const adjustmentDisplay = totalAdjustmentWithCompletion !== 0 ? (totalAdjustmentWithCompletion >= 0 ? `+${totalAdjustmentWithCompletion.toFixed(1)}` : `${totalAdjustmentWithCompletion.toFixed(1)}`) : ''

    // 排序工作明細（最新的在前）
    workDetails.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateB - dateA
    })

    setPerformanceData({
      totalWorkItems: totalItems,
      completedItems: completedItems,
      partialItems: partialItems,
      uncompletedItems: uncompletedItems,
      averageCompletionRate: averageCompletionRate,
      lateCount: lateCount,
      performanceScore: performanceScore, // 績效評分（100 + 管理者調整 + 達成率調整 + 遲到調整 + 未打卡調整）
      totalAdjustment: totalAdjustmentWithCompletion,
      adjustmentDisplay: adjustmentDisplay,
      managerAdjustment: totalAdjustment,       // 管理者調整
      completionRateAdjustment: completionRateAdjustment, // 完成率→績效分數→統計至績效評分
      lateAdjustment: lateAdjustment,            // 遲到調整分數
      noClockInAdjustment: noClockInAdjustment,  // 未打卡調整分數
      workDays: workDays.size,
      workDetails: workDetails,
      workItemStats: workItemStats,
      performanceRecords: sortedRecords,
      allPerformanceRecords: allPerformanceRecords,
      recordsByMonth: recordsByMonth,
      lateRecords: sortedLateRecords, // 保存遲到記錄列表
      attendanceRecords: sortedAttendanceRecords, // 保存出勤記錄列表
      totalLateMinutes: totalLateMinutes, // 總遲到分鐘數
      normalAttendanceCount: normalAttendanceCount, // 正常出勤次數
      lateAttendanceCount: lateAttendanceCount, // 遲到次數
      noClockInCount: noClockInCount, // 未打卡次數
      noClockInRecords: noClockInRecords // 未打卡記錄列表
    })
  }
  
  // 計算每日績效表現（僅管理者，只顯示當前選擇查看的用戶）
  const calculateDailyPerformance = useCallback(() => {
    if (userRole !== 'admin') return
    
    const { startDate, endDate } = getDateRange()
    const viewUser = getViewUser() // 獲取當前選擇查看的用戶
    const allUsers = getUsers()
    const schedules = getSchedules()
    const allRecords = getPerformanceRecords()
    const dailyData = []
    
    // 只處理當前選擇查看的用戶
    const targetUser = allUsers.find(u => u.account === viewUser)
    if (!targetUser || targetUser.role === 'admin') {
      setDailyPerformanceData([])
      return
    }
    
    // 生成該月的所有日期
    const start = new Date(startDate)
    const end = new Date(endDate)
    const currentDate = new Date(start)
    
    // 累積調整分數（用於累積計算績效分數）
    let cumulativeManagerAdjustment = 0
    let cumulativeLateAdjustment = 0
    
    // 累積統計（用於計算當月總出勤問題和達成率）
    let cumulativeLateCount = 0
    let cumulativeNoClockInCount = 0
    let cumulativeTotalCompletion = 0
    let cumulativeItemsWithRate = 0
    let cumulativeCompletionRateAdjustmentSum = 0 // 累積：每天每條工項的達成率加減分加總
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0]
      
      // 只計算當前選擇查看的用戶
      const user = targetUser
      const displayNames = getDisplayNamesForAccount(user.account)
      let dailyWorkItems = 0
      let dailyCompleted = 0
      let dailyPartial = 0
      let dailyTotalCompletion = 0
      let dailyItemsWithRate = 0
      let dailyTotalCompletionRateAdjustment = 0 // 當日每條工項依完成率查表加減分後加總
      
      // 統計當日工作項目（含獨立負責的 contentRows 展開）
      schedules.forEach(schedule => {
        if (schedule.date !== dateStr) return
        if (!schedule.workItems || schedule.workItems.length === 0) return
        
        const logicalItems = expandWorkItemsToLogical(schedule.workItems)
        logicalItems.forEach(item => {
          // 有異動申請待審：暫不列入績效評分
          if (String(item?.changeRequest?.status || '') === 'pending') return
          const it = normalizeWorkItem(item)
          const collabs = it.isCollaborative
            ? getWorkItemCollaborators(it)
            : [{
              name: String(it.responsiblePerson || '').trim(),
              actualQuantity: it.actualQuantity ?? ''
            }].filter((c) => !!c.name)

          collabs.forEach((c) => {
            const resp = String(c?.name || '').trim()
            if (!resp || !displayNames.includes(resp)) return

            const target = getWorkItemTargetForNameForPerformance(it, resp)
            const actual = getWorkItemActualForNameForPerformance(it, resp)
            const completionRate = target > 0 ? (actual / target * 100) : 0

            dailyWorkItems++
            dailyTotalCompletion += completionRate
            dailyItemsWithRate++
            dailyTotalCompletionRateAdjustment += calculateCompletionRateAdjustment(completionRate)

            if (completionRate >= 100) {
              dailyCompleted++
            } else if (completionRate > 0) {
              dailyPartial++
            }
          })
        })
      })
      
      // 累積達成率統計
      cumulativeTotalCompletion += dailyTotalCompletion
      cumulativeItemsWithRate += dailyItemsWithRate
      cumulativeCompletionRateAdjustmentSum += dailyTotalCompletionRateAdjustment
      
      // 當天的達成率調整：當日每條工項依完成率查表加減分後加總（不用當日平均完成率）
      const dailyCompletionRateAdjustment = dailyTotalCompletionRateAdjustment
      const dailyAvgCompletion = dailyItemsWithRate > 0 ? (dailyTotalCompletion / dailyItemsWithRate) : 0
      
      // 累積到當天的達成率調整：從月初到當日所有工項的加減分加總
      const cumulativeCompletionRateAdjustment = cumulativeCompletionRateAdjustmentSum
      
      // 統計當日管理者調整
      const dailyRecords = allRecords.filter(r => 
        r.type === 'performance' && 
        r.userName === user.account && 
        r.date === dateStr
      )
      let dailyManagerAdjustment = 0
      dailyRecords.forEach(record => {
        if (record.adjustment !== undefined && record.adjustment !== null) {
          dailyManagerAdjustment += parseFloat(record.adjustment) || 0
        }
      })
      
      // 統計遲到
      const dailyLateRecords = allRecords.filter(r => 
        r.type === 'late' && 
        r.userName === user.account && 
        r.date === dateStr
      )
      
      // 統計未打卡（當日）
      const dailyAttendance = getUserAttendanceRecords(user.account, dateStr, dateStr)
      const hasLeaveThatDay = (dailyAttendance || []).some((r) => {
        const s = String(r?.details || '').trim()
        return s === '請假' || s === '特休' || s.includes('請假') || s.includes('特休')
      })
      const dailyNoClockInRecords = hasLeaveThatDay ? [] : (dailyAttendance || []).filter(record => {
        const isNoClockIn = !record.clockInTime || 
                           record.details === '缺少打卡時間' || 
                           record.details === '匯入檔案後無記錄' ||
                           record.details === '匯入檔案後無紀錄'
        if (!isNoClockIn) return false
        const recordDate = new Date(`${String(record?.date || '').slice(0, 10)}T00:00:00`)
        const dayOfWeek = recordDate.getDay() // 0 = 週日, 6 = 週六
        return dayOfWeek !== 0 && dayOfWeek !== 6 // 排除週末
      })
      
      // 累積統計出勤問題（分開統計）
      cumulativeLateCount += dailyLateRecords.length
      cumulativeNoClockInCount += dailyNoClockInRecords.length
      
      // 分別計算遲到調整分數和未打卡調整分數
      const lateConfig = getLatePerformanceConfig()
      let dailyLateAdjustment = 0
      let dailyNoClockInAdjustment = 0
      let cumulativeNoClockInAdjustmentTotal = 0
      
      if (lateConfig.enabled) {
        // 遲到扣分：使用固定扣分（累積遲到次數 × 每次扣分）
        const newCumulativeLateAdjustment = calculateLateCountAdjustment(cumulativeLateCount)
        dailyLateAdjustment = newCumulativeLateAdjustment - cumulativeLateAdjustment
        cumulativeLateAdjustment = newCumulativeLateAdjustment
        
        // 未打卡扣分：使用固定扣分（累積未打卡次數 × 每次扣分）
        cumulativeNoClockInAdjustmentTotal = calculateNoClockInAdjustment(cumulativeNoClockInCount)
        // 計算當天未打卡的扣分增量
        const previousNoClockInCount = cumulativeNoClockInCount - dailyNoClockInRecords.length
        const previousNoClockInAdjustment = calculateNoClockInAdjustment(previousNoClockInCount)
        dailyNoClockInAdjustment = cumulativeNoClockInAdjustmentTotal - previousNoClockInAdjustment
      }
      
      // 累積管理者調整
      cumulativeManagerAdjustment += dailyManagerAdjustment
      
      // 績效分數 = 100 + 累積到當天的所有調整分數（遲到和未打卡分開計算）
      const dailyPerformanceScore = 100 + cumulativeManagerAdjustment + cumulativeCompletionRateAdjustment + cumulativeLateAdjustment + cumulativeNoClockInAdjustmentTotal
      
      // 判斷是否為週末
      const dayOfWeek = currentDate.getDay() // 0 = 週日, 6 = 週六
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      
      // 顯示當月所有日期（包括週六週日）
      dailyData.push({
        date: dateStr,
        userName: user.account,
        userDisplayName: user.name || user.account,
        workItems: dailyWorkItems,
        completedItems: dailyCompleted,
        partialItems: dailyPartial,
        averageCompletionRate: dailyAvgCompletion,
        lateCount: dailyLateRecords.length,
        noClockInCount: dailyNoClockInRecords.length,
        performanceScore: dailyPerformanceScore,
        managerAdjustment: dailyManagerAdjustment,
        completionRateAdjustment: dailyCompletionRateAdjustment,
        lateAdjustment: dailyLateAdjustment,
        noClockInAdjustment: dailyNoClockInAdjustment,
        isWeekend: isWeekend,
        dayOfWeek: dayOfWeek
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    // 按日期降序排序
    dailyData.sort((a, b) => {
      return b.date.localeCompare(a.date)
    })
    
    setDailyPerformanceData(dailyData)
  }, [selectedYear, selectedMonth, userRole, selectedViewUser, currentUser])
  
  // 當管理者切換到每日績效視圖或年月變更時計算
  useEffect(() => {
    if (userRole === 'admin' && showDailyPerformance) {
      calculateDailyPerformance()
    }
  }, [userRole, showDailyPerformance, calculateDailyPerformance])
  
  // 刷卡記錄導入相關函數（僅管理者）
  const parseCSVData = (csvText) => {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return []
    
    // 嘗試自動檢測分隔符（逗號、分號、Tab）
    const firstLine = lines[0]
    let delimiter = ','
    if (firstLine.includes(';')) delimiter = ';'
    else if (firstLine.includes('\t')) delimiter = '\t'
    
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''))
    const data = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/"/g, ''))
      if (values.length < 2) continue
      
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      data.push(row)
    }
    
    return data
  }
  
  const parseDateTime = (dateTimeStr) => {
    // 嘗試多種日期時間格式
    // 格式1: 2026-01-23 08:30:00
    // 格式2: 2026/01/23 08:30:00
    // 格式3: 01/23/2026 08:30:00
    // 格式4: 2026-01-23T08:30:00
    // 格式5: 2026-01-23 08:30 (SOYA格式：已組合的日期和時間)
    if (!dateTimeStr) return null
    
    let date = new Date(dateTimeStr)
    if (isNaN(date.getTime())) {
      // 嘗試手動解析
      const patterns = [
        // 標準格式：2026-01-23 08:30:00 或 2026-01-23 08:30
        /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{1,2}):?(\d{0,2})/,
        // 美式格式：01/23/2026 08:30:00
        /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{1,2}):?(\d{0,2})/,
        // SOYA格式：2026-01-23 08:30 (無秒數)
        /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{1,2})/
      ]
      
      for (const pattern of patterns) {
        const match = dateTimeStr.match(pattern)
        if (match) {
          if (pattern === patterns[0] || pattern === patterns[2]) {
            // YYYY-MM-DD 格式
            date = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${match[4].padStart(2, '0')}:${match[5].padStart(2, '0')}:${(match[6] || '00').padStart(2, '0')}`)
          } else {
            // MM/DD/YYYY 格式
            date = new Date(`${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T${match[4].padStart(2, '0')}:${match[5].padStart(2, '0')}:${(match[6] || '00').padStart(2, '0')}`)
          }
          break
        }
      }
    }
    
    if (isNaN(date.getTime())) return null
    return date
  }

  const pad2 = (n) => String(n).padStart(2, '0')
  const formatLocalYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const parseLocalYMD = (ymd) => {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const y = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    const da = parseInt(m[3], 10)
    return new Date(y, mo - 1, da)
  }
  const isWeekendYMD = (ymd) => {
    const d = parseLocalYMD(ymd)
    if (!d || Number.isNaN(d.getTime())) return false
    const day = d.getDay()
    return day === 0 || day === 6
  }

  const buildLeaveDateSetByUser = (applications, userDirectory = []) => {
    const map = new Map() // account -> Set<YYYY-MM-DD>
    const dir = Array.isArray(userDirectory) ? userDirectory : []
    const resolveUser = (nameOrAccount) => {
      if (!nameOrAccount) return null
      const id = String(nameOrAccount).trim()
      const u = findUserByAccountOrName(id, dir) || findUserByAccountOrName(id, getUsers())
      return u?.account || id
    }
    const list = Array.isArray(applications) ? applications : []
    list.forEach((r) => {
      const status = r?.status || 'pending'
      const isApproved = status === 'approved' || !!r?.approvedAt || !!r?.approvedBy
      if (!isApproved) return
      const userAcc = resolveUser(r?.userId || r?.userName)
      if (!userAcc) return
      const start = String(r?.startDate || '').slice(0, 10)
      const end = String(r?.endDate || '').slice(0, 10)
      const startD = parseLocalYMD(start)
      const endD = parseLocalYMD(end)
      if (!startD || !endD || Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return
      if (!map.has(userAcc)) map.set(userAcc, new Set())
      const s = map.get(userAcc)
      const cur = new Date(startD)
      while (cur <= endD) {
        s.add(formatLocalYMD(cur))
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }
  
  const findUserByAccountOrName = (identifier, directory = null) => {
    if (!identifier) return null
    const allUsersRaw = Array.isArray(directory) ? directory : getUsers()
    const allUsers = Array.isArray(allUsersRaw) ? allUsersRaw : []
    // 先嘗試匹配帳號
    let user = allUsers.find(u => u.account === identifier || u.account.toLowerCase() === identifier.toLowerCase())
    if (user) return user
    // 再嘗試匹配姓名
    user = allUsers.find(u => u.name === identifier || u.name?.toLowerCase() === identifier.toLowerCase())
    return user || null
  }
  
  const isLate = (clockInTime, workStartTimeStr) => {
    if (!clockInTime) return false
    
    const [startHour, startMinute] = workStartTimeStr.split(':').map(Number)
    const startTime = new Date(clockInTime)
    startTime.setHours(startHour, startMinute, 0, 0)
    
    return clockInTime > startTime
  }
  
  // 計算遲到分鐘數
  const calculateLateMinutes = (clockInTime, workStartTimeStr) => {
    if (!clockInTime) return 0
    
    const [startHour, startMinute] = workStartTimeStr.split(':').map(Number)
    const startTime = new Date(clockInTime)
    startTime.setHours(startHour, startMinute, 0, 0)
    
    if (clockInTime <= startTime) return 0
    
    const diffMs = clockInTime.getTime() - startTime.getTime()
    return Math.floor(diffMs / (1000 * 60)) // 轉換為分鐘
  }
  
  const handlePreviewImport = async () => {
    try {
      if (!importData.trim()) {
        alert('請輸入或上傳CSV數據')
        return
      }
      
      const parsed = parseCSVData(importData)
      if (parsed.length === 0) {
        alert('無法解析CSV數據，請檢查格式')
        return
      }
      
      if (!parsed[0] || Object.keys(parsed[0]).length === 0) {
        alert('CSV數據格式錯誤，請確保第一行為標題行')
        return
      }
    
    // 嘗試識別欄位（支援SOYA刷卡機格式：名稱,日期,上班）
    // 優先匹配SOYA格式的欄位名稱
    const dateFields = ['日期', 'Date', 'date', 'DATE']
    const timeFields = ['上班', 'Clock-in', 'clock_in', 'clock-in', '打卡時間', '刷卡時間', '時間', 'Time', 'time', 'TIME', '上班時間']
    const dateTimeFields = [
      '日期時間', '打卡時間', '刷卡時間', '時間', 'DateTime', 'Date', 'Time', 
      'date', 'time', 'datetime', 'date_time', 'clock_in', 'clock_in_time',
      '刷卡', '打卡', '進場時間', '出場時間', '上班時間', '下班時間',
      'RecordTime', 'Record_Time', 'RECORD_TIME', 'TimeStamp', 'Timestamp'
    ]
    const userFields = [
      '名稱', '用戶', '員工', '姓名', '帳號', '帳戶', 'User', 'Name', 'Account', 
      'user', 'name', 'account', '員工編號', '工號', '員工姓名', '員工名稱',
      'Employee', 'EmployeeName', 'Employee_ID', 'EmpID', 'Emp_ID',
      'CardNo', 'Card_No', 'CARD_NO', '卡號', '人員', '人員姓名'
    ]
    
    let dateField = null
    let timeField = null
    let dateTimeField = null
    let userField = null
    
    const headers = Object.keys(parsed[0])
    
    // 優先完全匹配SOYA格式的欄位名稱（名稱,日期,上班）
    for (const header of headers) {
      // 優先完全匹配
      if (!dateField && dateFields.includes(header)) {
        dateField = header
      }
      if (!timeField && timeFields.includes(header)) {
        timeField = header
      }
      if (!userField && userFields.includes(header)) {
        userField = header
      }
    }
    
    // 如果完全匹配失敗，嘗試忽略大小寫匹配
    if (!dateField || !timeField || !userField) {
      for (const header of headers) {
        const headerLower = header.toLowerCase().trim()
        
        // 匹配日期欄位（SOYA格式：單獨的"日期"列）
        if (!dateField) {
          for (const field of dateFields) {
            if (headerLower === field.toLowerCase()) {
              dateField = header
              break
            }
          }
        }
        
        // 匹配時間欄位（SOYA格式：單獨的"上班"列）
        if (!timeField) {
          for (const field of timeFields) {
            if (headerLower === field.toLowerCase()) {
              timeField = header
              break
            }
          }
        }
        
        // 匹配用戶欄位（SOYA格式："名稱"列）
        if (!userField) {
          for (const field of userFields) {
            if (headerLower === field.toLowerCase()) {
              userField = header
              break
            }
          }
        }
      }
    }
    
    // 如果還是找不到，嘗試包含匹配
    if (!dateField || !timeField || !userField) {
      for (const header of headers) {
        const headerLower = header.toLowerCase().replace(/[_\s-]/g, '')
        
        // 匹配日期時間欄位（合併的格式）
        if (!dateTimeField) {
          for (const field of dateTimeFields) {
            const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '')
            if (header === field || 
                header.toLowerCase() === field.toLowerCase() ||
                headerLower.includes(fieldLower) || 
                fieldLower.includes(headerLower)) {
              dateTimeField = header
              break
            }
          }
        }
        
        // 匹配日期欄位
        if (!dateField) {
          for (const field of dateFields) {
            const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '')
            if (headerLower.includes(fieldLower) || fieldLower.includes(headerLower)) {
              dateField = header
              break
            }
          }
        }
        
        // 匹配時間欄位
        if (!timeField) {
          for (const field of timeFields) {
            const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '')
            if (headerLower.includes(fieldLower) || fieldLower.includes(headerLower)) {
              timeField = header
              break
            }
          }
        }
        
        // 匹配用戶欄位
        if (!userField) {
          for (const field of userFields) {
            const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '')
            if (header === field || 
                header.toLowerCase() === field.toLowerCase() ||
                headerLower.includes(fieldLower) || 
                fieldLower.includes(headerLower)) {
              userField = header
              break
            }
          }
        }
        
        if ((dateTimeField || (dateField && timeField)) && userField) break
      }
    }
    
    // 如果還是找不到，嘗試匹配第一個看起來像日期/時間的欄位
    if (!dateField && !dateTimeField) {
      for (const header of headers) {
        const headerLower = header.toLowerCase()
        if (headerLower.includes('date') || headerLower.includes('日期')) {
          if (headerLower.includes('time') || headerLower.includes('時間')) {
            dateTimeField = header
          } else {
            dateField = header
          }
          break
        }
      }
    }
    
    if (!timeField && !dateTimeField) {
      for (const header of headers) {
        const headerLower = header.toLowerCase()
        if (headerLower.includes('time') || headerLower.includes('時間') || 
            headerLower.includes('clock') || headerLower.includes('打卡') ||
            headerLower.includes('上班')) {
          timeField = header
          break
        }
      }
    }
    
    if (!userField) {
      for (const header of headers) {
        const headerLower = header.toLowerCase()
        if (headerLower.includes('user') || headerLower.includes('name') || 
            headerLower.includes('account') || headerLower.includes('emp') ||
            headerLower.includes('員工') || headerLower.includes('用戶') || 
            headerLower.includes('姓名') || headerLower.includes('帳號') ||
            headerLower.includes('名稱')) {
          userField = header
          break
        }
      }
    }
    
    // 檢查是否有足夠的欄位
    const hasDateTime = dateTimeField || (dateField && timeField)
    if (!hasDateTime || !userField) {
      // 顯示更友好的錯誤信息
      const headerList = headers.map((h, i) => `${i + 1}. ${h}`).join('\n')
      alert(`無法識別必要欄位。\n\n找到的欄位：\n${headerList}\n\n請確保CSV包含：\n- 日期欄位（如：日期）和時間欄位（如：上班），或合併的日期時間欄位\n- 用戶欄位（如：名稱、用戶、員工、姓名等）\n\n提示：如果欄位名稱顯示為亂碼，請將CSV文件另存為UTF-8編碼格式。`)
      return
    }
    
    // Supabase 模式：用公開 profiles 清單來做用戶對照（避免 getUsers() 為空導致「找不到用戶」）
    let userDirectory = getUsers()
    if (typeof isAuthSupabase === 'function' && isAuthSupabase()) {
      try {
        const profiles = await getPublicProfiles()
        if (Array.isArray(profiles) && profiles.length > 0) {
          userDirectory = profiles.map((p) => ({
            account: p.account,
            name: p.display_name || p.account
          }))
        }
      } catch (e) {
        console.warn('handlePreviewImport: getPublicProfiles failed', e)
      }
    }

    // 請假表（已核准）→ 視為正常不扣分
    const leaveSetByUser = buildLeaveDateSetByUser(getLeaveApplications(), userDirectory)

    // 處理SOYA格式：日期和時間分開，且用戶名可能只在第一行
    let currentUserName = null
    
    const leaveKeywords = ['請假', '特休', '補休', '公假', '病假', '事假', '喪假', '婚假', '產假', '育嬰', '出差']
    const isLeaveMark = (s) => {
      const v = String(s || '').trim()
      if (!v) return false
      return leaveKeywords.some((k) => v.includes(k))
    }

    const preview = parsed.map((row, index) => {
      // 處理用戶名：如果當前行有用戶名，更新；否則使用上一行的用戶名
      const rowUserName = row[userField]?.trim()
      if (rowUserName) {
        currentUserName = rowUserName
      }
      const userIdentifier = currentUserName || rowUserName
      
      // 處理日期時間：可能是合併欄位，或分開的日期和時間欄位
      let dateTimeStr = null
      let rawTimeStr = null // 保存原始時間字符串
      let rawDateStr = null // 保存原始日期字符串
      
      if (dateTimeField) {
        dateTimeStr = row[dateTimeField]
        // 嘗試從合併的日期時間字符串中提取時間
        if (dateTimeStr) {
          const timeMatch = dateTimeStr.match(/(\d{1,2}):(\d{1,2})/)
          if (timeMatch) {
            rawTimeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`
          }
        }
      } else if (dateField && timeField) {
        // SOYA格式：組合日期和時間
        rawDateStr = row[dateField]?.trim() || ''
        rawTimeStr = row[timeField]?.trim() || ''

        // 文字型態（如：請假/特休）視為正常，不算未打卡、不扣分
        if (rawDateStr && isLeaveMark(rawTimeStr)) {
          const user = findUserByAccountOrName(userIdentifier, userDirectory)
          const dateMatch = rawDateStr.match(/(\d{1,2})\/(\d{1,2})/)
          const month = dateMatch ? parseInt(dateMatch[1], 10) : null
          const day = dateMatch ? parseInt(dateMatch[2], 10) : null
          const inferredDate = (month && day)
            ? `${selectedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : null
          return {
            index: index + 1,
            raw: row,
            date: inferredDate,
            time: rawTimeStr || '請假',
            leave: true,
            late: false,
            userName: user?.account || userIdentifier,
            userDisplayName: user ? (user.name || user.account) : userIdentifier,
            dateTimeField: dateTimeField || (dateField && timeField ? `${dateField}+${timeField}` : null),
            userField
          }
        }
        
        // 如果時間為空，嘗試推斷日期（用於未打卡計算）
        if (!rawTimeStr) {
          let inferredDate = null
          // 嘗試從日期欄位推斷日期
          if (rawDateStr) {
            const dateMatch = rawDateStr.match(/(\d{1,2})\/(\d{1,2})/)
            if (dateMatch) {
              const month = parseInt(dateMatch[1])
              const day = parseInt(dateMatch[2])
              const finalMonth = month || selectedMonth
              inferredDate = `${selectedYear}-${String(finalMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            }
          }
          
          // 查找用戶（用於顯示用戶名稱）
          const user = findUserByAccountOrName(userIdentifier, userDirectory)
          const userAcc = user?.account || userIdentifier
          // 若請假表中有該日（已核准），視為請假：正常不扣分
          if (inferredDate && userAcc && leaveSetByUser.get(userAcc)?.has(inferredDate)) {
            return {
              index: index + 1,
              raw: row,
              date: inferredDate,
              time: '請假',
              leave: true,
              late: false,
              userName: userAcc,
              userDisplayName: user ? (user.name || user.account) : userIdentifier
            }
          }
          
          return {
            index: index + 1,
            raw: row,
            error: '缺少打卡時間',
            date: inferredDate,
            dateTimeField: dateTimeField || (dateField && timeField ? `${dateField}+${timeField}` : null),
            userField,
            userName: user?.account || userIdentifier,
            userDisplayName: user ? (user.name || user.account) : userIdentifier
          }
        }
        
        if (rawDateStr) {
          // 處理日期格式 "01/01 (四)" 或 "01/01(四)" -> 轉換為完整日期
          // 使用頁面選擇的年份（避免跨月/跨年匯入造成錯年）
          const dateMatch = rawDateStr.match(/(\d{1,2})\/(\d{1,2})/)
          if (dateMatch) {
            const month = parseInt(dateMatch[1])
            const day = parseInt(dateMatch[2])
            const finalMonth = month || selectedMonth
            // 組合為完整日期時間字符串
            dateTimeStr = `${selectedYear}-${String(finalMonth).padStart(2, '0')}-${String(day).padStart(2, '0')} ${rawTimeStr}`
          } else {
            // 如果日期格式不匹配，嘗試直接組合
            dateTimeStr = `${rawDateStr} ${rawTimeStr}`
          }
        }
      }
      
      if (!dateTimeStr) {
        return {
          index: index + 1,
          raw: row,
          error: '缺少日期數據',
          dateTimeField: dateTimeField || (dateField && timeField ? `${dateField}+${timeField}` : null),
          userField
        }
      }
      
      const dateTime = parseDateTime(dateTimeStr)
      const user = findUserByAccountOrName(userIdentifier, userDirectory)
      
      if (!dateTime) {
        return {
          index: index + 1,
          raw: row,
          error: `無法解析日期時間: ${dateTimeStr}`,
          dateTimeField,
          userField
        }
      }
      
      if (!user) {
        return {
          index: index + 1,
          raw: row,
          error: `找不到用戶: ${userIdentifier}`,
          dateTimeField,
          userField
        }
      }
      
      // 使用本地日期（避免 toISOString 造成跨日/週末判斷錯位）
      const dateStr = formatLocalYMD(dateTime)
      // 直接使用原始時間字符串，確保顯示正確
      // 如果rawTimeStr存在，直接使用；否則從dateTime提取
      let timeStr = rawTimeStr
      if (!timeStr) {
        // 如果沒有原始時間字符串，從dateTime提取
        const hours = dateTime.getHours()
        const minutes = dateTime.getMinutes()
        timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      }
      
      const late = isLate(dateTime, workStartTime)
      
      return {
        index: index + 1,
        date: dateStr,
        time: timeStr,
        userName: user.account,
        userDisplayName: user.name || user.account,
        late: late,
        dateTimeField: dateTimeField || (dateField && timeField ? `${dateField}+${timeField}` : null),
        userField,
        raw: row
      }
    })

    // 1) 週末且「沒有打卡時間」：不顯示/不計入（避免週六週日出現未打卡）
    const filtered = preview.filter((r) => {
      if (!r?.date) return true
      if (!isWeekendYMD(r.date)) return true
      // 週末有時間 / 有請假：保留（有可能週末加班或週末請假紀錄）
      if (r.leave) return true
      if (!r.error && r.time) return true
      // 週末且缺少打卡時間：忽略
      if (r.error === '缺少打卡時間') return false
      return true
    })

    // 2) 同一天重複：合併（保留「請假」>「有時間」>「缺少打卡時間」；有多筆時間取最早）
    const toMinutes = (t) => {
      const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
      if (!m) return Number.POSITIVE_INFINITY
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
    }
    const better = (a, b) => {
      const rank = (x) => (x?.leave ? 3 : (!x?.error && x?.time ? 2 : (x?.error ? 0 : 1)))
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra > rb ? a : b
      // 同等：若都有時間，取最早
      const ta = toMinutes(a?.time)
      const tb = toMinutes(b?.time)
      if (ta !== tb) return ta < tb ? a : b
      // 其他：保留先出現的（較小 index）
      return (a?.index ?? 0) <= (b?.index ?? 0) ? a : b
    }
    const map = new Map()
    const order = []
    filtered.forEach((r) => {
      const key = (r?.date && r?.userName) ? `${r.userName}__${r.date}` : `idx__${r.index}`
      if (!map.has(key)) {
        map.set(key, { ...r, _firstIndex: r.index, duplicateCount: 1 })
        order.push(key)
        return
      }
      const cur = map.get(key)
      const keep = better(cur, r)
      map.set(key, { ...keep, _firstIndex: cur._firstIndex, duplicateCount: (cur.duplicateCount || 1) + 1 })
    })
    const deduped = order.map((k) => map.get(k)).sort((a, b) => (a?._firstIndex ?? 0) - (b?._firstIndex ?? 0)).map((r, i) => ({ ...r, index: i + 1 }))

    setImportPreview(deduped)
    } catch (error) {
      console.error('預覽數據時發生錯誤:', error)
      alert('預覽數據時發生錯誤: ' + (error.message || '未知錯誤'))
    }
  }
  
  const handleImportAttendance = () => {
    if (importPreview.length === 0) {
      alert('請先預覽數據')
      return
    }
    
    // 獲取所有有效記錄（包括正常/遲到/請假）
    const validRecords = importPreview.filter(p => !p.error)
    if (validRecords.length === 0) {
      alert('沒有有效的打卡記錄')
      return
    }
    
    let attendanceSuccessCount = 0
    let attendanceDuplicateCount = 0
    let lateSuccessCount = 0
    let lateDuplicateCount = 0
    let errorCount = 0
    
    validRecords.forEach(record => {
      // 請假：視為正常，不扣分（保存一筆出勤記錄作為「當日有紀錄」的憑證）
      if (record.leave) {
        const existing = getUserAttendanceRecords(record.userName, record.date, record.date)
          .filter(r => r.type === 'leave' || r.details === '請假')
        if (existing.length === 0) {
          const r = saveAttendanceRecord({
            userName: record.userName,
            date: record.date,
            clockInTime: null,
            isLate: false,
            details: record.time || '請假',
            source: 'SOYA刷卡機',
            type: 'leave'
          })
          if (r.success) attendanceSuccessCount++
          else errorCount++
        } else {
          attendanceDuplicateCount++
        }
        return
      }
      // 先保存所有出勤記錄（包括正常和遲到）
      const existingAttendance = getUserAttendanceRecords(record.userName, record.date, record.date)
      if (existingAttendance.length === 0) {
        const attendanceResult = saveAttendanceRecord({
          userName: record.userName,
          date: record.date,
          clockInTime: record.time,
          isLate: record.late,
          details: `刷卡時間: ${record.time} (上班時間: ${workStartTime})`,
          source: 'SOYA刷卡機'
        })
        
        if (attendanceResult.success) {
          attendanceSuccessCount++
        } else {
          errorCount++
        }
      } else {
        attendanceDuplicateCount++
      }
      
      // 如果是遲到記錄，也保存到遲到記錄
      if (record.late) {
        const existingLate = getUserLateRecords(record.userName, record.date, record.date)
        if (existingLate.length === 0) {
          const lateResult = saveLateRecord({
            userName: record.userName,
            date: record.date,
            clockInTime: record.time,
            details: `刷卡時間: ${record.time} (上班時間: ${workStartTime})`,
            source: 'SOYA刷卡機'
          })
          
          if (lateResult.success) {
            lateSuccessCount++
          } else {
            errorCount++
          }
        } else {
          lateDuplicateCount++
        }
      }
    })
    
    // 請假表（已核准）：不產生未打卡扣分
    const leaveSetByUser = buildLeaveDateSetByUser(getLeaveApplications(), getUsers())

    // 處理未打卡記錄：將"缺少打卡時間"視為未打卡，並檢查沒有記錄的日期（排除週末）
    let noClockInSuccessCount = 0
    let noClockInDuplicateCount = 0
    
    // 1. 處理"缺少打卡時間"的記錄
    const missingTimeRecords = importPreview.filter(p => p.error === '缺少打卡時間')
    missingTimeRecords.forEach(item => {
      if (item.date && item.userName) {
        // 請假：不算未打卡
        if (leaveSetByUser.get(item.userName)?.has(item.date)) return
        const recordDate = parseLocalYMD(item.date)
        const dayOfWeek = recordDate ? recordDate.getDay() : -1 // 0 = 週日, 6 = 週六
        
        // 只處理非週末的未打卡記錄
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateStr = item.date
          // 檢查是否已存在未打卡記錄
          const existingNoClockIn = getUserAttendanceRecords(item.userName, dateStr, dateStr)
            .filter(r => r.details === '缺少打卡時間' || r.details === '匯入檔案後無記錄')
          
          if (existingNoClockIn.length === 0) {
            const noClockInResult = saveAttendanceRecord({
              userName: item.userName,
              date: dateStr,
              clockInTime: null,
              isLate: false,
              details: '缺少打卡時間',
              source: 'SOYA刷卡機',
              type: 'no-clockin' // 標記為未打卡類型
            })
            
            if (noClockInResult.success) {
              noClockInSuccessCount++
            } else {
              errorCount++
            }
          } else {
            noClockInDuplicateCount++
          }
        }
      }
    })
    
    // 2. 檢查沒有記錄的日期（排除週末）
    // 按用戶分組處理，因為導入數據可能包含多個用戶
    const userDateMap = new Map() // Map<userName, Set<dateStr>>（當月「有效打卡」）
    const userAnyDateMap = new Map() // Map<userName, Set<dateStr>>（含缺少打卡/請假，避免同日重複產生「匯入後無記錄」）
    
    // 收集每個用戶的日期
    importPreview.forEach(item => {
      if (!item?.date || !item?.userName) return
      const dateStr = item.date
      if (!userAnyDateMap.has(item.userName)) userAnyDateMap.set(item.userName, new Set())
      userAnyDateMap.get(item.userName).add(dateStr)
      if (!item.error) {
        if (!userDateMap.has(item.userName)) userDateMap.set(item.userName, new Set())
        userDateMap.get(item.userName).add(dateStr)
      }
    })
    
    // 為每個用戶處理未打卡記錄
    userDateMap.forEach((datesWithValidRecords, userName) => {
      // 確定該用戶的日期範圍和月份
      const allDates = []
      importPreview.forEach(item => {
        if (item.date && item.userName === userName) {
          const date = parseLocalYMD(item.date)
          if (!isNaN(date.getTime())) {
            allDates.push(date)
          }
        }
      })
      
      if (allDates.length > 0) {
        // 確定月份範圍：找出所有日期中出現的月份
        const monthSet = new Set()
        allDates.forEach(date => {
          const year = date.getFullYear()
          const month = date.getMonth() + 1 // 1-12
          monthSet.add(`${year}-${String(month).padStart(2, '0')}`)
        })
        
        // 為每個月份檢查所有工作日
        monthSet.forEach(monthKey => {
          const [year, month] = monthKey.split('-').map(Number)
          // 該月第一天
          const firstDay = new Date(year, month - 1, 1)
          // 該月最後一天
          const lastDay = new Date(year, month, 0)
          
          // 遍歷該月的每一天（排除週末）
          const currentDate = new Date(firstDay)
          while (currentDate <= lastDay) {
            const dayOfWeek = currentDate.getDay() // 0 = 週日, 6 = 週六
            
            // 只處理非週末的日期
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              const dateStr = formatLocalYMD(currentDate)

              // 請假：視為正常，不產生未打卡
              if (leaveSetByUser.get(userName)?.has(dateStr)) {
                currentDate.setDate(currentDate.getDate() + 1)
                continue
              }
              // CSV 內已有該日任何列（包含缺少打卡/請假）：不再產生「匯入檔案後無記錄」
              if (userAnyDateMap.get(userName)?.has(dateStr)) {
                currentDate.setDate(currentDate.getDate() + 1)
                continue
              }
              
              // 檢查該天是否有有效打卡記錄
              if (!datesWithValidRecords.has(dateStr)) {
                // 檢查該天是否已經有未打卡記錄（避免重複）
                const existingNoClockIn = getUserAttendanceRecords(userName, dateStr, dateStr)
                  .filter(r => r.details === '缺少打卡時間' || r.details === '匯入檔案後無記錄')
                
                if (existingNoClockIn.length === 0) {
                  const noClockInResult = saveAttendanceRecord({
                    userName: userName,
                    date: dateStr,
                    clockInTime: null,
                    isLate: false,
                    details: '匯入檔案後無記錄',
                    source: 'SOYA刷卡機',
                    type: 'no-clockin' // 標記為未打卡類型
                  })
                  
                  if (noClockInResult.success) {
                    noClockInSuccessCount++
                  } else {
                    errorCount++
                  }
                } else {
                  noClockInDuplicateCount++
                }
              }
            }
            
            // 移到下一天
            currentDate.setDate(currentDate.getDate() + 1)
          }
        })
      }
    })
    
    setImportResult({
      total: validRecords.length,
      attendanceSuccess: attendanceSuccessCount,
      attendanceDuplicate: attendanceDuplicateCount,
      lateSuccess: lateSuccessCount,
      lateDuplicate: lateDuplicateCount,
      noClockInSuccess: noClockInSuccessCount,
      noClockInDuplicate: noClockInDuplicateCount,
      error: errorCount
    })
    
    // 重新計算績效
    setTimeout(() => {
      calculatePerformance(getViewUser())
      if (showDailyPerformance) {
        calculateDailyPerformance()
      }
    }, 100)
    
    // 注意：不清空 importPreview，以便在詳情視圖中顯示未打卡記錄
    // setImportPreview([])
    setImportData('')
  }
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    
    if (isExcel) {
      // Excel文件需要先轉換為CSV
      alert('目前僅支援CSV格式。\n\n請將Excel文件另存為CSV格式：\n1. 在Excel中打開文件\n2. 點擊「檔案」→「另存新檔」\n3. 選擇「CSV UTF-8 (逗號分隔)(*.csv)」或「CSV (逗號分隔)(*.csv)」\n4. 保存後再上傳')
      return
    }
    
    // 處理CSV文件，嘗試多種編碼
    const reader = new FileReader()
    reader.onload = (event) => {
      let text = event.target.result
      
      // 嘗試檢測和修復編碼問題
      // 如果包含BOM，移除它
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1)
      }
      
      setImportData(text)
    }
    reader.onerror = () => {
      alert('讀取文件失敗，請確保文件編碼為UTF-8')
    }
    // 嘗試UTF-8編碼，如果失敗可以嘗試其他編碼
    reader.readAsText(file, 'UTF-8')
  }
  // 管理者評分相關函數（支援多選員工，每人一筆評分）
  const handleScoreSubmit = () => {
    const names = Array.isArray(scoreForm.selectedUserNames) ? scoreForm.selectedUserNames : []
    if (names.length === 0 || !scoreForm.date || !scoreForm.adjustment) {
      alert('請至少選擇一位員工，並填寫日期與調整分數')
      return
    }
    
    const adjustment = parseFloat(scoreForm.adjustment)
    if (isNaN(adjustment) || adjustment <= 0) {
      alert('調整分數必須大於0')
      return
    }
    
    const actualAdjustment = scoreForm.adjustmentType === '+' ? adjustment : -adjustment
    const viewUser = getViewUser()
    let successCount = 0
    let failMsg = ''
    names.forEach((userName) => {
      const result = savePerformanceRecord({
        userName,
        date: scoreForm.date,
        adjustment: actualAdjustment.toString(),
        adjustmentType: scoreForm.adjustmentType,
        details: scoreForm.details || '',
        evaluator: currentUser
      })
      if (result.success) successCount++
      else if (result.message) failMsg = result.message
    })
    
    if (successCount > 0) {
      alert(successCount === names.length ? '評分已保存' : `已保存 ${successCount} 筆，${names.length - successCount} 筆失敗${failMsg ? '：' + failMsg : ''}`)
      setShowScoreForm(false)
      setScoreForm({
        selectedUserNames: [],
        date: new Date().toISOString().split('T')[0],
        adjustmentType: '+',
        adjustment: '',
        details: ''
      })
      names.forEach((u) => setTimeout(() => calculatePerformance(u), 100))
      if (!names.includes(viewUser)) setTimeout(() => calculatePerformance(viewUser), 100)
    } else {
      alert(failMsg || '保存失敗')
    }
  }
  
  const handleDeleteScore = (recordId) => {
    if (!window.confirm('確定要刪除此評分記錄嗎？')) return
    
    const result = deletePerformanceRecord(recordId)
    if (result.success) {
      alert('已刪除')
      // 重新計算績效（立即更新績效評分卡片）
      calculatePerformance(getViewUser())
    } else {
      alert(result.message || '刪除失敗')
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-')
      const year = parseInt(y) - 1911
      return `${year}/${m}/${d}`
    }
    return dateStr
  }

  // 格式化日期並顯示星期幾
  const formatDateWithWeekday = (dateStr) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const dayOfWeek = date.getDay()
    const weekday = weekdays[dayOfWeek]
    
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-')
      const year = parseInt(y) - 1911
      return `${year}/${m}/${d}(${weekday})`
    }
    return dateStr
  }

  const getCompletionColor = (rate) => {
    if (rate >= 100) return 'text-green-400'
    if (rate >= 80) return 'text-yellow-400'
    if (rate >= 50) return 'text-orange-400'
    return 'text-red-400'
  }

  const getPerformanceColor = (score) => {
    if (score >= 4.5) return 'text-green-400'
    if (score >= 3.5) return 'text-yellow-400'
    if (score >= 2.5) return 'text-orange-400'
    return 'text-red-400'
  }
  
  const getPerformanceScoreColor = (score) => {
    if (score >= 120) return 'text-green-400'
    if (score >= 100) return 'text-yellow-400'
    if (score >= 80) return 'text-orange-400'
    return 'text-red-400'
  }

  // 達成率調整規則管理函數（僅管理者）
  const handleAddRule = () => {
    if (!newRule.minRate || newRule.adjustment === '') {
      alert('請填寫最小完成率和調整分數')
      return
    }
    const minRate = parseFloat(newRule.minRate)
    const maxRate = newRule.maxRate ? parseFloat(newRule.maxRate) : null
    const adjustment = parseFloat(newRule.adjustment)
    
    if (isNaN(minRate) || isNaN(adjustment) || (maxRate !== null && isNaN(maxRate))) {
      alert('請輸入有效的數字')
      return
    }
    
    if (maxRate !== null && maxRate <= minRate) {
      alert('最大完成率必須大於最小完成率')
      return
    }
    
    const label = newRule.label || (maxRate === null ? `≥${minRate}%` : `${minRate}-${maxRate}%`)
    const rule = {
      id: Date.now().toString(),
      minRate,
      maxRate,
      adjustment,
      label
    }
    
    const updated = [...completionRateRules, rule]
    setCompletionRateRules(updated)
    saveCompletionRateRules(updated)
    setNewRule({ minRate: '', maxRate: '', adjustment: '', label: '' })
    calculatePerformance(getViewUser())
  }

  const handleDeleteRule = (id) => {
    if (!window.confirm('確定要刪除此規則嗎？')) return
    const updated = completionRateRules.filter(r => r.id !== id)
    setCompletionRateRules(updated)
    saveCompletionRateRules(updated)
    calculatePerformance(getViewUser())
  }

  const handleUpdateRule = (id, updates) => {
    const updated = completionRateRules.map(r => 
      r.id === id ? { ...r, ...updates } : r
    )
    setCompletionRateRules(updated)
    saveCompletionRateRules(updated)
    setEditingRuleId(null)
    calculatePerformance(getViewUser())
  }

  const handleStartEditRule = (rule) => {
    setEditingRuleId(rule.id)
    setNewRule({
      minRate: rule.minRate.toString(),
      maxRate: rule.maxRate ? rule.maxRate.toString() : '',
      adjustment: rule.adjustment.toString(),
      label: rule.label || ''
    })
  }

  const handleCancelEditRule = () => {
    setEditingRuleId(null)
    setNewRule({ minRate: '', maxRate: '', adjustment: '', label: '' })
  }

  // 遲到績效評分配置管理函數（僅管理者）- 簡化為固定扣分
  const handleSavePenaltyConfig = () => {
    const latePenalty = parseFloat(penaltyConfig.latePenalty)
    const noClockInPenalty = parseFloat(penaltyConfig.noClockInPenalty)
    
    if (isNaN(latePenalty) || isNaN(noClockInPenalty)) {
      alert('請輸入有效的數字')
      return
    }
    
    const updated = {
      ...latePerformanceConfig,
      latePenaltyPerTime: latePenalty,
      noClockInPenaltyPerTime: noClockInPenalty
    }
    setLatePerformanceConfig(updated)
    saveLatePerformanceConfig(updated)
    calculatePerformance(getViewUser())
    alert('設定已保存')
  }

  const handleToggleLatePerformanceEnabled = () => {
    const updated = { ...latePerformanceConfig, enabled: !latePerformanceConfig.enabled }
    setLatePerformanceConfig(updated)
    saveLatePerformanceConfig(updated)
    calculatePerformance(getViewUser())
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400">個人績效</h2>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <p className="text-gray-400 text-xs sm:text-sm">使用者: 
                <span className="ml-1.5 text-white font-semibold text-xs sm:text-sm">
                  {selectedViewUser ? (users.find(u => u.account === selectedViewUser)?.name || selectedViewUser) : (currentUser || '—')}
                </span>
              </p>
              {userRole === 'admin' && users.length > 0 && (
                <select
                  value={selectedViewUser || currentUser || ''}
                  onChange={(e) => {
                    const selectedAccount = e.target.value
                    setSelectedViewUser(selectedAccount === currentUser ? null : selectedAccount)
                  }}
                  className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-white text-xs focus:outline-none focus:border-yellow-400"
                >
                  <option value={currentUser || ''}>查看我的績效</option>
                  {users.map(user => (
                    <option key={user.account} value={user.account}>
                      {user.name || user.account}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-gray-400 text-[10px] sm:text-xs mb-1">年份</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
              >
                {Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => {
                  const year = 2026 + i // 從2026年開始，到當前年份
                  return (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-[10px] sm:text-xs mb-1">月份</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const month = i + 1
                  return (
                    <option key={month} value={month}>
                      {month}月
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 績效統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* 平均完成率（僅供參考，不影響績效評分） */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs mb-1">平均完成率</p>
              <p className={`text-xl sm:text-2xl font-bold ${getCompletionColor(performanceData.averageCompletionRate)}`}>
                {performanceData.averageCompletionRate.toFixed(1)}%
              </p>
              <p className="text-gray-500 text-[10px] mt-0.5">
                共 {performanceData.totalWorkItems} 個項目 · 僅供參考不計分
              </p>
            </div>
            <div className="bg-yellow-400/20 rounded-full p-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 完成項目數 */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs mb-1">完成項目</p>
              <p className="text-xl sm:text-2xl font-bold text-green-400">{performanceData.completedItems}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">
                完成率 ≥ 100%
              </p>
            </div>
            <div className="bg-green-400/20 rounded-full p-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 部分完成項目數 */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs mb-1">部分完成</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-400">{performanceData.partialItems}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">
                0% &lt; 完成率 &lt; 100%
              </p>
            </div>
            <div className="bg-yellow-400/20 rounded-full p-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 出勤紀錄 */}
        <div 
          className={`bg-gray-800 border border-gray-700 rounded-lg p-3 sm:p-4 ${(performanceData.attendanceRecords && performanceData.attendanceRecords.length > 0) ? 'cursor-pointer hover:bg-gray-750 transition-colors' : ''}`}
          onClick={() => {
            if (performanceData.attendanceRecords && performanceData.attendanceRecords.length > 0) {
              setShowLateRecords(!showLateRecords)
            }
          }}
          title={(performanceData.attendanceRecords && performanceData.attendanceRecords.length > 0) ? '點擊查看出勤記錄' : ''}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs mb-1">出勤紀錄</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-400">
                {performanceData.totalLateMinutes || 0}
              </p>
              <p className="text-gray-400 text-[10px] mt-0.5">
                總遲到分鐘數: {performanceData.totalLateMinutes || 0}
              </p>
              {performanceData.attendanceRecords && performanceData.attendanceRecords.length > 0 && (
                <p className="text-gray-500 text-[10px] mt-0.5">點擊查看詳情</p>
              )}
            </div>
            <div className="bg-yellow-400/20 rounded-full p-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* 出勤記錄詳情 */}
        {showLateRecords && (() => {
          // 從導入預覽中計算未打卡記錄（排除週末）
          // 邏輯：1. 將"缺少打卡紀錄"視為未打卡 2. 匯入檔案後，沒有記錄的日期一律視為未打卡 3. 但要排除週六和週日
          const noClockInRecordsFromPreview = []
          let calculatedNoClockInCount = performanceData.noClockInCount || 0
          
          if (importPreview && importPreview.length > 0) {
            const currentUser = getCurrentUser()
            const userName = currentUser?.account || ''
            
            // 1. 處理"缺少打卡時間"的記錄（視為未打卡，但排除週末）
            importPreview.forEach(item => {
              if (item.error === '缺少打卡時間' && item.date && item.userName === userName) {
                // 判斷日期是否為週六或週日
                const recordDate = new Date(item.date)
                const dayOfWeek = recordDate.getDay() // 0 = 週日, 6 = 週六
                
                // 只統計非週末的未打卡記錄
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                  const dateStr = item.date.split('T')[0] || item.date
                  noClockInRecordsFromPreview.push({
                    id: `no-clockin-missing-${item.index}`,
                    date: dateStr,
                    userName: item.userName,
                    userDisplayName: item.userDisplayName || item.userName,
                    source: 'SOYA刷卡機',
                    details: '缺少打卡時間'
                  })
                }
              }
            })
            
            // 2. 從導入預覽中提取所有有效打卡記錄的日期（正常、遲到，但不包括缺少打卡時間）
            const datesWithValidRecords = new Set()
            importPreview.forEach(item => {
              if (item.date && item.userName === userName && !item.error) {
                // 將日期轉換為 YYYY-MM-DD 格式以便比較
                const dateStr = item.date.split('T')[0] || item.date
                datesWithValidRecords.add(dateStr)
              }
            })
            
            // 3. 確定日期範圍（從最早日期到最晚日期）
            const allDates = []
            importPreview.forEach(item => {
              if (item.date && item.userName === userName) {
                const dateStr = item.date.split('T')[0] || item.date
                const date = new Date(dateStr)
                if (!isNaN(date.getTime())) {
                  allDates.push(date)
                }
              }
            })
            
            if (allDates.length > 0) {
              const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
              const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))
              
              // 4. 遍歷該日期範圍內的每一天（排除週末）
              const currentDate = new Date(minDate)
              while (currentDate <= maxDate) {
                const dayOfWeek = currentDate.getDay() // 0 = 週日, 6 = 週六
                
                // 只處理非週末的日期
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                  const dateStr = currentDate.toISOString().split('T')[0]
                  
                  // 5. 檢查該天是否有有效打卡記錄（不包括缺少打卡時間）
                  if (!datesWithValidRecords.has(dateStr)) {
                    // 檢查是否已經在未打卡記錄中（避免重複）
                    const alreadyAdded = noClockInRecordsFromPreview.some(r => r.date === dateStr)
                    if (!alreadyAdded) {
                      // 沒有記錄，視為未打卡
                      noClockInRecordsFromPreview.push({
                        id: `no-clockin-${dateStr}`,
                        date: dateStr,
                        userName: userName,
                        userDisplayName: currentUser?.name || currentUser?.account || userName,
                        source: 'SOYA刷卡機',
                        details: '匯入檔案後無記錄'
                      })
                    }
                  }
                }
                
                // 移到下一天
                currentDate.setDate(currentDate.getDate() + 1)
              }
            }
            
            // 更新未打卡次數
            calculatedNoClockInCount = noClockInRecordsFromPreview.length
          }
          
          return (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm sm:text-base font-bold text-yellow-400">出勤記錄詳情</h3>
              <button
                onClick={() => setShowLateRecords(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 三個統計面板 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {/* 正常出勤次數 */}
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">正常出勤次數</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-400">
                      {performanceData.normalAttendanceCount || 0}
                    </p>
                  </div>
                  <div className="bg-green-400/20 rounded-full p-1.5">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* 遲到次數 */}
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">遲到次數</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-400">
                      {performanceData.lateAttendanceCount || 0}
                    </p>
                  </div>
                  <div className="bg-red-400/20 rounded-full p-1.5">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* 未打卡次數 */}
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">未打卡次數</p>
                    <p className="text-xl sm:text-2xl font-bold text-yellow-400">
                      {calculatedNoClockInCount}
                    </p>
                  </div>
                  <div className="bg-yellow-400/20 rounded-full p-1.5">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 詳細記錄表格 */}
            {performanceData.attendanceRecords && performanceData.attendanceRecords.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs sm:text-sm font-semibold text-yellow-400 mb-2">詳細出勤記錄</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-700">
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">日期</th>
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">打卡時間</th>
                        <th className="px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs">狀態</th>
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceData.attendanceRecords.map((record, index) => {
                        // 判斷是否為未打卡記錄
                        const isNoClockIn = !record.clockInTime || 
                                          record.details === '缺少打卡時間' || 
                                          record.details === '匯入檔案後無記錄' ||
                                          record.details === '匯入檔案後無紀錄'
                        const isLeave = (() => {
                          const s = String(record?.details || '').trim()
                          return s === '請假' || s === '特休' || s.includes('請假') || s.includes('特休')
                        })()
                        
                        return (
                        <tr key={record.id || index} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">
                            {record.date ? new Date(record.date).toLocaleDateString('zh-TW', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit',
                              weekday: 'short'
                            }) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">
                            {record.clockInTime || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isLeave ? (
                              <span className="text-green-400 font-semibold text-[10px] sm:text-xs">請假</span>
                            ) : isNoClockIn ? (
                              <span className="text-yellow-400 font-semibold text-[10px] sm:text-xs">未打卡</span>
                            ) : record.isLate ? (
                              <span className="text-red-400 font-semibold text-[10px] sm:text-xs">遲到</span>
                            ) : (
                              <span className="text-green-400 text-[10px] sm:text-xs">正常</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400 text-[9px] sm:text-[10px]">
                            {record.details || record.source || '—'}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* 未打卡記錄表格 */}
            {noClockInRecordsFromPreview.length > 0 ? (
                <div className="mb-4">
                  <h4 className="text-xs sm:text-sm font-semibold text-yellow-400 mb-2">未打卡記錄（已排除週末）</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-900 border-b border-gray-700">
                          <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">日期</th>
                          <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">用戶</th>
                          <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">狀態</th>
                          <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">備註</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noClockInRecordsFromPreview.map((record, index) => (
                          <tr key={record.id || index} className="border-b border-gray-700 hover:bg-gray-750">
                            <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">
                              {record.date ? new Date(record.date).toLocaleDateString('zh-TW', { 
                                year: 'numeric', 
                                month: '2-digit', 
                                day: '2-digit',
                                weekday: 'short'
                              }) : '—'}
                            </td>
                            <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">
                              {record.userDisplayName || record.userName || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className="text-yellow-400 font-semibold text-[10px] sm:text-xs">未打卡</span>
                            </td>
                            <td className="px-2 py-1.5 text-gray-400 text-[9px] sm:text-[10px]">
                              {record.details || record.source || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    共 {noClockInRecordsFromPreview.length} 筆未打卡記錄（已排除週六、週日）
                  </div>
                </div>
              ) : null}
            
            {/* 匯入記錄 */}
            {importPreview && importPreview.length > 0 && (
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-yellow-400 mb-2">匯入記錄</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-700">
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">序號</th>
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">日期</th>
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">時間</th>
                        <th className="px-2 py-1.5 text-left text-yellow-400 font-semibold text-[10px] sm:text-xs">用戶</th>
                        <th className="px-2 py-1.5 text-center text-yellow-400 font-semibold text-[10px] sm:text-xs">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((item, index) => (
                        <tr key={index} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{item.index || index + 1}</td>
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{item.date || '—'}</td>
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{item.time || '—'}</td>
                          <td className="px-2 py-1.5 text-white text-[10px] sm:text-xs">{item.userDisplayName || '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            {item.error ? (
                              <span className="text-red-400 text-[9px] sm:text-[10px]">{item.error}</span>
                            ) : item.late ? (
                              <span className="text-red-400 font-semibold text-[10px] sm:text-xs">遲到</span>
                            ) : (
                              <span className="text-green-400 text-[10px] sm:text-xs">正常</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  共 {importPreview.length} 筆匯入記錄
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/* 績效評分：完成率→計算績效分數→統計至此 */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-gray-400 text-xs mb-1">績效評分</p>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <p className={`text-xl sm:text-2xl font-bold ${getPerformanceScoreColor(performanceData.performanceScore)}`}>
                  {performanceData.performanceScore.toFixed(0)}
                </p>
                {performanceData.totalAdjustment !== 0 && (
                  <span className={`text-sm sm:text-base font-semibold ${performanceData.totalAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {performanceData.adjustmentDisplay}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-xs">
                <span className="text-gray-500">初始100分</span>
                {performanceData.totalAdjustment !== 0 && (
                  <>
                    {performanceData.managerAdjustment !== 0 && (
                      <>
                        <span className="text-gray-500">+</span>
                        <span className={performanceData.managerAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}>
                          管理者{performanceData.managerAdjustment >= 0 ? '+' : ''}{performanceData.managerAdjustment.toFixed(1)}
                        </span>
                      </>
                    )}
                    {performanceData.completionRateAdjustment !== 0 && (
                      <>
                        <span className="text-gray-500">+</span>
                        <span className={performanceData.completionRateAdjustment >= 0 ? 'text-green-400' : 'text-red-400'} title="依每條工項完成率查表加減分後加總">
                          每條完成率{performanceData.completionRateAdjustment >= 0 ? '+' : ''}{performanceData.completionRateAdjustment}
                        </span>
                      </>
                    )}
                    {performanceData.lateAdjustment !== 0 && (
                      <>
                        <span className="text-gray-500">+</span>
                        <span className="text-red-400" title="依遲到記錄計算">
                          遲到{performanceData.lateAdjustment.toFixed(2)}
                        </span>
                      </>
                    )}
                    {performanceData.noClockInAdjustment !== 0 && (
                      <>
                        <span className="text-gray-500">+</span>
                        <span className="text-red-400" title="依未打卡記錄計算（六日除外）">
                          未打卡{performanceData.noClockInAdjustment.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span className="text-gray-500">=</span>
                    <span className={`font-bold ${getPerformanceScoreColor(performanceData.performanceScore)}`}>
                      {performanceData.performanceScore.toFixed(0)}分
                    </span>
                  </>
                )}
              </div>
              {performanceData.totalWorkItems > 0 && (
                <p className="text-gray-500 text-[10px] mt-1">績效評分依每天每條完成率記分（每條加減分加總），平均完成率僅供參考不計入</p>
              )}
            </div>
            <div className="bg-purple-400/20 rounded-full p-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 管理者評分區塊 */}
      {userRole === 'admin' && (
        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm sm:text-base font-bold text-yellow-400">管理者評分</h3>
            <button
              onClick={() => {
                if (!showScoreForm) {
                  const viewUser = getViewUser()
                  const me = getCurrentUser()
                  // 僅在「正在查看的用戶」不是自己時才預選，避免管理員被預選而誤扣到自己
                  setScoreForm({
                    ...scoreForm,
                    selectedUserNames: viewUser && viewUser !== me ? [viewUser] : []
                  })
                }
                setShowScoreForm(!showScoreForm)
              }}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
            >
              {showScoreForm ? '取消' : '新增評分'}
            </button>
          </div>
          
          {showScoreForm && (
            <div className="bg-gray-900 rounded-lg p-4 mb-4 border border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-gray-400 text-sm mb-2">選擇員工 *（可多選）</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setScoreForm({ ...scoreForm, selectedUserNames: users.map(u => u.account) })}
                      className="text-xs px-2 py-1 rounded bg-gray-600 text-gray-300 hover:bg-gray-500"
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      onClick={() => setScoreForm({ ...scoreForm, selectedUserNames: [] })}
                      className="text-xs px-2 py-1 rounded bg-gray-600 text-gray-300 hover:bg-gray-500"
                    >
                      清空
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-600 rounded px-3 py-2 bg-gray-700 space-y-1.5">
                    {users.map((user) => {
                      const account = user.account || user.id
                      const checked = (scoreForm.selectedUserNames || []).includes(account)
                      return (
                        <label key={account} className="flex items-center gap-2 cursor-pointer hover:bg-gray-600 rounded px-2 py-1 -mx-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(scoreForm.selectedUserNames || []), account]
                                : (scoreForm.selectedUserNames || []).filter((a) => a !== account)
                              setScoreForm({ ...scoreForm, selectedUserNames: next })
                            }}
                            className="rounded border-gray-500 text-yellow-500 focus:ring-yellow-400"
                          />
                          <span className="text-white text-sm">{user.name || account}</span>
                        </label>
                      )
                    })}
                    {users.length === 0 && (
                      <p className="text-gray-500 text-sm">尚無員工名單</p>
                    )}
                  </div>
                  {(scoreForm.selectedUserNames || []).length > 0 && (
                    <p className="text-gray-500 text-xs mt-1">已選 {(scoreForm.selectedUserNames || []).length} 人</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">日期 *</label>
                  <input
                    type="date"
                    value={scoreForm.date}
                    onChange={(e) => setScoreForm({ ...scoreForm, date: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">調整類型 *</label>
                  <select
                    value={scoreForm.adjustmentType}
                    onChange={(e) => setScoreForm({ ...scoreForm, adjustmentType: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="+">加分 (+)</option>
                    <option value="-">減分 (-)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">調整分數 *</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={scoreForm.adjustment}
                    onChange={(e) => setScoreForm({ ...scoreForm, adjustment: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    placeholder="輸入分數"
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-gray-400 text-sm mb-2">具體事項</label>
                  <textarea
                    value={scoreForm.details}
                    onChange={(e) => setScoreForm({ ...scoreForm, details: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    rows="3"
                    placeholder="請填寫加減分的具體原因或事項..."
                  />
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleScoreSubmit}
                  className="bg-yellow-400 text-gray-900 px-6 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
                >
                  保存評分
                </button>
              </div>
            </div>
          )}
          
          {/* 評分記錄列表（按月份分組） */}
          <div>
            <h4 className="text-md font-semibold text-yellow-400 mb-3">評分記錄（按月份）</h4>
            {Object.keys(performanceData.recordsByMonth || {}).length === 0 ? (
              <div className="text-gray-400 text-center py-4">
                <p>尚無評分記錄</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(performanceData.recordsByMonth || {})
                  .sort((a, b) => b.localeCompare(a)) // 最新的月份在前
                  .map((monthKey) => {
                    const monthRecords = performanceData.recordsByMonth[monthKey]
                    const [year, month] = monthKey.split('-')
                    const monthName = `${parseInt(year) - 1911}年${parseInt(month)}月`
                    
                    // 計算該月份的總調整分數
                    let monthAdjustment = 0
                    monthRecords.forEach(record => {
                      if (record.adjustment) {
                        monthAdjustment += parseFloat(record.adjustment) || 0
                      }
                    })
                    const monthScore = 100 + monthAdjustment
                    
                    return (
                      <div key={monthKey} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                          <h5 className="text-white font-semibold text-lg">{monthName}</h5>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-400 text-sm">該月總調整: 
                              <span className={`ml-2 font-bold ${monthAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {monthAdjustment >= 0 ? '+' : ''}{monthAdjustment.toFixed(1)} 分
                              </span>
                            </span>
                            <span className="text-yellow-400 font-semibold">該月績效: {monthScore.toFixed(0)} 分</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {monthRecords.map((record) => (
                            <div key={record.id} className="bg-gray-800 rounded p-3 border border-gray-700">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-4 mb-2 flex-wrap">
                                    <span className="text-white font-semibold">{record.userName}</span>
                                    <span className="text-gray-400 text-sm">{formatDate(record.date)}</span>
                                    {record.adjustment && (
                                      <span className={`text-lg font-bold ${parseFloat(record.adjustment) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {parseFloat(record.adjustment) >= 0 ? '+' : ''}{record.adjustment} 分
                                      </span>
                                    )}
                                    {record.score && !record.adjustment && (
                                      <span className={`text-lg font-bold ${getPerformanceColor(parseFloat(record.score || 0))}`}>
                                        {record.score} 分
                                      </span>
                                    )}
                                    {record.evaluator && (
                                      <span className="text-gray-500 text-xs">評分者: {record.evaluator}</span>
                                    )}
                                  </div>
                                  {record.details && (
                                    <p className="text-gray-300 text-sm mt-2 whitespace-pre-wrap">{record.details}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    handleDeleteScore(record.id)
                                  }}
                                  className="ml-4 text-red-400 hover:text-red-300 text-sm whitespace-nowrap"
                                >
                                  刪除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 每日績效表現（僅管理者） */}
      {userRole === 'admin' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-400">每日績效表現</h3>
            <button
              onClick={() => {
                setShowDailyPerformance(!showDailyPerformance)
                if (!showDailyPerformance) {
                  calculateDailyPerformance()
                }
              }}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
            >
              {showDailyPerformance ? '收起' : '查看每日績效'}
            </button>
          </div>
          
          {showDailyPerformance && (
            <div className="overflow-x-auto">
              {dailyPerformanceData.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  <p>該月份尚無績效數據</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-900 border-b-2 border-gray-700">
                      <th className="px-4 py-3 text-left text-yellow-400 font-semibold">日期</th>
                      <th className="px-4 py-3 text-left text-yellow-400 font-semibold">用戶</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">工作項目</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">完成</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">部分完成</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">平均完成率</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">遲到</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">未打卡</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">管理者調整</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">達成率調整</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">遲到調整</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">未打卡調整</th>
                      <th className="px-4 py-3 text-center text-yellow-400 font-semibold">績效評分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyPerformanceData.map((item, index) => (
                      <tr key={`${item.date}-${item.userName}-${index}`} className="border-b border-gray-700 hover:bg-gray-750">
                        <td className={`px-4 py-3 ${item.isWeekend ? 'text-red-400 font-semibold' : 'text-white'}`}>
                          {formatDateWithWeekday(item.date)}
                        </td>
                        <td className="px-4 py-3 text-white">{item.userDisplayName}</td>
                        <td className="px-4 py-3 text-center text-white">{item.workItems}</td>
                        <td className="px-4 py-3 text-center text-green-400">{item.completedItems}</td>
                        <td className="px-4 py-3 text-center text-yellow-400">{item.partialItems}</td>
                        <td className={`px-4 py-3 text-center font-semibold ${getCompletionColor(item.averageCompletionRate)}`}>
                          {item.averageCompletionRate.toFixed(1)}%
                        </td>
                        <td className={`px-4 py-3 text-center ${item.lateCount === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {item.lateCount}
                        </td>
                        <td className={`px-4 py-3 text-center ${item.noClockInCount === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {item.noClockInCount}
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold ${item.managerAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {item.managerAdjustment !== 0 ? (item.managerAdjustment >= 0 ? '+' : '') + item.managerAdjustment.toFixed(1) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold ${item.completionRateAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {item.completionRateAdjustment !== 0 ? (item.completionRateAdjustment >= 0 ? '+' : '') + item.completionRateAdjustment.toFixed(2) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold text-red-400`}>
                          {item.lateAdjustment !== 0 ? item.lateAdjustment.toFixed(2) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold text-red-400`}>
                          {item.noClockInAdjustment !== 0 ? item.noClockInAdjustment.toFixed(2) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-center font-bold ${getPerformanceScoreColor(item.performanceScore)}`}>
                          {item.performanceScore.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* 刷卡記錄導入（僅管理者） */}
      {userRole === 'admin' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-400">SOYA刷卡機記錄導入</h3>
            <button
              onClick={() => setShowAttendanceImport(!showAttendanceImport)}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
            >
              {showAttendanceImport ? '收起' : '導入刷卡記錄'}
            </button>
          </div>
          
          {showAttendanceImport && (
            <div className="space-y-4">
              {/* 上班時間設定 */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <label className="block text-gray-400 text-sm mb-2">上班時間（用於判斷遲到）</label>
                <input
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
                <p className="text-gray-500 text-xs mt-1">超過此時間打卡將被記錄為遲到</p>
              </div>
              
              {/* 文件上傳或手動輸入 */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <label className="block text-gray-400 text-sm mb-2">上傳CSV文件</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-500"
                />
                <p className="text-gray-500 text-xs mt-2">支援格式：CSV (.csv, .txt)</p>
                <p className="text-yellow-400 text-xs mt-1">💡 如果您的刷卡機導出Excel格式，請先在Excel中另存為CSV格式後再上傳</p>
                <p className="text-gray-500 text-xs mt-1">或手動貼上CSV數據：</p>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder="請貼上CSV數據，第一行為標題行（應包含日期時間和用戶欄位）&#10;例如：&#10;日期時間,用戶&#10;2026-01-23 08:30:00,user1"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono min-h-[120px] mt-2"
                />
                <button
                  onClick={handlePreviewImport}
                  className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
                >
                  預覽數據
                </button>
              </div>
              
              {/* 預覽結果 */}
              {importPreview.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <h4 className="text-yellow-400 font-semibold mb-3">預覽結果</h4>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-800 border-b border-gray-700">
                          <th className="px-3 py-2 text-left text-gray-400">序號</th>
                          <th className="px-3 py-2 text-left text-gray-400">日期</th>
                          <th className="px-3 py-2 text-left text-gray-400">時間</th>
                          <th className="px-3 py-2 text-left text-gray-400">用戶</th>
                          <th className="px-3 py-2 text-center text-gray-400">狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-700">
                            <td className="px-3 py-2 text-white">{item.index}</td>
                            <td className="px-3 py-2 text-white">{item.date || '—'}</td>
                            <td className="px-3 py-2 text-white">{item.time || '—'}</td>
                            <td className="px-3 py-2 text-white">{item.userDisplayName || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {item.error ? (
                                <span className="text-red-400 text-xs">{item.error}</span>
                              ) : item.late ? (
                                <span className="text-red-400 font-semibold">遲到</span>
                              ) : (
                                <span className="text-green-400">正常</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                      共 {importPreview.length} 筆記錄，
                      正常: <span className="text-green-400">{importPreview.filter(p => !p.error && !p.late).length}</span> 筆，
                      遲到: <span className="text-red-400">{importPreview.filter(p => !p.error && p.late).length}</span> 筆，
                      錯誤: <span className="text-yellow-400">{importPreview.filter(p => p.error).length}</span> 筆
                    </div>
                    <button
                      onClick={handleImportAttendance}
                      disabled={importPreview.filter(p => !p.error).length === 0}
                      className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors"
                    >
                      導入出勤記錄
                    </button>
                  </div>
                </div>
              )}
              
              {/* 導入結果 */}
              {importResult && (
                <div className={`bg-gray-900 rounded-lg p-4 border ${importResult.error > 0 ? 'border-yellow-500' : 'border-green-500'}`}>
                  <h4 className="font-semibold mb-2">導入結果</h4>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-300">總計: {importResult.total} 筆打卡記錄</p>
                    <p className="text-green-400">出勤記錄成功: {importResult.attendanceSuccess || 0} 筆</p>
                    {importResult.attendanceDuplicate > 0 && (
                      <p className="text-yellow-400">出勤記錄已存在（跳過）: {importResult.attendanceDuplicate} 筆</p>
                    )}
                    {importResult.lateSuccess > 0 && (
                      <p className="text-red-400">遲到記錄成功: {importResult.lateSuccess} 筆</p>
                    )}
                    {importResult.lateDuplicate > 0 && (
                      <p className="text-yellow-400">遲到記錄已存在（跳過）: {importResult.lateDuplicate} 筆</p>
                    )}
                    {importResult.noClockInSuccess > 0 && (
                      <p className="text-yellow-400">未打卡記錄成功: {importResult.noClockInSuccess} 筆</p>
                    )}
                    {importResult.noClockInDuplicate > 0 && (
                      <p className="text-yellow-400">未打卡記錄已存在（跳過）: {importResult.noClockInDuplicate} 筆</p>
                    )}
                    {importResult.error > 0 && (
                      <p className="text-red-400">失敗: {importResult.error} 筆</p>
                    )}
                  </div>
                  <button
                    onClick={() => setImportResult(null)}
                    className="mt-3 text-yellow-400 hover:text-yellow-500 text-sm"
                  >
                    關閉
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 達成率調整規則配置（僅管理者） */}
      {userRole === 'admin' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-400">達成率調整規則設定</h3>
            <button
              onClick={() => setShowCompletionRateConfig(!showCompletionRateConfig)}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
            >
              {showCompletionRateConfig ? '收起' : '設定規則'}
            </button>
          </div>
          
          {showCompletionRateConfig && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">設定每條工項完成率區間對應的加減分（每天每條依此記分，與平均完成率無關）</p>
              
              {/* 規則列表 */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h4 className="text-white font-semibold mb-3">現有規則</h4>
                {completionRateRules.length === 0 ? (
                  <p className="text-gray-400 text-sm">尚無規則，請新增</p>
                ) : (
                  <div className="space-y-2">
                    {completionRateRules
                      .sort((a, b) => (b.minRate || 0) - (a.minRate || 0))
                      .map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700">
                          {editingRuleId === rule.id ? (
                            <div className="flex-1 grid grid-cols-4 gap-2">
                              <input
                                type="number"
                                value={newRule.minRate}
                                onChange={(e) => setNewRule({ ...newRule, minRate: e.target.value })}
                                placeholder="最小%"
                                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                              />
                              <input
                                type="number"
                                value={newRule.maxRate}
                                onChange={(e) => setNewRule({ ...newRule, maxRate: e.target.value })}
                                placeholder="最大%（留空=無上限）"
                                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                              />
                              <input
                                type="number"
                                value={newRule.adjustment}
                                onChange={(e) => setNewRule({ ...newRule, adjustment: e.target.value })}
                                placeholder="調整分數"
                                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleUpdateRule(rule.id, {
                                    minRate: parseFloat(newRule.minRate),
                                    maxRate: newRule.maxRate ? parseFloat(newRule.maxRate) : null,
                                    adjustment: parseFloat(newRule.adjustment),
                                    label: newRule.label || (newRule.maxRate ? `${newRule.minRate}-${newRule.maxRate}%` : `≥${newRule.minRate}%`)
                                  })}
                                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelEditRule}
                                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <span className="text-white font-medium">{rule.label || (rule.maxRate ? `${rule.minRate}-${rule.maxRate}%` : `≥${rule.minRate}%`)}</span>
                                <span className={`ml-3 font-semibold ${rule.adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {rule.adjustment >= 0 ? '+' : ''}{rule.adjustment}分
                                </span>
                              </div>
                              <button
                                onClick={() => handleStartEditRule(rule)}
                                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                              >
                                編輯
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                              >
                                刪除
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              
              {/* 新增規則 */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h4 className="text-white font-semibold mb-3">新增規則</h4>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <input
                    type="number"
                    value={newRule.minRate}
                    onChange={(e) => setNewRule({ ...newRule, minRate: e.target.value })}
                    placeholder="最小完成率（%）*"
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                  <input
                    type="number"
                    value={newRule.maxRate}
                    onChange={(e) => setNewRule({ ...newRule, maxRate: e.target.value })}
                    placeholder="最大完成率（%，留空=無上限）"
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                  <input
                    type="number"
                    value={newRule.adjustment}
                    onChange={(e) => setNewRule({ ...newRule, adjustment: e.target.value })}
                    placeholder="調整分數 *"
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                  <input
                    type="text"
                    value={newRule.label}
                    onChange={(e) => setNewRule({ ...newRule, label: e.target.value })}
                    placeholder="標籤（選填，如：≥100%）"
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <button
                  onClick={handleAddRule}
                  className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
                >
                  新增規則
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 遲到績效評分配置（僅管理者） */}
      {userRole === 'admin' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-400">出勤績效評分配置</h3>
            <button
              onClick={() => setShowLatePerformanceConfig(!showLatePerformanceConfig)}
              className="bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
            >
              {showLatePerformanceConfig ? '收起' : '設定規則'}
            </button>
          </div>
          
          {showLatePerformanceConfig && (
            <div className="space-y-4">
              {/* 啟用/停用開關 */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">啟用出勤扣分</label>
                    <p className="text-gray-400 text-xs mt-1">關閉後，遲到和未打卡將不會影響績效評分</p>
                  </div>
                  <button
                    onClick={handleToggleLatePerformanceEnabled}
                    className={`px-4 py-2 rounded font-semibold transition-colors ${
                      latePerformanceConfig.enabled
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    {latePerformanceConfig.enabled ? '已啟用' : '已停用'}
                  </button>
                </div>
              </div>

              {/* 固定扣分設定（簡化邏輯） */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h4 className="text-white font-semibold mb-4">扣分設定</h4>
                <p className="text-gray-400 text-sm mb-4">設定每次遲到和未打卡的固定扣分數</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">遲到一次扣幾分 *</label>
                    <input
                      type="number"
                      value={penaltyConfig.latePenalty}
                      onChange={(e) => setPenaltyConfig({ ...penaltyConfig, latePenalty: e.target.value })}
                      placeholder="例如：-2"
                      step="0.1"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    />
                    <p className="text-gray-500 text-xs mt-1">輸入負數，例如：-2 表示遲到一次扣2分</p>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">未打卡一次扣幾分 *</label>
                    <input
                      type="number"
                      value={penaltyConfig.noClockInPenalty}
                      onChange={(e) => setPenaltyConfig({ ...penaltyConfig, noClockInPenalty: e.target.value })}
                      placeholder="例如：-2"
                      step="0.1"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    />
                    <p className="text-gray-500 text-xs mt-1">輸入負數，例如：-2 表示未打卡一次扣2分（六日除外）</p>
                  </div>
                  
                  <button
                    onClick={handleSavePenaltyConfig}
                    className="w-full bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
                  >
                    保存設定
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 平時表現評分記錄（非管理者視圖，按月份分組） */}
      {userRole !== 'admin' && Object.keys(performanceData.recordsByMonth || {}).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h3 className="text-lg font-bold text-yellow-400 mb-4">績效評分記錄（按月份）</h3>
          <div className="space-y-6">
            {Object.keys(performanceData.recordsByMonth || {})
              .sort((a, b) => b.localeCompare(a)) // 最新的月份在前
              .map((monthKey) => {
                const monthRecords = performanceData.recordsByMonth[monthKey]
                const [year, month] = monthKey.split('-')
                const monthName = `${parseInt(year) - 1911}年${parseInt(month)}月`
                
                // 計算該月份的總調整分數
                let monthAdjustment = 0
                monthRecords.forEach(record => {
                  if (record.adjustment) {
                    monthAdjustment += parseFloat(record.adjustment) || 0
                  }
                })
                const monthScore = 100 + monthAdjustment
                
                return (
                  <div key={monthKey} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                      <h5 className="text-white font-semibold text-lg">{monthName}</h5>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400 text-sm">該月總調整: 
                          <span className={`ml-2 font-bold ${monthAdjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {monthAdjustment >= 0 ? '+' : ''}{monthAdjustment.toFixed(1)} 分
                          </span>
                        </span>
                        <span className="text-yellow-400 font-semibold">該月績效: {monthScore.toFixed(0)} 分</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {monthRecords.map((record) => (
                        <div key={record.id} className="bg-gray-800 rounded p-3 border border-gray-700">
                          <div className="flex items-center gap-4 mb-2">
                            <span className="text-gray-400 text-sm">{formatDate(record.date)}</span>
                            {record.adjustment && (
                              <span className={`text-lg font-bold ${parseFloat(record.adjustment) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(record.adjustment) >= 0 ? '+' : ''}{record.adjustment} 分
                              </span>
                            )}
                            {record.score && !record.adjustment && (
                              <span className={`text-lg font-bold ${getPerformanceColor(parseFloat(record.score || 0))}`}>
                                {record.score} 分
                              </span>
                            )}
                            {record.evaluator && (
                              <span className="text-gray-500 text-xs">評分者: {record.evaluator}</span>
                            )}
                          </div>
                          {record.details && (
                            <p className="text-gray-300 text-sm mt-2 whitespace-pre-wrap">{record.details}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* 工作明細：每條完成率→查表加減分→加總計入績效評分 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-yellow-400">工作明細</h3>
          <p className="text-gray-500 text-xs mt-1">每條依目標數與實際數量算完成率，再依規則查表加減分後加總計入績效評分（與平均完成率無關）</p>
        </div>
        {performanceData.workDetails.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            <p>尚無工作記錄</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-yellow-400">
                  <th className="px-4 py-3 text-left text-yellow-400 font-semibold">日期</th>
                  <th className="px-4 py-3 text-left text-yellow-400 font-semibold">案場</th>
                  <th className="px-4 py-3 text-left text-yellow-400 font-semibold">工作內容</th>
                  <th className="px-4 py-3 text-right text-yellow-400 font-semibold">預計數量</th>
                  <th className="px-4 py-3 text-right text-yellow-400 font-semibold">實際完成</th>
                  <th className="px-4 py-3 text-right text-yellow-400 font-semibold">完成率</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.workDetails.map((detail, index) => (
                  <tr key={index} className="border-b border-gray-700 hover:bg-gray-900">
                    <td className="px-4 py-3 text-white">{formatDate(detail.date)}</td>
                    <td className="px-4 py-3 text-white">{detail.siteName}</td>
                    <td className="px-4 py-3 text-white">{detail.workContent}</td>
                    <td className="px-4 py-3 text-right text-white">{detail.targetQuantity > 0 ? detail.targetQuantity.toFixed(1) : '—'}</td>
                    <td className="px-4 py-3 text-right text-white">{detail.actualQuantity > 0 ? detail.actualQuantity.toFixed(1) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${getCompletionColor(parseFloat(detail.completionRate))}`}>
                      {detail.targetQuantity > 0 ? `${detail.completionRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default PersonalPerformance
