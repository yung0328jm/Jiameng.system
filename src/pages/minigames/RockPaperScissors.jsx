// 猜拳兩人對戰：五戰三勝，毓承幣下注
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
        <p className="text-gray-400 text-sm mb-2">兩人對戰，五戰三勝。雙方各下注毓承幣，贏家全拿。</p>
        <p className="text-amber-400/90 text-xs mb-3">我的毓承幣：{getWalletBalance(account).toLocaleString()}</p>
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
              setMessage('已建立房間，下注 ' + bet + ' 毓承幣。可從下方列表加入或分享代碼')
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
          <span className="text-gray-500 text-xs">毓承幣/人</span>
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
        <p className="text-amber-400/90 text-xs mb-3">下注 {room.betAmount ?? 1} 毓承幣/人 · 五戰三勝</p>
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
    const iWon = room.winner === account
    return (
      <div className="flex flex-col items-center w-full max-w-[320px]">
        <style>{`
          @keyframes rps-end-reveal {
            from { opacity: 0; transform: scale(0.85); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes rps-trophy-glow {
            0%, 100% { filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5)); }
            50% { filter: drop-shadow(0 0 16px rgba(251, 191, 36, 0.8)); }
          }
          .rps-end-card { animation: rps-end-reveal 0.4s ease-out forwards; }
          .rps-trophy { animation: rps-trophy-glow 1.5s ease-in-out infinite; }
        `}</style>
        <div className="flex justify-between w-full mb-3">
          <button type="button" onClick={() => setRoomId(null)} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        </div>
        <div className="rps-end-card w-full p-5 rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-amber-500/30 shadow-xl text-center">
          <p className="text-yellow-400 font-semibold text-lg mb-2">五戰三勝 結束</p>
          <p className="rps-trophy text-4xl mb-2">🏆</p>
          <p className="text-gray-400 text-sm">獲勝：<span className="text-white font-medium">{winnerName}</span></p>
          <p className={`text-lg font-bold mt-2 ${iWon ? 'text-emerald-400' : 'text-gray-400'}`}>{iWon ? '恭喜獲勝！' : ''}</p>
          <p className="text-amber-400 text-sm mt-1">獎金 {room.pool ?? 0} 毓承幣</p>
        </div>
        <button type="button" onClick={() => setRoomId(null)} className="mt-5 py-2 px-4 rounded-lg bg-amber-500/20 text-yellow-400 text-sm hover:bg-amber-500/30 transition-colors">回列表</button>
      </div>
    )
  }

  // status === 'playing'
  const scores = room.scores || [0, 0]
  const lastResult = room.roundResults?.[room.roundResults.length - 1]
  const showRoundResult = room.roundResults?.length > 0 && lastResult

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <style>{`
        @keyframes rps-reveal {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes rps-choice-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes rps-score-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes rps-vs-flash {
          0% { opacity: 0; transform: scale(2); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(1); }
        }
        @keyframes rps-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes rps-mood-pop {
          0% { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.15); }
          70% { transform: scale(0.95); }
          85% { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes rps-mood-glow {
          0%, 100% { filter: drop-shadow(0 0 12px currentColor); }
          50% { filter: drop-shadow(0 0 24px currentColor) drop-shadow(0 0 32px currentColor); }
        }
        @keyframes rps-mood-shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        .rps-reveal-box { animation: rps-reveal 0.35s ease-out forwards; }
        .rps-mood-text { animation: rps-mood-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .rps-mood-glow { animation: rps-mood-glow 1s ease-in-out infinite; }
        .rps-mood-lose { animation: rps-mood-pop 0.6s ease-out forwards, rps-mood-shake 0.5s ease-in-out 0.4s; }
        .rps-mood-title { text-shadow: 0 0 16px currentColor, 0 0 32px currentColor; }
        .rps-choice-btn:hover:not(:disabled) { transform: scale(1.05); }
        .rps-choice-btn:active:not(:disabled) { transform: scale(0.98); }
        .rps-choice-btn { transition: transform 0.15s ease, box-shadow 0.2s ease; }
        .rps-choice-btn.chosen { box-shadow: 0 0 16px rgba(251, 191, 36, 0.4); }
        .rps-score-display { animation: rps-score-pulse 0.5s ease-out; }
      `}</style>

      <div className="flex justify-between w-full mb-2">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode}</span>
      </div>

      {/* 比數區：卡片 + 動效 */}
      <div className="w-full mb-4 p-4 rounded-xl bg-gradient-to-b from-gray-800/90 to-gray-900/90 border border-amber-600/30 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
        <p className="text-gray-500 text-xs text-center mb-2">第 {room.round} 局 · 五戰三勝</p>
        <div className="flex items-center justify-center gap-4">
          <span className="text-white font-medium truncate max-w-[80px]">{room.players?.[0]?.name || '?'}</span>
          <span key={`${room.round}-${scores[0]}-${scores[1]}`} className="rps-score-display text-2xl font-bold text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]">{scores[0]} － {scores[1]}</span>
          <span className="text-white font-medium truncate max-w-[80px]">{room.players?.[1]?.name || '?'}</span>
        </div>
      </div>

      {showRoundResult && (() => {
        const isDraw = lastResult.winnerIndex == null
        const iWon = lastResult.winnerIndex === meIndex + 1
        const moodText = isDraw ? '平手啦!! 再來啊!!' : iWon ? '嘿嘿!!' : '可惡!!'
        const moodClass = isDraw
          ? 'rps-mood-text text-amber-400 rps-mood-glow'
          : iWon
            ? 'rps-mood-text text-emerald-400 rps-mood-glow'
            : 'rps-mood-lose text-red-400'
        return (
          <div className="rps-reveal-box w-full mb-4 p-4 rounded-xl bg-gray-800/90 border border-amber-500/20 text-center shadow-lg">
            <p className={`rps-mood-title text-3xl sm:text-4xl font-black tracking-wider py-3 ${moodClass}`} style={{ opacity: 0 }}>
              {moodText}
            </p>
            <p className="text-gray-400 text-sm mt-2 mb-1">
              你出 {CHOICE_LABELS[meIndex === 0 ? lastResult.choice0 : lastResult.choice1] || '—'}，對方出 {CHOICE_LABELS[meIndex === 0 ? lastResult.choice1 : lastResult.choice0] || '—'}
            </p>
            <p className={`text-base font-semibold ${isDraw ? 'text-gray-500' : iWon ? 'text-emerald-400' : 'text-red-400'}`}>
              {isDraw ? '平手' : iWon ? '本局你贏' : '本局對方贏'}
            </p>
          </div>
        )
      })()}

      {!bothChosen && (
        <>
          <p className="text-amber-400/90 text-xs font-medium mb-3">出拳</p>
          <div className="flex gap-4">
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
                className={`rps-choice-btn flex flex-col items-center gap-2 w-24 py-4 rounded-2xl bg-gradient-to-b from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 disabled:cursor-default border-2 touch-manipulation ${myChoice === c.id ? 'border-amber-400 chosen' : 'border-gray-600 hover:border-amber-500/50'}`}
              >
                <span className="text-4xl drop-shadow-md">{c.emoji}</span>
                <span className="text-xs text-gray-300 font-medium">{c.label}</span>
              </button>
            ))}
          </div>
          {myChoice != null && (
            <p className="text-gray-500 text-sm mt-4 animate-pulse">已出拳，等對方…</p>
          )}
        </>
      )}

      {bothChosen && room.status === 'playing' && (
        <p className="text-amber-400/90 text-sm font-medium animate-pulse">結算中…</p>
      )}

      {message && <p className="mt-3 text-yellow-400/90 text-sm">{message}</p>}
    </div>
  )
}
