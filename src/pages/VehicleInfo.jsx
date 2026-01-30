import { useState, useEffect } from 'react'
import { getSchedules } from '../utils/scheduleStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function VehicleInfo() {
  const [vehicleData, setVehicleData] = useState({})

  const loadVehicleData = () => {
    const schedules = getSchedules()
    
    // 按车辆分组汇总数据
    const vehicleSummary = {}
    
    schedules.forEach(schedule => {
      if (!schedule.vehicle) return
      
      const vehicle = schedule.vehicle
      if (!vehicleSummary[vehicle]) {
        vehicleSummary[vehicle] = {
          vehicle: vehicle,
          activities: {}, // 按活动分组的里程统计
          monthlyFuelCosts: {} // 按月分组的加油金额
        }
      }
      
      // 按活动统计里程
      if (schedule.siteName) {
        const activity = schedule.siteName
        if (!vehicleSummary[vehicle].activities[activity]) {
          vehicleSummary[vehicle].activities[activity] = {
            activity: activity,
            totalMileage: 0,
            tripCount: 0
          }
        }
        
        // 计算里程（回程里程 - 出发里程）
        const departure = parseFloat(schedule.departureMileage) || 0
        const returnMile = parseFloat(schedule.returnMileage) || 0
        if (returnMile > departure) {
          vehicleSummary[vehicle].activities[activity].totalMileage += (returnMile - departure)
          vehicleSummary[vehicle].activities[activity].tripCount += 1
        }
      }
      
      // 按月统计加油金额
      if (schedule.needRefuel && schedule.fuelCost) {
        const ymd = String(schedule.date || '').slice(0, 10) // YYYY-MM-DD
        const date = ymd ? new Date(`${ymd}T00:00:00`) : new Date('invalid')
        if (Number.isNaN(date.getTime())) return
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        
        if (!vehicleSummary[vehicle].monthlyFuelCosts[monthKey]) {
          vehicleSummary[vehicle].monthlyFuelCosts[monthKey] = {
            month: monthKey,
            totalCost: 0,
            tripCount: 0,
            // 同一台車同一天可能跑兩個案場：加油通常只會發生一次，避免重複計入
            _dayToFuelCost: {}
          }
        }
        
        const fuelCost = parseFloat(schedule.fuelCost) || 0
        const bucket = vehicleSummary[vehicle].monthlyFuelCosts[monthKey]
        const prev = bucket._dayToFuelCost[ymd]
        if (prev == null) {
          bucket._dayToFuelCost[ymd] = fuelCost
          bucket.totalCost += fuelCost
          bucket.tripCount += 1
        } else if (fuelCost > prev) {
          // 若同一天被填了不同金額，以較大者為準（用差額修正）
          bucket._dayToFuelCost[ymd] = fuelCost
          bucket.totalCost += (fuelCost - prev)
        }
      }
    })

    // 清掉內部欄位，避免存進 state 後影響 UI/序列化
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
              {/* 车辆标题 */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
                <h3 className="text-xl font-semibold text-yellow-400 flex items-center">
                  <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {vehicle.vehicle}
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
                            <div className="text-gray-400 text-sm">出車次數: {activity.tripCount} 次</div>
                          </div>
                          <div className="text-right">
                            <div className="text-yellow-400 font-semibold text-lg">
                              {activity.totalMileage.toLocaleString()} km
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
