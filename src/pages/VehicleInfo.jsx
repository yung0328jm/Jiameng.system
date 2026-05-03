import { useState, useEffect } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getCurrentUserInfo } from '../utils/authStorage'
import { refreshAppDataKeyFromSupabase } from '../utils/supabaseSync'
import {
  getAllVehicleSettings,
  saveVehicleSettings,
  deleteVehicleSettings,
  getVehicleSettingsEditors,
  saveVehicleSettingsEditors,
  getVehicleHiddenPlatesList,
  hideVehicleFromVehicleInfoPage,
  unhideVehicleFromVehicleInfoPage
} from '../utils/vehicleSettingsStorage'
import { isSelfTravelVehicle } from '../utils/vehicleSelfTravel'

/** 與 Calendar 一致：取得排程的案場段落（多案場時每個案場一筆，含 siteName + vehicleEntries） */
function getScheduleSegments(schedule) {
  if (!schedule) return []
  const segs = Array.isArray(schedule.segments) ? schedule.segments : null
  if (segs && segs.length > 0) {
    return segs.map((s) => ({
      siteName: String(s?.siteName ?? '').trim(),
      vehicleEntries: Array.isArray(s?.vehicleEntries) ? s.vehicleEntries : []
    }))
  }
  const siteName = String(schedule.siteName ?? '').trim()
  const vehicleEntries = Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0
    ? schedule.vehicleEntries
    : (() => {
        const v = String(schedule.vehicle ?? '').trim()
        if (!v) return []
        return v.split(',').map((s) => s.trim()).filter(Boolean).map((vehicle) => ({
          vehicle,
          departureMileage: schedule.departureMileage || '',
          returnMileage: schedule.returnMileage || '',
          needRefuel: schedule.needRefuel || false,
          fuelCost: schedule.fuelCost || ''
        }))
      })()
  return [{ siteName, vehicleEntries }]
}

