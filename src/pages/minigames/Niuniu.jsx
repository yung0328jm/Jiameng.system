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
  getLastJoined,
  saveLastJoined,
  disbandRoom,
  getDealtCards
} from '../../utils/niuniuRoomsStorage'
import { cardFace } from '../../utils/niuniuStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const DEAL_INTERVAL_MS = 650

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
    const canContinue = lastRoom && (lastRoom.status === 'waiting' || lastRoom.status === 'dealing' || lastRoom.status === 'ended')
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
        <p className="text-amber-400/90 text-xs mb-3">下注 {room.betAmount ?? 1} 佳盟幣/人</p>
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

  // 已結束
  if (room.status === 'ended') {
    const winner = room.winner ? room.players?.find((p) => p.account === room.winner) : null
    const iWon = room.winner === account
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => setRoomId(null)} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <p className="text-yellow-400 font-semibold text-lg">本局結束</p>
        {winner && <p className="text-gray-400 text-sm mt-1">獲勝：{winner.name || winner.account}</p>}
        {!winner && <p className="text-gray-400 text-sm mt-1">和局，各退下注</p>}
        <p className="text-emerald-400 text-sm">獎池 {room.pool ?? 0} 佳盟幣</p>
        {room.result0 && room.result1 && (
          <p className="text-gray-500 text-xs mt-2">
            {room.players?.[0]?.name} {room.result0.label} vs {room.players?.[1]?.name} {room.result1.label}
          </p>
        )}
        <button type="button" onClick={() => setRoomId(null)} className="mt-4 text-yellow-400 text-sm hover:underline">回列表</button>
      </div>
    )
  }

  // 發牌中 status === 'dealing'
  const { cards0, cards1 } = getDealtCards(room)
  const p0Name = room.players?.[0]?.name || '玩家1'
  const p1Name = room.players?.[1]?.name || '玩家2'
  const totalSlots = 5

  return (
    <div className="flex flex-col items-center w-full max-w-[340px]">
      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode} · 發牌中</span>
      </div>

      <p className="text-amber-400/90 text-xs mb-3">下注 {room.betAmount ?? 1} 佳盟幣/人 · 輪流發牌</p>

      {/* 玩家0 的牌：5 個位子，依序翻開 */}
      <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
        <p className="text-gray-400 text-xs mb-2">{meIndex === 0 ? '你' : p0Name}</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalSlots }, (_, i) => (
            <span
              key={i}
              className="inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gray-700 text-white text-sm font-medium border border-gray-600"
            >
              {cards0[i] ? cardFace(cards0[i]) : '?'}
            </span>
          ))}
        </div>
      </div>

      {/* 玩家1 的牌 */}
      <div className="w-full mb-4 p-3 rounded-xl bg-gray-800/90 border border-amber-600/30">
        <p className="text-gray-400 text-xs mb-2">{meIndex === 1 ? '你' : p1Name}</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalSlots }, (_, i) => (
            <span
              key={i}
              className="inline-flex items-center justify-center w-10 h-14 rounded-lg bg-gray-700 text-white text-sm font-medium border border-gray-600"
            >
              {cards1[i] ? cardFace(cards1[i]) : '?'}
            </span>
          ))}
        </div>
      </div>

      <p className="text-gray-500 text-xs">已發 {dealIndex} / 10 張</p>

      {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
    </div>
  )
}
