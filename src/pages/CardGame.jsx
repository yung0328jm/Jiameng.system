// 卡牌對戰：對戰、牌組、牌庫、商城、卡牌管理（管理員）
import { useState, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  getCardDefinitions,
  addCardDefinition,
  updateCardDefinition,
  deleteCardDefinition,
  getCardById,
  getCollection,
  addCardToCollection,
  getCardQuantity,
  getDecks,
  saveDeck,
  deleteDeck,
  getShopPacks,
  saveShopPack,
  deleteShopPack,
  getCardQuantity as getCollectionQty
} from '../utils/cardGameStorage.js'
import { getWalletBalance, subtractWalletBalance } from '../utils/walletStorage'
import { getPointsBalance, subtractPointsBalance } from '../utils/pointsStorage'
import { fetchCardShopDataFromSupabase } from '../utils/supabaseSync'
import CardBattle from './CardBattle'

const TAB_BATTLE = 'battle'
const TAB_DECKS = 'decks'
const TAB_COLLECTION = 'collection'
const TAB_SHOP = 'shop'
const TAB_ADMIN = 'admin'

function SingleCardShopItem({ card, currentUser, onBuy }) {
  const [qty, setQty] = useState(1)
  return (
    <div className="bg-gray-700 rounded-lg p-2 border border-gray-600 flex flex-col">
      {card.coverImage ? (
        <img src={card.coverImage} alt={card.name} className="w-full aspect-[3/4] object-cover rounded" />
      ) : (
        <div className="w-full aspect-[3/4] bg-gray-600 rounded flex items-center justify-center text-gray-400 text-xs">無圖</div>
      )}
      <div className="text-white text-sm font-medium truncate mt-1">{card.name}</div>
      {card.description ? (
        <p className="text-gray-400 text-xs mt-1 line-clamp-3 flex-1 min-h-[2.5rem]">{card.description}</p>
      ) : (
        <p className="text-gray-500 text-xs mt-1">—</p>
      )}
      <div className="flex items-center justify-between gap-1 mt-2 flex-wrap">
        <span className="text-yellow-400 text-xs">{card.price} {card.priceCurrency === 'coin' ? '佳盟幣' : '佳盟分'}/張</span>
        {currentUser && (
          <>
            <label className="flex items-center gap-1 text-xs text-gray-400">
              數量
              <input
                type="number"
                min={1}
                max={99}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                className="w-12 bg-gray-600 border border-gray-500 rounded px-1 py-0.5 text-white text-xs"
              />
            </label>
            <button type="button" onClick={() => onBuy(card, card.priceCurrency, qty)} className="text-xs bg-yellow-600 text-gray-900 px-2 py-1 rounded whitespace-nowrap">購買</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function CardGame({ onBack }) {
  const [currentUser, setCurrentUser] = useState('')
  const [userRole, setUserRole] = useState(null)
  const [tab, setTab] = useState(TAB_BATTLE)
  const [decks, setDecks] = useState([])
  const [collection, setCollection] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [shopPacks, setShopPacks] = useState([])
  const [battleDeckId, setBattleDeckId] = useState(null)
  const [battleStarted, setBattleStarted] = useState(false)
  const [collectionDetail, setCollectionDetail] = useState(null)
  useEffect(() => {
    if (!collectionDetail) return
    const onKey = (e) => { if (e.key === 'Escape') setCollectionDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collectionDetail])

  // 管理員：卡牌表單
  const [editingCardId, setEditingCardId] = useState(null)
  const [cardForm, setCardForm] = useState({
    name: '', type: 'minion', coverImage: '', description: '', attack: 0, hp: 0, skillText: '',
    cost: 0, canAttackHeroDirect: false, price: '', priceCurrency: 'coin'
  })

  useEffect(() => {
    setCurrentUser(getCurrentUser() || '')
    setUserRole(getCurrentUserRole())
  }, [])

  useEffect(() => {
    setDefinitions(getCardDefinitions())
    setShopPacks(getShopPacks())
    if (currentUser) {
      setDecks(getDecks(currentUser))
      setCollection(getCollection(currentUser))
    }
  }, [currentUser, tab])

  // 進入商城時從雲端補拉卡牌定義與卡包（一般用戶若初始 sync 未帶到這些 key 也能看到單卡與卡包）
  useEffect(() => {
    if (tab !== TAB_SHOP) return
    let cancelled = false
    fetchCardShopDataFromSupabase().then(() => {
      if (!cancelled) {
        setDefinitions(getCardDefinitions())
        setShopPacks(getShopPacks())
      }
    })
    return () => { cancelled = true }
  }, [tab])

  const refresh = () => {
    setDefinitions(getCardDefinitions())
    setShopPacks(getShopPacks())
    if (currentUser) {
      setDecks(getDecks(currentUser))
      setCollection(getCollection(currentUser))
    }
  }

  const handleSaveCard = () => {
    if (!cardForm.name.trim()) {
      alert('請輸入卡牌名稱')
      return
    }
    const payload = {
      ...cardForm,
      attack: Number(cardForm.attack) || 0,
      hp: Number(cardForm.hp) || 0,
      cost: Math.max(0, Number(cardForm.cost) ?? 0),
      price: cardForm.price === '' ? null : Number(cardForm.price)
    }
    if (editingCardId) {
      const res = updateCardDefinition(editingCardId, payload)
      if (res.success) {
        setEditingCardId(null)
        setCardForm({ name: '', type: 'minion', coverImage: '', description: '', attack: 0, hp: 0, skillText: '', cost: 0, canAttackHeroDirect: false, price: '', priceCurrency: 'coin' })
        refresh()
        alert('已更新')
      } else alert(res.message)
    } else {
      const res = addCardDefinition(payload)
      if (res.success) {
        setCardForm({ name: '', type: 'minion', coverImage: '', description: '', attack: 0, hp: 0, skillText: '', cost: 0, canAttackHeroDirect: false, price: '', priceCurrency: 'coin' })
        refresh()
        alert('已新增')
      } else alert(res.message)
    }
  }

  const handleDeleteCard = (id) => {
    if (!window.confirm('確定刪除此卡牌？')) return
    deleteCardDefinition(id)
    if (editingCardId === id) setEditingCardId(null)
    refresh()
  }

  const handleBuyCard = (card, currency, quantity = 1) => {
    if (!currentUser) {
      alert('請先登入')
      return
    }
    const qty = Math.max(1, Math.min(99, Number(quantity) || 1))
    const unitPrice = Number(card.price) || 0
    if (unitPrice <= 0) {
      alert('此卡牌未設定售價')
      return
    }
    const total = unitPrice * qty
    if (currency === 'coin') {
      const balance = getWalletBalance(currentUser)
      if (balance < total) {
        alert(`佳盟幣不足，需要 ${total}（單價 ${unitPrice} x ${qty}）`)
        return
      }
      const res = subtractWalletBalance(currentUser, total)
      if (res && res.success === false) {
        alert(res.message || '扣款失敗')
        return
      }
    } else {
      const balance = getPointsBalance(currentUser)
      if (balance < total) {
        alert(`佳盟分不足，需要 ${total}（單價 ${unitPrice} x ${qty}）`)
        return
      }
      const res = subtractPointsBalance(currentUser, total)
      if (res && res.success === false) {
        alert(res.message || '扣款失敗')
        return
      }
    }
    addCardToCollection(currentUser, card.id, qty)
    refresh()
    alert(`購買成功，獲得 ${qty} 張「${card.name}」`)
  }

  const handleBuyPack = (pack) => {
    if (!currentUser) {
      alert('請先登入')
      return
    }
    const pool = Array.isArray(pack.cardPool) ? pack.cardPool : []
    if (pool.length === 0) {
      alert('此卡包尚未設定卡池，請聯絡管理員')
      return
    }
    const price = Number(pack.price) || 0
    if (price <= 0) {
      alert('此卡包未設定售價')
      return
    }
    if (pack.currency === 'coin') {
      const balance = getWalletBalance(currentUser)
      if (balance < price) {
        alert(`佳盟幣不足，需要 ${price}`)
        return
      }
      const res = subtractWalletBalance(currentUser, price)
      if (res && res.success === false) {
        alert(res.message || '扣款失敗')
        return
      }
    } else {
      const balance = getPointsBalance(currentUser)
      if (balance < price) {
        alert(`佳盟分不足，需要 ${price}`)
        return
      }
      const res = subtractPointsBalance(currentUser, price)
      if (res && res.success === false) {
        alert(res.message || '扣款失敗')
        return
      }
    }
    const count = Math.min(pack.countPerPack || 1, pool.length)
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      const cardId = pool[idx]
      addCardToCollection(currentUser, cardId, 1)
    }
    refresh()
    alert(`已開啟卡包，獲得 ${count} 張卡`)
  }

  const startBattle = (deckId) => {
    setBattleDeckId(deckId)
    setBattleStarted(true)
  }

  if (battleStarted && battleDeckId && currentUser) {
    const deck = decks.find((d) => d.id === battleDeckId)
    if (deck) {
      return (
        <CardBattle
          playerDeck={deck}
          playerAccount={currentUser}
          onExit={() => { setBattleStarted(false); setBattleDeckId(null); refresh() }}
        />
      )
    }
  }

  const tabs = [
    { id: TAB_BATTLE, label: '對戰' },
    { id: TAB_DECKS, label: '牌組' },
    { id: TAB_COLLECTION, label: '牌庫' },
    { id: TAB_SHOP, label: '商城' }
  ]
  if (userRole === 'admin') tabs.push({ id: TAB_ADMIN, label: '卡牌管理' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-yellow-400">卡牌對戰</h2>
        {onBack && (
          <button type="button" onClick={onBack} className="text-gray-400 hover:text-white text-sm">返回</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-600 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded text-sm ${tab === t.id ? 'bg-yellow-500 text-gray-900 font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!currentUser && tab !== TAB_ADMIN && (
        <p className="text-gray-500 text-sm">請先登入後使用卡牌對戰。</p>
      )}

      {tab === TAB_BATTLE && currentUser && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">選擇牌組開始對戰（PvE 對電腦）</p>
          {decks.length === 0 ? (
            <p className="text-gray-500">尚無牌組，請先到「牌組」組牌（1 張英雄 + 50 張牌）。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {decks.map((d) => {
                const hero = getCardById(d.heroId)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => startBattle(d.id)}
                    className="p-3 bg-gray-700 rounded-lg border border-gray-600 text-left hover:border-yellow-500"
                  >
                    <div className="font-medium text-white">{d.name}</div>
                    <div className="text-xs text-gray-400">英雄：{hero ? hero.name : '-'} · 共 {d.cardIds.length} 張</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === TAB_DECKS && currentUser && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">每個牌組：1 張英雄卡 + 50 張小怪／效果卡。</p>
          <DeckList
            account={currentUser}
            decks={decks}
            definitions={definitions}
            collection={collection}
            onSave={refresh}
          />
        </div>
      )}

      {tab === TAB_COLLECTION && currentUser && (
        <div className="space-y-2">
          {collection.length === 0 ? (
            <p className="text-gray-500">牌庫為空，請到商城購買卡牌或卡包。</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {collection.map((e) => {
                const card = getCardById(e.cardId)
                if (!card) return null
                return (
                  <button
                    key={e.cardId}
                    type="button"
                    onClick={() => setCollectionDetail({ card, quantity: e.quantity })}
                    className="bg-gray-700 rounded-lg p-2 border border-gray-600 text-left hover:border-yellow-500 focus:outline-none focus:ring-1 ring-yellow-500"
                  >
                    {card.coverImage ? (
                      <img src={card.coverImage} alt={card.name} className="w-full aspect-[3/4] object-cover rounded" />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-gray-600 rounded flex items-center justify-center text-gray-400 text-xs">無圖</div>
                    )}
                    <div className="text-white text-sm font-medium truncate mt-1">{card.name}</div>
                    <div className="text-gray-400 text-xs">x{e.quantity} · 點擊查看</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {collectionDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setCollectionDetail(null)}
          onKeyDown={(e) => e.key === 'Escape' && setCollectionDetail(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-gray-800 rounded-xl border border-gray-600 shadow-xl max-w-sm w-full max-h-[90vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {collectionDetail.card.coverImage ? (
              <img src={collectionDetail.card.coverImage} alt={collectionDetail.card.name} className="w-full aspect-[3/4] object-cover rounded-lg" />
            ) : (
              <div className="w-full aspect-[3/4] bg-gray-600 rounded-lg flex items-center justify-center text-gray-400">無圖</div>
            )}
            <h3 className="text-white font-semibold text-lg mt-2">{collectionDetail.card.name}</h3>
            <p className="text-gray-400 text-sm mt-1">持有 x{collectionDetail.quantity}</p>
            <p className="text-amber-400 text-xs mt-1">{collectionDetail.card.type === 'hero' ? '英雄' : collectionDetail.card.type === 'minion' ? '小怪' : '效果'}</p>
            {(collectionDetail.card.attack != null || collectionDetail.card.hp != null) && (
              <p className="text-gray-300 text-sm mt-1">攻擊 {collectionDetail.card.attack ?? '-'} · 血量 {collectionDetail.card.hp ?? '-'}</p>
            )}
            {collectionDetail.card.skillText && (
              <p className="text-gray-300 text-sm mt-1">技能：{collectionDetail.card.skillText}</p>
            )}
            {collectionDetail.card.description && (
              <p className="text-gray-400 text-sm mt-2 whitespace-pre-wrap">{collectionDetail.card.description}</p>
            )}
            <button type="button" onClick={() => setCollectionDetail(null)} className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg text-sm">關閉</button>
          </div>
        </div>
      )}

      {tab === TAB_SHOP && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">單卡（有設定售價的卡牌）</p>
          {definitions.filter((c) => c.price != null && c.price > 0).length === 0 ? (
            <p className="text-gray-500 text-sm">尚無可購買的單卡；若管理員已新增卡牌並設定售價，請重新進入商城或重整頁面。</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {definitions.filter((c) => c.price != null && c.price > 0).map((card) => (
                <SingleCardShopItem key={card.id} card={card} currentUser={currentUser} onBuy={handleBuyCard} />
              ))}
            </div>
          )}
          <p className="text-gray-400 text-sm mt-4">卡包（抽獎包）</p>
          {shopPacks.length === 0 ? (
            <p className="text-gray-500 text-sm">尚無卡包，管理員可在「卡牌管理」新增卡包並設定封面。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shopPacks.map((pack) => (
                <div key={pack.id} className="bg-gray-700 rounded-xl border border-gray-600 overflow-hidden hover:border-purple-500 transition-colors">
                  <div className="aspect-[3/4] bg-gray-800 relative">
                    {pack.coverImage ? (
                      <img src={pack.coverImage} alt={pack.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                        <span className="text-4xl mb-2">🎴</span>
                        <span className="text-sm">管理員可設定卡包封面</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-white">{pack.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">隨機 {pack.countPerPack} 張 · {pack.price} {pack.currency === 'coin' ? '佳盟幣' : '佳盟分'}</div>
                    {currentUser && (
                      <button type="button" onClick={() => handleBuyPack(pack)} className="mt-2 w-full bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm font-medium">購買</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === TAB_ADMIN && (
        <div className="space-y-4">
          <h3 className="text-white font-semibold">卡牌定義</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
              <h4 className="text-amber-400 text-sm mb-2">{editingCardId ? '編輯卡牌' : '新增卡牌'}</h4>
              <div className="space-y-2 text-sm">
                <input type="text" placeholder="卡牌名稱" value={cardForm.name} onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                <select value={cardForm.type} onChange={(e) => setCardForm((f) => ({ ...f, type: e.target.value }))} className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white">
                  <option value="hero">英雄</option>
                  <option value="minion">小怪</option>
                  <option value="effect">效果</option>
                </select>
                <input type="text" placeholder="封面圖片 URL" value={cardForm.coverImage} onChange={(e) => setCardForm((f) => ({ ...f, coverImage: e.target.value }))} className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                <input type="text" placeholder="描述" value={cardForm.description} onChange={(e) => setCardForm((f) => ({ ...f, description: e.target.value }))} className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                <div className="flex gap-2">
                  <input type="number" placeholder="攻擊" value={cardForm.attack} onChange={(e) => setCardForm((f) => ({ ...f, attack: e.target.value }))} className="w-20 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                  <input type="number" placeholder="血量" value={cardForm.hp} onChange={(e) => setCardForm((f) => ({ ...f, hp: e.target.value }))} className="w-20 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                  <input type="number" min={0} placeholder="出場點數" value={cardForm.cost} onChange={(e) => setCardForm((f) => ({ ...f, cost: e.target.value }))} className="w-20 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" title="打出此牌需消耗的獻祭點數（每回合獻祭 1 張手牌得 1 點）" />
                </div>
                <label className="flex items-center gap-2 text-gray-300 text-sm">
                  <input type="checkbox" checked={cardForm.canAttackHeroDirect} onChange={(e) => setCardForm((f) => ({ ...f, canAttackHeroDirect: e.target.checked }))} className="rounded" />
                  特殊技能：場上有小怪時也可直擊英雄
                </label>
                <input type="text" placeholder="技能說明" value={cardForm.skillText} onChange={(e) => setCardForm((f) => ({ ...f, skillText: e.target.value }))} className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                <div className="flex gap-2 items-center">
                  <input type="number" placeholder="售價（留空不上架）" value={cardForm.price} onChange={(e) => setCardForm((f) => ({ ...f, price: e.target.value }))} className="flex-1 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white" />
                  <select value={cardForm.priceCurrency} onChange={(e) => setCardForm((f) => ({ ...f, priceCurrency: e.target.value }))} className="bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white">
                    <option value="coin">佳盟幣</option>
                    <option value="points">佳盟分</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleSaveCard} className="px-3 py-1.5 bg-yellow-500 text-gray-900 rounded text-sm font-semibold">保存</button>
                  {editingCardId && <button type="button" onClick={() => { setEditingCardId(null); setCardForm({ name: '', type: 'minion', coverImage: '', description: '', attack: 0, hp: 0, skillText: '', cost: 0, canAttackHeroDirect: false, price: '', priceCurrency: 'coin' }); }} className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm">取消</button>}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {definitions.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 bg-gray-700 rounded border border-gray-600">
                  {c.coverImage ? <img src={c.coverImage} alt="" className="w-10 h-14 object-cover rounded" /> : <div className="w-10 h-14 bg-gray-600 rounded" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{c.name}</div>
                    <div className="text-gray-400 text-xs">{c.type} · 攻{c.attack} 血{c.hp}</div>
                  </div>
                  <button type="button" onClick={() => { setEditingCardId(c.id); setCardForm({ name: c.name, type: c.type, coverImage: c.coverImage || '', description: c.description || '', attack: c.attack, hp: c.hp, skillText: c.skillText || '', cost: c.cost ?? 0, canAttackHeroDirect: !!c.canAttackHeroDirect, price: c.price != null ? c.price : '', priceCurrency: c.priceCurrency || 'coin' }); }} className="text-amber-400 text-xs">編輯</button>
                  <button type="button" onClick={() => handleDeleteCard(c.id)} className="text-red-400 text-xs">刪除</button>
                </div>
              ))}
            </div>
          </div>
          <h3 className="text-white font-semibold mt-6">卡包</h3>
          <ShopPackEditor packs={shopPacks} definitions={definitions} onSave={refresh} />
        </div>
      )}
    </div>
  )
}

function DeckList({ account, decks, definitions, collection, onSave }) {
  const [editingDeckId, setEditingDeckId] = useState(null)
  const [deckName, setDeckName] = useState('')
  const [selectedHeroId, setSelectedHeroId] = useState('')
  const [selectedCardIds, setSelectedCardIds] = useState([])
  const heroes = definitions.filter((c) => c.type === 'hero')
  const others = definitions.filter((c) => c.type !== 'hero')

  const startEdit = (deck) => {
    setEditingDeckId(deck.id)
    setDeckName(deck.name)
    setSelectedHeroId(deck.heroId || '')
    setSelectedCardIds(deck.cardIds ? [...deck.cardIds] : [])
  }

  const addToDeck = (cardId) => {
    const qty = getCollectionQty(account, cardId)
    const current = selectedCardIds.filter((id) => id === cardId).length
    if (current >= qty) return
    if (selectedCardIds.length >= 50) return
    setSelectedCardIds((ids) => [...ids, cardId])
  }

  const removeFromDeck = (index) => {
    setSelectedCardIds((ids) => ids.filter((_, i) => i !== index))
  }

  const save = () => {
    if (!deckName.trim()) { alert('請輸入牌組名稱'); return }
    if (!selectedHeroId) { alert('請選擇 1 張英雄'); return }
    if (selectedCardIds.length !== 50) { alert('請剛好選擇 50 張牌'); return }
    const deck = {
      id: editingDeckId === 'new' ? undefined : editingDeckId,
      name: deckName.trim(),
      heroId: selectedHeroId,
      cardIds: selectedCardIds
    }
    saveDeck(account, deck)
    setEditingDeckId(null)
    onSave()
  }

  return (
    <div className="space-y-3">
      {editingDeckId === null ? (
        <>
          {decks.map((d) => (
            <div key={d.id} className="flex justify-between items-center p-3 bg-gray-700 rounded border border-gray-600">
              <span className="text-white">{d.name}</span>
              <button type="button" onClick={() => startEdit(d)} className="text-amber-400 text-sm">編輯</button>
            </div>
          ))}
          <button type="button" onClick={() => { setEditingDeckId('new'); setDeckName(''); setSelectedHeroId(''); setSelectedCardIds([]); }} className="px-3 py-2 bg-gray-700 border border-dashed border-gray-500 rounded text-gray-400 text-sm">+ 新增牌組</button>
        </>
      ) : (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-600 space-y-3">
          <input type="text" placeholder="牌組名稱" value={deckName} onChange={(e) => setDeckName(e.target.value)} className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white" />
          <button type="button" onClick={() => setEditingDeckId(null)} className="text-gray-400 text-sm">← 返回牌組列表</button>
          <div>
            <label className="text-gray-400 text-xs block mb-1">英雄（1 張）</label>
            <select value={selectedHeroId} onChange={(e) => setSelectedHeroId(e.target.value)} className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white">
              <option value="">請選擇</option>
              {heroes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}（HP{c.hp}）</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">小怪／效果卡（已選 {selectedCardIds.length}/50）</label>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-auto p-2 bg-gray-900 rounded">
              {selectedCardIds.map((id, i) => {
                const card = getCardById(id)
                return (
                  <span key={`${id}-${i}`} className="inline-flex items-center gap-0.5 bg-gray-600 rounded px-1.5 py-0.5 text-xs text-white">
                    {card ? card.name : id}
                    <button type="button" onClick={() => removeFromDeck(i)} className="text-red-400">×</button>
                  </span>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {others.map((c) => {
                const inDeck = selectedCardIds.filter((id) => id === c.id).length
                const owned = getCollectionQty(account, c.id)
                const canAdd = inDeck < owned && selectedCardIds.length < 50
                return (
                  <button key={c.id} type="button" onClick={() => canAdd && addToDeck(c.id)} disabled={!canAdd} className={`px-2 py-1 rounded text-xs ${canAdd ? 'bg-gray-600 text-white hover:bg-gray-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    {c.name} x{inDeck}/{owned}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-3 py-1.5 bg-yellow-500 text-gray-900 rounded text-sm font-semibold">保存牌組</button>
            <button type="button" onClick={() => setEditingDeckId(null)} className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShopPackEditor({ packs, definitions, onSave }) {
  const [editingPackId, setEditingPackId] = useState(null)
  const [name, setName] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [price, setPrice] = useState(0)
  const [currency, setCurrency] = useState('coin')
  const [countPerPack, setCountPerPack] = useState(1)
  const [cardPool, setCardPool] = useState([])
  const addToPool = (cardId) => {
    if (!cardPool.includes(cardId)) setCardPool((p) => [...p, cardId])
  }
  const removeFromPool = (cardId) => setCardPool((p) => p.filter((id) => id !== cardId))
  const startEdit = (pack) => {
    setEditingPackId(pack.id)
    setName(pack.name || '')
    setCoverImage(pack.coverImage || '')
    setPrice(pack.price || 0)
    setCurrency(pack.currency || 'coin')
    setCountPerPack(pack.countPerPack ?? 1)
    setCardPool(Array.isArray(pack.cardPool) ? [...pack.cardPool] : [])
  }
  const cancelEdit = () => {
    setEditingPackId(null)
    setName('')
    setCoverImage('')
    setPrice(0)
    setCardPool([])
    setCountPerPack(1)
  }
  const handleSave = () => {
    if (!name.trim()) { alert('請輸入卡包名稱'); return }
    if (cardPool.length === 0) { alert('請至少加入一張卡到卡池'); return }
    saveShopPack({
      id: editingPackId || undefined,
      name: name.trim(),
      coverImage: coverImage.trim(),
      price: Number(price) || 0,
      currency,
      cardPool,
      countPerPack: Math.max(1, Math.min(10, countPerPack))
    })
    cancelEdit()
    onSave()
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-end">
        <input type="text" placeholder="卡包名稱" value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm" />
        <input type="text" placeholder="卡包封面圖片 URL（吸引客戶）" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className="flex-1 min-w-[180px] bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm" />
        <input type="number" placeholder="售價" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-20 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm">
          <option value="coin">佳盟幣</option>
          <option value="points">佳盟分</option>
        </select>
        <input type="number" min={1} max={10} placeholder="每包張數" value={countPerPack} onChange={(e) => setCountPerPack(Number(e.target.value))} className="w-16 bg-gray-700 border border-gray-500 rounded px-2 py-1.5 text-white text-sm" />
        <button type="button" onClick={handleSave} className="px-3 py-1.5 bg-yellow-500 text-gray-900 rounded text-sm font-semibold">{editingPackId ? '儲存' : '新增卡包'}</button>
        {editingPackId && <button type="button" onClick={cancelEdit} className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm">取消</button>}
      </div>
      {coverImage && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">封面預覽：</span>
          <img src={coverImage} alt="封面" className="h-16 w-auto object-contain rounded border border-gray-600" onError={(e) => { e.target.style.display = 'none' }} />
        </div>
      )}
      <p className="text-gray-500 text-xs">卡池（隨機從中抽）：</p>
      <div className="flex flex-wrap gap-1">
        {definitions.map((c) => (
          <button key={c.id} type="button" onClick={() => cardPool.includes(c.id) ? removeFromPool(c.id) : addToPool(c.id)} className={`px-2 py-0.5 rounded text-xs ${cardPool.includes(c.id) ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <p className="text-gray-500 text-xs mt-2">已建立的卡包（可點編輯設定封面）：</p>
      {packs.map((p) => (
        <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-700 rounded border border-gray-600">
          {p.coverImage ? <img src={p.coverImage} alt="" className="h-10 w-14 object-cover rounded" /> : <div className="h-10 w-14 bg-gray-600 rounded flex items-center justify-center text-gray-500 text-xs">無封面</div>}
          <span className="text-white text-sm flex-1">{p.name} · {p.price} {p.currency === 'coin' ? '幣' : '分'} · 抽{p.countPerPack}張</span>
          <button type="button" onClick={() => startEdit(p)} className="text-amber-400 text-xs">編輯</button>
          <button type="button" onClick={() => { if (window.confirm('確定刪除此卡包？')) { deleteShopPack(p.id); onSave(); } }} className="text-red-400 text-xs">刪除</button>
        </div>
      ))}
    </div>
  )
}
