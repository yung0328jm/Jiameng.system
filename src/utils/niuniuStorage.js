// 妞妞（牛牛）牌型與比牌邏輯，佳盟幣由呼叫方處理
const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** 牌點數（算牛用）：A=1, 2-10=2-10, J/Q/K=10 */
export function cardPoint(card) {
  if (!card || card.rank == null) return 0
  const r = card.rank
  if (r >= 2 && r <= 10) return r
  if (r === 1) return 1 // A
  return 10 // J,Q,K
}

/** 牌面顯示用 */
export function cardFace(card) {
  if (!card) return ''
  const rank = RANKS[(card.rank - 1)] || String(card.rank)
  const suit = SUITS[card.suit] ?? ''
  return `${suit}${rank}`
}

/** 建立 52 張牌：{ suit: 0-3, rank: 1-13 } */
export function createDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ suit: s, rank: r })
    }
  }
  return deck
}

/** Fisher-Yates 洗牌 */
export function shuffle(deck) {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 從 5 張牌中找「三張湊 10 的倍數」後，剩兩張的點數 mod 10 = 牛幾。無則 無牛(0) */
function findNiu(cards) {
  if (!cards || cards.length !== 5) return null
  const indices = [0, 1, 2, 3, 4]
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      for (let k = j + 1; k < indices.length; k++) {
        const three = [cards[i], cards[j], cards[k]]
        const sum3 = three.reduce((s, c) => s + cardPoint(c), 0)
        if (sum3 % 10 !== 0) continue
        const other = indices.filter((x) => x !== i && x !== j && x !== k)
        const two = [cards[other[0]], cards[other[1]]]
        const sum2 = two.reduce((s, c) => s + cardPoint(c), 0)
        const niu = sum2 % 10
        return { niu: niu === 0 ? 10 : niu, three, two }
      }
    }
  }
  return { niu: 0, three: [], two: cards }
}

/** 計算一手 5 張牌的牛：{ niu: 0-10, three, two, label }，0=無牛，10=牛牛 */
export function calcNiuniu(cards) {
  const result = findNiu(cards)
  if (!result) return { niu: 0, three: [], two: cards || [], label: '無牛' }
  const label = result.niu === 10 ? '牛牛' : `牛${result.niu}`
  return { ...result, label }
}

/** 比牌：playerResult / dealerResult 為 calcNiuniu 回傳。回傳 'win' | 'lose' | 'tie' */
export function compareHands(playerResult, dealerResult) {
  if (!playerResult || !dealerResult) return 'tie'
  const pNiu = playerResult.niu ?? 0
  const dNiu = dealerResult.niu ?? 0
  if (pNiu > dNiu) return 'win'
  if (pNiu < dNiu) return 'lose'
  // 同點比「兩張」裡最大單張：先比點數，再比 rank（K>Q>J>10>...>A）
  const maxPoint = (two) => {
    if (!two || two.length === 0) return { point: 0, rank: 0 }
    let best = { point: 0, rank: 0 }
    for (const c of two) {
      const pt = cardPoint(c)
      const rk = c.rank === 1 ? 14 : c.rank
      if (pt > best.point || (pt === best.point && rk > best.rank)) best = { point: pt, rank: rk }
    }
    return best
  }
  const pMax = maxPoint(playerResult.two)
  const dMax = maxPoint(dealerResult.two)
  if (pMax.point > dMax.point || (pMax.point === dMax.point && pMax.rank > dMax.rank)) return 'win'
  if (pMax.point < dMax.point || (pMax.point === dMax.point && pMax.rank < dMax.rank)) return 'lose'
  return 'tie'
}

/** 發牌：從已洗好的牌堆依序發 5 張給玩家、5 張給莊家，並計算牛。回傳 { playerCards, dealerCards, playerResult, dealerResult, result } */
export function dealRound(deck) {
  const d = deck.length >= 10 ? [...deck] : shuffle(createDeck())
  const playerCards = d.slice(0, 5)
  const dealerCards = d.slice(5, 10)
  const playerResult = calcNiuniu(playerCards)
  const dealerResult = calcNiuniu(dealerCards)
  const result = compareHands(playerResult, dealerResult)
  return { playerCards, dealerCards, playerResult, dealerResult, result }
}
