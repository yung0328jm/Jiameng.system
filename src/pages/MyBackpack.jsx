import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUserInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getItems, ITEM_TYPES, SHOP_CAT_LIVE, SHOP_CAT_PLANT, SHOP_CAT_SAND, SHOP_CAT_DECOR, SHOP_CAT_LIGHT, aquariumShopCategory } from '../utils/itemStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { createExchangeRequest, getUserExchangeRequests } from '../utils/exchangeRequestStorage'
import { getEquippedEffects, equipEffect, unequipEffect } from '../utils/effectStorage'
import { migrateOwned } from '../utils/petStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { shopItemArtSrc } from '../utils/tankDecorArt'

function MyBackpack() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [inventory, setInventory] = useState([])
  const [items, setItems] = useState([])
  const [showExchangeConfirm, setShowExchangeConfirm] = useState(false)
  const [selectedItemForExchange, setSelectedItemForExchange] = useState(null)
  const [exchangeRequests, setExchangeRequests] = useState([])
  const [equippedEffects, setEquippedEffects] = useState({})
  const [previewItemId, setPreviewItemId] = useState(null) // 點擊預覽時顯示的道具 id
  const [packFilter, setPackFilter] = useState('all')

  const refetchBackpack = () => {
    const user = getCurrentUser()
    if (user) {
      migrateOwned(user)
      const userInventory = getUserInventory(user)
      const allItems = getItems()
      const inventoryWithDetails = userInventory.map(inv => {
        const item = allItems.find(i => i.id === inv.itemId)
        return {
          ...inv,
          item: item || null,
          name: item ? item.name : '未知道具',
          icon: item ? item.icon : '❓',
          image: item ? (item.image || item.imageUrl || '') : '',
          description: item ? item.description : ''
        }
      })
      setInventory(inventoryWithDetails)
      setExchangeRequests(getUserExchangeRequests(user))
      setEquippedEffects(getEquippedEffects(user))
    }
    setItems(getItems())
  }

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    
    if (user) {
      loadInventory()
      loadExchangeRequests()
      loadEquippedEffects()
    }
    
    const allItems = getItems()
    setItems(allItems)
  }, [])

  useRealtimeKeys(['jiameng_inventories', 'jiameng_items', 'jiameng_exchange_requests', 'jiameng_equipped_effects', 'jiameng_pets'], refetchBackpack)

  const loadInventory = () => {
    const user = getCurrentUser() || currentUser
    if (!user) return
    migrateOwned(user)
    
    const userInventory = getUserInventory(user)
    const allItems = getItems()
    
    // 將背包中的道具與道具定義合併
    const inventoryWithDetails = userInventory.map(inv => {
      const item = allItems.find(i => i.id === inv.itemId)
      return {
        ...inv,
        item: item || null,
        name: item ? item.name : '未知道具',
        icon: item ? item.icon : '❓',
        description: item ? item.description : ''
      }
    })
    
    setInventory(inventoryWithDetails)
  }

  useEffect(() => {
    if (currentUser) {
      loadInventory()
      loadExchangeRequests()
      loadEquippedEffects()
    }
  }, [currentUser])

  // 定期更新兌換請求狀態
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        loadExchangeRequests()
      }, 3000) // 每3秒更新一次
      return () => clearInterval(interval)
    }
  }, [currentUser])

  const loadExchangeRequests = () => {
    if (!currentUser) return
    const requests = getUserExchangeRequests(currentUser)
    setExchangeRequests(requests)
  }

  const loadEquippedEffects = () => {
    if (!currentUser) return
    const effects = getEquippedEffects(currentUser)
    setEquippedEffects(effects)
  }

  const handleEquipEffect = (itemId, effectType) => {
    if (!currentUser) return
    
    const result = equipEffect(currentUser, itemId, effectType)
    if (result.success) {
      loadEquippedEffects()
      alert('裝備成功！')
    } else {
      alert(result.message || '裝備失敗')
    }
  }

  const handleUnequipEffect = (effectType) => {
    if (!currentUser) return
    
    const result = unequipEffect(currentUser, effectType)
    if (result.success) {
      loadEquippedEffects()
      alert('卸下成功！')
    } else {
      alert(result.message || '卸下失敗')
    }
  }

  const handleRemoveItem = (itemId, itemName) => {
    if (!currentUser) return
    
    if (window.confirm(`確定要刪除「${itemName}」嗎？此操作無法復原。`)) {
      const result = removeItemFromInventory(currentUser, itemId, 1)
      if (result.success) {
        loadInventory()
        alert('刪除成功！')
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }

  // 檢查道具是否有待處理的兌換請求
  const hasPendingExchangeRequest = (itemId) => {
    return exchangeRequests.some(
      req => req.itemId === itemId && req.status === 'pending'
    )
  }

  const handleExchangeItem = (invItem) => {
    if (!currentUser) {
      alert('請先登入')
      return
    }

    setSelectedItemForExchange(invItem)
    setShowExchangeConfirm(true)
  }

  const confirmExchange = () => {
    if (!selectedItemForExchange) return

    const result = createExchangeRequest({
      username: currentUser,
      itemId: selectedItemForExchange.itemId,
      itemName: selectedItemForExchange.name,
      itemIcon: selectedItemForExchange.icon,
      quantity: 1,
      description: `兌換道具：${selectedItemForExchange.name}`
    })

    if (result.success) {
      alert('兌換請求已提交，等待管理員確認')
      setShowExchangeConfirm(false)
      setSelectedItemForExchange(null)
      // 重新載入兌換請求以更新按鈕狀態
      loadExchangeRequests()
    } else {
      alert(result.message || '提交兌換請求失敗')
    }
  }


  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">請先登入以查看您的背包</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-7xl mx-auto">
        {/* 標題區域 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-yellow-400 mb-2">我的背包</h1>
          <p className="text-gray-400">查看和管理您的虛擬道具</p>
        </div>

        {/* 背包統計 */}
        <div className="mb-6 bg-purple-400/20 border border-purple-400 rounded-lg p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-gray-400 text-base sm:text-sm mb-1">道具總數</p>
              <p className="text-4xl sm:text-3xl font-bold text-purple-400">
                {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-gray-400 text-base sm:text-sm mb-1">道具種類</p>
              <p className="text-4xl sm:text-3xl font-bold text-purple-400">{inventory.length}</p>
            </div>
            <div className="text-5xl sm:text-4xl">🎒</div>
          </div>
        </div>

        {inventory.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { key: 'all', label: '全部' },
              { key: SHOP_CAT_LIVE, label: '活體' },
              { key: SHOP_CAT_PLANT, label: '植物類' },
              { key: SHOP_CAT_SAND, label: '底沙類' },
              { key: SHOP_CAT_DECOR, label: '擺件' },
              { key: SHOP_CAT_LIGHT, label: '燈具' }
            ].map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setPackFilter(row.key)}
                className={`min-h-[40px] px-3 py-1.5 rounded-full text-sm font-semibold border ${
                  packFilter === row.key
                    ? 'bg-purple-400 text-gray-900 border-purple-300'
                    : 'bg-gray-800 text-gray-200 border-gray-600'
                }`}
              >
                {row.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* 道具列表 */}
        {inventory.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <div className="text-6xl mb-4">🎒</div>
            <p className="text-gray-400 text-lg mb-2">背包為空</p>
            <p className="text-gray-500 text-sm">前往兌換商城購買道具吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 sm:gap-2">
            {inventory.filter((raw) => {
              if (packFilter === 'all') return true
              const cat = aquariumShopCategory(raw.item) || String(raw.item?.category || '').trim()
              return cat === packFilter
            }).map((raw) => {
              const invItem = { ...raw, displayKey: raw.itemId, displayName: raw.name, isFishCard: false }
              const fullCardEl = (
                <div
                  className="bg-gray-800 border border-gray-700 rounded-lg p-5 sm:p-6 hover:border-purple-400 transition-colors"
                >
                  {/* 道具圖標和名稱 */}
                  <div className="text-center mb-5 sm:mb-4">
                    {shopItemArtSrc(invItem.item || invItem) ? (
                      <div className={(invItem.item?.type === ITEM_TYPES.TANK_DECOR) ? 'mx-auto mb-3 sm:mb-2 w-full rounded-lg bg-[#0b2233] flex items-center justify-center p-4 min-h-[220px]' : ''}>
                        <img
                          src={shopItemArtSrc(invItem.item || invItem)}
                          alt=""
                          className={(invItem.item?.type === ITEM_TYPES.TANK_DECOR)
                            ? 'max-h-[52vh] w-auto max-w-full object-contain'
                            : 'mx-auto mb-3 sm:mb-2 h-20 w-auto object-contain'}
                        />
                      </div>
                    ) : (
                      <div className="text-7xl sm:text-6xl mb-3 sm:mb-2">{invItem.icon}</div>
                    )}
                    <h3 className="text-2xl sm:text-xl font-bold text-white mb-2">{invItem.displayName || invItem.name}</h3>
                    {invItem.fishName ? (
                      <p className="text-cyan-300 text-sm mb-2">{invItem.name}</p>
                    ) : null}
                    {invItem.description && (
                      <p className="text-gray-400 text-base sm:text-sm mb-4 leading-relaxed">{invItem.description}</p>
                    )}
                  </div>

                  {!invItem.isFishCard && (
                  <div className="mb-5 sm:mb-4 text-center">
                    <p className="text-gray-400 text-base sm:text-sm mb-2">擁有數量</p>
                    <p className="text-3xl sm:text-2xl font-bold text-purple-400">{invItem.quantity || 0}</p>
                  </div>
                  )}

                  {/* 獲得時間 */}
                  {invItem.obtainedAt && (
                    <div className="mb-5 sm:mb-4 text-center">
                      <p className="text-gray-500 text-sm sm:text-xs">
                        獲得時間：{new Date(invItem.obtainedAt).toLocaleDateString('zh-TW')}
                      </p>
                    </div>
                  )}

                  {/* 操作按鈕 */}
                  <div className="w-full">
                    {invItem.item && invItem.item.type === ITEM_TYPES.DANMU ? (
                      <div className="w-full bg-gray-700 text-gray-400 px-4 py-3 sm:py-2 rounded text-center text-base sm:text-sm">
                        交流區使用
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.NAME_EFFECT ? (
                      <div className="space-y-3 sm:space-y-2">
                        {equippedEffects.nameEffect === invItem.itemId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnequipEffect('name')
                            }}
                            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            卸下名子特效
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEquipEffect(invItem.itemId, 'name')
                            }}
                            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            裝備名子特效
                          </button>
                        )}
                        <div className="w-full bg-gray-700 text-gray-500 px-4 py-2 rounded text-center text-sm sm:text-xs">特殊道具，不可刪除、不可交易</div>
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.MESSAGE_EFFECT ? (
                      <div className="space-y-3 sm:space-y-2">
                        {equippedEffects.messageEffect === invItem.itemId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnequipEffect('message')
                            }}
                            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            卸下發話特效
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEquipEffect(invItem.itemId, 'message')
                            }}
                            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            裝備發話特效
                          </button>
                        )}
                        <div className="w-full bg-gray-700 text-gray-500 px-4 py-2 rounded text-center text-sm sm:text-xs">特殊道具，不可刪除、不可交易</div>
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.TITLE ? (
                      <div className="space-y-3 sm:space-y-2">
                        {equippedEffects.title === invItem.itemId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnequipEffect('title')
                            }}
                            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            卸下稱號
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEquipEffect(invItem.itemId, 'title')
                            }}
                            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                          >
                            裝備稱號
                          </button>
                        )}
                        <div className="w-full bg-gray-700 text-gray-500 px-4 py-2 rounded text-center text-sm sm:text-xs">特殊道具，不可刪除、不可交易</div>
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.FISH_SKIN ? (
                      <div className="w-full bg-gray-700 text-cyan-100 px-4 py-3 sm:py-2 rounded text-center text-base sm:text-sm leading-relaxed">
                        魚已改放「我的寵物」，背包無法套用。請到我的寵物點放入魚缸。
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.FISH_POTION ? (
                      <div className="w-full bg-gray-700 text-cyan-100 px-4 py-3 sm:py-2 rounded text-center text-base sm:text-sm leading-relaxed">
                        點自己的魚使用。紅蟲、成長／變性藥水公母都能用；其餘藥水只限已配對的母魚。紅蟲每隻每天最多 2 次。
                      </div>
                    ) : invItem.item && invItem.item.type === ITEM_TYPES.FISH_SLOT ? (
                      <div className="w-full bg-gray-700 text-gray-400 px-4 py-3 sm:py-2 rounded text-center text-base sm:text-sm leading-relaxed">
                        魚隻擴充已停用。寵物欄固定 50 隻，有魚即可放入魚缸。
                      </div>
                    ) : invItem.item && (invItem.item.type === ITEM_TYPES.TANK_LIGHT || invItem.item.type === ITEM_TYPES.TANK_DECOR) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewItemId(null)
                          navigate('/my-tank', { state: { tankEdit: true, editItemId: invItem.itemId } })
                        }}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                      >
                        放入魚缸
                      </button>
                    ) : hasPendingExchangeRequest(invItem.itemId) ? (
                      <button
                        disabled
                        className="w-full bg-gray-600 text-gray-400 px-4 py-3 sm:py-2 rounded cursor-not-allowed font-semibold text-base sm:text-sm min-h-[44px]"
                      >
                        確認兌換中
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExchangeItem(invItem)
                        }}
                        className="w-full bg-yellow-400 text-gray-900 px-4 py-3 sm:py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-base sm:text-sm min-h-[44px]"
                      >
                        兌換
                      </button>
                    )}
                  </div>
                </div>
              )

              return (
                <Fragment key={invItem.displayKey}>
                  {previewItemId === invItem.displayKey && (
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
                    onClick={() => setPreviewItemId(invItem.displayKey)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewItemId(invItem.displayKey); } }}
                    className="relative rounded-lg overflow-hidden shadow-lg min-w-0 flex flex-col min-h-[100px] sm:min-h-[120px] border border-gray-600 hover:border-purple-400 transition-colors cursor-pointer bg-gray-800"
                  >
                    <div className="flex flex-col items-center justify-center gap-1 p-2 flex-1">
                      {shopItemArtSrc(invItem.item || invItem) ? (
                        <img src={shopItemArtSrc(invItem.item || invItem)} alt="" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
                      ) : (
                        <div className="text-4xl sm:text-5xl">{invItem.icon}</div>
                      )}
                      <p className="text-white font-semibold text-center text-xs sm:text-sm truncate w-full">{invItem.displayName || invItem.name}</p>
                      {invItem.fishName ? (
                        <p className="text-cyan-300/80 text-[10px] truncate w-full text-center">{invItem.name}</p>
                      ) : null}
                      <p className="text-purple-400 text-[10px] sm:text-xs font-bold">{invItem.quantity || 0} 個</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">點擊預覽</p>
                    </div>
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}

        {/* 兌換確認對話框 */}
        {showExchangeConfirm && selectedItemForExchange && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 border border-yellow-400 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-yellow-400">確認兌換</h2>
                <button
                  onClick={() => {
                    setShowExchangeConfirm(false)
                    setSelectedItemForExchange(null)
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-6xl mb-4">{selectedItemForExchange.icon}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{selectedItemForExchange.name}</h3>
                  {selectedItemForExchange.description && (
                    <p className="text-gray-400 text-sm mb-4">{selectedItemForExchange.description}</p>
                  )}
                </div>

                <div className="bg-yellow-400/20 border border-yellow-400 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm text-center">
                    提交兌換請求後，需要管理員確認。確認後道具將從背包中移除。
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={confirmExchange}
                    className="flex-1 bg-yellow-400 text-gray-900 px-4 py-2 rounded hover:bg-yellow-500 transition-colors font-semibold"
                  >
                    確認兌換
                  </button>
                  <button
                    onClick={() => {
                      setShowExchangeConfirm(false)
                      setSelectedItemForExchange(null)
                    }}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
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

export default MyBackpack
