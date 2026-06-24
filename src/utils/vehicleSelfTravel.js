/** 行事曆車輛勾選：代表不搭乘公司車，無須填寫出發／回程里程 */
export const SELF_TRAVEL_VEHICLE_LABEL = '自行前往'

export const isSelfTravelVehicle = (v) =>
  String(v ?? '').trim() === SELF_TRAVEL_VEHICLE_LABEL
