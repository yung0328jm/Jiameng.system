import { syncKeyToSupabase } from './supabaseSync'
import { REALTIME_UPDATE_EVENT } from './supabaseRealtime'
import { getDropdownOptionsByCategory } from './dropdownStorage'
import { getProjects } from './projectStorage'

export const FOOD_ORDER_MERCHANTS_KEY = 'jiameng_food_order_merchants'
export const FOOD_ORDER_RECORDS_KEY = 'jiameng_food_order_records'
export const FOOD_ORDER_SITE_SESSION_KEY = 'jiameng_food_order_selected_site'

const normalizeSiteNames = (siteNames) => {
  const seen = new Set()
  const out = []
  ;(Array.isArray(siteNames) ? siteNames : []).forEach((s) => {
    const t = String(s || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  })
  return out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

/** 點餐系統可選案場（入廠申請常用清單 + 專案） */
export const getFoodSiteOptions = () => {
  const seen = new Set()
  const sites = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    sites.push(t)
  }
  ;(getDropdownOptionsByCategory('work_report_sites') || []).forEach((o) => add(o?.value))
  ;(getProjects() || []).forEach((p) => add(p?.name || p?.siteName))
  return sites.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

export const merchantAppliesToSite = (merchant, siteName) => {
  const site = String(siteName || '').trim()
  if (!site) return true
  const sites = normalizeSiteNames(merchant?.siteNames)
  return sites.length > 0 && sites.includes(site)
}

const notifyChanged = (key = FOOD_ORDER_MERCHANTS_KEY) => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REALTIME_UPDATE_EVENT, { detail: { key } }))
    }
  } catch (_) {}
}

const persistMerchants = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(FOOD_ORDER_MERCHANTS_KEY, val)
  syncKeyToSupabase(FOOD_ORDER_MERCHANTS_KEY, val).catch(() => {})
  notifyChanged(FOOD_ORDER_MERCHANTS_KEY)
}

