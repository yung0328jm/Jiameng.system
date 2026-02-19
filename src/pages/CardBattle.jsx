// 卡牌對戰：回合制 PvE，英雄血量歸 0 即敗
import { useState, useEffect } from 'react'
import { getCardById } from '../utils/cardGameStorage'

const MAX_FIELD = 5
const HAND_SIZE_START = 5
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

export default function CardBattle({ playerDeck, playerAccount, onExit }) {
  const getCard = (id) => getCardById(id)
  const [player, setPlayer] = useState(null)
  const [enemy, setEnemy] = useState(null)
  const [turn, setTurn] = useState('player')
  const [phase, setPhase] = useState('play') // 'play' | 'attack' | 'end'
  const [message, setMessage] = useState('')
  const [gameOver, setGameOver] = useState(null) // 'win' | 'lose'
  const [selectedAttacker, setSelectedAttacker] = useState(null) // { side: 'player', fieldIndex }

  useEffect(() => {
    const pHero = getCard(playerDeck.heroId)
    const pDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: hand } = drawCards(pDeck, Math.min(HAND_SIZE_START, pDeck.length))
    const p = {
      hero: pHero ? { ...pHero, currentHp: pHero.hp, maxHp: pHero.hp } : null,
      deck: pDeck,
      hand,
      field: []
    }
    const eHero = getCard(playerDeck.heroId)
    const eDeck = shuffle((playerDeck.cardIds || []).map((id) => getCard(id)).filter(Boolean))
    const { drawn: eHand } = drawCards(eDeck, Math.min(HAND_SIZE_START, eDeck.length))
    const e = {
      hero: eHero ? { ...eHero, currentHp: eHero.hp, maxHp: eHero.hp } : null,
      deck: eDeck,
      hand: eHand,
      field: []
    }
    setPlayer(p)
    setEnemy(e)
  }, [])

  useEffect(() => {
    if (!player || !enemy) return
    if (player.hero && player.hero.currentHp <= 0) setGameOver('lose')
    if (enemy.hero && enemy.hero.currentHp <= 0) setGameOver('win')
  }, [player?.hero?.currentHp, enemy?.hero?.currentHp])

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
    const newHand = state.hand.filter((_, i) => i !== handIndex)
    const newField = [...state.field, { ...card, currentHp: card.hp, maxHp: card.hp }]
    if (isPlayer) {
      setPlayer((prev) => ({ ...prev, hand: newHand, field: newField }))
    } else {
      setEnemy((prev) => ({ ...prev, hand: newHand, field: newField }))
    }
    setMessage('')
  }

  const attack = (attackerSide, attackerFieldIndex, targetSide, targetFieldIndexOrHero) => {
    if (turn !== 'player' || phase !== 'attack') return
    const attacker = (attackerSide === 'player' ? player : enemy).field[attackerFieldIndex]
    if (!attacker || attacker.attack <= 0) return
    const isTargetHero = targetFieldIndexOrHero === -1 || targetFieldIndexOrHero === undefined
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
  }

  const endPlayPhase = () => {
    if (turn !== 'player' || phase !== 'play') return
    setPhase('attack')
    setMessage('選擇己方單位攻擊敵方英雄或敵方單位')
  }

  const endTurn = () => {
    if (turn !== 'player') return
    setSelectedAttacker(null)
    setPhase('play')
    setTurn('enemy')
    setMessage('敵方回合')
    setTimeout(() => {
      aiTurn()
    }, 800)
  }

  const aiTurn = () => {
    let e = { ...enemy }
    let p = { ...player }
    const getCard = (id) => getCardById(id)
    if (e.deck.length > 0 && e.hand.length < 10) {
      const drawn = e.deck.shift()
      e.hand = [...e.hand, drawn]
    }
    while (e.field.length < MAX_FIELD && e.hand.some((c) => c.type !== 'hero')) {
      const idx = e.hand.findIndex((c) => c.type !== 'hero')
      if (idx === -1) break
      const card = e.hand[idx]
      e.hand = e.hand.filter((_, i) => i !== idx)
      e.field = [...e.field, { ...card, currentHp: card.hp, maxHp: card.hp }]
    }
    e.field.forEach((minion, i) => {
      if (minion.attack <= 0) return
      if (p.field.length > 0) {
        const targetIdx = Math.floor(Math.random() * p.field.length)
        const target = p.field[targetIdx]
        const newHp = (target.currentHp || target.hp) - minion.attack
        if (newHp <= 0) {
          p.field = p.field.filter((_, j) => j !== targetIdx)
        } else {
          p.field = p.field.map((m, j) => (j === targetIdx ? { ...m, currentHp: newHp } : m))
        }
      } else if (p.hero) {
        const newHp = Math.max(0, (p.hero.currentHp || p.hero.hp) - minion.attack)
        p.hero = { ...p.hero, currentHp: newHp }
      }
    })
    setEnemy(e)
    setPlayer(() => {
      if (p.deck.length > 0 && p.hand.length < 10) {
        const [drawn, ...rest] = p.deck
        return { ...p, deck: rest, hand: [...p.hand, drawn] }
      }
      return p
    })
    setTurn('player')
    setPhase('play')
    setMessage('你的回合')
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

  const Field = ({ side, hero, field, hand, isPlayer, onSelectAttacker, onSelectTarget, onSelectTargetHero }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-sm">{side === 'player' ? '我方' : '敵方'}</span>
        {hero && (
          <div
            role={onSelectTargetHero && side === 'enemy' ? 'button' : undefined}
            onClick={onSelectTargetHero && side === 'enemy' ? onSelectTargetHero : undefined}
            className={`px-3 py-1.5 bg-gray-700 rounded border ${onSelectTargetHero && side === 'enemy' ? 'border-amber-500 cursor-pointer hover:bg-gray-600' : 'border-gray-600'}`}
          >
            <span className="text-white font-medium">{hero.name}</span>
            <span className="text-red-400 ml-2">HP {hero.currentHp}/{hero.maxHp}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {field.map((m, i) => (
          <div
            key={i}
            role="button"
            onClick={() => {
              if (isPlayer && phase === 'attack' && turn === 'player' && m.attack > 0) {
                setSelectedAttacker(selectedAttacker?.fieldIndex === i ? null : i)
              } else if (!isPlayer && phase === 'attack' && onSelectTarget) {
                onSelectTarget(i)
              }
            }}
            className={`w-16 rounded border p-1 text-center ${isPlayer && phase === 'attack' && selectedAttacker === i ? 'bg-amber-900/50 border-amber-500' : 'bg-gray-700 border-gray-600'} ${!isPlayer && onSelectTarget ? 'cursor-pointer hover:bg-gray-600' : ''}`}
          >
            <div className="text-white text-xs truncate">{m.name}</div>
            <div className="text-red-400 text-xs">{m.currentHp}/{m.maxHp}</div>
            <div className="text-amber-400 text-xs">攻{m.attack}</div>
          </div>
        ))}
      </div>
      {isPlayer && (
        <div className="flex flex-wrap gap-1 mt-2">
          {hand.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => playMinion(side, i)}
              className="w-14 h-20 bg-gray-600 rounded border border-gray-500 hover:border-yellow-500 text-left p-0.5 overflow-hidden"
            >
              <div className="text-white text-[10px] truncate">{c.name}</div>
              <div className="text-[10px] text-amber-400">攻{c.attack} 血{c.hp}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-yellow-400 font-bold">對戰中</h3>
        <button type="button" onClick={onExit} className="text-gray-400 text-sm">離開</button>
      </div>
      {message && <p className="text-gray-300 text-sm">{message}</p>}
      <Field
        side="enemy"
        hero={enemy.hero}
        field={enemy.field}
        hand={enemy.hand}
        isPlayer={false}
        onSelectTarget={(i) => handleSelectAttackTarget('enemy', i)}
        onSelectTargetHero={handleSelectAttackTargetHero}
      />
      <hr className="border-gray-600" />
      <Field
        side="player"
        hero={player.hero}
        field={player.field}
        hand={player.hand}
        isPlayer={true}
        onSelectAttacker={setSelectedAttacker}
      />
      <div className="flex gap-2">
        {phase === 'play' && (
          <button type="button" onClick={endPlayPhase} className="px-3 py-2 bg-amber-500 text-gray-900 rounded font-semibold text-sm">進入攻擊階段</button>
        )}
        {phase === 'attack' && (
          <button type="button" onClick={endTurn} className="px-3 py-2 bg-gray-500 text-white rounded font-semibold text-sm">結束回合</button>
        )}
      </div>
      <p className="text-gray-500 text-xs">提示：出牌階段可打出小怪／效果卡到場上（最多 {MAX_FIELD} 張），再進入攻擊階段用場上單位攻擊敵方英雄或敵方單位，英雄血量歸 0 即勝負。</p>
    </div>
  )
}
