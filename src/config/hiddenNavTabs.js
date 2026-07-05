/**
 * 暫時隱藏的導覽項目（頁面與路由仍保留，改 false 即可恢復顯示）。
 *
 * 恢復方式：把對應項目改為 false，或刪除該行。
 * 直接輸入網址仍可進入（例：/vehicle-info、/developing、/personal-performance）。
 */
export const HIDDEN_NAV = {
  vehicle: true, // 車輛資訊 → /vehicle-info
  developing: true, // 開發中 → /developing
  performance: true // 個人績效 → /personal-performance（個人服務選單內）
}

export function isNavHidden(tab) {
  return !!HIDDEN_NAV[tab]
}
