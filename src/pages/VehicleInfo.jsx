import { useState, useEffect } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

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

  const loadVehicleData = () => {
    const schedules = getSchedules()
    const vehicleSummary = {}
    const dayByVehicle = {}

    const ensureVehicle = (vehicleKey) => {
      const key = String(vehicleKey || '').trim()
      if (!key) return null
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
              tripCount: 0
            }
          }
          vehicleSummary[vehicle].activities[activity].totalMileage += delta
          vehicleSummary[vehicle].activities[activity].tripCount += 1
        })
      })
    })

    Object.values(vehicleSummary).forEach((v) => {
      Object.values(v.monthlyFuelCosts || {}).forEach((m) => {
        if (m && m._dayToFuelCost) delete m._dayToFuelCost
      })
    })
    
    setVehicleData(vehicleSummary)
  }

  useRealtimeKeys(['jiameng_engineering_schedules'], loadVehicleData)

  useEffect(() => {
    loadVehicleData()
  }, [])

  const formatMonth = (monthKey) => {
    const [year, month] = monthKey.split('-')
    return `${year}年${parseInt(month)}月`
  }

  const vehicles = Object.values(vehicleData)

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">車輛資訊</h2>
      
      {vehicles.length === 0 ? (
        <div className="text-gray-400 text-center py-12">
          <p>目前尚無車輛資訊</p>
          <p className="text-sm mt-2">請在行事曆中新增工程排程並填寫車輛資訊</p>
        </div>
      ) : (
        <div className="space-y-6">
          {vehicles.map((vehicle, index) => (
            <div key={index} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              {/* 車輛標題：車牌 + 最後回程公里數（下次出發可填此值） */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700 flex-wrap gap-2">
                <h3 className="text-xl font-semibold text-yellow-400 flex items-center gap-2">
                  <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {vehicle.vehicle}
                </h3>
                {(vehicle.lastReturnMileage != null && !Number.isNaN(Number(vehicle.lastReturnMileage))) && (
                  <div className="text-sm text-gray-300 bg-gray-700/80 px-3 py-1.5 rounded-lg border border-gray-600">
                    <span className="text-gray-400">最後回程公里數：</span>
                    <span className="text-amber-300 font-semibold ml-1">
                      {Number(vehicle.lastReturnMileage).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
                    </span>
                    <span className="text-gray-500 text-xs ml-2">（下次出發可填此值）</span>
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
                    <div className="space-y-3">
                      {Object.values(vehicle.activities).map((activity, actIndex) => (
                        <div key={actIndex} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-b-0">
                          <div className="flex-1">
                            <div className="text-white font-medium">{activity.activity}</div>
                            <div className="text-gray-400 text-sm">
                              出車次數: {activity.tripCount} 次
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-yellow-400 font-semibold text-lg">
                              {`${Number(activity.totalMileage || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`}
                            </div>
                          </div>
                        </div>
                      ))}
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
          ))}
        </div>
      )}
    </div>
  )
}

export default VehicleInfo
