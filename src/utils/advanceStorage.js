// 預支申請：僅重新匯出，實際邏輯在 storage.js（避免部署時模組路徑解析失敗）
export {
  getAllAdvances,
  getAdvancesByAccount,
  getPendingAdvances,
  addAdvance,
  rejectAdvance,
  markTransferred,
  getTotalTransferredByAccount,
  getPendingCountByAccount,
  getTransferredCountByAccount,
  getMonthlyTransferredByAccount
} from './storage'
