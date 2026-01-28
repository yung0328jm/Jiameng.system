import { useState, useEffect } from 'react'
import { getUserInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getItems, getItem, ITEM_TYPES } from '../utils/itemStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { createExchangeRequest, getUserExchangeRequests } from '../utils/exchangeRequestStorage'
import { getEquippedEffects, equipEffect, unequipEffect } from '../utils/effectStorage'

function MyBackpack() {
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [inventory, setInventory] = useState([])
  const [items, setItems] = useState([])
  const [showExchangeConfirm, setShowExchangeConfirm] = useState(false)
  const [selectedItemForExchange, setSelectedItemForExchange] = useState(null)
  const [exchangeRequests, setExchangeRequests] = useState([])
  const [equippedEffects, setEquippedEffects] = useState({})

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
    
    // 載入所有道具定義
    const allItems = getItems()
    setItems(allItems)
  }, [])

  const loadInventory = () => {
    if (!currentUser) return
    
    const userInventory = getUserInventory(currentUser)
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

        {/* 道具列表 */}
        {inventory.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <div className="text-6xl mb-4">🎒</div>
            <p className="text-gray-400 text-lg mb-2">背包為空</p>
            <p className="text-gray-500 text-sm">前往兌換商城購買道具吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {inventory.map((invItem) => (
              <div
                key={invItem.itemId}
                className="bg-gray-800 border border-gray-700 rounded-lg p-5 sm:p-6 hover:border-purple-400 transition-colors"
              >
                {/* 道具圖標和名稱 */}
                <div className="text-center mb-5 sm:mb-4">
                  <div className="text-7xl sm:text-6xl mb-3 sm:mb-2">{invItem.icon}</div>
                  <h3 className="text-2xl sm:text-xl font-bold text-white mb-2">{invItem.name}</h3>
                  {invItem.description && (
                    <p className="text-gray-400 text-base sm:text-sm mb-4 leading-relaxed">{invItem.description}</p>
                  )}
                </div>

                {/* 數量 */}
                <div className="mb-5 sm:mb-4 text-center">
                  <p className="text-gray-400 text-base sm:text-sm mb-2">擁有數量</p>
                  <p className="text-3xl sm:text-2xl font-bold text-purple-400">{invItem.quantity || 0}</p>
                </div>

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
                          onClick={() => handleUnequipEffect('name')}
                          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                        >
                          卸下名子特效
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEquipEffect(invItem.itemId, 'name')}
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
                          onClick={() => handleUnequipEffect('message')}
                          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                        >
                          卸下發話特效
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEquipEffect(invItem.itemId, 'message')}
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
                          onClick={() => handleUnequipEffect('title')}
                          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                        >
                          卸下稱號
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEquipEffect(invItem.itemId, 'title')}
                          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold px-4 py-3 sm:py-2 rounded transition-colors text-base sm:text-sm min-h-[44px]"
                        >
                          裝備稱號
                        </button>
                      )}
                      <div className="w-full bg-gray-700 text-gray-500 px-4 py-2 rounded text-center text-sm sm:text-xs">特殊道具，不可刪除、不可交易</div>
                    </div>
                  ) : hasPendingExchangeRequest(invItem.itemId) ? (
                    <button
                      disabled
                      className="w-full bg-gray-600 text-gray-400 px-4 py-3 sm:py-2 rounded cursor-not-allowed font-semibold text-base sm:text-sm min-h-[44px]"
                    >
                      確認兌換中
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExchangeItem(invItem)}
                      className="w-full bg-yellow-400 text-gray-900 px-4 py-3 sm:py-2 rounded hover:bg-yellow-500 transition-colors font-semibold text-base sm:text-sm min-h-[44px]"
                    >
                      兌換
                    </button>
                  )}
                </div>
              </div>
            ))}
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
