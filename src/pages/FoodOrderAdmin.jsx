import { useState, useEffect, useMemo } from 'react'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getContractorRegistrations, getContractorAttendanceMode, CONTRACTOR_REGISTRATION_KEY } from '../utils/contractorRegistrationStorage'
import {
  getFoodMerchants,
  getFoodMerchantsForSite,
  getFoodSiteOptions,
  getEnabledFoodMerchants,
  getCompanyMealOrdersForDate,
  getNamedMealOrdersForDate,
  saveCompanyMealOrders,
  saveNamedMealOrders,
  clearCompanyMealOrders,
  clearNamedMealOrders,
  addFoodMerchant,
  updateFoodMerchant,
  deleteFoodMerchant,
  addFoodMenuItem,
  updateFoodMenuItem,
  deleteFoodMenuItem,
  getFoodOrderDailyStats,
  getFoodOrderQuantityBreakdown,
  setFoodOrderCharged,
  FOOD_ORDER_MERCHANTS_KEY,
  FOOD_ORDER_RECORDS_KEY,
  FOOD_ORDER_SITE_SESSION_KEY
} from '../utils/foodOrderStorage'

const EMPTY_MERCHANT = { name: '', description: '', enabled: true, siteNames: [] }
const EMPTY_ITEM = { name: '', price: '', description: '', enabled: true }

const todayIso = () => new Date().toISOString().slice(0, 10)

const newRegisterMealRow = (id) => ({ id, mealKey: '', quantity: '1' })

function EnabledToggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-teal-500 focus:ring-teal-500/40"
      />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function SiteNamesPicker({ siteOptions, value, onChange }) {
  const selected = new Set(value || [])
  const toggle = (site) => {
    const next = new Set(selected)
    if (next.has(site)) next.delete(site)
    else next.add(site)
    onChange([...next].sort((a, b) => a.localeCompare(b, 'zh-Hant')))
  }
  if (siteOptions.length === 0) {
    return <p className="text-amber-300 text-xs">尚無案場，請至入廠申請「常用清單」新增案場。</p>
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-600 bg-gray-900/40 p-2 space-y-1">
      {siteOptions.map((site) => (
        <label key={site} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/60 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(site)}
            onChange={() => toggle(site)}
            className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-orange-500"
          />
          <span className="text-sm text-gray-200">{site}</span>
        </label>
      ))}
    </div>
  )
}

