// 卡牌對戰：卡牌定義、玩家牌庫、牌組、商城
import { syncKeyToSupabase } from './supabaseSync.js'

const CARD_DEFINITIONS_KEY = 'jiameng_card_definitions'
const CARD_COLLECTION_KEY = 'jiameng_card_collection'
const CARD_COLLECTION_LAST_WRITE_KEY = 'jiameng_card_collection_last_write'
const CARD_DECKS_KEY = 'jiameng_card_decks'
const CARD_SHOP_KEY = 'jiameng_card_shop'

// --- 卡牌定義（管理員自製）---
// type: 'hero' | 'minion' | 'effect'
// coverImage: 圖片 URL 或 base64
export const getCardDefinitions = () => {
  try {
    const raw = localStorage.getItem(CARD_DEFINITIONS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

const persistCardDefinitions = (list) => {
  const val = JSON.stringify(list)
  localStorage.setItem(CARD_DEFINITIONS_KEY, val)
  syncKeyToSupabase(CARD_DEFINITIONS_KEY, val)
}

export const addCardDefinition = (card) => {
  const list = getCardDefinitions()
  const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const newCard = {
    id,
    name: card.name || '未命名',
    type: card.type || 'minion',
    coverImage: card.coverImage || '',
    description: card.description || '',
    attack: Number(card.attack) || 0,
    hp: Number(card.hp) || 0,
    skillText: card.skillText || '',
    cost: Math.max(0, Number(card.cost) ?? 0),
    canAttackHeroDirect: !!card.canAttackHeroDirect,
    price: card.price != null ? Number(card.price) : null,
    priceCurrency: card.priceCurrency || 'coin',
    createdAt: new Date().toISOString()
  }
  list.push(newCard)
  persistCardDefinitions(list)
  return { success: true, card: newCard }
}

export const updateCardDefinition = (id, updates) => {
  const list = getCardDefinitions()
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return { success: false, message: '找不到卡牌' }
  list[idx] = { ...list[idx], ...updates, id: list[idx].id }
  persistCardDefinitions(list)
  return { success: true, card: list[idx] }
}

export const deleteCardDefinition = (id) => {
  const list = getCardDefinitions().filter((c) => c.id !== id)
  persistCardDefinitions(list)
  return { success: true }
}

export const getCardById = (id) => getCardDefinitions().find((c) => c.id === id)

// --- 玩家牌庫（擁有的卡牌數量）---
// collection: { [account]: [ { cardId, quantity } ] }
export const getCollection = (account) => {
  try {
    const raw = localStorage.getItem(CARD_COLLECTION_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const arr = data[account] || []
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

const persistCollection = (data) => {
  const val = JSON.stringify(data)
  localStorage.setItem(CARD_COLLECTION_KEY, val)
  try {
    localStorage.setItem(CARD_COLLECTION_LAST_WRITE_KEY, String(Date.now()))
  } catch (_) {}
  syncKeyToSupabase(CARD_COLLECTION_KEY, val)
}

export const addCardToCollection = (account, cardId, quantity = 1) => {
  const data = (() => {
    try {
      const raw = localStorage.getItem(CARD_COLLECTION_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  })()
  if (!data[account]) data[account] = []
  const entry = data[account].find((e) => e.cardId === cardId)
  if (entry) entry.quantity = (entry.quantity || 0) + quantity
  else data[account].push({ cardId, quantity })
  persistCollection(data)
  return { success: true }
}

export const getCardQuantity = (account, cardId) => {
  const arr = getCollection(account)
  const e = arr.find((x) => x.cardId === cardId)
  return e ? e.quantity || 0 : 0
}

// 扣減牌庫（組牌時不扣，只檢查數量；兌換時才扣。這裡提供扣減 API）
export const removeCardFromCollection = (account, cardId, quantity = 1) => {
  const data = (() => {
    try {
      const raw = localStorage.getItem(CARD_COLLECTION_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  })()
  if (!data[account]) return { success: false, message: '牌庫為空' }
  const arr = data[account]
  const idx = arr.findIndex((e) => e.cardId === cardId)
  if (idx === -1) return { success: false, message: '沒有此卡' }
  const entry = arr[idx]
  const current = entry.quantity || 0
  if (current < quantity) return { success: false, message: '數量不足' }
  entry.quantity = current - quantity
  if (entry.quantity <= 0) arr.splice(idx, 1)
  persistCollection(data)
  return { success: true }
}

// --- 牌組（1 英雄 + 50 張牌）---
// decks: { [account]: [ { id, name, heroId, cardIds: [50] } ] }
export const getDecks = (account) => {
  try {
    const raw = localStorage.getItem(CARD_DECKS_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const list = data[account] || []
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

const persistDecks = (data) => {
  const val = JSON.stringify(data)
  localStorage.setItem(CARD_DECKS_KEY, val)
  syncKeyToSupabase(CARD_DECKS_KEY, val)
}

export const saveDeck = (account, deck) => {
  const data = (() => {
    try {
      const raw = localStorage.getItem(CARD_DECKS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  })()
  if (!data[account]) data[account] = []
  const id = deck.id || `deck_${Date.now()}`
  const existing = data[account].findIndex((d) => d.id === id)
  const newDeck = { id, name: deck.name || '未命名牌組', heroId: deck.heroId || '', cardIds: Array.isArray(deck.cardIds) ? deck.cardIds.slice(0, 50) : [] }
  if (existing >= 0) data[account][existing] = newDeck
  else data[account].push(newDeck)
  persistDecks(data)
  return { success: true, deck: newDeck }
}

export const deleteDeck = (account, deckId) => {
  const data = (() => {
    try {
      const raw = localStorage.getItem(CARD_DECKS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  })()
  if (!data[account]) return { success: false }
  data[account] = data[account].filter((d) => d.id !== deckId)
  persistDecks(data)
  return { success: true }
}

// --- 商城（卡包／單卡售價，可沿用卡牌定義的 price；卡包另存）---
// shopPacks: [ { id, name, price, currency, cardPool: [cardIds], countPerPack } ]
export const getShopPacks = () => {
  try {
    const raw = localStorage.getItem(CARD_SHOP_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const list = data.packs || []
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

export const saveShopPack = (pack) => {
  const raw = localStorage.getItem(CARD_SHOP_KEY)
  const data = raw ? JSON.parse(raw) : { packs: [] }
  const packs = Array.isArray(data.packs) ? data.packs : []
  const id = pack.id || `pack_${Date.now()}`
  const idx = packs.findIndex((p) => p.id === id)
  const newPack = {
    id,
    name: pack.name || '卡包',
    coverImage: pack.coverImage || '',
    price: Number(pack.price) || 0,
    currency: pack.currency || 'coin',
    cardPool: Array.isArray(pack.cardPool) ? pack.cardPool : [],
    countPerPack: Math.max(1, Math.min(10, Number(pack.countPerPack) || 1))
  }
  if (idx >= 0) packs[idx] = newPack
  else packs.push(newPack)
  data.packs = packs
  const val = JSON.stringify(data)
  localStorage.setItem(CARD_SHOP_KEY, val)
  syncKeyToSupabase(CARD_SHOP_KEY, val)
  return { success: true, pack: newPack }
}

export const deleteShopPack = (packId) => {
  const raw = localStorage.getItem(CARD_SHOP_KEY)
  const data = raw ? JSON.parse(raw) : { packs: [] }
  data.packs = (data.packs || []).filter((p) => p.id !== packId)
  const val = JSON.stringify(data)
  localStorage.setItem(CARD_SHOP_KEY, val)
  syncKeyToSupabase(CARD_SHOP_KEY, val)
  return { success: true }
}

// --- 卡套背面（對戰時手牌/牌堆背面圖，可販售）---
const CARD_BACK_URL_KEY = 'jiameng_card_back_url'

export const getCardBackUrl = () => {
  try {
    const url = localStorage.getItem(CARD_BACK_URL_KEY)
    return url != null ? String(url).trim() : ''
  } catch (e) {
    return ''
  }
}

export const setCardBackUrl = (url) => {
  const val = url != null ? String(url).trim() : ''
  localStorage.setItem(CARD_BACK_URL_KEY, val)
  syncKeyToSupabase(CARD_BACK_URL_KEY, val)
  return { success: true }
}