const readAllFoodOrders = () => {
  try {
    const raw = localStorage.getItem(FOOD_ORDER_RECORDS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

const persistOrders = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(FOOD_ORDER_RECORDS_KEY, val)
  syncKeyToSupabase(FOOD_ORDER_RECORDS_KEY, val).catch(() => {})
  notifyChanged(FOOD_ORDER_RECORDS_KEY)
}

const orderKey = (date, siteName, companyId, personId) =>
  `${String(date || '').slice(0, 10)}|${String(siteName || '').trim()}|${String(companyId || '').trim()}|${String(personId || '').trim()}`

export const getFoodOrders = () => readAllFoodOrders().filter((r) => !r?.deleted)

export const getFoodOrdersForDate = (date, { siteName, companyId } = {}) => {
  const d = String(date || '').slice(0, 10)
  return getFoodOrders().filter((r) => {
    if (String(r?.date || '').slice(0, 10) !== d) return false
    if (siteName && String(r?.siteName || '').trim() !== String(siteName).trim()) return false
    if (companyId && String(r?.companyId || '').trim() !== String(companyId).trim()) return false
    return true
  })
}

export const findFoodOrder = ({ date, siteName, companyId, personId }) => {
  const key = orderKey(date, siteName, companyId, personId)
  return getFoodOrders().find((r) => orderKey(r.date, r.siteName, r.companyId, r.personId) === key) || null
}

/** 承攬商當日訂餐（每人一案場一筆，可更新） */
export const upsertFoodOrder = ({
  date,
  siteName,
  companyId,
  companyName,
  personId,
  personName,
  merchantId,
  merchantName,
  menuItemId,
  menuItemName,
  unitPrice,
  quantity
}) => {
  try {
    const d = String(date || '').slice(0, 10)
    const site = String(siteName || '').trim()
    const cid = String(companyId || '').trim()
    const pid = String(personId || '').trim()
    const qty = Math.max(1, Math.floor(Number(quantity) || 1))
    const price = Math.max(0, Number(unitPrice) || 0)
    if (!d || !site || !cid || !pid) return { success: false, message: '資料不完整' }
    if (!merchantId || !menuItemId) return { success: false, message: '請選擇餐點' }
    const list = readAllFoodOrders()
    const key = orderKey(d, site, cid, pid)
    const idx = list.findIndex((r) => orderKey(r.date, r.siteName, r.companyId, r.personId) === key)
    const now = new Date().toISOString()
    const rec = {
      id: idx >= 0 ? list[idx].id : `for-${Date.now()}`,
      date: d,
      siteName: site,
      companyId: cid,
      companyName: String(companyName || '').trim(),
      personId: pid,
      personName: String(personName || '').trim(),
      merchantId: String(merchantId || '').trim(),
      merchantName: String(merchantName || '').trim(),
      menuItemId: String(menuItemId || '').trim(),
      menuItemName: String(menuItemName || '').trim(),
      unitPrice: price,
      quantity: qty,
      totalAmount: price * qty,
      isCharged: idx >= 0 ? !!list[idx]?.isCharged : false,
      deleted: false,
      createdAt: idx >= 0 ? (list[idx].createdAt || now) : now,
      updatedAt: now
    }
    if (idx >= 0) list[idx] = rec
    else list.push(rec)
    persistOrders(list)
    return { success: true, record: rec }
  } catch (e) {
    console.error('upsertFoodOrder:', e)
    return { success: false, message: '訂餐失敗' }
  }
}

export const clearFoodOrder = ({ date, siteName, companyId, personId }) => {
  try {
    const key = orderKey(date, siteName, companyId, personId)
    const list = readAllFoodOrders()
    const idx = list.findIndex((r) => orderKey(r.date, r.siteName, r.companyId, r.personId) === key)
    if (idx < 0) return { success: true }
    const now = new Date().toISOString()
    list[idx] = { ...list[idx], deleted: true, updatedAt: now }
    persistOrders(list)
    return { success: true }
  } catch (e) {
    console.error('clearFoodOrder:', e)
    return { success: false, message: '取消訂餐失敗' }
  }
}

export const setFoodOrderCharged = (id, isCharged) => {
  try {
    const rid = String(id || '').trim()
    if (!rid) return { success: false, message: '紀錄不存在' }
    const list = readAllFoodOrders()
    const idx = list.findIndex((r) => String(r?.id || '').trim() === rid)
    if (idx < 0 || list[idx]?.deleted) return { success: false, message: '找不到訂餐紀錄' }
    list[idx] = { ...list[idx], isCharged: !!isCharged, updatedAt: new Date().toISOString() }
    persistOrders(list)
    return { success: true, record: list[idx] }
  } catch (e) {
    console.error('setFoodOrderCharged:', e)
    return { success: false, message: '更新失敗' }
  }
}

export const getFoodOrderDailyStats = (date, siteName) => {
  const orders = getFoodOrdersForDate(date, { siteName: siteName || undefined })
    .sort((a, b) => {
      const c = String(a?.companyName || '').localeCompare(String(b?.companyName || ''), 'zh-Hant')
      if (c !== 0) return c
      return String(a?.personName || '').localeCompare(String(b?.personName || ''), 'zh-Hant')
    })
  let totalAmount = 0
  let totalQuantity = 0
  let chargedAmount = 0
  orders.forEach((o) => {
    totalAmount += Number(o?.totalAmount) || 0
    totalQuantity += Number(o?.quantity) || 0
    if (o?.isCharged) chargedAmount += Number(o?.totalAmount) || 0
  })
  return {
    orders,
    totalAmount,
    totalQuantity,
    chargedAmount,
    unchargedAmount: totalAmount - chargedAmount,
    orderCount: orders.length
  }
}

const persist = (list) => {
  persistMerchants(list)
}

const normalizeMenuItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    id: String(item?.id || '').trim() || `food-item-${Date.now()}`,
    name: String(item?.name || '').trim(),
    price: Math.max(0, Number(item?.price) || 0),
    description: String(item?.description || '').trim(),
    enabled: item?.enabled !== false
  }))