function FoodOrderAdmin() {
  const [activeTab, setActiveTab] = useState('merchants') // merchants | register | stats
  const [statsDate, setStatsDate] = useState(todayIso)
  const [statsSite, setStatsSite] = useState('')
  const [orderRevision, setOrderRevision] = useState(0)
  const [showQuantityDetail, setShowQuantityDetail] = useState(false)
  const [siteOptions, setSiteOptions] = useState(() => getFoodSiteOptions())
  const [selectedSite, setSelectedSite] = useState(() => {
    try {
      return sessionStorage.getItem(FOOD_ORDER_SITE_SESSION_KEY) || ''
    } catch (_) {
      return ''
    }
  })
  const [merchants, setMerchants] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState(null)
  const [showMerchantForm, setShowMerchantForm] = useState(false)
  const [editingMerchantId, setEditingMerchantId] = useState(null)
  const [merchantForm, setMerchantForm] = useState(EMPTY_MERCHANT)
  const [editingItemId, setEditingItemId] = useState(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [registerDate, setRegisterDate] = useState(todayIso)
  const [registerSite, setRegisterSite] = useState('')
  const [registerCompanyId, setRegisterCompanyId] = useState('')
  const [registerMealRows, setRegisterMealRows] = useState(() => [newRegisterMealRow('row-1')])
  const [registerNamedMealRows, setRegisterNamedMealRows] = useState([])
  const [contractors, setContractors] = useState(() => getContractorRegistrations())

  const loadSites = () => setSiteOptions(getFoodSiteOptions())
  const load = () => setMerchants(getFoodMerchants())
  const loadContractors = () => setContractors(getContractorRegistrations())

  useRealtimeKeys([FOOD_ORDER_MERCHANTS_KEY, FOOD_ORDER_RECORDS_KEY, 'jiameng_dropdown_options', CONTRACTOR_REGISTRATION_KEY], () => {
    loadSites()
    load()
    loadContractors()
    setOrderRevision((r) => r + 1)
  })

  useEffect(() => {
    loadSites()
    load()
    loadContractors()
  }, [])

  useEffect(() => {
    try {
      if (selectedSite) sessionStorage.setItem(FOOD_ORDER_SITE_SESSION_KEY, selectedSite)
      else sessionStorage.removeItem(FOOD_ORDER_SITE_SESSION_KEY)
    } catch (_) {}
  }, [selectedSite])

  useEffect(() => {
    if (selectedSite && !siteOptions.includes(selectedSite)) setSelectedSite('')
  }, [siteOptions, selectedSite])

  const filteredMerchants = useMemo(() => {
    void merchants
    return getFoodMerchantsForSite(selectedSite)
  }, [merchants, selectedSite])

  const dailyStats = useMemo(() => {
    void orderRevision
    return getFoodOrderDailyStats(statsDate, statsSite || undefined)
  }, [orderRevision, statsDate, statsSite])

  const quantityBreakdown = useMemo(() => {
    return getFoodOrderQuantityBreakdown(dailyStats.orders)
  }, [dailyStats.orders])

  const contractorOptions = useMemo(
    () => [...contractors].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')),
    [contractors]
  )

  const registerCompany = useMemo(
    () => contractorOptions.find((c) => c.id === registerCompanyId) || null,
    [contractorOptions, registerCompanyId]
  )

  const registerAttendanceMode = useMemo(
    () => getContractorAttendanceMode(registerCompany),
    [registerCompany]
  )

  const isRegisterHeadcountMode = registerAttendanceMode === 'headcount'

  const registerActivePersonnel = useMemo(() => {
    if (!registerCompany) return []
    return (registerCompany.personnel || [])
      .filter((p) => p?.active !== false && String(p?.name || '').trim())
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
  }, [registerCompany])

  const registerMealOptions = useMemo(() => {
    void orderRevision
    if (!registerSite) return []
    const opts = []
    getEnabledFoodMerchants(registerSite).forEach((merchant) => {
      ;(merchant.menuItems || []).forEach((item) => {
        opts.push({
          key: `${merchant.id}|${item.id}`,
          merchantId: merchant.id,
          merchantName: merchant.name,
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          label: `${merchant.name} - ${item.name}（$${item.price}）`
        })
      })
    })
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  }, [orderRevision, registerSite])

  const registerExistingOrders = useMemo(() => {
    void orderRevision
    if (!registerSite || !registerCompanyId) return []
    return isRegisterHeadcountMode
      ? getCompanyMealOrdersForDate(registerDate, { siteName: registerSite, companyId: registerCompanyId })
      : getNamedMealOrdersForDate(registerDate, { siteName: registerSite, companyId: registerCompanyId })
  }, [orderRevision, registerDate, registerSite, registerCompanyId, isRegisterHeadcountMode])

  useEffect(() => {
    if (registerSite && !siteOptions.includes(registerSite)) setRegisterSite('')
  }, [siteOptions, registerSite])

  useEffect(() => {
    if (!registerSite || !registerCompanyId) {
      setRegisterMealRows([newRegisterMealRow('row-1')])
      return
    }
    if (!isRegisterHeadcountMode) return
    const orders = getCompanyMealOrdersForDate(registerDate, {
      siteName: registerSite,
      companyId: registerCompanyId
    })
    if (orders.length === 0) {
      setRegisterMealRows([newRegisterMealRow(`row-${Date.now()}`)])
      return
    }
    setRegisterMealRows(
      orders.map((order, idx) => ({
        id: `saved-${order.id || idx}`,
        mealKey: `${order.merchantId}|${order.menuItemId}`,
        quantity: String(order.quantity || 1)
      }))
    )
  }, [registerDate, registerSite, registerCompanyId, orderRevision, isRegisterHeadcountMode])

  useEffect(() => {
    if (!registerSite || !registerCompanyId) {
      setRegisterNamedMealRows([])
      return
    }
    if (isRegisterHeadcountMode) return
    const orders = getNamedMealOrdersForDate(registerDate, {
      siteName: registerSite,
      companyId: registerCompanyId
    })
    const orderByPerson = new Map(orders.map((o) => [String(o.personId || '').trim(), o]))
    setRegisterNamedMealRows(
      registerActivePersonnel.map((person) => {
        const order = orderByPerson.get(String(person.id || '').trim())
        return {
          personId: person.id,
          personName: person.name,
          mealKey: order ? `${order.merchantId}|${order.menuItemId}` : ''
        }
      })
    )
  }, [registerDate, registerSite, registerCompanyId, orderRevision, isRegisterHeadcountMode, registerActivePersonnel])

  const registerMealTotal = useMemo(() => {
    if (isRegisterHeadcountMode) {
      return registerMealRows.reduce((sum, row) => {
        const sel = registerMealOptions.find((o) => o.key === row.mealKey)
        if (!sel) return sum
        const qty = Math.max(1, Math.floor(Number(row.quantity) || 1))
        return sum + sel.unitPrice * qty
      }, 0)
    }
    return registerNamedMealRows.reduce((sum, row) => {
      const sel = registerMealOptions.find((o) => o.key === row.mealKey)
      if (!sel) return sum
      return sum + sel.unitPrice
    }, 0)
  }, [registerMealRows, registerNamedMealRows, registerMealOptions, isRegisterHeadcountMode])

  const getRegisterMealSelection = (mealKey) => registerMealOptions.find((o) => o.key === mealKey) || null

  const updateRegisterMealRow = (rowId, patch) => {
    setRegisterMealRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  const addRegisterMealRow = () => {
    setRegisterMealRows((rows) => [...rows, newRegisterMealRow(`row-${Date.now()}`)])
  }

  const removeRegisterMealRow = (rowId) => {
    setRegisterMealRows((rows) => {
      if (rows.length <= 1) return [newRegisterMealRow(`row-${Date.now()}`)]
      return rows.filter((row) => row.id !== rowId)
    })
  }

  const updateRegisterNamedMealRow = (personId, mealKey) => {
    setRegisterNamedMealRows((rows) => rows.map((row) => (row.personId === personId ? { ...row, mealKey } : row)))
  }

  const saveRegisterOrders = () => {
    if (!registerCompany || !registerSite) {
      setMessage({ type: 'error', text: '請選擇案場與承攬商' })
      return
    }
    if (isRegisterHeadcountMode) {
      const lines = registerMealRows
        .map((row) => {
          const sel = getRegisterMealSelection(row.mealKey)
          if (!sel) return null
          return {
            merchantId: sel.merchantId,
            merchantName: sel.merchantName,
            menuItemId: sel.menuItemId,
            menuItemName: sel.menuItemName,
            unitPrice: sel.unitPrice,
            quantity: Math.max(1, Math.floor(Number(row.quantity) || 1))
          }
        })
        .filter(Boolean)
      if (lines.length === 0) {
        setMessage({ type: 'error', text: '請至少選擇一項餐點' })
        return
      }
      const res = saveCompanyMealOrders({
        date: registerDate,
        siteName: registerSite,
        companyId: registerCompany.id,
        companyName: registerCompany.name,
        lines
      })
      if (!res.success) {
        setMessage({ type: 'error', text: res.message || '登記失敗' })
        return
      }
      setOrderRevision((r) => r + 1)
      const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      setMessage({ type: 'success', text: `已代「${registerCompany.name}」登記 ${lines.length} 項，合計 $${total}` })
      return
    }
    const lines = registerNamedMealRows
      .map((row) => {
        const sel = getRegisterMealSelection(row.mealKey)
        if (!sel) return null
        return {
          personId: row.personId,
          personName: row.personName,
          merchantId: sel.merchantId,
          merchantName: sel.merchantName,
          menuItemId: sel.menuItemId,
          menuItemName: sel.menuItemName,
          unitPrice: sel.unitPrice,
          quantity: 1
        }
      })
      .filter(Boolean)
    if (lines.length === 0) {
      setMessage({ type: 'error', text: '請至少為一位人員選擇餐點' })
      return
    }
    const res = saveNamedMealOrders({
      date: registerDate,
      siteName: registerSite,
      companyId: registerCompany.id,
      companyName: registerCompany.name,
      lines
    })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '登記失敗' })
      return
    }
    setOrderRevision((r) => r + 1)
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
    setMessage({ type: 'success', text: `已代「${registerCompany.name}」登記 ${lines.length} 人，合計 $${total}` })
  }

  const cancelRegisterOrders = () => {
    if (!registerCompany || !registerSite) return
    const hasHeadcountOrders = registerExistingOrders.length > 0 || registerMealRows.some((row) => row.mealKey)
    const hasNamedOrders = registerExistingOrders.length > 0 || registerNamedMealRows.some((row) => row.mealKey)
    if (isRegisterHeadcountMode ? !hasHeadcountOrders : !hasNamedOrders) return
    if (!window.confirm(`確定取消「${registerCompany.name}」${registerDate.replace(/-/g, '/')} 的訂餐？`)) return
    const res = isRegisterHeadcountMode
      ? clearCompanyMealOrders({
          date: registerDate,
          siteName: registerSite,
          companyId: registerCompany.id
        })
      : clearNamedMealOrders({
          date: registerDate,
          siteName: registerSite,
          companyId: registerCompany.id
        })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '取消失敗' })
      return
    }
    if (isRegisterHeadcountMode) setRegisterMealRows([newRegisterMealRow(`row-${Date.now()}`)])
    else {
      setRegisterNamedMealRows(
        registerActivePersonnel.map((person) => ({ personId: person.id, personName: person.name, mealKey: '' }))
      )
    }
    setOrderRevision((r) => r + 1)
    setMessage({ type: 'success', text: '已取消訂餐登記。' })
  }

  const toggleOrderCharged = (order) => {
    const res = setFoodOrderCharged(order.id, !order.isCharged)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '更新失敗' })
      return
    }
    setOrderRevision((r) => r + 1)
  }

  const selected = useMemo(
    () => filteredMerchants.find((m) => m.id === selectedId) || merchants.find((m) => m.id === selectedId) || null,
    [filteredMerchants, merchants, selectedId]
  )

  useEffect(() => {
    if (selectedId && selectedSite && !filteredMerchants.some((m) => m.id === selectedId)) {
      setSelectedId('')
      setEditingItemId(null)
      setItemForm(EMPTY_ITEM)
    }
  }, [filteredMerchants, selectedId, selectedSite])

  const openCreateMerchant = () => {
    if (!selectedSite) {
      setMessage({ type: 'error', text: '請先選擇案場' })
      return
    }
    setEditingMerchantId(null)
    setMerchantForm({ ...EMPTY_MERCHANT, siteNames: [selectedSite] })
    setShowMerchantForm(true)
    setMessage(null)
  }

  const openEditMerchant = (merchant) => {
    setEditingMerchantId(merchant.id)
    setMerchantForm({
      name: merchant.name || '',
      description: merchant.description || '',
      enabled: merchant.enabled !== false,
      siteNames: [...(merchant.siteNames || [])]
    })
    setShowMerchantForm(true)
    setMessage(null)
  }

  const closeMerchantForm = () => {
    setShowMerchantForm(false)
    setEditingMerchantId(null)
    setMerchantForm(EMPTY_MERCHANT)
  }

  const handleMerchantSubmit = (e) => {
    e.preventDefault()
    setMessage(null)
    const res = editingMerchantId
      ? updateFoodMerchant(editingMerchantId, merchantForm)
      : addFoodMerchant(merchantForm)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '儲存失敗' })
      return
    }
    load()
    if (!editingMerchantId && res.record?.id) setSelectedId(res.record.id)
    closeMerchantForm()
    setMessage({ type: 'success', text: editingMerchantId ? '已更新商家。' : '已新增商家。' })
  }

  const handleDeleteMerchant = (merchant) => {
    if (!window.confirm(`確定要刪除商家「${merchant.name}」及其所有菜單品項嗎？`)) return
    const res = deleteFoodMerchant(merchant.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (selectedId === merchant.id) setSelectedId('')
    load()
    setMessage({ type: 'success', text: '已刪除商家。' })
  }

  const toggleMerchantEnabled = (merchant) => {
    const res = updateFoodMerchant(merchant.id, { enabled: merchant.enabled === false })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '更新失敗' })
      return
    }
    load()
  }

  const startEditItem = (item) => {
    setEditingItemId(item.id)
    setItemForm({
      name: item.name || '',
      price: String(item.price ?? ''),
      description: item.description || '',
      enabled: item.enabled !== false
    })
  }

  const cancelEditItem = () => {
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM)
  }

  const handleItemSubmit = (e) => {
    e.preventDefault()
    if (!selectedId) return
    setMessage(null)
    const payload = { ...itemForm, price: Number(itemForm.price) }
    const res = editingItemId
      ? updateFoodMenuItem(selectedId, editingItemId, payload)
      : addFoodMenuItem(selectedId, payload)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '儲存失敗' })
      return
    }
    load()
    cancelEditItem()
    setMessage({ type: 'success', text: editingItemId ? '已更新品項。' : '已新增品項。' })
  }

  const handleDeleteItem = (item) => {
    if (!selectedId) return
    if (!window.confirm(`確定要刪除品項「${item.name}」嗎？`)) return
    const res = deleteFoodMenuItem(selectedId, item.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (editingItemId === item.id) cancelEditItem()
    load()
    setMessage({ type: 'success', text: '已刪除品項。' })
  }

  const toggleItemEnabled = (item) => {
    if (!selectedId) return
    const res = updateFoodMenuItem(selectedId, item.id, { enabled: item.enabled === false })
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '更新失敗' })
      return
    }
    load()
  }

  return (
    <div className="max-w-5xl mx-auto w-full text-white px-1 sm:px-0">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-orange-300">點餐系統</h2>
          <p className="text-gray-400 text-sm mt-1">管理商家菜單、代為登記訂餐，並統計承攬商當日訂餐。</p>
        </div>
        {activeTab === 'merchants' && (
          <button
            type="button"
            onClick={openCreateMerchant}
            disabled={!selectedSite}
            className="shrink-0 min-h-[40px] px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            新增商家
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2 border-b border-gray-700">
        <button
          type="button"
          onClick={() => setActiveTab('merchants')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'merchants'
              ? 'border-orange-400 text-orange-300'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          菜單設定
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('register'); setMessage(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'register'
              ? 'border-orange-400 text-orange-300'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          代為登記
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'stats'
              ? 'border-orange-400 text-orange-300'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          當日統計
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/40 text-green-300 border border-green-700/50'
              : 'bg-red-900/40 text-red-300 border border-red-700/50'
          }`}
        >
          {message.text}
        </div>
      )}

      {activeTab === 'register' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-600 bg-gray-800/60 p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-300 text-sm mb-1.5">訂餐日期</label>
              <input
                type="date"
                value={registerDate}
                onChange={(e) => setRegisterDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5">案場 *</label>
              <select
                value={registerSite}
                onChange={(e) => setRegisterSite(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
              >
                <option value="">— 請選擇案場 —</option>
                {siteOptions.map((site) => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5">承攬商 *</label>
              <select
                value={registerCompanyId}
                onChange={(e) => setRegisterCompanyId(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
              >
                <option value="">— 請選擇承攬商 —</option>
                {contractorOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {!registerSite ? (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-600 rounded-xl">
              請先選擇案場以代為登記訂餐。
            </p>
          ) : !registerCompanyId ? (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-600 rounded-xl">
              請選擇承攬商以登記訂餐。
            </p>
          ) : registerMealOptions.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-600 rounded-xl">
              此案場尚無可訂餐的商家，請至「菜單設定」新增。
            </p>
          ) : !isRegisterHeadcountMode && registerActivePersonnel.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-600 rounded-xl">
              此承攬商尚無可訂餐人員，請至「承攬商資料登記」建立人員名單。
            </p>
          ) : (
            <div className="rounded-xl border border-gray-600 bg-gray-800/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-orange-300 text-sm font-medium">
                  {registerCompany?.name} · {registerSite} · {registerDate.replace(/-/g, '/')}
                  <span className="text-gray-400 font-normal ml-1.5">
                    （{isRegisterHeadcountMode ? '人數制' : '實名制'}）
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveRegisterOrders}
                    className="text-xs px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-600 text-white font-medium"
                  >
                    儲存登記
                  </button>
                  {(
                    isRegisterHeadcountMode
                      ? registerExistingOrders.length > 0 || registerMealRows.some((row) => row.mealKey)
                      : registerExistingOrders.length > 0 || registerNamedMealRows.some((row) => row.mealKey)
                  ) && (
                    <button
                      type="button"
                      onClick={cancelRegisterOrders}
                      className="text-xs px-3 py-1.5 rounded-md border border-gray-600 text-gray-300 hover:bg-black/30"
                    >
                      取消登記
                    </button>
                  )}
                </div>
              </div>

              {registerExistingOrders.length > 0 && (
                <p className="text-green-400/90 text-xs">
                  已登記：{registerExistingOrders.map((o) => (
                    isRegisterHeadcountMode
                      ? `${o.menuItemName}×${o.quantity}`
                      : `${o.personName} ${o.menuItemName}`
                  )).join('、')}
                </p>
              )}

              {isRegisterHeadcountMode ? (
              <div className="space-y-2">
                {registerMealRows.map((row, index) => {
                  const sel = getRegisterMealSelection(row.mealKey)
                  const qty = Math.max(1, Math.floor(Number(row.quantity) || 1))
                  const amount = sel ? sel.unitPrice * qty : 0
                  return (
                    <div key={row.id} className="p-3 rounded-lg bg-black/25 border border-orange-800/40 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-400 text-xs">餐點 {index + 1}</span>
                        {registerMealRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRegisterMealRow(row.id)}
                            className="text-xs text-gray-400 hover:text-red-300"
                          >
                            移除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_auto] gap-2 items-end">
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">選擇餐點</label>
                          <select
                            value={row.mealKey}
                            onChange={(e) => updateRegisterMealRow(row.id, { mealKey: e.target.value })}
                            className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm"
                          >
                            <option value="">— 請選擇 —</option>
                            {registerMealOptions.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">數量</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(e) => updateRegisterMealRow(row.id, { quantity: e.target.value })}
                            disabled={!row.mealKey}
                            className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm tabular-nums disabled:opacity-40"
                          />
                        </div>
                        <div className="text-right sm:text-center">
                          <p className="text-gray-400 text-xs mb-1">金額</p>
                          <p className="text-amber-300 font-semibold tabular-nums">${amount || '—'}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={addRegisterMealRow}
                  className="w-full py-2.5 rounded-lg border border-dashed border-orange-700/60 text-orange-300 text-sm hover:bg-orange-950/30"
                >
                  ＋ 新增餐點
                </button>
                <div className="flex justify-end pt-1">
                  <p className="text-sm text-gray-300">
                    合計 <span className="text-amber-300 font-semibold tabular-nums">${registerMealTotal || 0}</span>
                  </p>
                </div>
              </div>
              ) : (
              <div className="space-y-2">
                {registerNamedMealRows.map((row) => {
                  const sel = getRegisterMealSelection(row.mealKey)
                  return (
                    <div key={row.personId} className="p-3 rounded-lg bg-black/25 border border-orange-800/40 space-y-2">
                      <p className="text-white text-sm font-medium">{row.personName}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">選擇餐點</label>
                          <select
                            value={row.mealKey}
                            onChange={(e) => updateRegisterNamedMealRow(row.personId, e.target.value)}
                            className="w-full bg-black/30 border border-gray-600 rounded-md px-2 py-2 text-white text-sm"
                          >
                            <option value="">— 不訂餐 —</option>
                            {registerMealOptions.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="text-right sm:text-center">
                          <p className="text-gray-400 text-xs mb-1">金額</p>
                          <p className="text-amber-300 font-semibold tabular-nums">${sel ? sel.unitPrice : '—'}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-end pt-1">
                  <p className="text-sm text-gray-300">
                    合計 <span className="text-amber-300 font-semibold tabular-nums">${registerMealTotal || 0}</span>
                  </p>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      ) : activeTab === 'stats' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-600 bg-gray-800/60 p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 text-sm mb-1.5">統計日期</label>
              <input
                type="date"
                value={statsDate}
                onChange={(e) => setStatsDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5">案場篩選</label>
              <select
                value={statsSite}
                onChange={(e) => setStatsSite(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
              >
                <option value="">全部案場</option>
                {siteOptions.map((site) => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3">
              <p className="text-gray-400 text-xs">訂餐筆數</p>
              <p className="text-xl font-bold text-white tabular-nums">{dailyStats.orderCount}</p>
            </div>
            <button
              type="button"
              onClick={() => dailyStats.orders.length > 0 && setShowQuantityDetail(true)}
              disabled={dailyStats.orders.length === 0}
              className={`rounded-lg border p-3 text-left transition-colors ${
                dailyStats.orders.length > 0
                  ? 'border-orange-600/60 bg-gray-800/60 hover:bg-orange-950/30 hover:border-orange-500/70 cursor-pointer'
                  : 'border-gray-600 bg-gray-800/60 opacity-60 cursor-default'
              }`}
            >
              <p className="text-gray-400 text-xs">總數量</p>
              <p className="text-xl font-bold text-white tabular-nums">{dailyStats.totalQuantity}</p>
              {dailyStats.orders.length > 0 && (
                <p className="text-orange-300/80 text-[10px] mt-1">點擊查看明細</p>
              )}
            </button>
            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3">
              <p className="text-gray-400 text-xs">總金額</p>
              <p className="text-xl font-bold text-amber-300 tabular-nums">${dailyStats.totalAmount}</p>
            </div>
            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3">
              <p className="text-gray-400 text-xs">已收費 / 未收費</p>
              <p className="text-sm font-semibold text-emerald-300 tabular-nums">${dailyStats.chargedAmount}</p>
              <p className="text-sm text-gray-400 tabular-nums">${dailyStats.unchargedAmount}</p>
            </div>
          </div>

          {dailyStats.orders.length === 0 ? (
            <p className="text-gray-500 text-sm py-12 text-center border border-dashed border-gray-600 rounded-xl">
              此日期{statsSite ? `（${statsSite}）` : ''}尚無訂餐紀錄。
            </p>
          ) : (
            <div className="rounded-xl border border-gray-600 bg-gray-800/60 overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="px-3 py-2 font-medium">案場</th>
                    <th className="px-3 py-2 font-medium">承攬商</th>
                    <th className="px-3 py-2 font-medium">人員</th>
                    <th className="px-3 py-2 font-medium">廠商</th>
                    <th className="px-3 py-2 font-medium">品項</th>
                    <th className="px-3 py-2 font-medium text-right">數量</th>
                    <th className="px-3 py-2 font-medium text-right">金額</th>
                    <th className="px-3 py-2 font-medium text-center">是否收費</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60">
                  {dailyStats.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-900/40">
                      <td className="px-3 py-2.5 text-gray-300">{order.siteName}</td>
                      <td className="px-3 py-2.5 text-gray-300">{order.companyName}</td>
                      <td className="px-3 py-2.5 text-white">{order.personName || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-300">{order.merchantName}</td>
                      <td className="px-3 py-2.5 text-white">{order.menuItemName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{order.quantity}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">${order.totalAmount}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleOrderCharged(order)}
                          className={`text-xs px-2.5 py-1 rounded border ${
                            order.isCharged
                              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50'
                              : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                          }`}
                        >
                          {order.isCharged ? '已收費' : '未收費'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="mb-4 rounded-xl border border-gray-600 bg-gray-800/60 p-3 sm:p-4">
        <label className="block text-gray-300 text-sm mb-1.5">目前案場 *</label>
        <select
          value={selectedSite}
          onChange={(e) => {
            setSelectedSite(e.target.value)
            setSelectedId('')
            cancelEditItem()
          }}
          className="w-full sm:max-w-md bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white"
        >
          <option value="">— 請選擇案場 —</option>
          {siteOptions.map((site) => (
            <option key={site} value={site}>{site}</option>
          ))}
        </select>
        <p className="text-gray-500 text-xs mt-1.5">僅顯示套用此案場的商家；例：日月光店家不會出現在林口。</p>
      </div>

      {!selectedSite ? (
        <p className="text-gray-500 text-sm py-12 text-center border border-dashed border-gray-600 rounded-xl">
          請先選擇案場以管理該地區的點餐商家。
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div className="rounded-xl border border-gray-600 bg-gray-800/60 overflow-hidden">
            <div className="px-3 py-2 bg-gray-900/80 border-b border-gray-700 text-sm text-gray-300">
              商家列表 · {selectedSite}
            </div>
            <div className="divide-y divide-gray-700/60 max-h-[420px] overflow-y-auto">
              {filteredMerchants.length === 0 ? (
                <p className="text-gray-500 text-sm p-4 text-center">此案場尚無商家，請點「新增商家」。</p>
              ) : (
                filteredMerchants.map((merchant) => (
                  <button
                    key={merchant.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(merchant.id)
                      cancelEditItem()
                    }}
                    className={`w-full text-left px-3 py-3 transition-colors ${
                      selectedId === merchant.id ? 'bg-orange-900/30' : 'hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{merchant.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(merchant.menuItems || []).length} 項
                          {merchant.enabled === false && <span className="text-gray-500 ml-1">· 已停用</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                        merchant.enabled !== false ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {merchant.enabled !== false ? '啟用' : '停用'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-600 bg-gray-800/60 p-4 sm:p-5 min-h-[320px]">
            {!selected ? (
              <p className="text-gray-500 text-sm py-12 text-center">請從左側選擇商家以管理菜單。</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-gray-700">
                  <div>
                    <h3 className="text-lg font-bold text-orange-200">{selected.name}</h3>
                    {selected.description && <p className="text-gray-400 text-sm mt-1">{selected.description}</p>}
                    {(selected.siteNames || []).length > 0 && (
                      <p className="text-teal-300/80 text-xs mt-1">
                        適用案場：{(selected.siteNames || []).join('、')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <EnabledToggle
                      checked={selected.enabled !== false}
                      onChange={() => toggleMerchantEnabled(selected)}
                      label={selected.enabled !== false ? '已啟用' : '已停用'}
                    />
                    <button type="button" onClick={() => openEditMerchant(selected)} className="text-xs px-2.5 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white">
                      編輯商家
                    </button>
                    <button type="button" onClick={() => handleDeleteMerchant(selected)} className="text-xs px-2.5 py-1 rounded bg-red-900/50 text-red-300 border border-red-700/50 hover:bg-red-800/60">
                      刪除
                    </button>
                  </div>
                </div>

                <form onSubmit={handleItemSubmit} className="rounded-lg border border-gray-600 bg-gray-900/40 p-3 space-y-3">
                  <p className="text-sm font-medium text-teal-300">{editingItemId ? '編輯品項' : '新增品項'}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">品項名稱 *</label>
                      <input type="text" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="例：雞腿便當" required />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">價格（元）*</label>
                      <input type="number" min="0" step="1" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm tabular-nums" placeholder="80" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">說明（選填）</label>
                    <input type="text" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="例：含飲料" />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EnabledToggle checked={itemForm.enabled} onChange={(v) => setItemForm((f) => ({ ...f, enabled: v }))} label="啟用此品項" />
                    <div className="flex gap-2">
                      {editingItemId && (
                        <button type="button" onClick={cancelEditItem} className="px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm">取消</button>
                      )}
                      <button type="submit" className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-600 text-white text-sm font-medium">
                        {editingItemId ? '儲存品項' : '新增品項'}
                      </button>
                    </div>
                  </div>
                </form>

                <div>
                  <p className="text-sm text-gray-300 mb-2">菜單品項（{(selected.menuItems || []).length}）</p>
                  {(selected.menuItems || []).length === 0 ? (
                    <p className="text-gray-500 text-sm py-6 text-center border border-dashed border-gray-600 rounded-lg">尚無品項，請於上方新增。</p>
                  ) : (
                    <div className="space-y-2">
                      {[...(selected.menuItems || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant')).map((item) => (
                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-gray-900/50 border border-gray-700/60">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-white">{item.name}</span>
                              <span className="text-amber-300 font-semibold tabular-nums">${item.price}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.enabled !== false ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                                {item.enabled !== false ? '啟用' : '停用'}
                              </span>
                            </div>
                            {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <button type="button" onClick={() => toggleItemEnabled(item)} className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-700">
                              {item.enabled !== false ? '停用' : '啟用'}
                            </button>
                            <button type="button" onClick={() => startEditItem(item)} className="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white">編輯</button>
                            <button type="button" onClick={() => handleDeleteItem(item)} className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 border border-red-700/50">刪除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {showQuantityDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-orange-600/50 rounded-xl p-5 w-full max-w-lg my-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-orange-300">訂餐數量明細</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {statsDate.replace(/-/g, '/')}
                  {statsSite ? ` · ${statsSite}` : ' · 全部案場'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuantityDetail(false)}
                className="text-gray-400 hover:text-white text-xl leading-none px-1"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="rounded-lg border border-gray-600 bg-gray-900/40 p-3 mb-4">
              <p className="text-gray-400 text-xs mb-1">全體合計</p>
              <p className="text-white font-semibold tabular-nums">
                共 <span className="text-orange-200">{quantityBreakdown.totalQuantity}</span> 份　
                金額 <span className="text-amber-300">${quantityBreakdown.totalAmount}</span>
              </p>
            </div>

            <div className="mb-4">
              <p className="text-teal-300 text-sm font-medium mb-2">依品項統計</p>
              {quantityBreakdown.byItem.length === 0 ? (
                <p className="text-gray-500 text-sm">尚無資料</p>
              ) : (
                <div className="space-y-1.5">
                  {quantityBreakdown.byItem.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/25 border border-gray-700/60 text-sm"
                    >
                      <span className="text-gray-200 min-w-0">{item.label}</span>
                      <span className="text-white tabular-nums shrink-0">
                        {item.quantity} 份 · <span className="text-amber-300">${item.amount}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-violet-300 text-sm font-medium mb-2">依承攬商統計</p>
              {quantityBreakdown.byCompany.length === 0 ? (
                <p className="text-gray-500 text-sm">尚無資料</p>
              ) : (
                <div className="space-y-3">
                  {quantityBreakdown.byCompany.map((company) => (
                    <div key={company.companyId} className="rounded-lg border border-gray-600 bg-gray-900/30 overflow-hidden">
                      <div className="px-3 py-2 bg-gray-900/60 border-b border-gray-700/60 flex items-center justify-between gap-2">
                        <span className="text-white font-medium text-sm">{company.companyName}</span>
                        <span className="text-xs text-gray-300 tabular-nums shrink-0">
                          {company.quantity} 份 · <span className="text-amber-300">${company.amount}</span>
                        </span>
                      </div>
                      <div className="divide-y divide-gray-700/40">
                        {company.items.map((item) => (
                          <div key={`${company.companyId}-${item.label}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="text-gray-400 min-w-0">{item.menuItemName}</span>
                            <span className="text-gray-200 tabular-nums shrink-0">
                              {item.quantity} 份 · <span className="text-amber-300/90">${item.amount}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowQuantityDetail(false)}
              className="w-full min-h-[44px] mt-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {showMerchantForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-orange-600/50 rounded-xl p-5 w-full max-w-md my-4">
            <h3 className="text-lg font-bold text-orange-300 mb-4">{editingMerchantId ? '編輯商家' : '新增商家'}</h3>
            <form onSubmit={handleMerchantSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">商家名稱 *</label>
                <input type="text" value={merchantForm.name} onChange={(e) => setMerchantForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" required />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">說明（選填）</label>
                <input type="text" value={merchantForm.description} onChange={(e) => setMerchantForm((f) => ({ ...f, description: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">適用案場 *</label>
                <SiteNamesPicker
                  siteOptions={siteOptions}
                  value={merchantForm.siteNames}
                  onChange={(siteNames) => setMerchantForm((f) => ({ ...f, siteNames }))}
                />
                <p className="text-gray-500 text-xs mt-1">勾選此案場後，該商家才會在對應地區顯示。</p>
              </div>
              <EnabledToggle checked={merchantForm.enabled} onChange={(v) => setMerchantForm((f) => ({ ...f, enabled: v }))} label="啟用此商家" />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 min-h-[44px] rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold">儲存</button>
                <button type="button" onClick={closeMerchantForm} className="flex-1 min-h-[44px] rounded-lg bg-gray-600 hover:bg-gray-500 text-white">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FoodOrderAdmin
