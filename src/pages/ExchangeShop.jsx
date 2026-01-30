import { useState, useEffect, Fragment, useCallback } from 'react'
import { getItems, createItem, updateItem, deleteItem, setItems, ITEM_TYPES } from '../utils/itemStorage'
import { addItemToInventory } from '../utils/inventoryStorage'
import { getWalletBalance, subtractWalletBalance, addTransaction } from '../utils/walletStorage'
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { getAllEquippedEffects, unequipEffect } from '../utils/effectStorage'
import { syncKeyToSupabase } from '../utils/supabaseSync'
import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabaseClient'

function ExchangeShop() {
  const [items, setItems] = useState([])
  const [itemsMeta, setItemsMeta] = useState({ total: 0, shopEligible: 0, hiddenInShop: 0, nonShop: 0 })
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    icon: '🎁',
    price: 0,
    type: 'general',
    isHidden: false // 管理員可隱藏：一般用戶在商城看不見，但背包仍可正常使用
  })
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [previewItemId, setPreviewItemId] = useState(null) // 點擊預覽時顯示的道具 id
  const [cloudItemsInfo, setCloudItemsInfo] = useState({ loading: false, count: null, sourceKey: 'jiameng_items', error: '' })

  const loadItems = useCallback(() => {
    const role = getCurrentUserRole()
    const all = Array.isArray(getItems()) ? getItems() : []
    const shopEligible = all.filter((item) => item.type !== ITEM_TYPES.TITLE && item.type !== ITEM_TYPES.NAME_EFFECT && item.type !== ITEM_TYPES.MESSAGE_EFFECT)
    const hiddenInShop = shopEligible.filter((i) => !!i?.isHidden).length
    const visibleItems = role === 'admin' ? shopEligible : shopEligible.filter((i) => !i?.isHidden)
    setItems(visibleItems)
    setItemsMeta({ total: all.length, shopEligible: shopEligible.length, hiddenInShop, nonShop: Math.max(0, all.length - shopEligible.length) })
  }, [])

  const fetchCloudItemsCount = useCallback(async (sourceKey = 'jiameng_items') => {
    if (!isSupabaseEnabled()) {
      setCloudItemsInfo({ loading: false, count: null, sourceKey, error: '尚未啟用 Supabase' })
      return null
    }
    const sb = getSupabaseClient()
    if (!sb) {
      setCloudItemsInfo({ loading: false, count: null, sourceKey, error: 'Supabase 未設定' })
      return null
    }
    setCloudItemsInfo((s) => ({ ...s, loading: true, error: '', sourceKey }))
    try {
      const { data, error } = await sb
        .from('app_data')
        .select('data')
        .eq('key', sourceKey)
        .maybeSingle()
      if (error) throw error
      const val = data?.data
      // backup 格式：{ savedAt, items: [...] }
      const list = Array.isArray(val) ? val : (Array.isArray(val?.items) ? val.items : [])
      const count = list.length
      setCloudItemsInfo({ loading: false, count, sourceKey, error: '' })
      return count
    } catch (e) {
      const msg = e?.message || '讀取雲端資料失敗'
      setCloudItemsInfo({ loading: false, count: null, sourceKey, error: msg })
      return null
    }
  }, [])

  const pullItemsFromCloud = useCallback(async (sourceKey = 'jiameng_items') => {
    if (!isSupabaseEnabled()) {
      alert('尚未啟用 Supabase')
      return
    }
    const sb = getSupabaseClient()
    if (!sb) {
      alert('Supabase 未設定')
      return
    }
    setCloudItemsInfo((s) => ({ ...s, loading: true, error: '', sourceKey }))
    try {
      const { data, error } = await sb
        .from('app_data')
        .select('data')
        .eq('key', sourceKey)
        .maybeSingle()
      if (error) throw error
      const val = data?.data
      const list = Array.isArray(val) ? val : (Array.isArray(val?.items) ? val.items : [])
      localStorage.setItem('jiameng_items', JSON.stringify(list))
      setCloudItemsInfo({ loading: false, count: list.length, sourceKey, error: '' })
      loadItems()
      alert(`已從雲端拉回道具（${sourceKey}）：${list.length} 筆`)
    } catch (e) {
      const msg = e?.message || '從雲端拉回失敗'
      setCloudItemsInfo({ loading: false, count: null, sourceKey, error: msg })
      alert(`從雲端拉回失敗：${msg}`)
    }
  }, [loadItems])

  const refetchExchangeShop = () => {
    try {
      loadItems()
      const user = getCurrentUser()
      if (user) setWalletBalance(getWalletBalance(user))
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('refetchExchangeShop', e)
    }
  }

  useEffect(() => {
    loadItems()
    const role = getCurrentUserRole()
    const user = getCurrentUser()
    setUserRole(role)
    setCurrentUser(user || '')
    if (user) {
      const balance = getWalletBalance(user)
      setWalletBalance(balance)
    }
    if (role === 'admin') {
      fetchCloudItemsCount('jiameng_items')
    }
  }, [])

  useRealtimeKeys(['jiameng_items', 'jiameng_wallets', 'jiameng_transactions'], refetchExchangeShop)

  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        const balance = getWalletBalance(currentUser)
        setWalletBalance(balance)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [currentUser])

  const handleAddItem = () => {
    setEditingItem(null)
    setItemForm({
      name: '',
      description: '',
      icon: '🎁',
      price: 0,
      type: 'general',
      isHidden: false
    })
    setShowItemForm(true)
  }

  const handleEditItem = (item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name || '',
      description: item.description || '',
      icon: item.icon || '🎁',
      price: item.price || 0,
      type: item.type || 'general',
      isHidden: !!item.isHidden
    })
    setShowItemForm(true)
  }

  const handleSaveItem = () => {
    if (!itemForm.name || !itemForm.icon) {
      alert('請填寫道具名稱和圖標')
      return
    }
    const priceNum = itemForm.price === '' ? 0 : (typeof itemForm.price === 'number' ? itemForm.price : (parseFloat(itemForm.price) || 0))
    const normalizedForm = { ...itemForm, price: priceNum }
    if (priceNum < 0) {
      alert('價格不能為負數')
      return
    }

    if (editingItem) {
      const result = updateItem(editingItem.id, normalizedForm)
      if (result.success) {
        alert('道具更新成功')
        loadItems()
        setShowItemForm(false)
      } else {
        alert(result.message || '更新失敗')
      }
    } else {
      const result = createItem(normalizedForm)
      if (result.success) {
        alert('道具創建成功')
        loadItems()
        setShowItemForm(false)
      } else {
        alert(result.message || '創建失敗')
      }
    }
  }

  const handleDeleteItem = (itemId) => {
    const item = getItems().find((i) => i.id === itemId)
    const itemName = item?.name || '此道具'
    if (!window.confirm(`確定要刪除「${itemName}」嗎？\n\n注意：會同步從所有人的背包/已裝備中移除，避免出現「未知道具」。`)) return

    // 1) 卸下所有人已裝備的該道具（若是特效/稱號）
    try {
      const allEquipped = getAllEquippedEffects()
      Object.keys(allEquipped || {}).forEach((username) => {
        const e = allEquipped?.[username] || {}
        if (e?.nameEffect === itemId) unequipEffect(username, 'name')
        if (e?.messageEffect === itemId) unequipEffect(username, 'message')
        if (e?.title === itemId) unequipEffect(username, 'title')
      })
    } catch (e) {
      console.warn('Delete item: unequip failed', e)
    }

    // 2) 從所有人的背包中移除該道具（直接掃 inventories map，Supabase 模式也可靠）
    try {
      const rawInv = localStorage.getItem('jiameng_inventories')
      const inventories = rawInv ? JSON.parse(rawInv) : {}
      let changed = false
      Object.keys(inventories || {}).forEach((username) => {
        const arr = Array.isArray(inventories[username]) ? inventories[username] : []
        const filtered = arr.filter((invEntry) => invEntry?.itemId !== itemId)
        if (filtered.length !== arr.length) {
          inventories[username] = filtered
          changed = true
        }
      })
      if (changed) {
        const val = JSON.stringify(inventories)
        localStorage.setItem('jiameng_inventories', val)
        syncKeyToSupabase('jiameng_inventories', val)
      }
    } catch (e) {
      console.warn('Delete item: clean inventories failed', e)
    }

    // 3) 移除所有兌換請求中引用此道具的紀錄（避免列表出現未知道具）
    try {
      const raw = localStorage.getItem('jiameng_exchange_requests')
      const reqs = raw ? JSON.parse(raw) : []
      if (Array.isArray(reqs) && reqs.length > 0) {
        const filtered = reqs.filter((r) => r?.itemId !== itemId)
        if (filtered.length !== reqs.length) {
          const val = JSON.stringify(filtered)
          localStorage.setItem('jiameng_exchange_requests', val)
          syncKeyToSupabase('jiameng_exchange_requests', val)
        }
      }
    } catch (e) {
      console.warn('Delete item: clean exchange requests failed', e)
    }

    // 4) 最後刪除道具定義
    const result = deleteItem(itemId)
    if (result.success) {
      alert('道具刪除成功')
      loadItems()
    } else {
      alert(result.message || '刪除失敗')
    }
  }

  const handleExchange = (item) => {
    if (!currentUser) {
      alert('請先登入')
      return
    }

    const balance = getWalletBalance(currentUser)
    if (balance < item.price) {
      alert(`佳盟幣不足，需要 ${item.price} 佳盟幣，目前餘額：${balance}`)
      return
    }

    if (!window.confirm(`確定要用 ${item.price} 佳盟幣兌換「${item.name}」嗎？`)) {
      return
    }

    // 扣除佳盟幣
    const subtractResult = subtractWalletBalance(currentUser, item.price)
    if (!subtractResult.success) {
      alert(subtractResult.message || '扣除佳盟幣失敗')
      return
    }

    // 記錄交易
    addTransaction({
      type: 'exchange',
      from: currentUser,
      to: 'system',
      amount: item.price,
      description: `兌換道具：${item.name}`,
      itemId: item.id,
      itemName: item.name
    })

    // 添加道具到背包
    const addResult = addItemToInventory(currentUser, item.id, 1)
    if (!addResult.success) {
      alert(addResult.message || '添加道具到背包失敗')
      // 如果添加失敗，退回佳盟幣
      subtractWalletBalance(currentUser, -item.price)
      return
    }

    alert(`成功兌換「${item.name}」！已添加到您的背包。`)
    setWalletBalance(getWalletBalance(currentUser))
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-7xl mx-auto">
        {/* 標題區域 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-yellow-400 mb-2">兌換商城</h1>
          <p className="text-gray-400">使用佳盟幣兌換虛擬道具</p>
        </div>

        {/* 用戶餘額顯示 */}
        {currentUser && (
          <div className="mb-6 bg-yellow-400/20 border border-yellow-400 rounded-lg p-5 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-gray-400 text-base sm:text-sm mb-1">我的佳盟幣餘額</p>
                <p className="text-4xl sm:text-3xl font-bold text-yellow-400">{walletBalance}</p>
              </div>
              <div className="text-5xl sm:text-4xl">💰</div>
            </div>
          </div>
        )}

        {/* 管理員：新增道具按鈕 */}
        {userRole === 'admin' && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleAddItem}
                className="bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
              >
                + 新增道具
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const localAll = Array.isArray(getItems()) ? getItems() : []
                    const localCount = localAll.length
                    const cloudCount = await fetchCloudItemsCount('jiameng_items')

                    // 防呆：本機很少但雲端很多，禁止覆蓋
                    if (typeof cloudCount === 'number' && cloudCount > localCount && localCount <= 1) {
                      alert(`偵測到：本機道具只有 ${localCount} 筆，但雲端有 ${cloudCount} 筆。\n\n為避免把雲端覆蓋成只剩彈幕，已阻止推送。\n請改用「從雲端拉回道具」。`)
                      return
                    }

                    // 防呆：本機比雲端少，需強確認
                    if (typeof cloudCount === 'number' && cloudCount > localCount) {
                      const ok = window.confirm(`注意：本機道具 ${localCount} 筆 < 雲端 ${cloudCount} 筆。\n推送會讓雲端道具消失！\n\n確定仍要推送本機到雲端嗎？`)
                      if (!ok) return
                    } else {
                      const ok = window.confirm(`確定要推送「本機道具清單」到雲端嗎？\n\n本機：${localCount} 筆\n雲端：${typeof cloudCount === 'number' ? `${cloudCount} 筆` : '未知'}`)
                      if (!ok) return
                    }

                    const val = localStorage.getItem('jiameng_items') || JSON.stringify(localAll || [])
                    await syncKeyToSupabase('jiameng_items', val)
                    await fetchCloudItemsCount('jiameng_items')
                    alert('已推送本機道具到雲端（請在另一台刷新/重新登入）')
                  } catch (e) {
                    console.warn('push items to supabase failed', e)
                    alert('推送失敗')
                  }
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg transition-colors font-semibold"
                title="推送本機 jiameng_items 到雲端（已加入防呆避免覆蓋）"
              >
                推送本機道具到雲端
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm('確定要「從雲端拉回」道具到本機嗎？\n\n本機的道具清單會被雲端覆蓋（不會影響背包道具數量，但商城顯示會依雲端為準）。')
                  if (!ok) return
                  await pullItemsFromCloud('jiameng_items')
                }}
                className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-3 rounded-lg transition-colors font-semibold"
                title="把雲端 app_data 的 jiameng_items 拉回本機（修復只剩彈幕）"
              >
                從雲端拉回道具
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const all = Array.isArray(getItems()) ? getItems() : []
                    const next = all.map((it) => {
                      const isShopEligible = it?.type !== ITEM_TYPES.TITLE && it?.type !== ITEM_TYPES.NAME_EFFECT && it?.type !== ITEM_TYPES.MESSAGE_EFFECT
                      if (!isShopEligible) return it
                      return { ...it, isHidden: false }
                    })
                    const r = setItems(next)
                    if (!r?.success) {
                      alert(r?.message || '更新失敗')
                      return
                    }
                    loadItems()
                    alert('已一鍵顯示所有可售道具（取消隱藏）')
                  } catch (e) {
                    console.warn('unhide all items failed', e)
                    alert('操作失敗')
                  }
                }}
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-3 rounded-lg transition-colors font-semibold"
                title="把商城可售的道具全部取消隱藏（一般用戶即可看見）"
              >
                一鍵顯示可售道具
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm('從雲端「備份」拉回道具？\n\n若雲端主清單已被覆蓋，此功能可能救回上一版（需要之前有備份資料）。')
                  if (!ok) return
                  await pullItemsFromCloud('jiameng_items_backup')
                }}
                className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-3 rounded-lg transition-colors font-semibold"
                title="從雲端 jiameng_items_backup 拉回（若主清單被覆蓋可嘗試救援）"
              >
                從雲端備份拉回
              </button>
              {items.length <= 1 && (
                <div className="text-sm text-yellow-300">
                  目前商城道具數量偏少，可能是被隱藏或同步被覆蓋。若另一台還有完整道具，請在那台按「重新同步道具到雲端」。
                </div>
              )}
              <div className="text-xs text-gray-400">
                本機：總道具 {itemsMeta.total}｜商城可售 {itemsMeta.shopEligible}｜已隱藏 {itemsMeta.hiddenInShop}｜不在商城販售（稱號/特效）{itemsMeta.nonShop}
                {cloudItemsInfo.loading ? '｜雲端：讀取中…' : (
                  cloudItemsInfo.count == null
                    ? (cloudItemsInfo.error ? `｜雲端：讀取失敗（${cloudItemsInfo.error}）` : '｜雲端：未知')
                    : `｜雲端（${cloudItemsInfo.sourceKey}）：${cloudItemsInfo.count}`
                )}
              </div>
            </div>
          </div>
        )}

        {/* 一般用戶：提示有隱藏道具 */}
        {userRole !== 'admin' && itemsMeta.hiddenInShop > 0 && (
          <div className="mb-4 text-sm text-gray-400">
            有 <span className="text-yellow-300 font-semibold">{itemsMeta.hiddenInShop}</span> 個道具已被管理員隱藏（商城不顯示，但背包已擁有仍可使用）。
          </div>
        )}

        {/* 道具列表（小網格、點擊預覽） */}
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 sm:gap-2">
          {items.map(item => {
            const fullCardEl = (
              <div
                key={item.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-5 sm:p-6 hover:border-yellow-400 transition-colors"
              >
                {/* 道具圖標和名稱 */}
                <div className="text-center mb-5 sm:mb-4">
                  <div className="text-7xl sm:text-6xl mb-3 sm:mb-2">{item.icon}</div>
                  <h3 className="text-2xl sm:text-xl font-bold text-white mb-2">{item.name}</h3>
                  {item.description && (
                    <p className="text-gray-400 text-base sm:text-sm mb-4 leading-relaxed">{item.description}</p>
                  )}
                </div>

                {/* 價格 */}
                <div className="mb-5 sm:mb-4 text-center">
                  <p className="text-gray-400 text-base sm:text-sm mb-2">兌換價格</p>
                  <p className="text-3xl sm:text-2xl font-bold text-yellow-400">{item.price || 0} 佳盟幣</p>
                </div>

                {/* 操作按鈕 */}
                <div className="flex gap-3 sm:gap-2">
                  {userRole === 'admin' ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const nextHidden = !item?.isHidden
                          const r = updateItem(item.id, { isHidden: nextHidden })
                          if (!r?.success) alert(r?.message || '更新失敗')
                          loadItems()
                        }}
                        className={`flex-1 px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px] ${
                          item?.isHidden ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
                        }`}
                        title={item?.isHidden ? '顯示此道具（一般用戶將可看見）' : '隱藏此道具（一般用戶將看不見）'}
                      >
                        {item?.isHidden ? '顯示' : '隱藏'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditItem(item)
                        }}
                        className="flex-1 bg-blue-600 text-white px-4 py-3 sm:py-2 rounded hover:bg-blue-700 transition-colors text-base sm:text-sm min-h-[44px]"
                      >
                        編輯
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteItem(item.id)
                        }}
                        className="flex-1 bg-red-600 text-white px-4 py-3 sm:py-2 rounded hover:bg-red-700 transition-colors text-base sm:text-sm min-h-[44px]"
                      >
                        刪除
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExchange(item)
                      }}
                      disabled={!currentUser || walletBalance < (item.price || 0)}
                      className="w-full bg-yellow-400 text-gray-900 px-4 py-3 sm:py-2 rounded hover:bg-yellow-500 transition-colors font-semibold disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-base sm:text-sm min-h-[44px]"
                    >
                      {!currentUser ? '請先登入' : walletBalance < (item.price || 0) ? '餘額不足' : '兌換'}
                    </button>
                  )}
                </div>
              </div>
            )

            return (
              <Fragment key={item.id}>
                {previewItemId === item.id && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 overflow-auto"
                    onClick={() => setPreviewItemId(null)}
                  >
                    <div
                      className="relative max-h-[90vh] w-full max-w-2xl my-auto rounded-lg overflow-y-auto overflow-x-hidden"
                      onClick={e => e.stopPropagation()}
                    >
                      {fullCardEl}
                      <button
                        type="button"
                        onClick={() => setPreviewItemId(null)}
                        className="absolute top-2 right-2 z-10 w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-lg"
                        aria-label="關閉預覽"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewItemId(item.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewItemId(item.id); } }}
                  className="relative rounded-lg overflow-hidden shadow-lg min-w-0 flex flex-col min-h-[100px] sm:min-h-[120px] border border-gray-600 hover:border-yellow-400 transition-colors cursor-pointer bg-gray-800"
                >
                  {userRole === 'admin' && item?.isHidden && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-gray-200">
                      已隱藏
                    </div>
                  )}
                  <div className="flex flex-col items-center justify-center gap-1 p-2 flex-1">
                    <div className="text-4xl sm:text-5xl">{item.icon}</div>
                    <p className="text-white font-semibold text-center text-xs sm:text-sm truncate w-full">{item.name}</p>
                    <p className="text-yellow-400 text-[10px] sm:text-xs font-bold">{item.price || 0} 幣</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">點擊預覽</p>
                  </div>
                  {userRole === 'admin' && (
                    <div className="absolute top-1 right-1" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const nextHidden = !item?.isHidden
                          const r = updateItem(item.id, { isHidden: nextHidden })
                          if (!r?.success) alert(r?.message || '更新失敗')
                          loadItems()
                        }}
                        className="w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 text-[10px] leading-none mr-1"
                        title={item?.isHidden ? '顯示' : '隱藏'}
                      >
                        {item?.isHidden ? '👁' : '🙈'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditItem(item)
                        }}
                        className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 text-[10px] leading-none"
                        title="編輯"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>

        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">尚無道具可兌換</p>
            {userRole === 'admin' && (
              <p className="text-sm mt-2">點擊「新增道具」開始添加</p>
            )}
          </div>
        )}

        {/* 新增/編輯道具表單（手機可捲動、縮小以點到完成） */}
        {showItemForm && userRole === 'admin' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto">
            <div className="bg-gray-800 rounded-t-xl sm:rounded-lg border border-yellow-400 w-full max-w-md max-h-[90vh] flex flex-col shadow-xl mt-auto sm:mt-0">
              <div className="flex justify-between items-center p-3 sm:p-4 border-b border-gray-600 shrink-0">
                <h2 className="text-base sm:text-xl font-bold text-yellow-400">
                  {editingItem ? '編輯道具' : '新增道具'}
                </h2>
                <button
                  onClick={() => setShowItemForm(false)}
                  className="text-gray-400 hover:text-white p-1"
                  aria-label="關閉"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 p-3 sm:p-6 space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">道具名稱 *</label>
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="請輸入道具名稱"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 sm:px-4 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">道具圖標 *</label>
                  <input
                    type="text"
                    value={itemForm.icon}
                    onChange={(e) => setItemForm({ ...itemForm, icon: e.target.value })}
                    placeholder="🎁"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 sm:px-4 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-xl sm:text-2xl text-center"
                    required
                  />
                  <p className="text-gray-500 text-xs mt-1 mb-1 sm:mb-2">輸入 emoji 或從下方選擇</p>
                  {/* 預設圖標選擇器（手機縮小） */}
                  <div className="bg-gray-700 rounded-lg p-2 sm:p-3">
                    <p className="text-gray-400 text-xs mb-1 sm:mb-2">快速選擇：</p>
                    <div className="grid grid-cols-6 gap-1 sm:gap-2">
                      {['🎫', '🎟️', '💳', '🃏', '🎴', '📇', '🎁', '🎀', '🏆', '⭐', '💎', '🔖', '📜', '🎪', '🎨', '🎯', '🎲', '🪙'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, icon: emoji })}
                          className={`text-xl sm:text-3xl p-1 sm:p-2 rounded hover:bg-gray-600 transition-colors ${
                            itemForm.icon === emoji ? 'bg-yellow-400/30 border-2 border-yellow-400' : 'border border-gray-600'
                          }`}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">道具描述</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    placeholder="請輸入道具描述"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 sm:px-4 sm:py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 text-sm"
                    rows="2"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">兌換價格（佳盟幣） *</label>
                  <input
                    type="number"
                    value={itemForm.price}
                    onChange={(e) => {
                      const v = e.target.value
                      setItemForm({ ...itemForm, price: v === '' ? '' : (parseFloat(v) || 0) })
                    }}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 sm:px-4 sm:py-2 text-white focus:outline-none focus:border-yellow-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">道具類型</label>
                  <select
                    value={itemForm.type}
                    onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 sm:px-4 sm:py-2 text-white focus:outline-none focus:border-yellow-400 text-sm"
                  >
                    <option value="general">一般道具</option>
                    <option value="danmu">彈幕道具</option>
                    <option value="special">特殊道具</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3 bg-gray-900/40 border border-gray-700 rounded-lg p-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">商城顯示</p>
                    <p className="text-gray-400 text-xs mt-0.5 break-words">
                      隱藏後一般用戶在兌換商城看不見，但若背包已擁有仍可正常使用。
                    </p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      checked={!itemForm.isHidden}
                      onChange={(e) => setItemForm({ ...itemForm, isHidden: !e.target.checked })}
                      className="w-5 h-5 text-yellow-400 bg-gray-700 border-gray-600 rounded focus:ring-yellow-400 focus:ring-2"
                    />
                    <span className="text-sm text-gray-200">{itemForm.isHidden ? '隱藏' : '顯示'}</span>
                  </label>
                </div>

                <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-4 pb-2 sm:pb-0 shrink-0 sticky bottom-0 bg-gray-800">
                  <button
                    onClick={handleSaveItem}
                    className="flex-1 bg-yellow-400 text-gray-900 px-3 py-2 sm:px-4 sm:py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-sm sm:text-base min-h-[44px] touch-manipulation"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setShowItemForm(false)}
                    className="flex-1 bg-gray-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded hover:bg-gray-700 transition-colors text-sm sm:text-base min-h-[44px] touch-manipulation"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExchangeShop
