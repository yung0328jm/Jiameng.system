// 卡牌對戰：純函數 reducer，供線上房間同步用
const MAX_FRONT = 5
const MAX_BACK = 5
const HAND_SIZE_START = 5
const MAX_HAND_SIZE = 9
const DRAW_PER_TURN = 1

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 建立初始對戰狀態（雙方各抽 5 張） */
export function getInitialGameState(hostDeck, guestDeck, getCard) {
  if (!getCard || !hostDeck || !guestDeck) return null
  const pHero = getCard(hostDeck.heroId)
  const pDeck = shuffle((hostDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
  const gHero = getCard(guestDeck.heroId)
  const gDeck = shuffle((guestDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))

  const drawN = (deck, n) => {
    const hand = []
    let d = [...deck]
    for (let i = 0; i < n && d.length > 0; i++) {
      hand.push(d[0])
      d = d.slice(1)
    }
    return { hand, deck: d }
  }

  const hostDraw = drawN(pDeck, HAND_SIZE_START)
  const guestDraw = drawN(gDeck, HAND_SIZE_START)

  const hostSide = {
    hero: pHero ? { ...pHero, currentHp: pHero.hp, maxHp: pHero.hp, energy: 1 } : null,
    deck: hostDraw.deck,
    hand: hostDraw.hand,
    fieldFront: [],
    fieldBack: [],
    sacrificePoints: 0,
    sacrificeMax: 0
  }
  const guestSide = {
    hero: gHero ? { ...gHero, currentHp: gHero.hp, maxHp: gHero.hp, energy: 0 } : null,
    deck: guestDraw.deck,
    hand: guestDraw.hand,
    fieldFront: [],
    fieldBack: [],
    sacrificePoints: 0,
    sacrificeMax: 0
  }

  return {
    hostSide,
    guestSide,
    turn: 'host',
    phase: 'sacrifice',
    message: '房主回合 · 請獻祭一張手牌',
    gameOver: null,
    playerGraveyardCount: 0,
    enemyGraveyardCount: 0,
    lastAttack: null
  }
}

function removeDeadFromFront(side) {
  const front = side.fieldFront || []
  const alive = front.filter((m) => (m.currentHp ?? m.hp) > 0 && !m.dying)
  const deadCount = front.length - alive.length
  return { side: { ...side, fieldFront: alive }, deadCount }
}

/** 單一 reducer：回傳新 state，不 mutate */
export function reduceGameState(state, action) {
  if (!state || !action) return state
  const { type } = action
  let hostSide = { ...state.hostSide }
  let guestSide = { ...state.guestSide }
  let turn = state.turn
  let phase = state.phase
  let message = state.message
  let gameOver = state.gameOver
  let playerGraveyardCount = state.playerGraveyardCount ?? 0
  let enemyGraveyardCount = state.enemyGraveyardCount ?? 0
  let lastAttack = state.lastAttack

  const currentSide = turn === 'host' ? hostSide : guestSide
  const otherSide = turn === 'host' ? guestSide : hostSide

  if (type === 'SACRIFICE') {
    const { side, handIndex } = action
    const s = side === 'host' ? hostSide : guestSide
    const card = s.hand?.[handIndex]
    if (!card || phase !== 'sacrifice') return state
    const newHand = (s.hand || []).filter((_, i) => i !== handIndex)
    const newMax = (s.sacrificeMax ?? 0) + 1
    const updated = {
      ...s,
      hand: newHand,
      sacrificePoints: (s.sacrificePoints ?? 0) + 1,
      sacrificeMax: newMax,
      fieldFront: (s.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    }
    if (side === 'host') hostSide = updated
    else guestSide = updated
    phase = 'play'
    message = '獻祭了「' + card.name + '」，獻祭上限+1，本輪可用+1。'
  }

  if (type === 'PLAY_MINION') {
    const { side, handIndex } = action
    if (phase !== 'play' || turn !== side) return state
    const s = side === 'host' ? hostSide : guestSide
    const card = s.hand?.[handIndex]
    if (!card || card.type !== 'minion') return state
    const cost = card.cost ?? 0
    if ((s.sacrificePoints ?? 0) < cost) return state
    if ((s.fieldFront || []).length >= MAX_FRONT) return state
    const newHand = (s.hand || []).filter((_, i) => i !== handIndex)
    const newFront = [...(s.fieldFront || []), { ...card, currentHp: card.hp, maxHp: card.hp, canAttack: false }]
    const updated = { ...s, hand: newHand, fieldFront: newFront, sacrificePoints: Math.max(0, (s.sacrificePoints ?? 0) - cost) }
    if (side === 'host') hostSide = updated
    else guestSide = updated
    message = ''
  }

  if (type === 'PLAY_BACK') {
    const { side, handIndex } = action
    if (phase !== 'play' || turn !== side) return state
    const s = side === 'host' ? hostSide : guestSide
    const card = s.hand?.[handIndex]
    if (!card || (card.type !== 'equipment' && card.type !== 'effect' && card.type !== 'trap')) return state
    const cost = card.cost ?? 0
    if ((s.sacrificePoints ?? 0) < cost) return state
    if ((s.fieldBack || []).length >= MAX_BACK) return state
    const newHand = (s.hand || []).filter((_, i) => i !== handIndex)
    const faceDown = card.type === 'trap'
    const currentUseCount = card.type === 'equipment' ? (card.useCount ?? 1) : undefined
    const slot = { card, faceDown, currentUseCount }
    const newBack = [...(s.fieldBack || []), slot]
    const updated = { ...s, hand: newHand, fieldBack: newBack, sacrificePoints: Math.max(0, (s.sacrificePoints ?? 0) - cost) }
    if (side === 'host') hostSide = updated
    else guestSide = updated
    message = ''
  }

  if (type === 'END_PLAY_PHASE') {
    if (phase !== 'play') return state
    phase = 'attack'
    message = '選擇己方單位攻擊。'
  }

  if (type === 'ATTACK') {
    const { attackerSide, attackerIndex, targetSide, targetFieldIndexOrHero } = action
    if (phase !== 'attack' || turn !== attackerSide) return state
    const attState = attackerSide === 'host' ? hostSide : guestSide
    const tgtState = targetSide === 'host' ? hostSide : guestSide
    const front = attState.fieldFront || []
    let attackValue = 0
    if (attackerIndex === -1) {
      const back = attState.fieldBack || []
      const eqSlot = back.find((s) => s.card?.type === 'equipment' && (s.currentUseCount ?? s.card?.useCount ?? 0) > 0)
      if (!eqSlot) return state
      attackValue = eqSlot.card?.attack ?? 0
    } else {
      const att = front[attackerIndex]
      if (!att || att.attack <= 0 || att.canAttack === false) return state
      attackValue = att.attack
    }
    const isTargetHero = targetFieldIndexOrHero === -1 || targetFieldIndexOrHero == null
    if (isTargetHero) {
      const hero = tgtState.hero
      if (!hero) return state
      const enemyFront = targetSide === 'host' ? hostSide.fieldFront || [] : guestSide.fieldFront || []
      const canDirect = attackerIndex >= 0 ? (front[attackerIndex]?.canAttackHeroDirect === true) : true
      if (enemyFront.length > 0 && !canDirect) return state
      const newHp = Math.max(0, (hero.currentHp ?? hero.hp) - attackValue)
      const updated = { ...tgtState, hero: { ...hero, currentHp: newHp } }
      if (targetSide === 'host') hostSide = updated
      else guestSide = updated
      if (newHp <= 0) gameOver = targetSide === 'host' ? 'guest' : 'host'
    } else {
      const tgtFront = tgtState.fieldFront || []
      const target = tgtFront[targetFieldIndexOrHero]
      if (!target) return state
      const newHp = (target.currentHp ?? target.hp) - attackValue
      if (newHp <= 0) {
        const newFront = tgtFront.filter((_, i) => i !== targetFieldIndexOrHero)
        const updated = { ...tgtState, fieldFront: newFront }
        if (targetSide === 'host') hostSide = updated
        else guestSide = updated
        if (targetSide === 'host') playerGraveyardCount += 1
        else enemyGraveyardCount += 1
      } else {
        const newFront = tgtFront.map((m, i) => (i === targetFieldIndexOrHero ? { ...m, currentHp: newHp } : m))
        const updated = { ...tgtState, fieldFront: newFront }
        if (targetSide === 'host') hostSide = updated
        else guestSide = updated
      }
    }
    if (attackerIndex >= 0) {
      const attFront = (attackerSide === 'host' ? hostSide : guestSide).fieldFront || []
      const newAttFront = attFront.map((m, i) => (i === attackerIndex ? { ...m, canAttack: false } : m))
      if (attackerSide === 'host') hostSide = { ...hostSide, fieldFront: newAttFront }
      else guestSide = { ...guestSide, fieldFront: newAttFront }
    }
    if (attackerIndex === -1) {
      const att = attackerSide === 'host' ? hostSide : guestSide
      const back = [...(att.fieldBack || [])]
      const idx = back.findIndex((s) => s.card?.type === 'equipment' && (s.currentUseCount ?? s.card?.useCount ?? 0) > 0)
      if (idx !== -1) {
        const used = (back[idx].currentUseCount ?? back[idx].card?.useCount ?? 1) - 1
        back[idx] = { ...back[idx], currentUseCount: used }
      }
      if (attackerSide === 'host') hostSide = { ...hostSide, fieldBack: back }
      else guestSide = { ...guestSide, fieldBack: back }
    }
    lastAttack = { attackerSide, attackerIndex, targetSide, targetHero: isTargetHero, targetIndex: isTargetHero ? -1 : targetFieldIndexOrHero }
    message = '攻擊！'
  }

  if (type === 'END_TURN') {
    if (phase !== 'attack') return state
    turn = turn === 'host' ? 'guest' : 'host'
    phase = 'sacrifice'
    const nextSide = turn === 'host' ? hostSide : guestSide
    const nextOther = turn === 'host' ? guestSide : hostSide
    let newNext = { ...nextSide, sacrificePoints: nextSide.sacrificeMax ?? nextSide.sacrificePoints ?? 0 }
    newNext = {
      ...newNext,
      fieldFront: (newNext.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    }
    if (turn === 'host') {
      newNext.hero = newNext.hero ? { ...newNext.hero, energy: (newNext.hero.energy ?? 0) + 1 } : null
      if (newNext.deck.length > 0 && (newNext.hand || []).length < MAX_HAND_SIZE) {
        const drawn = newNext.deck[0]
        newNext = { ...newNext, deck: newNext.deck.slice(1), hand: [...(newNext.hand || []), drawn] }
      }
      hostSide = newNext
    } else {
      newNext.hero = newNext.hero ? { ...newNext.hero, energy: (newNext.hero.energy ?? 0) + 1 } : null
      if (newNext.deck.length > 0 && (newNext.hand || []).length < MAX_HAND_SIZE) {
        const drawn = newNext.deck[0]
        newNext = { ...newNext, deck: newNext.deck.slice(1), hand: [...(newNext.hand || []), drawn] }
      }
      guestSide = newNext
    }
    message = turn === 'host' ? '房主回合 · 請獻祭一張手牌' : '對手回合 · 請獻祭一張手牌'
  }

  if (type === 'REMOVE_DEAD') {
    const h = removeDeadFromFront(hostSide)
    hostSide = h.side
    playerGraveyardCount += h.deadCount
    const g = removeDeadFromFront(guestSide)
    guestSide = g.side
    enemyGraveyardCount += g.deadCount
  }

  return {
    hostSide,
    guestSide,
    turn,
    phase,
    message,
    gameOver,
    playerGraveyardCount,
    enemyGraveyardCount,
    lastAttack: type === 'ATTACK' ? lastAttack : null
  }
}

export { MAX_FRONT, MAX_BACK, HAND_SIZE_START, MAX_HAND_SIZE, DRAW_PER_TURN }
