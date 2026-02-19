// 卡牌對戰：回合制 PvE，英雄血量歸 0 即敗
import { useState, useEffect, useRef } from 'react'
import { getCardById, getSkillById } from '../utils/cardGameStorage.js'

const MAX_FRONT = 5  // 前排小怪數量上限
const MAX_BACK = 5   // 後排裝備/效果/陷阱數量上限
const HAND_SIZE_START = 5
const MAX_HAND_SIZE = 9
const MIN_DECK_SIZE = 30
const MAX_DECK_SIZE = 50
const DRAW_PER_TURN = 1

function buildDeckForBattle(heroId, cardIds, getCard) {
  const hero = getCard(heroId)
  if (!hero) return { hero: null, deck: [] }
  const deck = cardIds.map((id) => getCard(id)).filter(Boolean)
  return { hero: { ...hero, currentHp: hero.hp, maxHp: hero.hp }, deck }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function drawCards(deck, count) {
  const drawn = deck.splice(0, count)
  return { deck, drawn }
}

function CardBack({ cardBackUrl, className = '' }) {
  if (cardBackUrl) {
    return <img src={cardBackUrl} alt="" className={`w-full h-full object-cover rounded-lg border border-amber-600/40 ${className}`} />
  }
  return (
    <div className={`w-full h-full rounded-md border border-amber-600/50 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center ${className}`}>
      <span className="text-amber-400/60 text-[7px]">背面</span>
    </div>
  )
}

function BattleCard({ card, showCost = false, attack, hp, currentHp, maxHp, selected, dimmed, onClick, className = '', attackAnim, hitAnim, dying, compact }) {
  const atk = attack ?? card?.attack ?? 0
  const health = currentHp ?? hp ?? card?.hp ?? 0
  const maxHealth = maxHp ?? card?.maxHp ?? card?.hp ?? 0
  const name = card?.name || '—'
  const cover = card?.coverImage
  const sizeClass = compact
    ? 'w-9 h-[44px] sm:w-10 sm:h-[52px] rounded-md'
    : 'w-11 h-[56px] sm:w-14 sm:h-[68px] md:w-16 md:h-20 rounded-lg'
  const badgeClass = compact ? 'w-4 h-4 text-[7px]' : 'w-5 h-5 text-[8px]'
  const nameClass = compact ? 'text-[6px] sm:text-[7px]' : 'text-[7px] sm:text-[8px]'
  return (
    <button
      type="button"
      onClick={dying ? undefined : onClick}
      className={`relative ${sizeClass} overflow-visible border-2 shadow-md transition-all ${selected ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105' : 'border-amber-700/60 hover:border-amber-500'} ${dimmed ? 'opacity-60' : ''} ${attackAnim ? 'card-attack-lunge' : ''} ${hitAnim ? 'card-hit' : ''} ${dying ? 'card-death pointer-events-none' : ''} ${className}`}
    >
      <div className="absolute inset-0 rounded overflow-hidden bg-gray-900">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-gray-500 text-[7px]">無圖</div>
        )}
      </div>
      <div className="absolute inset-0 rounded overflow-hidden bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      {showCost && (card?.cost != null && card.cost > 0) && (
        <div className={`absolute top-0.5 left-0.5 rounded-full bg-amber-600 flex items-center justify-center font-bold text-gray-900 ${compact ? 'w-3 h-3 text-[6px]' : 'w-4 h-4 text-[8px]'}`}>{card.cost}</div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-0.5 flex items-center justify-between gap-0.5">
        <span className={`rounded-full bg-red-900/90 flex items-center justify-center font-bold text-red-200 ${badgeClass}`} title="攻擊">{atk}</span>
        <span className={`text-white truncate flex-1 text-center drop-shadow ${nameClass}`}>{name}</span>
        <span className={`rounded-full bg-green-900/90 flex items-center justify-center font-bold text-green-200 ${badgeClass}`} title="血量">{currentHp != null ? `${currentHp}/${maxHealth}` : health}</span>
      </div>
    </button>
  )
}

function HeroSlot({ hero, isTarget, onClick, className = '', hitAnim }) {
  if (!hero) return null
  const cover = hero.coverImage
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg overflow-hidden border-2 shadow-lg ${isTarget ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-amber-700/70'} ${hitAnim ? 'hero-hit' : ''} ${className}`}
    >
      <div className="absolute inset-0 bg-gray-900">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-gray-800 flex items-center justify-center text-amber-200/80 text-[9px] sm:text-xs">英雄</div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      <div className="absolute top-0.5 left-0.5 right-0.5">
        <span className="text-amber-200 text-[9px] sm:text-xs font-semibold drop-shadow truncate block">{hero.name}</span>
      </div>
      <div className="absolute bottom-0.5 left-0.5 right-0.5 flex justify-center">
        <span className="px-1.5 py-0.5 rounded-full bg-red-900/90 text-red-200 text-[9px] sm:text-xs font-bold">HP {hero.currentHp ?? hero.hp}/{hero.maxHp ?? hero.hp}</span>
      </div>
    </Wrapper>
  )
}

