// 妞妞兩人對戰：建立/加入房間，依序發牌（輪流發給兩人），比牛
import { useState, useEffect, useRef } from 'react'
import { useRealtimeKeys } from '../../contexts/SyncContext'
import {
  getRooms,
  getRoom,
  createRoom,
  joinRoom,
  startGame,
  advanceDeal,
  setRevealReady,
  getLastJoined,
  saveLastJoined,
  disbandRoom,
  getDealtCards,
  getFullHands
} from '../../utils/niuniuRoomsStorage'
import { cardFace } from '../../utils/niuniuStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const DEAL_INTERVAL_MS = 1000

export default function Niuniu({ onBack }) {
  const [roomId, setRoomId] = useState(null)
  const [betAmount, setBetAmount] = useState('1')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exitedRoomIds, setExitedRoomIds] = useState(() => new Set())

  const account = getCurrentUser() || ''
  const rooms = getRooms()
  const room = roomId ? getRoom(roomId) : null
  const isHost = room && room.host === account
  const meIndex = room?.players?.findIndex((p) => p.account === account) ?? -1
  const dealIndex = room?.dealIndex ?? 0

  useRealtimeKeys(['jiameng_niuniu_rooms'], () => setRefresh((r) => r + 1))

  // 發牌階段：僅房主定時推進 dealIndex
  const dealTimerRef = useRef(null)
  useEffect(() => {
    if (!roomId || !room || room.status !== 'dealing' || !isHost) return
    const id = roomId
    const t = setInterval(() => {
      advanceDeal(id)
      setRefresh((r) => r + 1)
    }, DEAL_INTERVAL_MS)
    dealTimerRef.current = t
    return () => {
      clearInterval(t)
      dealTimerRef.current = null
    }
  }, [roomId, room?.status, room?.dealIndex, isHost])

  const handleExitRoom = (id) => {
    if (!id) return
    if (room && room.host === account) disbandRoom(id, account)
    else setExitedRoomIds((prev) => new Set([...prev, id]))
  }

  if (!account) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">請先登入</p>
        <button type="button" onClick={onBack} className="mt-3 text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
    )
  }

  // 大廳：建立 / 加入房間
  if (!roomId) {
    const waitingRooms = rooms.filter((r) => r.status === 'waiting' && !exitedRoomIds.has(r.id))
    const lastJoined = getLastJoined()
    const lastRoom = lastJoined ? getRoom(lastJoined.roomId) : null
    const canContinue = lastRoom && (lastRoom.status === 'waiting' || lastRoom.status === 'dealing' || lastRoom.status === 'reveal' || lastRoom.status === 'ended')
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <p className="text-gray-400 text-sm mb-2">妞妞兩人對戰，雙方各下注佳盟幣，依序發牌比牛，贏家全拿獎池。</p>
        <p className="text-amber-400/90 text-xs mb-3">我的佳盟幣：{getWalletBalance(account).toLocaleString()}</p>
        {canContinue && (
          <button
            type="button"
            onClick={() => { setRoomId(lastJoined.roomId); setMessage('') }}
            className="w-full max-w-[280px] py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg mb-2"
          >
            繼續上次房間 ({(lastRoom?.shortCode || lastJoined.shortCode) || '…'})
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const bet = Math.max(1, Math.floor(Number(betAmount) || 1))
            const res = createRoom(account, bet)
            if (res.ok) {
              setRoomId(res.roomId)
              setMessage('已建立房間，下注 ' + bet + ' 佳盟幣。可從下方列表加入或分享代碼')
            } else {
              setMessage(res.error || '建立失敗')
            }
          }}
          className="w-full max-w-[240px] py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg"
        >
          建立房間
        </button>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-gray-500 text-xs">下注</label>
          <input
            type="number"
            min={1}
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            className="w-16 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-white text-sm"
          />
          <span className="text-gray-500 text-xs">佳盟幣/人</span>
        </div>
        {waitingRooms.length > 0 && (
          <div className="mt-4 w-full max-w-[280px]">
            <p className="text-gray-500 text-xs mb-2">可加入的房間（點擊加入）</p>
            {waitingRooms.slice(0, 10).map((r) => {
              const isInRoom = r.players?.some((p) => p.account === account)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    if (isInRoom) {
                      saveLastJoined(r.id, r.shortCode)
                      setRoomId(r.id)
                      setMessage('')
                    } else {
                      const res = joinRoom(r.id, account)
                      if (res.ok) {
                        saveLastJoined(r.id, r.shortCode)
                        setRoomId(res.room.id)
                        setMessage('')
                      } else {
                        setMessage(res.error || '加入失敗')
                      }
                    }
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm mb-1 hover:bg-gray-600"
                >
                  {r.hostName} 的房間 · {r.betAmount ?? 1} 幣 {isInRoom && '· 已在此房'}
                </button>
              )
            })}
          </div>
        )}
        {message && <p className="mt-3 text-yellow-400/90 text-sm">{message}</p>}
      </div>
    )
  }

  if (!room) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">找不到房間或已結束</p>
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null) }} className="mt-3 text-yellow-400 text-sm hover:underline">返回列表</button>
      </div>
    )
  }

  // 等待中
  if (room.status === 'waiting') {
    const full = room.players?.length === 2
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
          <span className="text-gray-500 text-xs">房間 {room.shortCode}</span>
        </div>
        <p className="text-gray-400 text-sm">玩家：{room.players?.map((p) => p.name || p.account).join(' vs ')}</p>
        <p className="text-amber-400/90 text-xs mb-1">下注 {room.betAmount ?? 1} 佳盟幣/人</p>
        <p className="text-gray-500 text-xs mb-3">須兩人佳盟幣皆足夠才能開始</p>
        {!full && <p className="text-gray-500 text-sm mb-2">等待第二人加入…</p>}
        {isHost && full && (
          <button
            type="button"
            onClick={() => {
              const res = startGame(roomId)
              if (res.ok) setMessage('')
              else setMessage(res.error || '')
            }}
            className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg"
          >
            開始遊戲（發牌）
          </button>
        )}
        {!isHost && full && <p className="text-gray-500 text-sm">等房主開始…</p>}
        {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
      </div>
    )
  }

  // 已結束：雙方牌都攤開，顯示結果
  if (room.status === 'ended') {
    const winner = room.winner ? room.players?.find((p) => p.account === room.winner) : null
    const iWon = room.winner === account
    const { cards0, cards1 } = getFullHands(room)
    const oppCards = meIndex === 0 ? cards1 : cards0
    const myCards = meIndex === 0 ? cards0 : cards1
    const oppName = room.players?.[1 - meIndex]?.name || '對手'
    return (
      <div className="flex flex-col items-center w-full max-w-[340px]">
        <style>{`
          @keyframes nn-reveal {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
          }
          .nn-reveal-in { animation: nn-reveal 0.4s ease-out forwards; }
        `}</style>
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => setRoomId(null)} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <p className="text-yellow-400 font-semibold text-lg nn-reveal-in">開牌結果</p>
        {/* 對手牌（攤開後） */}
        <div className="w-full mb-3 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30 nn-reveal-in">
          <p className="text-gray-400 text-xs mb-2">{oppName}</p>
          <div className="flex flex-wrap gap-1.5">
            {oppCards.map((c, i) => (
              <span key={i} className="nn-card inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gray-700 text-white text-sm font-medium border border-gray-600">
                {cardFace(c)}
              </span>
            ))}
          </div>
          <p className="text-amber-400 text-sm font-semibold mt-1">
            {(meIndex === 0 ? room.result1 : room.result0)?.label ?? '—'}
          </p>
        </div>
        {/* 我的牌 */}
        <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30 nn-reveal-in">
          <p className="text-gray-400 text-xs mb-2">你</p>
          <div className="flex flex-wrap gap-1.5">
            {myCards.map((c, i) => (
              <span key={i} className="nn-card inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gray-700 text-white text-sm font-medium border border-gray-600">
                {cardFace(c)}
              </span>
            ))}
          </div>
          <p className="text-amber-400 text-sm font-semibold mt-1">
            {(meIndex === 0 ? room.result0 : room.result1)?.label ?? '—'}
          </p>
        </div>
        <div className="text-center nn-reveal-in">
          {winner && <p className="text-gray-400 text-sm">獲勝：{winner.name || winner.account}</p>}
          {!winner && <p className="text-gray-400 text-sm">和局，各退下注</p>}
          <p className="text-emerald-400 text-sm font-semibold">獎池 {room.pool ?? 0} 佳盟幣</p>
        </div>
        <button type="button" onClick={() => setRoomId(null)} className="mt-4 text-yellow-400 text-sm hover:underline">回列表</button>
      </div>
    )
  }

  // 攤開階段：只顯示自己的牌型，對手為牌背；按「攤開」後等對方
  if (room.status === 'reveal') {
    const { cards0, cards1 } = getFullHands(room)
    const myCards = meIndex === 0 ? cards0 : cards1
    const myResult = meIndex === 0 ? room.result0 : room.result1
    const oppName = room.players?.[1 - meIndex]?.name || '對手'
    const iReady = room.revealReady?.[account]
    const bothReady = room.players?.every((p) => room.revealReady?.[p.account])
    return (
      <div className="flex flex-col items-center w-full max-w-[340px]">
        <div className="flex justify-between w-full mb-2">
          <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
          <span className="text-gray-500 text-xs">房間 {room.shortCode}</span>
        </div>
        <p className="text-amber-400/90 text-xs mb-3">看牌後按「攤開」，兩人皆攤開後即開牌</p>
        {/* 對手：牌背 */}
        <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
          <p className="text-gray-400 text-xs mb-2">{oppName}</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="nn-card-back inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gradient-to-br from-amber-900 to-amber-800 text-amber-200/60 text-xl border border-amber-600/50 shadow-inner">
                🂠
              </span>
            ))}
          </div>
        </div>
        {/* 我的牌 + 牌型 */}
        <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-500/40">
          <p className="text-gray-400 text-xs mb-2">你的牌</p>
          <div className="flex flex-wrap gap-1.5">
            {myCards.map((c, i) => (
              <span key={i} className="nn-card inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gray-700 text-white text-sm font-medium border border-gray-600">
                {cardFace(c)}
              </span>
            ))}
          </div>
          <p className="text-amber-400 text-sm font-semibold mt-2">牌型：{myResult?.label ?? '—'}</p>
        </div>
        {!iReady ? (
          <button
            type="button"
            onClick={() => {
              const res = setRevealReady(roomId, account)
              if (res.ok) setRefresh((r) => r + 1)
              else setMessage(res.error || '')
            }}
            className="w-full max-w-[200px] py-3 rounded-xl bg-amber-500 text-gray-900 font-bold"
          >
            攤開
          </button>
        ) : (
          <p className="text-gray-500 text-sm">已攤開，等對方…</p>
        )}
        {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
      </div>
    )
  }

  // 發牌中：只顯示自己的牌依序出現，對手一律牌背；發牌動畫
  const { cards0, cards1 } = getDealtCards(room)
  const myCards = meIndex === 0 ? cards0 : cards1
  const oppName = room.players?.[1 - meIndex]?.name || '對手'
  const totalSlots = 5

  return (
    <div className="flex flex-col items-center w-full max-w-[340px]">
      <style>{`
        @keyframes nn-deal-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nn-card-new { animation: nn-deal-in 0.35s ease-out forwards; }
        .nn-card-back { user-select: none; }
      `}</style>
      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode} · 發牌中</span>
      </div>

      <p className="text-amber-400/90 text-xs mb-3">下注 {room.betAmount ?? 1} 佳盟幣 · 輪流發牌（只會看到自己的牌）</p>

      {/* 對手：5 張牌背 */}
      <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
        <p className="text-gray-400 text-xs mb-2">{oppName}</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalSlots }, (_, i) => (
            <span key={`back-${i}`} className="nn-card-back inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gradient-to-br from-amber-900 to-amber-800 text-amber-200/60 text-xl border border-amber-600/50 shadow-inner">
              🂠
            </span>
          ))}
        </div>
      </div>

      {/* 我的牌：依序出現 + 動畫 */}
      <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
        <p className="text-gray-400 text-xs mb-2">你的牌</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalSlots }, (_, i) => {
            const card = myCards[i]
            const key = card ? `slot-${i}-${card.suit}-${card.rank}` : `slot-${i}-empty`
            return (
              <span
                key={key}
                className={`inline-flex items-center justify-center w-10 h-14 rounded-lg border border-gray-600 text-sm font-medium ${card ? 'nn-card-new bg-gray-700 text-white' : 'bg-gray-700/50 text-gray-500'}`}
              >
                {card ? cardFace(card) : '?'}
              </span>
            )
          })}
        </div>
      </div>

      <p className="text-gray-500 text-xs">已發 {dealIndex} / 10 張</p>

      {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
    </div>
  )
}
