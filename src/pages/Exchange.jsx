import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getItems, getItem, ITEM_TYPES } from '../utils/itemStorage'
import { getUserInventory, getItemQuantity, addItemToInventory, removeItemFromInventory } from '../utils/inventoryStorage'
import { getActiveTrades, createTrade, requestTrade, confirmTrade, rejectTrade, cancelBuyRequest, cancelTrade, getUserTrades, deleteTrade, getPendingTrades } from '../utils/tradeStorage'
import { getWalletBalance, subtractWalletBalance, addWalletBalance, addTransaction } from '../utils/walletStorage'
import { getUsers } from '../utils/storage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function Exchange() {
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  
  // 交易所狀態
  const [trades, setTrades] = useState([])
  const [pendingTrades, setPendingTrades] = useState([])
  const [showTradeForm, setShowTradeForm] = useState(false)
  const [tradeForm, setTradeForm] = useState({
    itemId: 'danmu_item',
    quantity: 1,
    price: 1,
    description: ''
  })
  const [myTrades, setMyTrades] = useState([])
  const [showMyTrades, setShowMyTrades] = useState(false)

  useEffect(() => {
    const user = getCurrentUser()
    const role = getCurrentUserRole()
    setCurrentUser(user || '')
    setUserRole(role)
    
    if (user) {
      const balance = getWalletBalance(user)
      setWalletBalance(balance)
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
    }
  }, [])

  // 定期更新錢包餘額
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        const balance = getWalletBalance(currentUser)
        setWalletBalance(balance)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [currentUser])
  
  // 定期更新待確認交易
  useEffect(() => {
    const interval = setInterval(() => {
      loadPendingTrades()
      loadTrades()
    }, 3000) // 每3秒更新一次
    return () => clearInterval(interval)
  }, [currentUser])

  // 交易所相關函數
  const loadTrades = () => {
    const activeTrades = getActiveTrades()
    setTrades(activeTrades)
  }
  
  const loadPendingTrades = () => {
    if (!currentUser) return
    const pending = getPendingTrades(currentUser)
    setPendingTrades(pending)
  }
  
  const loadMyTrades = () => {
    if (!currentUser) return
    const userTrades = getUserTrades(currentUser)
    setMyTrades(userTrades)
  }

  const refetchForRealtime = () => {
    loadTrades()
    loadPendingTrades()
    loadMyTrades()
    const u = getCurrentUser()
    if (u) setWalletBalance(getWalletBalance(u))
  }
  useRealtimeKeys(['jiameng_trades', 'jiameng_wallets'], refetchForRealtime)
  
  const handleCreateTrade = () => {
    if (!tradeForm.quantity || tradeForm.quantity <= 0) {
      alert('請輸入有效的數量')
      return
    }
    if (!tradeForm.price || tradeForm.price <= 0) {
      alert('請輸入有效的價格')
      return
    }
    
    // 檢查是否有足夠的道具
    const userQuantity = getItemQuantity(currentUser, tradeForm.itemId)
    if (userQuantity < tradeForm.quantity) {
      alert(`您只有 ${userQuantity} 個道具，無法出售 ${tradeForm.quantity} 個`)
      return
    }
    
    const item = getItem(tradeForm.itemId)
    if (!item) {
      alert('道具不存在')
      return
    }
    
    // 從背包移除道具（暫時保留，交易完成後轉移給買家）
    const removeResult = removeItemFromInventory(currentUser, tradeForm.itemId, tradeForm.quantity)
    if (!removeResult.success) {
      alert('創建交易失敗：' + removeResult.message)
      return
    }
    
    // 創建交易（固定使用佳盟幣）
    const result = createTrade({
      seller: currentUser,
      itemId: tradeForm.itemId,
      itemName: item.name,
      quantity: tradeForm.quantity,
      price: tradeForm.price,
      currency: 'jiameng_coin', // 固定使用佳盟幣
      description: tradeForm.description
    })
    
    if (result.success) {
      setTradeForm({ itemId: 'danmu_item', quantity: 1, price: 1, description: '' })
      setShowTradeForm(false)
      loadTrades()
      loadMyTrades()
      alert('交易創建成功！')
    } else {
      alert(result.message || '創建交易失敗')
      // 如果創建失敗，恢復道具
      addItemToInventory(currentUser, tradeForm.itemId, tradeForm.quantity)
    }
  }
  
  const handleBuyTrade = (trade) => {
    if (trade.seller === currentUser) {
      alert('不能購買自己的交易')
      return
    }
    
    if (trade.status === 'pending') {
      alert('此交易已有其他買家請求購買，請等待賣家確認')
      return
    }
    
    // 檢查買家是否有足夠的佳盟幣
    const buyerBalance = getWalletBalance(currentUser || '')
    if (buyerBalance < trade.price) {
      alert(`您只有 ${buyerBalance.toLocaleString()} 個佳盟幣，無法支付 ${trade.price.toLocaleString()} 個`)
      return
    }
    
    if (!window.confirm(`確定要請求購買 ${trade.itemName} x${trade.quantity}，價格：${trade.price.toLocaleString()} 個佳盟幣？\n\n點擊確認後，需要賣家確認才能完成交易。`)) {
      return
    }
    
    // 從買家扣除佳盟幣（暫時鎖定）
    const removeCurrencyResult = subtractWalletBalance(currentUser, trade.price)
    if (!removeCurrencyResult.success) {
      alert('請求購買失敗：' + removeCurrencyResult.message)
      return
    }
    
    // 請求購買（設置為待確認狀態）
    const result = requestTrade(trade.id, currentUser)
    if (result.success) {
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
      setWalletBalance(getWalletBalance(currentUser))
      alert('購買請求已發送！請等待賣家確認。')
    } else {
      alert(result.message || '請求購買失敗')
      // 如果請求失敗，恢復佳盟幣
      addWalletBalance(currentUser, trade.price)
    }
  }
  
  const handleConfirmTrade = (trade) => {
    if (!window.confirm(`確定要確認此交易？\n\n將轉移 ${trade.itemName} x${trade.quantity} 給 ${trade.pendingBuyer}\n獲得 ${trade.price.toLocaleString()} 個佳盟幣`)) {
      return
    }
    
    // 確認交易（完成交易並轉移物品）
    const result = confirmTrade(trade.id, currentUser)
    if (result.success) {
      // 給買家添加購買的道具
      addItemToInventory(trade.pendingBuyer, trade.itemId, trade.quantity)
      
      // 給賣家添加佳盟幣
      addWalletBalance(currentUser, trade.price)
      addTransaction({
        type: 'trade',
        from: trade.pendingBuyer,
        to: currentUser,
        amount: trade.price,
        description: `出售 ${trade.itemName} x${trade.quantity}`
      })
      
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
      setWalletBalance(getWalletBalance(currentUser))
      alert('交易確認成功！物品已轉移。')
    } else {
      alert(result.message || '確認交易失敗')
    }
  }
  
  const handleRejectTrade = (trade) => {
    if (!window.confirm(`確定要拒絕 ${trade.pendingBuyer} 的購買請求？\n\n買家的佳盟幣將被返還。`)) {
      return
    }
    
    // 返還買家的佳盟幣
    addWalletBalance(trade.pendingBuyer, trade.price)
    
    // 拒絕交易
    const result = rejectTrade(trade.id, currentUser)
    if (result.success) {
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
      alert('已拒絕購買請求，買家的佳盟幣已返還。')
    } else {
      alert(result.message || '拒絕交易失敗')
    }
  }
  
  const handleCancelBuyRequest = (trade) => {
    if (!window.confirm('確定要取消購買請求？您的佳盟幣將被返還。')) {
      return
    }
    
    // 返還佳盟幣
    addWalletBalance(currentUser, trade.price)
    
    // 取消購買請求
    const result = cancelBuyRequest(trade.id, currentUser)
    if (result.success) {
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
      setWalletBalance(getWalletBalance(currentUser))
      alert('購買請求已取消，佳盟幣已返還。')
    } else {
      alert(result.message || '取消請求失敗')
    }
  }
  
  const handleCancelTrade = (trade) => {
    if (trade.status === 'pending') {
      alert('此交易有待確認的購買請求，請先處理購買請求')
      return
    }
    
    if (!window.confirm('確定要取消此交易嗎？道具將返還到您的背包。')) {
      return
    }
    
    const result = cancelTrade(trade.id, currentUser)
    if (result.success) {
      // 返還道具
      addItemToInventory(currentUser, trade.itemId, trade.quantity)
      loadTrades()
      loadPendingTrades()
      loadMyTrades()
      alert('交易已取消，道具已返還')
    } else {
      alert(result.message || '取消失敗')
    }
  }
  
  const handleDeleteTrade = (tradeId) => {
    if (window.confirm('確定要刪除此交易記錄嗎？')) {
      const result = deleteTrade(tradeId)
      if (result.success) {
        loadTrades()
        loadMyTrades()
        alert('交易記錄已刪除')
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }
  
  const formatTradeDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 w-full" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-7xl mx-auto">
        {/* 標題區域 */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-blue-400 mb-2 flex items-center gap-2">
                <span>💱</span>
                <span>交易所</span>
              </h1>
              <p className="text-gray-400">用戶間道具交易平台</p>
            </div>
            {currentUser && (
              <div className="text-yellow-400 font-semibold flex items-center gap-2 text-xl">
                <span>💰</span>
                <span>佳盟幣: {walletBalance.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={() => setShowTradeForm(!showTradeForm)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded transition-colors"
          >
            {showTradeForm ? '取消' : '+ 發布交易'}
          </button>
          <button
            onClick={() => {
              setShowMyTrades(!showMyTrades)
              if (!showMyTrades) {
                loadMyTrades()
              }
            }}
            className="bg-purple-500 hover:bg-purple-600 text-white font-semibold px-4 py-2 rounded transition-colors"
          >
            {showMyTrades ? '隱藏' : '我的交易'}
          </button>
        </div>

        {/* 發布交易表單 */}
        {showTradeForm && (
          <div className="mb-6 p-6 bg-gray-800 rounded-lg border border-blue-400">
            <h4 className="text-white font-semibold mb-4 text-xl">發布新交易</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">出售道具</label>
                <select
                  value={tradeForm.itemId}
                  onChange={(e) => {
                    const item = getItem(e.target.value)
                    setTradeForm({ ...tradeForm, itemId: e.target.value, itemName: item?.name || '' })
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-400"
                >
                  {getItems()
                    .filter((item) => item.type !== ITEM_TYPES.TITLE && item.type !== ITEM_TYPES.NAME_EFFECT && item.type !== ITEM_TYPES.MESSAGE_EFFECT)
                    .map((item) => {
                      const quantity = getItemQuantity(currentUser, item.id)
                      if (quantity > 0) {
                        return (
                          <option key={item.id} value={item.id}>
                            {item.icon} {item.name} (擁有: {quantity})
                          </option>
                        )
                      }
                      return null
                    })}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">數量</label>
                <input
                  type="number"
                  min="1"
                  value={tradeForm.quantity}
                  onChange={(e) => setTradeForm({ ...tradeForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">價格（佳盟幣）</label>
                <input
                  type="number"
                  min="1"
                  value={tradeForm.price}
                  onChange={(e) => setTradeForm({ ...tradeForm, price: parseInt(e.target.value) || 1 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">描述（選填）</label>
                <textarea
                  value={tradeForm.description}
                  onChange={(e) => setTradeForm({ ...tradeForm, description: e.target.value })}
                  placeholder="輸入交易描述..."
                  rows="3"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <button
                onClick={handleCreateTrade}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded transition-colors"
              >
                發布交易
              </button>
            </div>
          </div>
        )}

        {/* 我的交易記錄 */}
        {showMyTrades && (
          <div className="mb-6 p-6 bg-gray-800 rounded-lg border border-purple-400">
            <h4 className="text-white font-semibold mb-4 text-xl">我的交易記錄</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {myTrades.length === 0 ? (
                <div className="text-gray-400 text-center py-4">尚無交易記錄</div>
              ) : (
                myTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className={`p-4 rounded-lg border ${
                      trade.status === 'completed' ? 'border-green-500 bg-green-900/20' :
                      trade.status === 'cancelled' ? 'border-gray-500 bg-gray-800' :
                      'border-blue-500 bg-blue-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-white font-semibold text-lg">
                            {getItem(trade.itemId)?.icon || '📦'} {trade.itemName} x{trade.quantity}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            trade.status === 'completed' ? 'bg-green-500 text-white' :
                            trade.status === 'cancelled' ? 'bg-gray-500 text-white' :
                            'bg-blue-500 text-white'
                          }`}>
                            {trade.status === 'completed' ? '已完成' :
                             trade.status === 'cancelled' ? '已取消' : '進行中'}
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm">
                          {trade.status === 'active' ? (
                            <>賣家: {trade.seller} · 價格: {trade.price.toLocaleString()} 佳盟幣</>
                          ) : trade.status === 'completed' ? (
                            <>買家: {trade.buyer} · 價格: {trade.price.toLocaleString()} 佳盟幣</>
                          ) : (
                            <>賣家: {trade.seller}</>
                          )}
                        </div>
                        {trade.description && (
                          <div className="text-gray-300 text-sm mt-2">{trade.description}</div>
                        )}
                        <div className="text-gray-500 text-xs mt-2">
                          {formatTradeDate(trade.createdAt)}
                          {trade.completedAt && ` · 完成於 ${formatTradeDate(trade.completedAt)}`}
                        </div>
                      </div>
                      {trade.status === 'active' && trade.seller === currentUser && (
                        <button
                          onClick={() => handleCancelTrade(trade)}
                          className="ml-4 text-red-400 hover:text-red-300 text-sm px-3 py-1 bg-red-500/20 rounded"
                        >
                          取消
                        </button>
                      )}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => handleDeleteTrade(trade.id)}
                          className="ml-2 text-red-400 hover:text-red-300 text-sm px-3 py-1 bg-red-500/20 rounded"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 待確認交易（賣家視角） */}
        {pendingTrades.length > 0 && (
          <div className="mb-6 p-6 bg-orange-900/30 rounded-lg border border-orange-500">
            <h4 className="text-orange-400 font-semibold mb-4 text-xl flex items-center gap-2">
              <span>⏳</span>
              <span>待確認的交易 ({pendingTrades.length})</span>
            </h4>
            <div className="space-y-3">
              {pendingTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="p-4 rounded-lg border border-orange-500 bg-orange-900/20"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-bold text-lg">
                          {getItem(trade.itemId)?.icon || '📦'} {trade.itemName} x{trade.quantity}
                        </span>
                        <span className="text-orange-400 text-xs px-2 py-1 rounded bg-orange-500/30">
                          待確認
                        </span>
                      </div>
                      <div className="text-yellow-400 text-sm mb-1">
                        買家: {trade.pendingBuyer}
                      </div>
                      <div className="text-blue-400 text-sm mb-1">
                        價格: {trade.price.toLocaleString()} 個佳盟幣
                      </div>
                      <div className="text-gray-400 text-xs">
                        請求時間: {formatTradeDate(trade.requestedAt || trade.createdAt)}
                      </div>
                    </div>
                    <div className="ml-4 flex gap-2">
                      <button
                        onClick={() => handleConfirmTrade(trade)}
                        className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded transition-colors"
                      >
                        確認
                      </button>
                      <button
                        onClick={() => handleRejectTrade(trade)}
                        className="bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded transition-colors"
                      >
                        拒絕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 活躍交易列表 */}
        <div className="space-y-4">
          <h4 className="text-white font-semibold text-xl">活躍交易</h4>
          {trades.filter(t => t.status === 'active').length === 0 ? (
            <div className="text-gray-400 text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-lg">尚無活躍交易</p>
              <p className="text-sm mt-2">點擊「發布交易」開始交易</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trades.filter(t => t.status === 'active').map((trade) => (
                <div
                  key={trade.id}
                  className="p-4 rounded-lg border border-blue-500 bg-blue-900/20 hover:bg-blue-900/30 transition-colors"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-4xl">{getItem(trade.itemId)?.icon || '📦'}</span>
                      <div className="flex-1">
                        <div className="text-white font-bold text-lg">
                          {trade.itemName}
                        </div>
                        <div className="text-yellow-400 font-semibold">x{trade.quantity}</div>
                      </div>
                    </div>
                    <div className="text-gray-300 text-sm mb-2">
                      賣家: <span className="text-yellow-400">{trade.seller}</span>
                    </div>
                    <div className="text-blue-400 font-semibold mb-2 text-lg">
                      價格: {trade.price.toLocaleString()} 個佳盟幣
                    </div>
                    {trade.description && (
                      <div className="text-gray-400 text-sm mb-2">{trade.description}</div>
                    )}
                    <div className="text-gray-500 text-xs mb-3">
                      發布時間: {formatTradeDate(trade.createdAt)}
                    </div>
                    <div className="mt-auto">
                      {trade.seller !== currentUser ? (
                        (() => {
                          const userBalance = getWalletBalance(currentUser || '')
                          const canBuy = userBalance >= trade.price && trade.status === 'active' && currentUser
                          const isDisabled = !currentUser || userBalance < trade.price || trade.status === 'pending' || trade.status !== 'active'
                          
                          return (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (canBuy) {
                                  handleBuyTrade(trade)
                                } else {
                                  if (!currentUser) {
                                    alert('請先登入')
                                  } else if (userBalance < trade.price) {
                                    alert(`您只有 ${userBalance.toLocaleString()} 個佳盟幣，需要 ${trade.price.toLocaleString()} 個`)
                                  } else if (trade.status === 'pending') {
                                    alert('此交易已有其他買家請求購買')
                                  }
                                }
                              }}
                              disabled={isDisabled}
                              className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
                                canBuy
                                  ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
                                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              {trade.status === 'pending' ? '待確認' : 
                               !currentUser ? '請登入' :
                               userBalance < trade.price ? `需要${trade.price.toLocaleString()}` : '購買'}
                            </button>
                          )
                        })()
                      ) : (
                        <span className="text-gray-400 text-sm">我的交易</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 顯示買家發起的待確認交易 */}
          {trades.filter(t => t.status === 'pending' && t.pendingBuyer === currentUser).length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h4 className="text-yellow-400 font-semibold mb-4 text-xl">我的購買請求</h4>
              <div className="space-y-3">
                {trades.filter(t => t.status === 'pending' && t.pendingBuyer === currentUser).map((trade) => (
                  <div
                    key={trade.id}
                    className="p-4 rounded-lg border border-yellow-500 bg-yellow-900/20"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-white font-semibold text-lg">
                            {getItem(trade.itemId)?.icon || '📦'} {trade.itemName} x{trade.quantity}
                          </span>
                          <span className="text-yellow-400 text-xs px-2 py-1 rounded bg-yellow-500/30">
                            等待賣家確認
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm">
                          賣家: {trade.seller} · 價格: {trade.price.toLocaleString()} 個佳盟幣
                        </div>
                        <div className="text-gray-500 text-xs mt-1">
                          請求時間: {formatTradeDate(trade.requestedAt || trade.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelBuyRequest(trade)}
                        className="ml-4 bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded transition-colors"
                      >
                        取消請求
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Exchange
