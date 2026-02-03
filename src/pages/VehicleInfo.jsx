import { useState, useEffect } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

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
          hasRefueled: false
        }
      }
      return key
    }

    const processOneVehicle = (vehicleKey, ymd, activity, departure, returnMile, needRefuel, fuelCost) => {
      const key = ensureVehicle(vehicleKey)
      if (!key) return
      if (!dayByVehicle[key]) dayByVehicle[key] = {}
      if (!dayByVehicle[key][ymd]) dayByVehicle[key][ymd] = { mileage: 0, activities: new Set() }
      if (activity) dayByVehicle[key][ymd].activities.add(activity)
      const delta = returnMile > departure ? (returnMile - departure) : 0
      if (delta > dayByVehicle[key][ymd].mileage) dayByVehicle[key][ymd].mileage = delta
      if (needRefuel && fuelCost != null && fuelCost !== '') {
        vehicleSummary[key].hasRefueled = true
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

    schedules.forEach(schedule => {
      const ymd = String(schedule.date || '').slice(0, 10)
      if (!ymd) return
      const activity = String(schedule.siteName || '').trim()

      if (Array.isArray(schedule.vehicleEntries) && schedule.vehicleEntries.length > 0) {
        schedule.vehicleEntries.forEach((entry) => {
          const vehicleKey = String(entry?.vehicle || '').trim()
          if (!vehicleKey) return
          const dep = parseFloat(entry.departureMileage) || 0
          const ret = parseFloat(entry.returnMileage) || 0
          processOneVehicle(vehicleKey, ymd, activity, dep, ret, !!entry.needRefuel, entry.fuelCost)
        })
      } else {
        const vehicle = String(schedule.vehicle || '').trim()
        if (!vehicle) return
        const dep = parseFloat(schedule.departureMileage) || 0
        const ret = parseFloat(schedule.returnMileage) || 0
        processOneVehicle(vehicle, ymd, activity, dep, ret, !!schedule.needRefuel, schedule.fuelCost)
      }
    })

    // 依 vehicle/day 產生活動統計：里程平均分攤到當天所有活動
    Object.keys(dayByVehicle).forEach((vehicle) => {
      const days = dayByVehicle[vehicle]
      Object.keys(days).forEach((ymd) => {
        const d = days[ymd]
        const activities = Array.from(d.activities || [])

        if (!(d.mileage > 0) || activities.length === 0) return

        const share = d.mileage / activities.length
        activities.forEach((activity) => {
          if (!vehicleSummary[vehicle].activities[activity]) {
            vehicleSummary[vehicle].activities[activity] = {
              activity,
              totalMileage: 0,
              tripCount: 0
            }
          }
          vehicleSummary[vehicle].activities[activity].totalMileage += share
          // 出車次數：以「同車同日曾到此案場」計 1 次
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
              {/* 車輛標題：有加油時亮綠燈 */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
                <h3 className="text-xl font-semibold text-yellow-400 flex items-center gap-2">
                  <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {vehicle.vehicle}
                  {vehicle.hasRefueled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-400/50" title="有加油記錄">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                      <span className="text-green-400 text-xs font-normal">已加油</span>
                    </span>
                  )}
                </h3>
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