export default function CardBattle({ playerDeck, playerAccount, onExit, playerCardBackUrl, enemyCardBackUrl }) {
  const cardBackUrl = playerCardBackUrl ?? enemyCardBackUrl ?? '' // fallback for legacy
  const getCard = (id) => getCardById(id)
  const [player, setPlayer] = useState(null)
  const [enemy, setEnemy] = useState(null)
  const [turn, setTurn] = useState('player')
  const [phase, setPhase] = useState('sacrifice') // 'sacrifice' | 'play' | 'attack'
  const [message, setMessage] = useState('請獻祭一張手牌（點擊手牌）')
  const [gameOver, setGameOver] = useState(null) // 'win' | 'lose'
  const [selectedAttacker, setSelectedAttacker] = useState(null)
  const [drawInIndices, setDrawInIndices] = useState([])
  const [lastAttack, setLastAttack] = useState(null) // { attackerSide, attackerIndex, targetSide, targetHero, targetIndex }
  const [hintOpen, setHintOpen] = useState(false)
  const [playerGraveyardCount, setPlayerGraveyardCount] = useState(0)
  const [enemyGraveyardCount, setEnemyGraveyardCount] = useState(0)
  const [handDetailIndex, setHandDetailIndex] = useState(null) // 點擊手牌放大預覽，再點或關閉後可獻祭/出牌需按鈕確認
  const prevHandLengthRef = useRef(0)
  const attackAnimTimeoutRef = useRef(null)
  const deathRemoveTimeoutRef = useRef(null)

  useEffect(() => {
    return () => { if (attackAnimTimeoutRef.current) clearTimeout(attackAnimTimeoutRef.current) }
  }, [])

  useEffect(() => {
    const pHero = getCard(playerDeck.heroId)
    const pDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: hand } = drawCards(pDeck, Math.min(HAND_SIZE_START, pDeck.length))
    const p = {
      hero: pHero ? { ...pHero, currentHp: pHero.hp, maxHp: pHero.hp, energy: 1 } : null,
      deck: pDeck,
      hand,
      fieldFront: [],
      fieldBack: [],
      sacrificePoints: 0
    }
    const eHero = getCard(playerDeck.heroId)
    const eDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: eHand } = drawCards(eDeck, Math.min(HAND_SIZE_START, eDeck.length))
    const e = {
      hero: eHero ? { ...eHero, currentHp: eHero.hp, maxHp: eHero.hp, energy: 0 } : null,
      deck: eDeck,
      hand: eHand,
      fieldFront: [],
      fieldBack: [],
      sacrificePoints: 0
    }
    setPlayer(p)
    setEnemy(e)
  }, [])

  useEffect(() => {
    if (!player || !enemy) return
    const playerHp = player.hero?.currentHp ?? player.hero?.hp
    const enemyHp = enemy.hero?.currentHp ?? enemy.hero?.hp
    if (player.hero != null && playerHp <= 0) setGameOver('lose')
    else if (enemy.hero != null && enemyHp <= 0) setGameOver('win')
  }, [player?.hero?.currentHp, player?.hero?.hp, enemy?.hero?.currentHp, enemy?.hero?.hp])

  useEffect(() => {
    if (!player?.hand) return
    const len = player.hand.length
    if (len > prevHandLengthRef.current) {
      const newIndices = []
      for (let i = prevHandLengthRef.current; i < len; i++) newIndices.push(i)
      setDrawInIndices(newIndices)
    }
    prevHandLengthRef.current = len
  }, [player?.hand?.length])

  useEffect(() => {
    if (drawInIndices.length === 0) return
    const t = setTimeout(() => setDrawInIndices([]), 700)
    return () => clearTimeout(t)
  }, [drawInIndices])

  useEffect(() => {
    const hasDying = (arr) => Array.isArray(arr) && arr.some((m) => m?.dying === true)
    if (!player || !enemy) return
    if (!hasDying(player.fieldFront) && !hasDying(enemy.fieldFront)) {
      deathRemoveTimeoutRef.current = null
      return
    }
    if (deathRemoveTimeoutRef.current != null) return
    deathRemoveTimeoutRef.current = setTimeout(() => {
      deathRemoveTimeoutRef.current = null
      setPlayer((prev) => {
        const front = prev.fieldFront || []
        const dyingCount = front.filter((m) => m.dying).length
        if (dyingCount > 0) setPlayerGraveyardCount((c) => c + dyingCount)
        return { ...prev, fieldFront: front.filter((m) => !m.dying) }
      })
      setEnemy((prev) => {
        const front = prev.fieldFront || []
        const dyingCount = front.filter((m) => m.dying).length
        if (dyingCount > 0) setEnemyGraveyardCount((c) => c + dyingCount)
        return { ...prev, fieldFront: front.filter((m) => !m.dying) }
      })
    }, 700)
    return () => {}
  }, [player?.fieldFront, enemy?.fieldFront])

  const sacrificeCard = (handIndex) => {
    if (turn !== 'player' || phase !== 'sacrifice') return
    const card = player.hand[handIndex]
    if (!card) return
    const newHand = player.hand.filter((_, i) => i !== handIndex)
    setPlayer((prev) => ({
      ...prev,
      hand: newHand,
      sacrificePoints: (prev.sacrificePoints || 0) + 1,
      fieldFront: (prev.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    }))
    setPhase('play')
    setMessage(`獻祭了「${card.name}」，獲得 1 點獻祭點數。累積足夠點數才能打出卡牌（出場點數）。出牌或進入攻擊階段`)
  }

  const playMinion = (side, handIndex) => {
    if (turn !== 'player' || phase !== 'play') return
    const isPlayer = side === 'player'
    const state = isPlayer ? player : enemy
    const card = state.hand[handIndex]
    if (!card || card.type === 'hero') return
    const cost = card.cost ?? 0
    if (isPlayer) {
      const points = state.sacrificePoints ?? 0
      if (points < cost) {
        setMessage(`獻祭點數不足（需要 ${cost}，目前 ${points}）`)
        return
      }
    }
    const newHand = state.hand.filter((_, i) => i !== handIndex)
    if (card.type === 'minion') {
      if ((state.fieldFront || []).length >= MAX_FRONT) {
        setMessage('前排已滿')
        return
      }
      const newFront = [...(state.fieldFront || []), { ...card, currentHp: card.hp, maxHp: card.hp, canAttack: false }]
      if (isPlayer) {
        setPlayer((prev) => ({ ...prev, hand: newHand, fieldFront: newFront, sacrificePoints: Math.max(0, (prev.sacrificePoints || 0) - cost) }))
      } else {
        setEnemy((prev) => ({ ...prev, hand: newHand, fieldFront: newFront }))
      }
    } else {
      if ((state.fieldBack || []).length >= MAX_BACK) {
        setMessage('後排已滿')
        return
      }
      const faceDown = card.type === 'trap'
      const currentUseCount = card.type === 'equipment' ? (card.useCount ?? 1) : undefined
      const slot = { card, faceDown, currentUseCount }
      const newBack = [...(state.fieldBack || []), slot]
      if (isPlayer) {
        setPlayer((prev) => ({ ...prev, hand: newHand, fieldBack: newBack, sacrificePoints: Math.max(0, (prev.sacrificePoints || 0) - cost) }))
      } else {
        setEnemy((prev) => ({ ...prev, hand: newHand, fieldBack: newBack }))
      }
    }
    setMessage('')
  }

  const attack = (attackerSide, attackerFieldIndex, targetSide, targetFieldIndexOrHero) => {
    if (turn !== 'player' || phase !== 'attack') return
    const state = attackerSide === 'player' ? player : enemy
    const front = state.fieldFront || []
    let attacker
    let attackValue
    if (attackerFieldIndex === -1) {
      const back = state.fieldBack || []
      const eqSlot = back.find((s) => s.card?.type === 'equipment' && (s.currentUseCount ?? s.card?.useCount ?? 0) > 0)
      if (!eqSlot) return
      attackValue = eqSlot.card?.attack ?? 0
      attacker = { name: '英雄（裝備）', attack: attackValue }
    } else {
      attacker = front[attackerFieldIndex]
      if (!attacker || attacker.attack <= 0 || attacker.canAttack === false) return
      attackValue = attacker.attack
    }
    if (attackValue <= 0) return
    const isTargetHero = targetFieldIndexOrHero === -1 || targetFieldIndexOrHero === undefined
    if (isTargetHero && targetSide === 'enemy') {
      const enemyFront = enemy.fieldFront || []
      const canDirect = attacker.canAttackHeroDirect === true
      if (enemyFront.length > 0 && !canDirect) return
    }
    if (isTargetHero && targetSide === 'player') {
      const playerFront = player.fieldFront || []
      if (playerFront.length > 0) return
    }
    let target
    if (isTargetHero) {
      target = (targetSide === 'player' ? player : enemy).hero
      if (!target) return
    } else {
      target = (targetSide === 'player' ? player : enemy).fieldFront[targetFieldIndexOrHero]
      if (!target) return
    }
    const newHp = (target.currentHp ?? target.hp) - attackValue
    if (isTargetHero) {
      if (attackerSide === 'player') {
        setEnemy((prev) => ({
          ...prev,
          hero: prev.hero ? { ...prev.hero, currentHp: Math.max(0, newHp) } : null
        }))
      } else {
        setPlayer((prev) => ({
          ...prev,
          hero: prev.hero ? { ...prev.hero, currentHp: Math.max(0, newHp) } : null
        }))
      }
    } else {
      const targetFieldIndex = targetFieldIndexOrHero
      if (newHp <= 0) {
        if (targetSide === 'player') {
          setPlayer((prev) => {
            const f = [...(prev.fieldFront || [])]
            if (f[targetFieldIndex]) f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: 0, dying: true }
            return { ...prev, fieldFront: f }
          })
        } else {
          setEnemy((prev) => {
            const f = [...(prev.fieldFront || [])]
            if (f[targetFieldIndex]) f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: 0, dying: true }
            return { ...prev, fieldFront: f }
          })
        }
      } else {
        if (targetSide === 'player') {
          setPlayer((prev) => {
            const f = [...(prev.fieldFront || [])]
            f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: newHp }
            return { ...prev, fieldFront: f }
          })
        } else {
          setEnemy((prev) => {
            const f = [...(prev.fieldFront || [])]
            f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: newHp }
            return { ...prev, fieldFront: f }
          })
        }
      }
    }
    if (attackerFieldIndex === -1 && attackerSide === 'player') {
      setPlayer((prev) => {
        const back = [...(prev.fieldBack || [])]
        const idx = back.findIndex((s) => s.card?.type === 'equipment' && (s.currentUseCount ?? s.card?.useCount ?? 0) > 0)
        if (idx !== -1) {
          const used = (back[idx].currentUseCount ?? back[idx].card?.useCount ?? 1) - 1
          back[idx] = { ...back[idx], currentUseCount: used }
        }
        return { ...prev, fieldBack: back }
      })
    }
    setMessage(`${attacker.name} 攻擊！`)
    // 攻擊／受擊動畫
    if (attackAnimTimeoutRef.current) clearTimeout(attackAnimTimeoutRef.current)
    setLastAttack({
      attackerSide,
      attackerIndex: attackerFieldIndex,
      targetSide,
      targetHero: isTargetHero,
      targetIndex: isTargetHero ? -1 : targetFieldIndexOrHero
    })
    attackAnimTimeoutRef.current = setTimeout(() => {
      setLastAttack(null)
      attackAnimTimeoutRef.current = null
    }, 650)
    if (attackerFieldIndex >= 0) {
      if (attackerSide === 'player') {
        setPlayer((prev) => {
          const f = [...(prev.fieldFront || [])]
          if (f[attackerFieldIndex]) f[attackerFieldIndex] = { ...f[attackerFieldIndex], canAttack: false }
          return { ...prev, fieldFront: f }
        })
      } else {
        setEnemy((prev) => {
          const f = [...(prev.fieldFront || [])]
          if (f[attackerFieldIndex]) f[attackerFieldIndex] = { ...f[attackerFieldIndex], canAttack: false }
          return { ...prev, fieldFront: f }
        })
      }
    }
  }

  const endPlayPhase = () => {
    if (turn !== 'player' || phase !== 'play') return
    setPhase('attack')
    setMessage('選擇己方單位攻擊。敵方場上有小怪時須先擊倒小怪才能攻擊英雄。')
  }

  const endTurn = () => {
    if (turn !== 'player') return
    setSelectedAttacker(null)
    setPhase('sacrifice')
    setTurn('enemy')
    setMessage('敵方回合')
    setTimeout(() => {
      aiTurn()
    }, 800)
  }

  const aiTurn = () => {
    let e = { ...enemy }
    let p = { ...player }
    let playerDeathsThisTurn = 0
    e.fieldFront = (e.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    if (e.deck.length > 0 && e.hand.length < MAX_HAND_SIZE) {
      const drawn = e.deck.shift()
      e.hand = [...e.hand, drawn]
    }
    const sacrificeIdx = e.hand.findIndex((c) => c && c.type !== 'hero')
    if (sacrificeIdx !== -1) {
      e.sacrificePoints = (e.sacrificePoints || 0) + 1
      e.hand = e.hand.filter((_, i) => i !== sacrificeIdx)
    }
    while ((e.fieldFront || []).length < MAX_FRONT && e.hand.some((c) => c && c.type === 'minion')) {
      const idx = e.hand.findIndex((c) => c && c.type === 'minion')
      if (idx === -1) break
      const card = e.hand[idx]
      const cost = card.cost ?? 0
      if ((e.sacrificePoints || 0) < cost) break
      e.sacrificePoints = (e.sacrificePoints || 0) - cost
      e.hand = e.hand.filter((_, i) => i !== idx)
      e.fieldFront = [...(e.fieldFront || []), { ...card, currentHp: card.hp, maxHp: card.hp, canAttack: false }]
    }
    ;(e.fieldFront || []).forEach((minion) => {
      if (minion.attack <= 0 || minion.canAttack === false) return
      const canAttackHero = minion.canAttackHeroDirect === true
      const pFront = p.fieldFront || []
      if (pFront.length > 0) {
        const targetIdx = Math.floor(Math.random() * pFront.length)
        const target = pFront[targetIdx]
        const newHp = (target.currentHp || target.hp) - minion.attack
        if (newHp <= 0) {
          playerDeathsThisTurn += 1
          p.fieldFront = pFront.filter((_, j) => j !== targetIdx)
        } else {
          p.fieldFront = pFront.map((m, j) => (j === targetIdx ? { ...m, currentHp: newHp } : m))
        }
      } else if (p.hero && (canAttackHero || pFront.length === 0)) {
        const newHp = Math.max(0, (p.hero.currentHp || p.hero.hp) - minion.attack)
        p.hero = { ...p.hero, currentHp: newHp }
      }
    })
    setEnemy(e)
    if (playerDeathsThisTurn > 0) setPlayerGraveyardCount((c) => c + playerDeathsThisTurn)
    const nextP = { ...p }
    nextP.fieldFront = (nextP.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    nextP.hero = nextP.hero ? { ...nextP.hero, energy: (nextP.hero.energy ?? 0) + 1 } : null
    setPlayer(() => {
      if (nextP.deck.length > 0 && nextP.hand.length < MAX_HAND_SIZE) {
        const [drawn, ...rest] = nextP.deck
        return { ...nextP, deck: rest, hand: [...nextP.hand, drawn] }
      }
      return nextP
    })
    setTurn('player')
    setPhase('sacrifice')
    setMessage('你的回合 · 請獻祭一張手牌（點擊手牌）')
  }

  if (!player || !enemy) {
    return (
      <div className="p-4 text-white">
        <p>載入中…</p>
      </div>
    )
  }

  if (gameOver) {
    return (
      <div className="p-6 text-center">
        <p className="text-2xl font-bold text-yellow-400 mb-4">{gameOver === 'win' ? '勝利！' : '敗北…'}</p>
        <button type="button" onClick={onExit} className="px-4 py-2 bg-gray-600 text-white rounded">離開對戰</button>
      </div>
    )
  }

  const handleSelectAttackTarget = (targetSide, targetFieldIndex) => {
    if (phase !== 'attack' || turn !== 'player' || targetSide !== 'enemy') return
    if (selectedAttacker == null) return
    attack('player', selectedAttacker, targetSide, targetFieldIndex)
    setSelectedAttacker(null)
  }

  const handleSelectAttackTargetHero = () => {
    if (phase !== 'attack' || turn !== 'player') return
    if (selectedAttacker == null) return
    attack('player', selectedAttacker, 'enemy', -1)
    setSelectedAttacker(null)
  }

  const canAttackEnemyHero = (enemy.fieldFront || []).length === 0
  const playerBack = player?.fieldBack || []
  const canHeroAttack = playerBack.some((s) => s.card?.type === 'equipment' && (s.currentUseCount ?? s.card?.useCount ?? 0) > 0)

  const useHeroSkill = (skillId, energyCost) => {
    const cost = Math.max(0, Number(energyCost) || 0)
    if (turn !== 'player' || !player?.hero) return
    const energy = player.hero.energy ?? 0
    if (energy < cost) return
    const skill = getSkillById(skillId)
    if (!skill) return
    const key = skill.skillKey || ''
    const damageAllMatch = key.match(/^damage_all_minions_(\d+)$/)
    const healHeroMatch = key.match(/^heal_hero_(\d+)$/)
    setMessage(`使用了「${skill.name}」`)
    if (damageAllMatch) {
      const damage = Math.max(0, parseInt(damageAllMatch[1], 10) || 3)
      setEnemy((prev) => ({
        ...prev,
        fieldFront: (prev.fieldFront || []).map((m) => {
          const newHp = (m.currentHp ?? m.hp) - damage
          return newHp <= 0 ? { ...m, currentHp: 0, dying: true } : { ...m, currentHp: newHp }
        })
      }))
    }
    setPlayer((prev) => {
      const newEnergy = (prev.hero?.energy ?? 0) - cost
      let heroUpdate = prev.hero ? { ...prev.hero, energy: Math.max(0, newEnergy) } : null
      if (healHeroMatch && heroUpdate) {
        const heal = Math.max(0, parseInt(healHeroMatch[1], 10) || 3)
        const maxHp = heroUpdate.maxHp ?? heroUpdate.hp ?? 0
        const currentHp = heroUpdate.currentHp ?? heroUpdate.hp ?? 0
        heroUpdate = { ...heroUpdate, currentHp: Math.min(maxHp, currentHp + heal) }
      }
      return { ...prev, hero: heroUpdate }
    })
  }

  const Field = ({ side, hero, heroEnergy, heroSkills, fieldFront, fieldBack, hand, isPlayer, sacrificePoints, drawInIndices, enemyDeckRemaining, enemySacrificePoints, cardBackUrl, onSelectAttacker, onSelectTarget, onSelectTargetHero, onSelectHeroAttacker, onUseHeroSkill, onSacrificeCard, onPlayMinion, onHandCardClick, handDetailIndex, handCardCompact }) => (
    <div className={`rounded-lg border border-amber-900/50 overflow-hidden flex-shrink-0 min-h-0 flex flex-col ${isPlayer ? 'bg-gradient-to-b from-gray-900/80 to-gray-800/60' : 'bg-gradient-to-b from-gray-800/60 to-gray-900/80'}`}>
      <div className="px-1.5 py-0.5 sm:px-2 sm:py-1 flex items-center gap-1 sm:gap-2 flex-wrap border-b border-amber-800/40">
        <span className="text-amber-200/90 font-medium text-[10px] sm:text-xs">{side === 'player' ? '我方' : '敵方'}</span>
        {!isPlayer && (
          <>
            <span className="text-amber-400/90 text-[9px] sm:text-xs">獻祭 {enemySacrificePoints ?? 0}</span>
            <span className="text-gray-400 text-[9px] sm:text-xs">牌庫 {enemyDeckRemaining ?? 0}</span>
            <span className="text-gray-400 text-[9px] sm:text-xs">手牌 {hand?.length ?? 0}</span>
          </>
        )}
        {isPlayer && sacrificePoints != null && (
          <span className="text-amber-400 text-[9px] sm:text-xs">獻祭 {sacrificePoints}</span>
        )}
      </div>
      <div className="p-1 sm:p-2 space-y-1 sm:space-y-2 flex-1 min-h-0">
        <div>
          <div className="text-gray-500 text-[9px] sm:text-[10px] mb-0.5 flex items-center justify-center gap-1">
            英雄
            {isPlayer && heroEnergy != null && <span className="text-amber-400">能量 {heroEnergy}</span>}
          </div>
          <div className="flex justify-center">
            {hero && (
              <HeroSlot
                hero={hero}
                isTarget={onSelectTargetHero && side === 'enemy'}
                onClick={onSelectTargetHero && side === 'enemy' ? onSelectTargetHero : (onSelectHeroAttacker && side === 'player' ? onSelectHeroAttacker : undefined)}
                className={side === 'enemy' && !onSelectTargetHero ? 'opacity-75 cursor-default' : 'cursor-pointer'}
                hitAnim={lastAttack?.targetSide === side && lastAttack?.targetHero === true}
              />
            )}
          </div>
        </div>
        {isPlayer && hero && (heroSkills || []).length > 0 && (phase === 'play' || phase === 'attack') && (
          <div className="flex flex-wrap gap-0.5 sm:gap-1 justify-center items-center">
            <span className="text-gray-500 text-[9px] sm:text-[10px]">技能：</span>
            {(heroSkills || []).map((s, i) => {
              const sk = getSkillById(s.skillId)
              const slotCost = Number(s.energyCost)
              const defCost = Number(sk?.energyCost)
              const cost = Math.max(0, (slotCost > 0 ? slotCost : defCost) || 0)
              const canUse = (heroEnergy ?? 0) >= cost
              return sk ? (
                <button key={i} type="button" onClick={() => canUse && onUseHeroSkill?.(s.skillId, cost)} disabled={!canUse} className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] ${canUse ? 'bg-amber-600 text-gray-900' : 'bg-gray-700 text-gray-500'}`}>
                  {sk.name}（耗{cost}）
                </button>
              ) : null
            })}
          </div>
        )}
        <div>
          <div className="text-gray-500 text-[9px] sm:text-[10px] mb-0.5">前排</div>
          <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center min-h-[52px] sm:min-h-[64px]">
            {(fieldFront || []).map((m, i) => (
              <BattleCard
                key={i}
                card={m}
                attack={m.attack}
                currentHp={m.currentHp}
                maxHp={m.maxHp}
                dying={m.dying}
                selected={isPlayer && phase === 'attack' && selectedAttacker === i}
                dimmed={isPlayer && phase === 'attack' && m.canAttack === false}
                attackAnim={lastAttack?.attackerSide === side && lastAttack?.attackerIndex === i}
                hitAnim={lastAttack?.targetSide === side && lastAttack?.targetHero === false && lastAttack?.targetIndex === i}
                onClick={() => {
                  const canAttack = m.canAttack !== false
                  if (isPlayer && phase === 'attack' && turn === 'player' && m.attack > 0 && canAttack) {
                    setSelectedAttacker(selectedAttacker === i ? null : i)
                  } else if (!isPlayer && phase === 'attack' && onSelectTarget) {
                    onSelectTarget(i)
                  }
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-[9px] sm:text-[10px] mb-0.5">後排</div>
          <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center min-h-[44px] sm:min-h-[56px]">
            {(fieldBack || []).map((slot, i) => (
              slot.faceDown ? (
                <div key={i} className="w-11 h-[56px] sm:w-14 sm:h-[68px] rounded-lg overflow-hidden border-2 border-amber-700/60 shadow-md">
                  <CardBack cardBackUrl={cardBackUrl} className="w-full h-full" />
                </div>
              ) : (
                <BattleCard
                  key={i}
                  card={slot.card}
                  attack={slot.card?.type === 'equipment' ? slot.card.attack : undefined}
                  showCost
                  currentHp={slot.currentUseCount != null ? slot.currentUseCount : undefined}
                  maxHp={slot.card?.type === 'equipment' ? slot.card.useCount : undefined}
                  className="opacity-90"
                />
              )
            ))}
          </div>
        </div>
        {!isPlayer && hand && hand.length > 0 && (
          <div>
            <div className="text-gray-500 text-[9px] sm:text-[10px] mb-0.5">對手手牌</div>
            <div className="flex justify-center items-end gap-0" style={{ marginLeft: 4 }}>
              {hand.map((_, i) => (
                <div key={i} className="w-6 h-8 sm:w-8 sm:h-10 rounded overflow-hidden shadow border border-amber-700/50" style={{ marginLeft: i > 0 ? -6 : 0 }}>
                  <CardBack cardBackUrl={cardBackUrl} className="w-full h-full" />
                </div>
              ))}
            </div>
          </div>
        )}
        {isPlayer && (
          <div>
            <div className="text-gray-500 text-[9px] sm:text-[10px] mb-0.5">手牌（點擊預覽，獻祭/出牌在預覽內確認）</div>
            <div className="flex flex-wrap gap-0.5 sm:gap-1 justify-center">
              {hand.map((c, i) => (
                <div
                  key={i}
                  className={`${(drawInIndices || []).includes(i) ? 'card-draw-in' : ''} ${handDetailIndex === i ? 'ring-2 ring-amber-400 rounded' : ''}`}
                  style={(drawInIndices || []).includes(i) ? { animationDelay: `${Math.min(i, 4) * 80}ms` } : undefined}
                >
                  <BattleCard
                    card={c}
                    showCost
                    compact={handCardCompact}
                    selected={handDetailIndex === i}
                    onClick={() => onHandCardClick && onHandCardClick(i)}
                    className={handDetailIndex === i ? 'border-amber-400' : ''}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const deckRemaining = player?.deck?.length ?? 0
  const enemyDeckRemaining = enemy?.deck?.length ?? 0

  const playerHeroJustHit = lastAttack?.targetSide === 'player' && lastAttack?.targetHero === true
  return (
    <div className={`h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900 ${playerHeroJustHit ? 'battle-screen-shake' : ''}`}>
      <style>{`
        @keyframes cardDrawIn {
          from { transform: translateX(-90px) scale(0.85); opacity: 0.7; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        .card-draw-in { animation: cardDrawIn 0.4s ease-out forwards; }
        @keyframes cardAttackLunge {
          0% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-12px) scale(1.08); }
          70% { transform: translateY(-6px) scale(1.04); }
          100% { transform: translateY(0) scale(1); }
        }
        .card-attack-lunge { animation: cardAttackLunge 0.5s ease-out forwards; }
        @keyframes cardHitShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes cardHitBlood {
          0% { opacity: 0; }
          15% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        .card-hit { animation: cardHitShake 0.45s ease-out forwards; }
        .card-hit::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse at center, rgba(180,0,0,0.5) 0%, rgba(120,0,0,0.3) 40%, transparent 70%);
          pointer-events: none;
          animation: cardHitBlood 0.5s ease-out forwards;
        }
        @keyframes heroHitShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
        }
        @keyframes heroHitBlood {
          0% { opacity: 0; }
          20% { opacity: 0.85; }
          100% { opacity: 0; }
        }
        .hero-hit { animation: heroHitShake 0.5s ease-out forwards; }
        .hero-hit::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse at center, rgba(200,0,0,0.45) 0%, transparent 65%);
          pointer-events: none;
          animation: heroHitBlood 0.55s ease-out forwards;
        }
        @keyframes cardDeathCrack {
          0% { transform: scale(1); opacity: 1; filter: brightness(1); }
          25% { transform: scale(1.05); opacity: 1; filter: brightness(1.3); }
          50% { transform: scale(1.08) rotate(-2deg); opacity: 0.95; filter: brightness(1.1); }
          75% { transform: scale(1.1) rotate(1deg); opacity: 0.7; filter: brightness(0.8); }
          100% { transform: scale(1.15) rotate(3deg); opacity: 0; filter: brightness(0.5); }
        }
        @keyframes cardDeathBlood {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 0.95; transform: scale(1.2); }
          60% { opacity: 0.7; transform: scale(1.4); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        .card-death {
          animation: cardDeathCrack 0.65s ease-out forwards;
        }
        .card-death::before {
          content: '';
          position: absolute;
          inset: -10%;
          border-radius: inherit;
          background: radial-gradient(ellipse at center, rgba(180,0,0,0.7) 0%, rgba(100,0,0,0.4) 40%, transparent 70%);
          pointer-events: none;
          animation: cardDeathBlood 0.65s ease-out forwards;
          z-index: 2;
        }
        @keyframes screenShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-4px); }
          30% { transform: translateX(4px); }
          45% { transform: translateX(-3px); }
          60% { transform: translateX(3px); }
          75% { transform: translateX(-2px); }
        }
        .battle-screen-shake { animation: screenShake 0.4s ease-out; }
      `}</style>
      {/* 頂部：標題與訊息，不捲動 */}
      <div className="flex-shrink-0 p-1.5 sm:p-2 max-w-2xl w-full mx-auto border-b border-amber-900/40 bg-slate-900/50">
        <div className="flex justify-between items-center gap-1">
          <h3 className="text-amber-300 font-bold text-sm sm:text-base truncate">對戰中</h3>
          <button type="button" onClick={onExit} className="text-gray-400 hover:text-white text-[10px] sm:text-xs px-2 py-1.5 rounded border border-gray-600 flex-shrink-0 min-h-[36px] touch-manipulation">離開</button>
        </div>
        {message && <p className="text-amber-100/90 text-[10px] sm:text-xs truncate mt-0.5">{message}</p>}
      </div>
      {/* 中間：對戰場地，可捲動 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2 max-w-2xl mx-auto">
        {/* 敵方區域：牌堆與墓地在敵方那邊，與我方左右相對 */}
        <div className="flex gap-1.5 sm:gap-2">
          <div className="flex-shrink-0 flex flex-col items-center justify-end gap-1">
            <div className="flex flex-col items-center" aria-label="敵方墓地">
              <span className="text-gray-500 text-[8px] sm:text-[10px]">墓地</span>
              <div className="w-8 h-10 sm:w-10 sm:h-12 rounded border border-gray-600 bg-gray-800/90 flex items-center justify-center">
                <span className="text-amber-400/90 font-mono text-[10px] font-bold">{enemyGraveyardCount}</span>
              </div>
            </div>
            <div className="relative w-10 h-12 sm:w-12 sm:h-14 flex items-center justify-center" aria-label="敵方牌堆">
              <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ transform: 'translateY(2px)' }}>
                <CardBack cardBackUrl={enemyCardBackUrl ?? cardBackUrl} className="w-full h-full rounded-lg" />
              </div>
              <div className="absolute inset-0 rounded-lg overflow-hidden bg-gray-800/80" style={{ transform: 'translateY(4px)' }}>
                <CardBack cardBackUrl={enemyCardBackUrl ?? cardBackUrl} className="w-full h-full rounded-lg opacity-90" />
              </div>
              <div className="absolute inset-0 rounded-lg border-2 border-amber-500/60 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-amber-400 font-mono text-[10px] mt-0.5 font-semibold">{enemyDeckRemaining}</p>
          </div>
          <div className="flex-1 min-w-0">
            <Field
              side="enemy"
              hero={enemy.hero}
              heroEnergy={null}
              heroSkills={null}
              fieldFront={enemy.fieldFront}
              fieldBack={enemy.fieldBack}
              hand={enemy.hand}
              isPlayer={false}
              enemyDeckRemaining={enemyDeckRemaining}
              enemySacrificePoints={enemy.sacrificePoints ?? 0}
              cardBackUrl={enemyCardBackUrl ?? cardBackUrl}
              onSelectTarget={(i) => handleSelectAttackTarget('enemy', i)}
              onSelectTargetHero={canAttackEnemyHero ? handleSelectAttackTargetHero : undefined}
            />
          </div>
        </div>
        <hr className="border-gray-600 flex-shrink-0" />
        {/* 我方區域：牌堆與墓地在我方那邊 */}
        <div className="flex gap-1.5 sm:gap-2">
          <div className="flex-shrink-0 flex flex-col items-center justify-end gap-1">
            <div className="flex flex-col items-center" aria-label="墓地">
              <span className="text-gray-500 text-[8px] sm:text-[10px]">墓地</span>
              <div className="w-8 h-10 sm:w-10 sm:h-12 rounded border border-gray-600 bg-gray-800/90 flex items-center justify-center">
                <span className="text-amber-400/90 font-mono text-[10px] font-bold">{playerGraveyardCount}</span>
              </div>
            </div>
            <div className="relative w-10 h-12 sm:w-12 sm:h-14 flex items-center justify-center" aria-label="牌堆">
              <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ transform: 'translateY(2px)' }}>
                <CardBack cardBackUrl={playerCardBackUrl ?? cardBackUrl} className="w-full h-full rounded-lg" />
              </div>
              <div className="absolute inset-0 rounded-lg overflow-hidden bg-gray-800/80" style={{ transform: 'translateY(4px)' }}>
                <CardBack cardBackUrl={playerCardBackUrl ?? cardBackUrl} className="w-full h-full rounded-lg opacity-90" />
              </div>
              <div className="absolute inset-0 rounded-lg border-2 border-amber-500/60 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-amber-400 font-mono text-[10px] mt-0.5 font-semibold">{deckRemaining}</p>
          </div>
          <div className="flex-1 min-w-0">
            <Field
              side="player"
              hero={player.hero}
              heroEnergy={player.hero?.energy ?? 0}
              heroSkills={player.hero?.skills}
              fieldFront={player.fieldFront}
              fieldBack={player.fieldBack}
              hand={player.hand}
              isPlayer={true}
              sacrificePoints={player.sacrificePoints ?? 0}
              drawInIndices={drawInIndices}
              cardBackUrl={playerCardBackUrl ?? cardBackUrl}
              onSelectHeroAttacker={canHeroAttack ? () => setSelectedAttacker(-1) : undefined}
              onUseHeroSkill={useHeroSkill}
            onSacrificeCard={sacrificeCard}
            onPlayMinion={(i) => playMinion('player', i)}
            onHandCardClick={(i) => setHandDetailIndex((prev) => (prev === i ? null : i))}
            handDetailIndex={handDetailIndex}
            handCardCompact={true}
          />
          </div>
        </div>
      </div>
      </div>
      {/* 底部操作列：固定不捲動、易點擊，留出 safe area */}
      <div
        className="flex-shrink-0 border-t border-amber-800/50 bg-slate-900/95 backdrop-blur-sm pt-1"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-2xl mx-auto px-2 sm:px-3 flex flex-wrap items-center gap-2">
          {phase === 'sacrifice' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhase('play')
                  setMessage(player.hand.length === 0 ? '無手牌可獻祭，出牌或進入攻擊階段' : '略過獻祭，出牌或進入攻擊階段')
                }}
                className="min-h-[40px] px-3 py-2 bg-amber-600 hover:bg-amber-500 text-gray-900 rounded-lg font-semibold text-xs touch-manipulation active:scale-[0.98]"
              >
                略過獻祭
              </button>
              <span className="text-gray-400 text-[10px] sm:text-xs">點手牌預覽後於彈窗內按獻祭</span>
            </>
          )}
          {phase === 'play' && (
            <button type="button" onClick={endPlayPhase} className="min-h-[40px] px-3 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg font-semibold text-xs touch-manipulation active:scale-[0.98]">進入攻擊階段</button>
          )}
          {phase === 'attack' && (
            <button type="button" onClick={endTurn} className="min-h-[40px] px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold text-xs touch-manipulation active:scale-[0.98]">結束回合</button>
          )}
        </div>
        <div className="max-w-2xl mx-auto px-2 sm:px-3 pt-0.5 pb-0.5">
          <button type="button" onClick={() => setHintOpen((o) => !o)} className="text-amber-200/50 hover:text-amber-200/80 text-[10px] min-h-[28px] touch-manipulation">
            {hintOpen ? '收起規則' : '規則說明'}
          </button>
          {hintOpen && (
            <p className="text-amber-200/60 text-[9px] sm:text-[10px] mt-0.5">
              前排小怪、後排裝備／效果／陷阱。英雄每回合+1能量，可消耗能量釋放技能；裝備放出後英雄可攻擊，依使用次數消耗。陷阱牌背向上，觸發後套用技能（之後擴充）。
            </p>
          )}
        </div>
      </div>

      {/* 手牌預覽：點擊手牌放大，關閉／獻祭／出牌需按鈕確認 */}
      {handDetailIndex != null && player?.hand?.[handDetailIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
          onClick={() => setHandDetailIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-gray-800 rounded-xl border border-amber-600/60 shadow-xl max-w-[280px] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 flex justify-center">
              <div className="scale-[1.8] origin-center pointer-events-none">
                <BattleCard
                  card={player.hand[handDetailIndex]}
                  showCost
                  attack={player.hand[handDetailIndex]?.attack}
                  hp={player.hand[handDetailIndex]?.hp}
                  className="cursor-default"
                />
              </div>
            </div>
              <div className="mt-2 text-center text-white text-sm font-medium">{player.hand[handDetailIndex]?.name}</div>
              <div className="mt-1 text-gray-400 text-xs text-center">
                {player.hand[handDetailIndex]?.type === 'minion' && `小怪 · 攻${player.hand[handDetailIndex]?.attack ?? 0} 血${player.hand[handDetailIndex]?.hp ?? 0}`}
                {player.hand[handDetailIndex]?.type === 'equipment' && `裝備 · 攻${player.hand[handDetailIndex]?.attack ?? 0}`}
                {player.hand[handDetailIndex]?.type === 'effect' && '效果'}
                {player.hand[handDetailIndex]?.type === 'trap' && '陷阱'}
                {player.hand[handDetailIndex]?.cost != null && player.hand[handDetailIndex].cost > 0 && ` · 消耗 ${player.hand[handDetailIndex].cost} 獻祭點`}
              </div>
              {player.hand[handDetailIndex]?.description && (
                <p className="mt-1 text-gray-500 text-[10px] text-center line-clamp-3">{player.hand[handDetailIndex].description}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-3 border-t border-gray-700">
              <button type="button" onClick={() => setHandDetailIndex(null)} className="flex-1 min-w-[60px] py-2 bg-gray-600 text-white rounded-lg text-xs font-medium touch-manipulation">關閉</button>
              {phase === 'sacrifice' && (
                <button type="button" onClick={() => { sacrificeCard(handDetailIndex); setHandDetailIndex(null); }} className="flex-1 min-w-[60px] py-2 bg-amber-600 text-gray-900 rounded-lg text-xs font-medium touch-manipulation">獻祭</button>
              )}
              {phase === 'play' && player.hand[handDetailIndex]?.type === 'minion' && (player.sacrificePoints ?? 0) >= (player.hand[handDetailIndex]?.cost ?? 0) && (player.fieldFront?.length ?? 0) <= MAX_FRONT - 1 && (
                <button type="button" onClick={() => { playMinion('player', handDetailIndex); setHandDetailIndex(null); }} className="flex-1 min-w-[60px] py-2 bg-green-600 text-white rounded-lg text-xs font-medium touch-manipulation">出牌</button>
              )}
              {phase === 'play' && (player.hand[handDetailIndex]?.type === 'equipment' || player.hand[handDetailIndex]?.type === 'effect' || player.hand[handDetailIndex]?.type === 'trap') && (player.sacrificePoints ?? 0) >= (player.hand[handDetailIndex]?.cost ?? 0) && (player.fieldBack?.length ?? 0) <= MAX_BACK - 1 && (
                <button type="button" onClick={() => { playMinion('player', handDetailIndex); setHandDetailIndex(null); }} className="flex-1 min-w-[60px] py-2 bg-green-600 text-white rounded-lg text-xs font-medium touch-manipulation">出牌</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