export const getFoodMerchants = () => {
  try {
    const raw = localStorage.getItem(FOOD_ORDER_MERCHANTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    return list.map((m) => ({
      ...m,
      name: String(m?.name || '').trim(),
      description: String(m?.description || '').trim(),
      enabled: m?.enabled !== false,
      siteNames: normalizeSiteNames(m?.siteNames),
      menuItems: normalizeMenuItems(m?.menuItems)
    }))
  } catch (_) {
    return []
  }
}

export const getFoodMerchantById = (id) => {
  const mid = String(id || '').trim()
  if (!mid) return null
  return getFoodMerchants().find((m) => String(m?.id || '').trim() === mid) || null
}

/** 前台點餐用：依案場篩選啟用中的商家與品項 */
export const getEnabledFoodMerchants = (siteName) => {
  const site = String(siteName || '').trim()
  return getFoodMerchants()
    .filter((m) => m.enabled !== false && (!site || merchantAppliesToSite(m, site)))
    .map((m) => ({
      ...m,
      menuItems: (m.menuItems || []).filter((item) => item.enabled !== false)
    }))
    .filter((m) => (m.menuItems || []).length > 0)
}

export const getFoodMerchantsForSite = (siteName) => {
  const site = String(siteName || '').trim()
  if (!site) return getFoodMerchants()
  return getFoodMerchants().filter((m) => merchantAppliesToSite(m, site))
}

export const addFoodMerchant = ({ name, description, enabled = true, siteNames }) => {
  try {
    const n = String(name || '').trim()
    const sites = normalizeSiteNames(siteNames)
    if (!n) return { success: false, message: '請填寫商家名稱' }
    if (sites.length === 0) return { success: false, message: '請至少選擇一個適用案場' }
    const list = getFoodMerchants()
    const now = new Date().toISOString()
    const rec = {
      id: `food-merchant-${Date.now()}`,
      name: n,
      description: String(description || '').trim(),
      enabled: enabled !== false,
      siteNames: sites,
      menuItems: [],
      createdAt: now,
      updatedAt: now
    }
    list.push(rec)
    persist(list)
    return { success: true, record: rec }
  } catch (e) {
    console.error('addFoodMerchant:', e)
    return { success: false, message: '新增商家失敗' }
  }
}

export const updateFoodMerchant = (id, patch) => {
  try {
    const mid = String(id || '').trim()
    if (!mid) return { success: false, message: '商家不存在' }
    const list = getFoodMerchants()
    const idx = list.findIndex((m) => String(m?.id || '').trim() === mid)
    if (idx < 0) return { success: false, message: '找不到商家' }
    const prev = list[idx]
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    if (patch.name !== undefined) {
      const n = String(patch.name || '').trim()
      if (!n) return { success: false, message: '請填寫商家名稱' }
      next.name = n
    }
    if (patch.description !== undefined) next.description = String(patch.description || '').trim()
    if (patch.enabled !== undefined) next.enabled = !!patch.enabled
    if (patch.siteNames !== undefined) {
      const sites = normalizeSiteNames(patch.siteNames)
      if (sites.length === 0) return { success: false, message: '請至少選擇一個適用案場' }
      next.siteNames = sites
    }
    if (patch.menuItems !== undefined) next.menuItems = normalizeMenuItems(patch.menuItems)
    list[idx] = next
    persist(list)
    return { success: true, record: next }
  } catch (e) {
    console.error('updateFoodMerchant:', e)
    return { success: false, message: '更新商家失敗' }
  }
}

export const deleteFoodMerchant = (id) => {
  try {
    const mid = String(id || '').trim()
    if (!mid) return { success: false, message: '商家不存在' }
    const list = getFoodMerchants().filter((m) => String(m?.id || '').trim() !== mid)
    if (list.length === getFoodMerchants().length) return { success: false, message: '找不到商家' }
    persist(list)
    return { success: true }
  } catch (e) {
    console.error('deleteFoodMerchant:', e)
    return { success: false, message: '刪除商家失敗' }
  }
}

export const addFoodMenuItem = (merchantId, { name, price, description, enabled = true }) => {
  try {
    const mid = String(merchantId || '').trim()
    const n = String(name || '').trim()
    const p = Number(price)
    if (!mid) return { success: false, message: '請選擇商家' }
    if (!n) return { success: false, message: '請填寫品項名稱' }
    if (!Number.isFinite(p) || p < 0) return { success: false, message: '請填寫有效價格' }
    const list = getFoodMerchants()
    const idx = list.findIndex((m) => String(m?.id || '').trim() === mid)
    if (idx < 0) return { success: false, message: '找不到商家' }
    const now = new Date().toISOString()
    const item = {
      id: `food-item-${Date.now()}`,
      name: n,
      price: p,
      description: String(description || '').trim(),
      enabled: enabled !== false,
      createdAt: now,
      updatedAt: now
    }
    list[idx] = {
      ...list[idx],
      menuItems: [...(list[idx].menuItems || []), item],
      updatedAt: now
    }
    persist(list)
    return { success: true, record: item }
  } catch (e) {
    console.error('addFoodMenuItem:', e)
    return { success: false, message: '新增品項失敗' }
  }
}

export const updateFoodMenuItem = (merchantId, itemId, patch) => {
  try {
    const mid = String(merchantId || '').trim()
    const iid = String(itemId || '').trim()
    if (!mid || !iid) return { success: false, message: '品項不存在' }
    const list = getFoodMerchants()
    const idx = list.findIndex((m) => String(m?.id || '').trim() === mid)
    if (idx < 0) return { success: false, message: '找不到商家' }
    const items = [...(list[idx].menuItems || [])]
    const itemIdx = items.findIndex((item) => String(item?.id || '').trim() === iid)
    if (itemIdx < 0) return { success: false, message: '找不到品項' }
    const prev = items[itemIdx]
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    if (patch.name !== undefined) {
      const n = String(patch.name || '').trim()
      if (!n) return { success: false, message: '請填寫品項名稱' }
      next.name = n
    }
    if (patch.price !== undefined) {
      const p = Number(patch.price)
      if (!Number.isFinite(p) || p < 0) return { success: false, message: '請填寫有效價格' }
      next.price = p
    }
    if (patch.description !== undefined) next.description = String(patch.description || '').trim()
    if (patch.enabled !== undefined) next.enabled = !!patch.enabled
    items[itemIdx] = next
    list[idx] = { ...list[idx], menuItems: items, updatedAt: new Date().toISOString() }
    persist(list)
    return { success: true, record: next }
  } catch (e) {
    console.error('updateFoodMenuItem:', e)
    return { success: false, message: '更新品項失敗' }
  }
}

export const deleteFoodMenuItem = (merchantId, itemId) => {
  try {
    const mid = String(merchantId || '').trim()
    const iid = String(itemId || '').trim()
    if (!mid || !iid) return { success: false, message: '品項不存在' }
    const list = getFoodMerchants()
    const idx = list.findIndex((m) => String(m?.id || '').trim() === mid)
    if (idx < 0) return { success: false, message: '找不到商家' }
    const before = (list[idx].menuItems || []).length
    const items = (list[idx].menuItems || []).filter((item) => String(item?.id || '').trim() !== iid)
    if (items.length === before) return { success: false, message: '找不到品項' }
    list[idx] = { ...list[idx], menuItems: items, updatedAt: new Date().toISOString() }
    persist(list)
    return { success: true }
  } catch (e) {
    console.error('deleteFoodMenuItem:', e)
    return { success: false, message: '刪除品項失敗' }
  }
}
