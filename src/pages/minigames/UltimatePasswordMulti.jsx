// 終極密碼多人輪流：1–100 猜數字，猜到的人輸
import { useState, useEffect, useRef } from 'react'
import { useSyncRevision } from '../../contexts/SyncContext'
import {
  getRooms,
  getRoom,
  createRoom,
  joinRoom,
  startRoom,
  submitGuess,
  processLastGuess,
  getLastJoined,
  saveLastJoined,
  resetRoomForNewRound,
  disbandRoom
} from '../../utils/ultimatePasswordRoomsStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

const MIN = 1
const MAX = 100

function randomSecret() {
  return Math.floor(Math.random() * (MAX - MIN + 1)) + MIN
}

export default function UltimatePasswordMulti({ onBack }) {
  const [roomId, setRoomId] = useState(null)
  const [guessInput, setGuessInput] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exitedRoomIds, setExitedRoomIds] = useState(() => new Set())
  const [showExplosion, setShowExplosion] = useState(false)
  const revision = useSyncRevision()
  const secretRef = useRef(null)
  const account = getCurrentUser() || ''

  const rooms = getRooms()
  const room = roomId ? getRoom(roomId) : null
  const isHost = room && room.host === account
  const currentPlayer = room?.players?.[room.currentIndex]
  const isMyTurn = currentPlayer?.account === account
  const hasPendingGuess = !!room?.lastGuess

  // 猜中密碼時觸發爆炸特效，約 2.5 秒後收掉
  useEffect(() => {
    if (room?.status === 'ended' && (room?.winner || room?.loser)) {
      setShowExplosion(true)
      const t = setTimeout(() => setShowExplosion(false), 2600)
      return () => clearTimeout(t)
    }
  }, [room?.status, room?.winner, room?.loser])

  // 房主：有 lastGuess 時立即處理（含自己猜的），處理完會清掉 lastGuess 並 sync
  useEffect(() => {
    if (!roomId || !room || !isHost || room.status !== 'playing') return
    const lg = room.lastGuess
    if (!lg) return
    const secret = secretRef.current
    if (secret == null) return
    processLastGuess(roomId, secret, room)
    setMessage('')
    setRefresh((r) => r + 1)
  }, [roomId, room?.lastGuess, isHost, account, revision, refresh])

  if (!account) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm">請先登入</p>
        <button type="button" onClick={onBack} className="mt-3 text-yellow-400 text-sm hover:underline">← 返回</button>
      </div>
    )
  }

  const handleExitRoom = (id) => {
    if (!id) return
    if (room && room.host === account) {
      disbandRoom(id, account)
    } else {
      setExitedRoomIds((prev) => new Set([...prev, id]))
    }
  }

  if (!roomId) {
    const waitingRooms = rooms
      .filter((r) => r.status === 'waiting' && !exitedRoomIds.has(r.id))
    const lastJoined = getLastJoined()
    const lastRoom = lastJoined ? getRoom(lastJoined.roomId) : null
    const canContinue = lastRoom && (lastRoom.status === 'waiting' || lastRoom.status === 'playing')
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline touch-manipulation">← 返回</button>
        </div>
        <p className="text-gray-400 text-sm mb-2">房主設密碼 1～100，大家輪流猜；猜中密碼的人贏得全部獎池。</p>
        <p className="text-yellow-400/90 text-xs mb-3">參與者每人支付 1 佳盟幣，猜中密碼的人全部拿走獎池。我的佳盟幣：{getWalletBalance(account).toLocaleString()}</p>
        {canContinue && (
          <button
            type="button"
            onClick={() => { setRoomId(lastJoined.roomId); setMessage('') }}
            className="w-full max-w-[280px] py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg touch-manipulation mb-2"
          >
            繼續上次房間 ({(lastRoom?.shortCode || lastJoined.shortCode) || '…'})
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const res = createRoom(account)
            if (res.ok) {
              secretRef.current = randomSecret()
              setRoomId(res.roomId)
              setMessage('已建立房間，其他用戶可從下方列表選擇加入')
            } else {
              setMessage(res.error || '建立失敗')
            }
          }}
          className="w-full max-w-[240px] py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
        >
          建立房間
        </button>
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
                  className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm mb-1 hover:bg-gray-600 touch-manipulation"
                >
                  {r.hostName} 的房間（{r.players?.length || 0} 人）{isInRoom && '· 已在此房'}
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

  const handleStart = () => {
    if (secretRef.current == null) secretRef.current = randomSecret()
    const res = startRoom(roomId)
    if (res.ok) setMessage('')
    else setMessage(res.error || '')
  }

  const handleGuess = () => {
    const n = parseInt(guessInput, 10)
    if (Number.isNaN(n) || n < MIN || n > MAX) {
      setMessage(`請輸入 ${MIN}～${MAX} 的數字`)
      return
    }
    const res = submitGuess(roomId, account, n)
    if (res.ok) {
      setGuessInput('')
      setMessage('')
      setRefresh((r) => r + 1)
    } else {
      setMessage(res.error || '')
    }
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <div className="flex items-center justify-between w-full mb-3">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode || room.id}</span>
      </div>

      <div className="w-full space-y-3">
        <p className="text-gray-400 text-xs">玩家：{room.players?.map((p) => p.name || p.account).join('、')}</p>
        {room.status === 'waiting' && (
          <>
            {room.shortCode && (
              <p className="text-center text-yellow-400 font-mono text-lg tracking-widest">代碼 {room.shortCode}</p>
            )}
            <p className="text-gray-500 text-xs">分享上面代碼給其他人加入，至少 2 人才能開始。</p>
            {isHost && (
              <>
                {(room.players?.length || 0) < 2 ? (
                  <p className="text-yellow-400/90 text-sm">目前 {(room.players?.length || 0)} 人，需至少 2 人才能開始</p>
                ) : (
                  <button type="button" onClick={handleStart} className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation">
                    開始遊戲（密碼已隨機產生）
                  </button>
                )}
              </>
            )}
            {!isHost && <p className="text-gray-500 text-sm">等房主開始…</p>}
          </>
        )}
        {room.status === 'playing' && (
          <>
            <p className="text-yellow-400 font-semibold text-center">範圍 {room.low}～{room.high}</p>
            <p className="text-gray-400 text-sm text-center">輪到：{currentPlayer?.name || currentPlayer?.account}</p>
            {room.history?.length > 0 && (
              <div className="text-gray-500 text-xs space-y-0.5 max-h-24 overflow-y-auto">
                {room.history.slice(-8).map((h, i) => (
                  <div key={i}>{h.name} 猜 {h.number} → {h.result === 'too_small' ? '太小' : h.result === 'too_big' ? '太大' : '中了（全拿）'}</div>
                ))}
              </div>
            )}
            {isMyTurn && !hasPendingGuess && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={MIN}
                  max={MAX}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                  placeholder="你的數字"
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500"
                />
                <button type="button" onClick={handleGuess} className="px-4 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation">猜</button>
              </div>
            )}
            {isMyTurn && hasPendingGuess && <p className="text-gray-500 text-sm">已送出，等房主判定…</p>}
          </>
        )}
        {room.status === 'ended' && (
          <div className="text-center py-2 relative">
            {showExplosion && (
              <>
                <style>{`
                  @keyframes up-explode-ring {
                    0% { transform: scale(0.2); opacity: 1; }
                    100% { transform: scale(3); opacity: 0; }
                  }
                  @keyframes up-explode-flash {
                    0% { opacity: 1; transform: scale(0.5); }
                    30% { opacity: 1; transform: scale(1.5); }
                    100% { opacity: 0; transform: scale(4); }
                  }
                  @keyframes up-explode-text {
                    0% { transform: scale(0.3); opacity: 0; }
                    15% { transform: scale(1.8); opacity: 1; }
                    25% { transform: scale(2) rotate(-5deg); }
                    35% { transform: scale(2) rotate(5deg); }
                    45% { transform: scale(2) rotate(-3deg); }
                    100% { transform: scale(2.2) rotate(0deg); opacity: 0.9; }
                  }
                `}</style>
                <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
                  <div className="absolute inset-0 bg-orange-400/30 animate-[up-explode-flash_0.4s_ease-out_forwards]" />
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute w-32 h-32 rounded-full border-4 border-orange-500 bg-orange-400/20"
                      style={{ animation: `up-explode-ring 0.8s ease-out ${i * 0.15}s forwards` }}
                    />
                  ))}
                  <div className="relative text-[4rem] sm:text-[5rem] font-black text-orange-500 drop-shadow-lg animate-[up-explode-text_0.6s_ease-out_forwards]" style={{ textShadow: '0 0 20px #fff, 0 0 40px #f97316' }}>
                    全拿！！
                  </div>
                </div>
              </>
            )}
            <p className="text-yellow-400 font-semibold">遊戲結束</p>
            <p className="text-gray-400 text-sm">猜中密碼、獎池全拿：{room.players?.find((p) => p.account === (room.winner || room.loser))?.name || room.winner || room.loser}（+{room.pool ?? 0} 佳盟幣）</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExplosion(false)
                  const res = resetRoomForNewRound(roomId)
                  if (!res.ok) { setMessage(res.error || ''); return }
                  if (isHost) {
                    secretRef.current = randomSecret()
                    startRoom(roomId)
                  }
                  setMessage('')
                  setRefresh((r) => r + 1)
                }}
                className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
              >
                再來一局
              </button>
              <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null) }} className="text-yellow-400 text-sm hover:underline">回列表</button>
            </div>
          </div>
        )}
      </div>
      {message && <p className="mt-3 text-yellow-400/90 text-sm text-center">{message}</p>}
    </div>
  )
}
