// 猜拳兩人對戰：五戰三勝，佳盟幣下注
import { useState, useEffect } from 'react'
import { useSyncRevision, useRealtimeKeys } from '../../contexts/SyncContext'
import {
  getRooms,
  getRoom,
  createRoom,
  joinRoom,
  startGame,
  submitChoice,
  resolveRound,
  getLastJoined,
  saveLastJoined,
  disbandRoom,
  CHOICE_LABELS
} from '../../utils/rpsRoomsStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const CHOICES = [
  { id: 'rock', label: '石頭', emoji: '✊' },
  { id: 'paper', label: '布', emoji: '✋' },
  { id: 'scissors', label: '剪刀', emoji: '✌️' }
]

export default function RockPaperScissors({ onBack }) {
  const [roomId, setRoomId] = useState(null)
  const [betAmount, setBetAmount] = useState('1')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exitedRoomIds, setExitedRoomIds] = useState(() => new Set())

  const revision = useSyncRevision()
  const account = getCurrentUser() || ''
  const rooms = getRooms()
  const room = roomId ? getRoom(roomId) : null
  const isHost = room && room.host === account
  const meIndex = room?.players?.findIndex((p) => p.account === account) ?? -1
  const opponent = room?.players?.[1 - meIndex]
  const choices = room?.choices || {}
  const myChoice = choices[account]
  const bothChosen = room?.players?.every((p) => choices[p.account] != null)

  useRealtimeKeys(['jiameng_rps_rooms'], () => setRefresh((r) => r + 1))

  // 兩人都出拳後自動結算本局
  useEffect(() => {
    if (!roomId || !room || room.status !== 'playing' || !bothChosen) return
    resolveRound(roomId)
    setRefresh((r) => r + 1)
  }, [roomId, room?.choices, bothChosen, revision, refresh])

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

  if (!roomId) {
    const waitingRooms = rooms.filter((r) => r.status === 'waiting' && !exitedRoomIds.has(r.id))
    const lastJoined = getLastJoined()
    const lastRoom = lastJoined ? getRoom(lastJoined.roomId) : null
    const canContinue = lastRoom && (lastRoom.status === 'waiting' || lastRoom.status === 'playing')
    return (
      <div className="flex flex-col items-center">
        <div className="flex justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <p className="text-gray-400 text-sm mb-2">兩人對戰，五戰三勝。雙方各下注佳盟幣，贏家全拿。</p>
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

  if (room.status === 'waiting') {
    const full = room.players?.length === 2
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
          <span className="text-gray-500 text-xs">房間 {room.shortCode}</span>
        </div>
        <p className="text-gray-400 text-sm">玩家：{room.players?.map((p) => p.name || p.account).join(' vs ')}</p>
        <p className="text-amber-400/90 text-xs mb-3">下注 {room.betAmount ?? 1} 佳盟幣/人 · 五戰三勝</p>
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
            開始遊戲
          </button>
        )}
        {!isHost && full && <p className="text-gray-500 text-sm">等房主開始…</p>}
        {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
      </div>
    )
  }

  if (room.status === 'ended') {
    const winnerName = room.players?.find((p) => p.account === room.winner)?.name || room.winner
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => setRoomId(null)} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <p className="text-yellow-400 font-semibold text-lg">五戰三勝 結束</p>
        <p className="text-gray-400 text-sm mt-1">獲勝：{winnerName}</p>
        <p className="text-emerald-400 text-sm">獎金 {room.pool ?? 0} 佳盟幣</p>
        <button type="button" onClick={() => setRoomId(null)} className="mt-4 text-yellow-400 text-sm hover:underline">回列表</button>
      </div>
    )
  }

  // status === 'playing'
  const scores = room.scores || [0, 0]
  const lastResult = room.roundResults?.[room.roundResults.length - 1]
  const showRoundResult = room.roundResults?.length > 0 && lastResult

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode}</span>
      </div>

      <p className="text-gray-400 text-sm mb-1">第 {room.round} 局 · 五戰三勝</p>
      <div className="flex items-center justify-center gap-4 mb-4">
        <span className="text-white font-medium">{room.players?.[0]?.name || '?'}</span>
        <span className="text-yellow-400 text-xl font-bold">{scores[0]} － {scores[1]}</span>
        <span className="text-white font-medium">{room.players?.[1]?.name || '?'}</span>
      </div>

      {showRoundResult && (
        <div className="w-full mb-3 p-3 rounded-lg bg-gray-800/80 text-center text-sm">
          <p className="text-gray-400">
            你出 {CHOICE_LABELS[meIndex === 0 ? lastResult.choice0 : lastResult.choice1] || '—'}，對方出 {CHOICE_LABELS[meIndex === 0 ? lastResult.choice1 : lastResult.choice0] || '—'}
          </p>
          <p className={lastResult.winnerIndex == null ? 'text-gray-500' : lastResult.winnerIndex === meIndex + 1 ? 'text-emerald-400' : 'text-red-400'}>
            {lastResult.winnerIndex == null ? '平手' : lastResult.winnerIndex === meIndex + 1 ? '本局你贏' : '本局對方贏'}
          </p>
        </div>
      )}

      {!bothChosen && (
        <>
          <p className="text-gray-500 text-xs mb-2">出拳</p>
          <div className="flex gap-3">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const res = submitChoice(roomId, account, c.id)
                  if (res.ok) setRefresh((r) => r + 1)
                  else setMessage(res.error || '')
                }}
                disabled={myChoice != null}
                className="flex flex-col items-center gap-1 w-20 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-default border-2 border-transparent touch-manipulation data-[chosen]:border-amber-400"
                data-chosen={myChoice === c.id ? '' : undefined}
              >
                <span className="text-3xl">{c.emoji}</span>
                <span className="text-xs text-gray-300">{c.label}</span>
              </button>
            ))}
          </div>
          {myChoice != null && <p className="text-gray-500 text-xs mt-2">已出拳，等對方…</p>}
        </>
      )}

      {bothChosen && room.status === 'playing' && <p className="text-gray-500 text-sm">結算中…</p>}

      {message && <p className="mt-2 text-yellow-400/90 text-sm">{message}</p>}
    </div>
  )
}
