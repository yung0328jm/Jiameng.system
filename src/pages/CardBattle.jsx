// 卡牌對戰：回合制 PvE，英雄血量歸 0 即敗
import { useState, useEffect, useRef } from 'react'
import { getCardById, getSkillById } from '../utils/cardGameStorage.js'

const MAX_FRONT = 5  // 前排小怪數量上限
const MAX_BACK = 5   // 後排裝備/效果/陷阱數量上限
const HAND_SIZE_START = 5
const DECK_SIZE = 50
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
    <div className={`w-full h-full rounded-lg border-2 border-amber-600/50 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center ${className}`}>
      <span className="text-amber-400/60 text-[8px]">背面</span>
    </div>
  )
}

function BattleCard({ card, showCost = false, attack, hp, currentHp, maxHp, selected, dimmed, onClick, className = '', attackAnim, hitAnim }) {
  const atk = attack ?? card?.attack ?? 0
  const health = currentHp ?? hp ?? card?.hp ?? 0
  const maxHealth = maxHp ?? card?.maxHp ?? card?.hp ?? 0
  const name = card?.name || '—'
  const cover = card?.coverImage
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-14 h-[72px] sm:w-[72px] sm:h-[96px] md:w-[80px] md:h-[108px] rounded-xl overflow-visible border-2 shadow-lg transition-all ${selected ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105' : 'border-amber-700/60 hover:border-amber-500'} ${dimmed ? 'opacity-60' : ''} ${attackAnim ? 'card-attack-lunge' : ''} ${hitAnim ? 'card-hit' : ''} ${className}`}
    >
      <div className="absolute inset-0 rounded-[10px] overflow-hidden bg-gray-900">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-gray-500 text-[10px]">無圖</div>
        )}
      </div>
      <div className="absolute inset-0 rounded-[10px] overflow-hidden bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      {showCost && (card?.cost != null && card.cost > 0) && (
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center text-[10px] font-bold text-gray-900">{card.cost}</div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-1 flex items-center justify-between gap-0.5">
        <span className="w-6 h-6 rounded-full bg-red-900/90 flex items-center justify-center text-[10px] font-bold text-red-200" title="攻擊">{atk}</span>
        <span className="text-white text-[9px] truncate flex-1 text-center drop-shadow">{name}</span>
        <span className="w-6 h-6 rounded-full bg-green-900/90 flex items-center justify-center text-[10px] font-bold text-green-200" title="血量">{currentHp != null ? `${currentHp}/${maxHealth}` : health}</span>
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
      className={`relative w-20 h-28 sm:w-24 sm:h-32 md:w-28 md:h-36 rounded-xl overflow-hidden border-2 shadow-xl ${isTarget ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-amber-700/70'} ${hitAnim ? 'hero-hit' : ''} ${className}`}
    >
      <div className="absolute inset-0 bg-gray-900">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-gray-800 flex items-center justify-center text-amber-200/80 text-xs">英雄</div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      <div className="absolute top-1 left-1 right-1">
        <span className="text-amber-200 text-xs font-semibold drop-shadow truncate block">{hero.name}</span>
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex justify-center">
        <span className="px-2 py-0.5 rounded-full bg-red-900/90 text-red-200 text-xs font-bold">HP {hero.currentHp ?? hero.hp}/{hero.maxHp ?? hero.hp}</span>
      </div>
    </Wrapper>
  )
}

