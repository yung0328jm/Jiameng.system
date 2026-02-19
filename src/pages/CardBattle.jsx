// 卡牌對戰：回合制 PvE，英雄血量歸 0 即敗
import { useState, useEffect, useRef } from 'react'
import { getCardById } from '../utils/cardGameStorage.js'

const MAX_FIELD = 5
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

function BattleCard({ card, showCost = false, attack, hp, currentHp, maxHp, selected, dimmed, onClick, className = '' }) {
  const atk = attack ?? card?.attack ?? 0
  const health = currentHp ?? hp ?? card?.hp ?? 0
  const maxHealth = maxHp ?? card?.maxHp ?? card?.hp ?? 0
  const name = card?.name || '—'
  const cover = card?.coverImage
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-[72px] h-[96px] sm:w-[80px] sm:h-[108px] rounded-xl overflow-hidden border-2 shadow-lg transition-all ${selected ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105' : 'border-amber-700/60 hover:border-amber-500'} ${dimmed ? 'opacity-60' : ''} ${className}`}
    >
      <div className="absolute inset-0 bg-gray-900">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-gray-500 text-[10px]">無圖</div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
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

function HeroSlot({ hero, isTarget, onClick, className = '' }) {
  if (!hero) return null
  const cover = hero.coverImage
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative w-24 h-32 sm:w-28 sm:h-36 rounded-xl overflow-hidden border-2 shadow-xl ${isTarget ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-amber-700/70'} ${className}`}
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
  const prevHandLengthRef = useRef(0)

  useEffect(() => {
    const pHero = getCard(playerDeck.heroId)
    const pDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: hand } = drawCards(pDeck, Math.min(HAND_SIZE_START, pDeck.length))
    const p = {
      hero: pHero ? { ...pHero, currentHp: pHero.hp, maxHp: pHero.hp } : null,
      deck: pDeck,
      hand,
      field: [],
      sacrificePoints: 0
    }
    const eHero = getCard(playerDeck.heroId)
    const eDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: eHand } = drawCards(eDeck, Math.min(HAND_SIZE_START, eDeck.length))
    const e = {
      hero: eHero ? { ...eHero, currentHp: eHero.hp, maxHp: eHero.hp } : null,
      deck: eDeck,
      hand: eHand,
      field: [],
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
      field: (prev.field || []).map((m) => ({ ...m, canAttack: true }))
    }))
    setPhase('play')
    setMessage(`獻祭了「${card.name}」，獲得 1 點獻祭點數。累積足夠點數才能打出卡牌（出場點數）。出牌或進入攻擊階段`)
  }

  const playMinion = (side, handIndex) => {
    if (turn !== 'player' || phase !== 'play') return
    const isPlayer = side === 'player'
    const state = isPlayer ? player : enemy
    if (state.field.length >= MAX_FIELD) {
      setMessage('場上已滿')
      return
    }
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
    const newField = [...state.field, { ...card, currentHp: card.hp, maxHp: card.hp, canAttack: false }]
    if (isPlayer) {
      setPlayer((prev) => ({
        ...prev,
        hand: newHand,
        field: newField,
        sacrificePoints: Math.max(0, (prev.sacrificePoints || 0) - cost)
      }))
    } else {
      setEnemy((prev) => ({ ...prev, hand: newHand, field: newField }))
    }
    setMessage('')
  }

  const attack = (attackerSide, attackerFieldIndex, targetSide, targetFieldIndexOrHero) => {
    if (turn !== 'player' || phase !== 'attack') return
    const attacker = (attackerSide === 'player' ? player : enemy).field[attackerFieldIndex]
    if (!attacker || attacker.attack <= 0 || attacker.canAttack === false) return
    const isTargetHero = targetFieldIndexOrHero === -1 || targetFieldIndexOrHero === undefined
    if (isTargetHero && targetSide === 'enemy') {
      const enemyField = enemy.field || []
      const canDirect = attacker.canAttackHeroDirect === true
      if (enemyField.length > 0 && !canDirect) return
    }
    if (isTargetHero && targetSide === 'player') {
      const playerField = player.field || []
      if (playerField.length > 0) return
    }
    let target
    if (isTargetHero) {
      target = (targetSide === 'player' ? player : enemy).hero
      if (!target) return
    } else {
      target = (targetSide === 'player' ? player : enemy).field[targetFieldIndexOrHero]
      if (!target) return
    }
    const newHp = (target.currentHp ?? target.hp) - attacker.attack
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
          setPlayer((prev) => ({ ...prev, field: prev.field.filter((_, i) => i !== targetFieldIndex) }))
        } else {
          setEnemy((prev) => ({ ...prev, field: prev.field.filter((_, i) => i !== targetFieldIndex) }))
        }
      } else {
        if (targetSide === 'player') {
          setPlayer((prev) => {
            const f = [...prev.field]
            f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: newHp }
            return { ...prev, field: f }
          })
        } else {
          setEnemy((prev) => {
            const f = [...prev.field]
            f[targetFieldIndex] = { ...f[targetFieldIndex], currentHp: newHp }
            return { ...prev, field: f }
          })
        }
      }
    }
    setMessage(`${attacker.name} 攻擊！`)
    // 該單位本回合已攻擊，不可再攻擊
    if (attackerSide === 'player') {
      setPlayer((prev) => {
        const f = [...(prev.field || [])]
        if (f[attackerFieldIndex]) f[attackerFieldIndex] = { ...f[attackerFieldIndex], canAttack: false }
        return { ...prev, field: f }
      })
    } else {
      setEnemy((prev) => {
        const f = [...(prev.field || [])]
        if (f[attackerFieldIndex]) f[attackerFieldIndex] = { ...f[attackerFieldIndex], canAttack: false }
        return { ...prev, field: f }
      })
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
    e.field = (e.field || []).map((m) => ({ ...m, canAttack: true }))
    if (e.deck.length > 0 && e.hand.length < 10) {
      const drawn = e.deck.shift()
      e.hand = [...e.hand, drawn]
    }
    const sacrificeIdx = e.hand.findIndex((c) => c && c.type !== 'hero')
    if (sacrificeIdx !== -1) {
      e.sacrificePoints = (e.sacrificePoints || 0) + 1
      e.hand = e.hand.filter((_, i) => i !== sacrificeIdx)
    }
    while (e.field.length < MAX_FIELD && e.hand.some((c) => c.type !== 'hero')) {
      const idx = e.hand.findIndex((c) => c.type !== 'hero')
      if (idx === -1) break
      const card = e.hand[idx]
      const cost = card.cost ?? 0
      if ((e.sacrificePoints || 0) < cost) break
      e.sacrificePoints = (e.sacrificePoints || 0) - cost
      e.hand = e.hand.filter((_, i) => i !== idx)
      e.field = [...e.field, { ...card, currentHp: card.hp, maxHp: card.hp, canAttack: false }]
    }
    e.field.forEach((minion) => {
      if (minion.attack <= 0 || minion.canAttack === false) return
      const canAttackHero = minion.canAttackHeroDirect === true
      if (p.field.length > 0) {
        const targetIdx = Math.floor(Math.random() * p.field.length)
        const target = p.field[targetIdx]
        const newHp = (target.currentHp || target.hp) - minion.attack
        if (newHp <= 0) {
          p.field = p.field.filter((_, j) => j !== targetIdx)
        } else {
          p.field = p.field.map((m, j) => (j === targetIdx ? { ...m, currentHp: newHp } : m))
        }
      } else if (p.hero && (canAttackHero || p.field.length === 0)) {
        const newHp = Math.max(0, (p.hero.currentHp || p.hero.hp) - minion.attack)
        p.hero = { ...p.hero, currentHp: newHp }
      }
    })
    setEnemy(e)
    const nextP = { ...p }
    nextP.field = (nextP.field || []).map((m) => ({ ...m, canAttack: true }))
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
    if (selectedAttacker === null) return
    attack('player', selectedAttacker, targetSide, targetFieldIndex)
    setSelectedAttacker(null)
  }

  const handleSelectAttackTargetHero = () => {
    if (phase !== 'attack' || turn !== 'player') return
    if (selectedAttacker === null) return
    attack('player', selectedAttacker, 'enemy', -1)
    setSelectedAttacker(null)
  }

  const canAttackEnemyHero = enemy.field.length === 0

  const Field = ({ side, hero, field, hand, isPlayer, sacrificePoints, drawInIndices, enemyDeckRemaining, enemySacrificePoints, cardBackUrl, onSelectAttacker, onSelectTarget, onSelectTargetHero, onSacrificeCard, onPlayMinion }) => (
    <div className={`rounded-xl border border-amber-900/50 overflow-hidden ${isPlayer ? 'bg-gradient-to-b from-gray-900/80 to-gray-800/60' : 'bg-gradient-to-b from-gray-800/60 to-gray-900/80'}`}>
      <div className="px-3 py-2 flex items-center gap-3 flex-wrap border-b border-amber-800/40">
        <span className="text-amber-200/90 font-medium">{side === 'player' ? '我方' : '敵方'}</span>
        {!isPlayer && (
          <>
            <span className="text-amber-400/90 text-sm">獻祭 {enemySacrificePoints ?? 0}</span>
            <span className="text-gray-400 text-sm">牌庫 {enemyDeckRemaining ?? 0}/{DECK_SIZE}</span>
            <span className="text-gray-400 text-sm">手牌 {hand?.length ?? 0} 張</span>
          </>
        )}
        {isPlayer && sacrificePoints != null && (
          <span className="text-amber-400 text-sm">獻祭點數 {sacrificePoints}</span>
        )}
      </div>
      <div className="p-3 space-y-3">
        <div>
          <div className="text-gray-500 text-xs mb-1">英雄</div>
          <div className="flex justify-center">
            {hero && (
              <HeroSlot
                hero={hero}
                isTarget={onSelectTargetHero && side === 'enemy'}
                onClick={onSelectTargetHero && side === 'enemy' ? onSelectTargetHero : undefined}
                className={side === 'enemy' && !onSelectTargetHero ? 'opacity-75 cursor-default' : 'cursor-pointer'}
              />
            )}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">場上單位</div>
          <div className="flex flex-wrap gap-2 justify-center min-h-[100px]">
            {field.map((m, i) => (
              <BattleCard
                key={i}
                card={m}
                attack={m.attack}
                currentHp={m.currentHp}
                maxHp={m.maxHp}
                selected={isPlayer && phase === 'attack' && selectedAttacker === i}
                dimmed={isPlayer && phase === 'attack' && m.canAttack === false}
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
        {!isPlayer && hand && hand.length > 0 && (
          <div>
            <div className="text-gray-500 text-xs mb-1">對手手牌（卡背）</div>
            <div className="flex justify-center items-end gap-0" style={{ marginLeft: 8 }}>
              {hand.map((_, i) => (
                <div key={i} className="w-11 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shadow border border-amber-700/50" style={{ marginLeft: i > 0 ? -10 : 0 }}>
                  <CardBack cardBackUrl={cardBackUrl} className="w-full h-full" />
                </div>
              ))}
            </div>
          </div>
        )}
        {isPlayer && (
          <div>
            <div className="text-gray-500 text-xs mb-1">手牌</div>
            <div className="flex flex-wrap gap-2 justify-center">
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900">
      <style>{`
        @keyframes cardDrawIn {
          from { transform: translateX(-90px) scale(0.85); opacity: 0.7; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        .card-draw-in { animation: cardDrawIn 0.4s ease-out forwards; }
      `}</style>
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-amber-300 font-bold text-lg">對戰中</h3>
          <button type="button" onClick={onExit} className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded border border-gray-600">離開</button>
        </div>
        {message && <p className="text-amber-100/90 text-sm">{message}</p>}
        <div className="flex gap-4">
        <div className="flex-shrink-0 flex flex-col items-center justify-end">
          <div className="relative w-16 h-20 flex items-center justify-center" aria-label="牌堆">
            <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ transform: 'translateY(2px)' }}>
              <CardBack cardBackUrl={cardBackUrl} className="w-full h-full rounded-lg" />
            </div>
            <div className="absolute inset-0 rounded-lg overflow-hidden bg-gray-800/80" style={{ transform: 'translateY(4px)' }}>
              <CardBack cardBackUrl={cardBackUrl} className="w-full h-full rounded-lg opacity-90" />
            </div>
            <div className="absolute inset-0 rounded-lg border-2 border-amber-500 flex items-center justify-center bg-gray-800/90">
              <span className="text-amber-400/90 text-xs font-bold">牌庫</span>
            </div>
          </div>
          <p className="text-amber-400 font-mono text-sm mt-2 font-semibold">{deckRemaining}/{DECK_SIZE}</p>
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          <Field
            side="enemy"
            hero={enemy.hero}
            field={enemy.field}
            hand={enemy.hand}
            isPlayer={false}
            enemyDeckRemaining={enemyDeckRemaining}
            enemySacrificePoints={enemy.sacrificePoints ?? 0}
            cardBackUrl={cardBackUrl}
            onSelectTarget={(i) => handleSelectAttackTarget('enemy', i)}
            onSelectTargetHero={canAttackEnemyHero ? handleSelectAttackTargetHero : undefined}
          />
          <hr className="border-gray-600" />
          <Field
            side="player"
            hero={player.hero}
            field={player.field}
            hand={player.hand}
            isPlayer={true}
            sacrificePoints={player.sacrificePoints ?? 0}
            drawInIndices={drawInIndices}
            onSacrificeCard={sacrificeCard}
            onPlayMinion={(i) => playMinion('player', i)}
          />
        </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 pb-4 flex gap-2 flex-wrap items-center">
        {phase === 'sacrifice' && (
          <>
            <button
              type="button"
              onClick={() => {
                setPhase('play')
                setMessage(player.hand.length === 0 ? '無手牌可獻祭，出牌或進入攻擊階段' : '略過獻祭，出牌或進入攻擊階段')
              }}
              className="px-3 py-2 bg-gray-600 text-white rounded font-semibold text-sm hover:bg-gray-500"
            >
              略過獻祭
            </button>
            <span className="text-gray-400 text-sm">或點擊一張手牌獻祭以獲得 1 點獻祭點數</span>
          </>
        )}
        {phase === 'play' && (
          <button type="button" onClick={endPlayPhase} className="px-3 py-2 bg-amber-500 text-gray-900 rounded font-semibold text-sm">進入攻擊階段</button>
        )}
        {phase === 'attack' && (
          <button type="button" onClick={endTurn} className="px-3 py-2 bg-gray-500 text-white rounded font-semibold text-sm">結束回合</button>
        )}
      </div>
      <p className="max-w-2xl mx-auto px-4 pb-4 text-amber-200/60 text-xs">
        手牌僅自己可見，出牌後才會出現在場上。可略過獻祭或每回合獻祭一張手牌得 1 點獻祭點數，累積足夠（出場點數）才能打出。小怪每回合只能攻擊一次；本回合打出的單位下一回合才能攻擊。敵方場上有小怪時無法直接攻擊英雄（特殊技能卡除外）。
      </p>
    </div>
  )
}