function VehicleInfo() {
  const [vehicleData, setVehicleData] = useState({})
  const [vehicleSettings, setVehicleSettings] = useState({})
  const [vehicleSettingsEditors, setVehicleSettingsEditors] = useState(() => getVehicleSettingsEditors())
  const [newEditorAccount, setNewEditorAccount] = useState('')
  const [expandedVehicles, setExpandedVehicles] = useState({})
  const [expandedActivities, setExpandedActivities] = useState({})
  const [hiddenPlatesList, setHiddenPlatesList] = useState(() => getVehicleHiddenPlatesList())
  const loadVehicleSettings = () => setVehicleSettings(getAllVehicleSettings())
  const loadEditors = () => setVehicleSettingsEditors(getVehicleSettingsEditors())
  const loadHiddenPlates = () => setHiddenPlatesList(getVehicleHiddenPlatesList())
  const currentUser = getCurrentUserInfo()
  const currentAccount = currentUser?.username ? String(currentUser.username).trim() : ''
  const isAdmin = currentUser?.role === 'admin'
  const allowedAccounts = vehicleSettingsEditors?.allowedAccounts || []
  const canEditVehicleSettings = !!currentAccount && (isAdmin || allowedAccounts.includes(currentAccount))
  const updateVehicleSetting = (vehicleKey, field, value) => {
    saveVehicleSettings(vehicleKey, { [field]: value })
    setVehicleSettings((prev) => {
      const key = String(vehicleKey || '').trim()
      if (!key) return prev
      return { ...prev, [key]: { ...(prev[key] || {}), [field]: value } }
    })
  }
  /** 更新欄位；驗車為「上次＋間隔」自動帶入下次，保養改為手動輸入 */
  const updateVehicleSettingWithAutoNext = (vehicleKey, field, value) => {
    const key = String(vehicleKey || '').trim()
    if (!key) return
    const prev = vehicleSettings[key] || {}
    const next = { ...prev, [field]: value }
    if (field === 'lastInspectionDate' || field === 'inspectionIntervalMonths') {
      const lastStr = field === 'lastInspectionDate' ? value : (prev.lastInspectionDate || '')
      const months = field === 'inspectionIntervalMonths' ? parseInt(value, 10) : parseInt(prev.inspectionIntervalMonths, 10)
      if (lastStr && /^\d{4}-\d{2}-\d{2}$/.test(String(lastStr).trim()) && !Number.isNaN(months) && months > 0) {
        const d = new Date(lastStr + 'T00:00:00')
        if (!Number.isNaN(d.getTime())) {
          d.setMonth(d.getMonth() + months)
          d.setDate(d.getDate() + 1)
          next.nextInspectionDate = d.toISOString().slice(0, 10)
        }
      }
    }
    saveVehicleSettings(vehicleKey, next)
    setVehicleSettings((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...next } }))
  }
  const [inspectionDoneChecked, setInspectionDoneChecked] = useState({})
  /** 從本頁移除該車：隱藏車牌列＋清除保養／驗車設定（不刪行事曆排程） */
  const handleRemoveVehicleFromPage = (vehicleKey) => {
    const key = String(vehicleKey || '').trim()
    if (!key || !canEditVehicleSettings) return
    if (
      !window.confirm(
        `確定將「${key}」從車輛資訊移除？\n\n` +
          '• 此車將不再顯示於本頁（含里程與加油統計）。\n' +
          '• 行事曆中的工程排程不會被刪除。\n' +
          '• 此車的保養／驗車設定會一併清除。\n\n' +
          '日後可於下方「已隱藏的車牌」恢復顯示。'
      )
    ) {
      return
    }
    const h = hideVehicleFromVehicleInfoPage(key)
    if (!h.success) {
      alert(h.message || '隱藏失敗')
      return
    }
    deleteVehicleSettings(key)
    setVehicleSettings((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setInspectionDoneChecked((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setExpandedVehicles((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    loadHiddenPlates()
    loadVehicleData()
  }

  const applyInspectionDone = (vehicleKey) => {
    const key = String(vehicleKey || '').trim()
    if (!key) return
    const s = vehicleSettings[key] || {}
    const intervalMonths = parseInt(s.inspectionIntervalMonths, 10) || 0
    const today = new Date().toISOString().slice(0, 10)
    const d = new Date(today + 'T00:00:00')
    d.setMonth(d.getMonth() + intervalMonths)
    d.setDate(d.getDate() + 1)
    const nextDate = d.toISOString().slice(0, 10)
    saveVehicleSettings(vehicleKey, { lastInspectionDate: today, nextInspectionDate: nextDate })
    setVehicleSettings((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), lastInspectionDate: today, nextInspectionDate: nextDate } }))
  }
  const toggleVehicle = (vehicleKey) => {
    setExpandedVehicles((prev) => ({ ...prev, [vehicleKey]: !prev[vehicleKey] }))
  }
  const toggleActivity = (vehicleIndex, activityName) => {
    const key = `${vehicleIndex}-${activityName}`
    setExpandedActivities((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const loadVehicleData = () => {
    const schedules = getSchedules()
    const vehicleSummary = {}
    const dayByVehicle = {}

    const ensureVehicle = (vehicleKey) => {
      const key = String(vehicleKey || '').trim()
      if (!key || isSelfTravelVehicle(key)) return null
      if (!vehicleSummary[key]) {
        vehicleSummary[key] = {
          vehicle: key,
          activities: {},
          monthlyFuelCosts: {},
          lastReturnDate: null,
          lastReturnMileage: null
        }
      }
      return key
    }

    /** 每案場每台車一筆：活動名 + 該段里程，供後續依案場分別累加出車次數與里程 */
    const processOneVehicle = (vehicleKey, ymd, activity, departure, returnMile, needRefuel, fuelCost) => {
      const key = ensureVehicle(vehicleKey)
      if (!key) return
      if (!dayByVehicle[key]) dayByVehicle[key] = {}
      if (!dayByVehicle[key][ymd]) dayByVehicle[key][ymd] = { activityDeltas: [] }
      const delta = returnMile > departure ? (returnMile - departure) : 0
      if (activity) dayByVehicle[key][ymd].activityDeltas.push({ activity, delta })
      // 記錄該車最後一次回程公里數（取日期最新的一筆，方便下次出發填寫）
      if (ymd && (returnMile != null && returnMile !== '')) {
        const ret = parseFloat(returnMile) || 0
        const cur = vehicleSummary[key].lastReturnDate
        if (!cur || ymd >= cur) {
          vehicleSummary[key].lastReturnDate = ymd
          vehicleSummary[key].lastReturnMileage = ret
        }
      }
      if (needRefuel && fuelCost != null && fuelCost !== '') {
        const date = new Date(`${ymd}T00:00:00`)
        if (!Number.isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (!vehicleSummary[key].monthlyFuelCosts[monthKey]) {
            vehicleSummary[key].monthlyFuelCosts[monthKey] = {
              month: monthKey,
              totalCost: 0,
              tripCount: 0,
              _dayToFuelCost: {}
            }
          }
          const bucket = vehicleSummary[key].monthlyFuelCosts[monthKey]
          const cost = parseFloat(fuelCost) || 0
          const prev = bucket._dayToFuelCost[ymd]
          if (prev == null) {
            bucket._dayToFuelCost[ymd] = cost
            bucket.totalCost += cost
            bucket.tripCount += 1
          } else if (cost > prev) {
            bucket._dayToFuelCost[ymd] = cost
            bucket.totalCost += (cost - prev)
          }
        }
      }
    }

    schedules.forEach((schedule) => {
      const ymd = String(schedule.date || '').slice(0, 10)
      if (!ymd) return

      const segments = getScheduleSegments(schedule)
      segments.forEach((seg) => {
        const activity = seg.siteName || ''
        const entries = Array.isArray(seg.vehicleEntries) && seg.vehicleEntries.length > 0
          ? seg.vehicleEntries
          : (() => {
              const vehicleStr = String(schedule.vehicle || '').trim()
              if (!vehicleStr) return []
              const dep = parseFloat(schedule.departureMileage) || 0
              const ret = parseFloat(schedule.returnMileage) || 0
              return vehicleStr.split(',').map((v) => String(v).trim()).filter(Boolean).map((vehicle) => ({
                vehicle,
                departureMileage: dep,
                returnMileage: ret,
                needRefuel: schedule.needRefuel,
                fuelCost: schedule.fuelCost
              }))
            })()
        entries.forEach((entry) => {
          const vehicleKey = String(entry?.vehicle || '').trim()
          if (!vehicleKey) return
          const dep = parseFloat(entry.departureMileage) || 0
          const ret = parseFloat(entry.returnMileage) || 0
          processOneVehicle(vehicleKey, ymd, activity, dep, ret, !!entry.needRefuel, entry.fuelCost)
        })
      })
    })

    // 依案場分別累加：每個案場各自出車次數 + 該案場里程（不再合併為一筆、不再平均）
    Object.keys(dayByVehicle).forEach((vehicle) => {
      const days = dayByVehicle[vehicle]
      Object.keys(days).forEach((ymd) => {
        const d = days[ymd]
        const list = d.activityDeltas || []
        list.forEach(({ activity, delta }) => {
          if (!activity) return
          if (!vehicleSummary[vehicle].activities[activity]) {
            vehicleSummary[vehicle].activities[activity] = {
              activity,
              totalMileage: 0,
              tripCount: 0,
              trips: []
            }
          }
          const act = vehicleSummary[vehicle].activities[activity]
          act.totalMileage += delta
          act.tripCount += 1
          act.trips.push({ ymd, delta })
        })
      })
    })

    Object.values(vehicleSummary).forEach((v) => {
      Object.values(v.monthlyFuelCosts || {}).forEach((m) => {
        if (m && m._dayToFuelCost) delete m._dayToFuelCost
      })
    })

    const hiddenSet = new Set(getVehicleHiddenPlatesList())
    Object.keys(vehicleSummary).forEach((k) => {
      if (hiddenSet.has(k)) delete vehicleSummary[k]
    })

    setVehicleData(vehicleSummary)
  }

  useRealtimeKeys(
    ['jiameng_engineering_schedules', 'jiameng_vehicle_settings', 'jiameng_vehicle_settings_editors', 'jiameng_vehicle_info_hidden'],
    () => {
      loadVehicleData()
      loadVehicleSettings()
      loadEditors()
      loadHiddenPlates()
    }
  )

  useEffect(() => {
    loadVehicleData()
  }, [])

  // 進入頁面時從雲端拉取最新車輛設定，讓所有用戶（含手機）都能看到管理員輸入的資訊
  useEffect(() => {
    let cancelled = false
    const pull = async () => {
      await refreshAppDataKeyFromSupabase('jiameng_vehicle_settings')
      if (cancelled) return
      await refreshAppDataKeyFromSupabase('jiameng_vehicle_settings_editors')
      if (cancelled) return
      await refreshAppDataKeyFromSupabase('jiameng_vehicle_info_hidden')
      if (cancelled) return
      loadVehicleSettings()
      loadEditors()
      loadHiddenPlates()
      loadVehicleData()
    }
    pull()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadVehicleSettings()
    loadEditors()
  }, [vehicleData])

  const formatMonth = (monthKey) => {
    const [year, month] = monthKey.split('-')
    return `${year}年${parseInt(month)}月`
  }

  const vehicles = Object.values(vehicleData)

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">車輛資訊</h2>

      {isAdmin && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <h3 className="text-white font-semibold mb-2">指定可編輯／勾選用戶</h3>
          <p className="text-gray-400 text-sm mb-3">僅以下帳號可編輯保養與驗車、勾選「本次已經驗車」；未指定時僅管理員可編輯。此設定同步給所有用戶。</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {(allowedAccounts || []).map((acc) => (
              <span key={acc} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-700 text-amber-200 text-sm">
                {acc}
                <button
                  type="button"
                  onClick={() => {
                    const next = (allowedAccounts || []).filter((a) => a !== acc)
                    saveVehicleSettingsEditors({ allowedAccounts: next })
                    loadEditors()
                  }}
                  className="text-gray-400 hover:text-red-400"
                  aria-label="移除"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newEditorAccount}
              onChange={(e) => setNewEditorAccount(e.target.value)}
              placeholder="輸入帳號後按新增"
              className="flex-1 max-w-xs bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const v = newEditorAccount.trim()
                if (!v || (allowedAccounts || []).includes(v)) return
                saveVehicleSettingsEditors({ allowedAccounts: [...(allowedAccounts || []), v] })
                loadEditors()
                setNewEditorAccount('')
              }}
            />
            <button
              type="button"
              onClick={() => {
                const v = newEditorAccount.trim()
                if (!v || (allowedAccounts || []).includes(v)) return
                saveVehicleSettingsEditors({ allowedAccounts: [...(allowedAccounts || []), v] })
                loadEditors()
                setNewEditorAccount('')
              }}
              className="px-3 py-2 rounded bg-amber-600 text-black text-sm font-medium hover:bg-amber-500"
            >
              新增
            </button>
          </div>
        </div>
      )}

      {!canEditVehicleSettings && (
        <p className="text-gray-400 text-sm mb-4">目前僅供檢視；僅管理員或已指定之用戶可編輯保養／驗車與勾選。</p>
      )}

      {canEditVehicleSettings && hiddenPlatesList.length > 0 && (
        <div className="mb-6 p-4 bg-gray-900/80 rounded-lg border border-amber-900/40">
          <h3 className="text-amber-200 font-semibold mb-2 text-sm">已從本頁隱藏的車牌</h3>
          <p className="text-gray-500 text-xs mb-3">
            下列車牌仍可能出現在行事曆排程；恢復後會重新顯示於車輛資訊列表。
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenPlatesList.map((plate) => (
              <span
                key={plate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-800 border border-gray-600 text-sm text-gray-200"
              >
                <span className="font-mono">{plate}</span>
                <button
                  type="button"
                  onClick={() => {
                    const r = unhideVehicleFromVehicleInfoPage(plate)
                    if (!r.success) {
                      alert(r.message || '恢復失敗')
                      return
                    }
                    loadHiddenPlates()
                    loadVehicleData()
                  }}
                  className="text-amber-400 hover:text-amber-300 text-xs font-medium underline-offset-2 hover:underline"
                >
                  恢復顯示
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="text-gray-400 text-center py-12">
          <p>目前尚無車輛資訊</p>
          <p className="text-sm mt-2">請在行事曆中新增工程排程並填寫車輛資訊</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((vehicle, index) => {
            const isVehicleExpanded = expandedVehicles[vehicle.vehicle]
            return (
            <div key={index} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => toggleVehicle(vehicle.vehicle)}
                className="flex-1 min-w-0 flex items-center justify-between py-4 px-5 text-left hover:bg-gray-700/50 transition-colors flex-wrap gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg
                    className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isVehicleExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <svg className="w-6 h-6 shrink-0 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xl font-semibold text-yellow-400 truncate">{vehicle.vehicle}</span>
                </div>
                {(() => {
                  const s = vehicleSettings[String(vehicle.vehicle).trim()] || {}
                  const hasMain = s.nextMaintenanceMileage != null && String(s.nextMaintenanceMileage).trim() !== ''
                  const hasInsp = s.nextInspectionDate != null && String(s.nextInspectionDate).trim() !== ''
                  if (!hasMain && !hasInsp) return null
                  return (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-4 text-sm text-gray-300">
                      {hasMain && <span>下次保養：<span className="text-amber-300 font-medium">{Number(s.nextMaintenanceMileage).toLocaleString()} km</span></span>}
                      {hasInsp && <span>下次驗車：<span className="text-amber-300 font-medium">{String(s.nextInspectionDate)}</span></span>}
                    </div>
                  )
                })()}
              </button>
              {canEditVehicleSettings && (
                <div className="shrink-0 flex items-center pr-3 sm:pr-4 border-l border-gray-700/80">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveVehicleFromPage(vehicle.vehicle) }}
                    className="p-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/40 active:bg-red-950/60 touch-manipulation"
                    title="從車輛資訊移除（不刪行事曆排程）"
                    aria-label="從車輛資訊移除該車"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
              </div>
              {isVehicleExpanded && (
              <div className="px-5 pb-5 pt-0 border-t border-gray-700">
                {(vehicle.lastReturnMileage != null && !Number.isNaN(Number(vehicle.lastReturnMileage))) && (
                  <div className="flex justify-end mb-4">
                    <div className="text-sm text-gray-300 bg-gray-700/80 px-3 py-1.5 rounded-lg border border-gray-600">
                      <span className="text-gray-400">最後回程公里數：</span>
                      <span className="text-amber-300 font-semibold ml-1">
                        {Number(vehicle.lastReturnMileage).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
                      </span>
                      <span className="text-gray-500 text-xs ml-2">（下次出發可填此值）</span>
                    </div>
                  </div>
                )}

                {/* 上次／下次保養與驗車、間隔設定；輸入上次＋區間後自動帶入下次 */}
                <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <h4 className="text-base font-semibold text-white mb-3">保養與驗車</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">上次保養里程 (km)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        readOnly={!canEditVehicleSettings}
                        value={vehicleSettings[String(vehicle.vehicle).trim()]?.lastMaintenanceMileage ?? ''}
                        onChange={(e) => canEditVehicleSettings && updateVehicleSetting(vehicle.vehicle, 'lastMaintenanceMileage', e.target.value)}
                        placeholder="請輸入"
                        className={`w-full border border-gray-600 rounded px-3 py-2 text-sm ${canEditVehicleSettings ? 'bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500' : 'bg-gray-800 text-amber-200 cursor-default'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">下次保養里程 (km)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        readOnly={!canEditVehicleSettings}
                        value={vehicleSettings[String(vehicle.vehicle).trim()]?.nextMaintenanceMileage ?? ''}
                        onChange={(e) => canEditVehicleSettings && updateVehicleSetting(vehicle.vehicle, 'nextMaintenanceMileage', e.target.value)}
                        placeholder="請輸入"
                        className={`w-full border border-gray-600 rounded px-3 py-2 text-sm ${canEditVehicleSettings ? 'bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500' : 'bg-gray-800 text-amber-200 cursor-default'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">上次驗車日期</label>
                      <input
                        type="date"
                        readOnly={!canEditVehicleSettings}
                        value={vehicleSettings[String(vehicle.vehicle).trim()]?.lastInspectionDate ?? ''}
                        onChange={(e) => canEditVehicleSettings && updateVehicleSettingWithAutoNext(vehicle.vehicle, 'lastInspectionDate', e.target.value)}
                        className={`w-full border border-gray-600 rounded px-3 py-2 text-sm ${canEditVehicleSettings ? 'bg-gray-700 text-white focus:outline-none focus:border-amber-500' : 'bg-gray-800 text-amber-200 cursor-default'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">下次驗車日期 <span className="text-gray-500 font-normal">（依上次＋驗車間隔自動帶入）</span></label>
                      <input
                        type="date"
                        readOnly
                        value={vehicleSettings[String(vehicle.vehicle).trim()]?.nextInspectionDate ?? ''}
                        placeholder="請填寫上次驗車日期與驗車間隔"
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-amber-200 cursor-default text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">驗車間隔 (月＋1天) — 輸入月數後依上次驗車＋此月數＋1天自動帶入下次驗車</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        readOnly={!canEditVehicleSettings}
                        value={vehicleSettings[String(vehicle.vehicle).trim()]?.inspectionIntervalMonths ?? ''}
                        onChange={(e) => canEditVehicleSettings && updateVehicleSettingWithAutoNext(vehicle.vehicle, 'inspectionIntervalMonths', e.target.value)}
                        placeholder="例：6"
                        className={`w-full border border-gray-600 rounded px-3 py-2 text-sm ${canEditVehicleSettings ? 'bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500' : 'bg-gray-800 text-amber-200 cursor-default'}`}
                      />
                    </div>
                  </div>
                  {canEditVehicleSettings && (
                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!inspectionDoneChecked[String(vehicle.vehicle).trim()]}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setInspectionDoneChecked((prev) => ({ ...prev, [String(vehicle.vehicle).trim()]: checked }))
                            if (checked) applyInspectionDone(vehicle.vehicle)
                          }}
                          className="w-4 h-4 rounded border-gray-500 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-white text-sm font-medium">本次已經驗車</span>
                      </label>
                      <span className="text-gray-500 text-xs">勾選後以今日為上次驗車，並依驗車間隔（月＋1天）自動帶入下次驗車日期</span>
                    </div>
                  </div>
                  )}
                </div>

              {/* 按活动统计里程 */}
              {Object.keys(vehicle.activities).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    活動里程統計
                  </h4>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="space-y-1">
                      {Object.values(vehicle.activities).map((activity, actIndex) => {
                        const expKey = `${index}-${activity.activity}`
                        const isExpanded = expandedActivities[expKey]
                        const trips = Array.isArray(activity.trips) ? activity.trips : []
                        const sortedTrips = [...trips].sort((a, b) => (a.ymd || '').localeCompare(b.ymd || ''))
                        return (
                          <div key={actIndex} className="border border-gray-700 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleActivity(index, activity.activity)}
                              className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-gray-800/80 transition-colors"
                            >
                              <div className="flex-1 flex items-center gap-2">
                                <svg
                                  className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <div>
                                  <div className="text-white font-medium">{activity.activity}</div>
                                  <div className="text-gray-400 text-sm">
                                    出車次數: {activity.tripCount} 次
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-yellow-400 font-semibold text-lg">
                                  {`${Number(activity.totalMileage || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`}
                                </div>
                              </div>
                            </button>
                            {isExpanded && sortedTrips.length > 0 && (
                              <div className="border-t border-gray-700 bg-gray-800/60 px-4 py-3">
                                <div className="text-gray-400 text-xs font-medium mb-2">各次出車里程</div>
                                <ul className="space-y-1.5">
                                  {sortedTrips.map((trip, i) => {
                                    const [y, m, d] = (trip.ymd || '').split('-')
                                    const dateStr = y && m && d ? `${y}/${m}/${d}` : trip.ymd || '—'
                                    return (
                                      <li key={i} className="flex justify-between text-sm">
                                        <span className="text-gray-300">{dateStr}</span>
                                        <span className="text-amber-300/90">{Number(trip.delta || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} km</span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 按月统计加油金额 */}
              {Object.keys(vehicle.monthlyFuelCosts).length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    每月加油總金額
                  </h4>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="space-y-3">
                      {Object.values(vehicle.monthlyFuelCosts)
                        .sort((a, b) => b.month.localeCompare(a.month))
                        .map((monthData, monthIndex) => (
                        <div key={monthIndex} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-b-0">
                          <div className="flex-1">
                            <div className="text-white font-medium">{formatMonth(monthData.month)}</div>
                            <div className="text-gray-400 text-sm">加油次數: {monthData.tripCount} 次</div>
                          </div>
                          <div className="text-right">
                            <div className="text-green-400 font-semibold text-lg">
                              NT$ {monthData.totalCost.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 如果没有活动或加油记录 */}
              {Object.keys(vehicle.activities).length === 0 && Object.keys(vehicle.monthlyFuelCosts).length === 0 && (
                <div className="text-gray-400 text-center py-4">
                  <p>此車輛尚無活動或加油記錄</p>
                </div>
              )}
              </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default VehicleInfo