export default function CardBattle({ playerDeck, playerAccount, onExit, cardBackUrl }) {
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
  const prevHandLengthRef = useRef(0)
  const attackAnimTimeoutRef = useRef(null)

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
          setPlayer((prev) => ({ ...prev, fieldFront: (prev.fieldFront || []).filter((_, i) => i !== targetFieldIndex) }))
        } else {
          setEnemy((prev) => ({ ...prev, fieldFront: (prev.fieldFront || []).filter((_, i) => i !== targetFieldIndex) }))
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
    e.fieldFront = (e.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    if (e.deck.length > 0 && e.hand.length < 10) {
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
    const nextP = { ...p }
    nextP.fieldFront = (nextP.fieldFront || []).map((m) => ({ ...m, canAttack: true }))
    nextP.hero = nextP.hero ? { ...nextP.hero, energy: (nextP.hero.energy ?? 0) + 1 } : null
    setPlayer(() => {
      if (nextP.deck.length > 0 && nextP.hand.length < 10) {
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
    if (turn !== 'player' || !player?.hero) return
    const energy = player.hero.energy ?? 0
    if (energy < energyCost) return
    const skill = getSkillById(skillId)
    if (!skill) return
    setPlayer((prev) => ({
      ...prev,
      hero: prev.hero ? { ...prev.hero, energy: (prev.hero.energy ?? 0) - energyCost } : null
    }))
    setMessage(`使用了「${skill.name}」`)
    const key = skill.skillKey || ''
    const damageAllMatch = key.match(/^damage_all_minions_(\d+)$/)
    if (damageAllMatch) {
      const damage = Math.max(0, parseInt(damageAllMatch[1], 10) || 3)
      setEnemy((prev) => ({
        ...prev,
        fieldFront: (prev.fieldFront || []).map((m) => {
          const newHp = (m.currentHp ?? m.hp) - damage
          return newHp <= 0 ? null : { ...m, currentHp: newHp }
        }).filter(Boolean)
      }))
    }
  }

  const Field = ({ side, hero, heroEnergy, heroSkills, fieldFront, fieldBack, hand, isPlayer, sacrificePoints, drawInIndices, enemyDeckRemaining, enemySacrificePoints, cardBackUrl, onSelectAttacker, onSelectTarget, onSelectTargetHero, onSelectHeroAttacker, onUseHeroSkill, onSacrificeCard, onPlayMinion }) => (
    <div className={`rounded-lg sm:rounded-xl border border-amber-900/50 overflow-hidden flex-shrink-0 min-h-0 flex flex-col ${isPlayer ? 'bg-gradient-to-b from-gray-900/80 to-gray-800/60' : 'bg-gradient-to-b from-gray-800/60 to-gray-900/80'}`}>
      <div className="px-2 py-1 sm:px-3 sm:py-2 flex items-center gap-2 flex-wrap border-b border-amber-800/40">
        <span className="text-amber-200/90 font-medium text-xs sm:text-base">{side === 'player' ? '我方' : '敵方'}</span>
        {!isPlayer && (
          <>
            <span className="text-amber-400/90 text-[10px] sm:text-sm">獻祭 {enemySacrificePoints ?? 0}</span>
            <span className="text-gray-400 text-[10px] sm:text-sm">牌庫 {enemyDeckRemaining ?? 0}/{DECK_SIZE}</span>
            <span className="text-gray-400 text-[10px] sm:text-sm">手牌 {hand?.length ?? 0}</span>
          </>
        )}
        {isPlayer && sacrificePoints != null && (
          <span className="text-amber-400 text-[10px] sm:text-sm">獻祭 {sacrificePoints}</span>
        )}
      </div>
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 flex-1 min-h-0">
        <div>
          <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5 flex items-center justify-center gap-2">
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
          <div className="flex flex-wrap gap-1 justify-center items-center">
            <span className="text-gray-500 text-[10px]">英雄技能：</span>
            {(heroSkills || []).map((s, i) => {
              const sk = getSkillById(s.skillId)
              const cost = s.energyCost ?? sk?.energyCost ?? 0
              const canUse = (heroEnergy ?? 0) >= cost
              return sk ? (
                <button key={i} type="button" onClick={() => canUse && onUseHeroSkill?.(s.skillId, cost)} disabled={!canUse} className={`px-2 py-1 rounded text-xs ${canUse ? 'bg-amber-600 text-gray-900' : 'bg-gray-700 text-gray-500'}`}>
                  {sk.name}（耗{cost}）
                </button>
              ) : null
            })}
          </div>
        )}
        <div>
          <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5">前排（小怪）</div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center min-h-[80px] sm:min-h-[100px]">
            {(fieldFront || []).map((m, i) => (
              <BattleCard
                key={i}
                card={m}
                attack={m.attack}
                currentHp={m.currentHp}
                maxHp={m.maxHp}
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
          <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5">後排（裝備／效果／陷阱）</div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center min-h-[60px]">
            {(fieldBack || []).map((slot, i) => (
              slot.faceDown ? (
                <div key={i} className="w-14 h-[72px] sm:w-[72px] sm:h-[96px] rounded-xl overflow-hidden border-2 border-amber-700/60 shadow-lg">
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
            <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5">對手手牌</div>
            <div className="flex justify-center items-end gap-0" style={{ marginLeft: 6 }}>
              {hand.map((_, i) => (
                <div key={i} className="w-8 h-10 sm:w-11 sm:h-14 rounded overflow-hidden shadow border border-amber-700/50" style={{ marginLeft: i > 0 ? -8 : 0 }}>
                  <CardBack cardBackUrl={cardBackUrl} className="w-full h-full" />
                </div>
              ))}
            </div>
          </div>
        )}
        {isPlayer && (
          <div>
            <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5">手牌</div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
              {hand.map((c, i) => (
                <div
                  key={i}
                  className={`${(drawInIndices || []).includes(i) ? 'card-draw-in' : ''}`}
                  style={(drawInIndices || []).includes(i) ? { animationDelay: `${Math.min(i, 4) * 80}ms` } : undefined}
                >
                  <BattleCard
                    card={c}
                    showCost
                    selected={false}
                    onClick={() => phase === 'sacrifice' ? (onSacrificeCard && onSacrificeCard(i)) : (onPlayMinion && onPlayMinion(i))}
                    className={phase === 'sacrifice' ? 'border-amber-500/80' : ''}
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

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900">
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
      `}</style>
      {/* 頂部：標題與訊息，不捲動 */}
      <div className="flex-shrink-0 p-2 sm:p-3 max-w-2xl w-full mx-auto border-b border-amber-900/40 bg-slate-900/50">
        <div className="flex justify-between items-center gap-2">
          <h3 className="text-amber-300 font-bold text-base sm:text-lg truncate">對戰中</h3>
          <button type="button" onClick={onExit} className="text-gray-400 hover:text-white text-sm px-3 py-2 rounded border border-gray-600 flex-shrink-0 min-h-[44px] touch-manipulation">離開</button>
        </div>
        {message && <p className="text-amber-100/90 text-xs sm:text-sm truncate mt-1">{message}</p>}
      </div>
      {/* 中間：對戰場地，可捲動 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="p-2 sm:p-4 space-y-2 sm:space-y-4 max-w-2xl mx-auto">
        <div className="flex gap-2 sm:gap-4">
        <div className="flex-shrink-0 flex flex-col items-center justify-end">
          <div className="relative w-12 h-14 sm:w-16 sm:h-20 flex items-center justify-center" aria-label="牌堆">
            <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ transform: 'translateY(2px)' }}>
              <CardBack cardBackUrl={cardBackUrl} className="w-full h-full rounded-lg" />
            </div>
            <div className="absolute inset-0 rounded-lg overflow-hidden bg-gray-800/80" style={{ transform: 'translateY(4px)' }}>
              <CardBack cardBackUrl={cardBackUrl} className="w-full h-full rounded-lg opacity-90" />
            </div>
            <div className="absolute inset-0 rounded-lg border-2 border-amber-500 flex items-center justify-center bg-gray-800/90">
              <span className="text-amber-400/90 text-[10px] sm:text-xs font-bold">牌庫</span>
            </div>
          </div>
          <p className="text-amber-400 font-mono text-xs sm:text-sm mt-1 font-semibold">{deckRemaining}/{DECK_SIZE}</p>
        </div>
        <div className="flex-1 min-w-0 space-y-2 sm:space-y-4 min-h-0 flex flex-col">
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
            cardBackUrl={cardBackUrl}
            onSelectTarget={(i) => handleSelectAttackTarget('enemy', i)}
            onSelectTargetHero={canAttackEnemyHero ? handleSelectAttackTargetHero : undefined}
          />
          <hr className="border-gray-600 flex-shrink-0" />
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
            cardBackUrl={cardBackUrl}
            onSelectHeroAttacker={canHeroAttack ? () => setSelectedAttacker(-1) : undefined}
            onUseHeroSkill={useHeroSkill}
            onSacrificeCard={sacrificeCard}
            onPlayMinion={(i) => playMinion('player', i)}
          />
        </div>
        </div>
      </div>
      </div>
      {/* 底部操作列：固定不捲動、易點擊，留出 safe area */}
      <div
        className="flex-shrink-0 border-t border-amber-800/50 bg-slate-900/95 backdrop-blur-sm pt-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-2xl mx-auto px-3 sm:px-4 flex flex-wrap items-center gap-3">
          {phase === 'sacrifice' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhase('play')
                  setMessage(player.hand.length === 0 ? '無手牌可獻祭，出牌或進入攻擊階段' : '略過獻祭，出牌或進入攻擊階段')
                }}
                className="min-h-[48px] px-4 py-3 sm:px-5 sm:py-2.5 bg-amber-600 hover:bg-amber-500 text-gray-900 rounded-lg font-semibold text-sm touch-manipulation active:scale-[0.98]"
              >
                略過獻祭
              </button>
              <span className="text-gray-400 text-xs sm:text-sm">或點擊手牌獻祭得 1 點</span>
            </>
          )}
          {phase === 'play' && (
            <button type="button" onClick={endPlayPhase} className="min-h-[48px] px-4 py-3 sm:px-5 sm:py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg font-semibold text-sm touch-manipulation active:scale-[0.98]">進入攻擊階段</button>
          )}
          {phase === 'attack' && (
            <button type="button" onClick={endTurn} className="min-h-[48px] px-4 py-3 sm:px-5 sm:py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold text-sm touch-manipulation active:scale-[0.98]">結束回合</button>
          )}
        </div>
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-1 pb-1">
          <button type="button" onClick={() => setHintOpen((o) => !o)} className="text-amber-200/50 hover:text-amber-200/80 text-xs min-h-[32px] touch-manipulation">
            {hintOpen ? '收起規則' : '規則說明'}
          </button>
          {hintOpen && (
            <p className="text-amber-200/60 text-[10px] sm:text-xs mt-1">
              前排小怪、後排裝備／效果／陷阱。英雄每回合+1能量，可消耗能量釋放技能；裝備放出後英雄可攻擊，依使用次數消耗。陷阱牌背向上，觸發後套用技能（之後擴充）。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
