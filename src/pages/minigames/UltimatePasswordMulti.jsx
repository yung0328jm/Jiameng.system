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
  processLastGuess
} from '../../utils/ultimatePasswordRoomsStorage'
import { getCurrentUser } from '../../utils/authStorage'

const MIN = 1
const MAX = 100

function randomSecret() {
  return Math.floor(Math.random() * (MAX - MIN + 1)) + MIN
}

export default function UltimatePasswordMulti({ onBack }) {
  const [roomId, setRoomId] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const revision = useSyncRevision()
  const secretRef = useRef(null)
  const account = getCurrentUser() || ''

  const rooms = getRooms()
  const room = roomId ? getRoom(roomId) : null
  const isHost = room && room.host === account
  const currentPlayer = room?.players?.[room.currentIndex]
  const isMyTurn = currentPlayer?.account === account
  const hasPendingGuess = !!room?.lastGuess

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

  if (!roomId) {
    const waitingRooms = rooms.filter((r) => r.status === 'waiting')
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline touch-manipulation">← 返回</button>
        </div>
        <p className="text-gray-400 text-sm mb-3">房主設密碼 1～100，大家輪流猜；猜到密碼的人輸。</p>
        <button
          type="button"
          onClick={() => {
            const res = createRoom(account)
            if (res.ok) {
              secretRef.current = randomSecret()
              setRoomId(res.roomId)
              setMessage('已建立房間，可分享代碼給其他人加入')
            } else {
              setMessage(res.error || '建立失敗')
            }
          }}
          className="w-full max-w-[240px] py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
        >
          建立房間
        </button>
        <div className="mt-4 flex gap-2 w-full max-w-[280px]">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.trim())}
            placeholder="輸入房間代碼"
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const res = joinRoom(joinCode, account)
              if (res.ok) {
                setRoomId(joinCode)
                setJoinCode('')
                setMessage('')
              } else {
                setMessage(res.error || '加入失敗')
              }
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg touch-manipulation whitespace-nowrap"
          >
            加入
          </button>
        </div>
        {waitingRooms.length > 0 && (
          <div className="mt-4 w-full max-w-[280px]">
            <p className="text-gray-500 text-xs mb-2">可加入的房間</p>
            {waitingRooms.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRoomId(r.id); setMessage('') }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm mb-1"
              >
                {r.id} · {r.hostName} ({r.players?.length || 0} 人)
              </button>
            ))}
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
        <button type="button" onClick={() => setRoomId(null)} className="mt-3 text-yellow-400 text-sm hover:underline">返回列表</button>
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
        <button type="button" onClick={() => { setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.id}</span>
      </div>

      <div className="w-full space-y-3">
        <p className="text-gray-400 text-xs">玩家：{room.players?.map((p) => p.name || p.account).join('、')}</p>
        {room.status === 'waiting' && (
          <>
            {isHost && (
              <button type="button" onClick={handleStart} className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation">
                開始遊戲（密碼已隨機產生）
              </button>
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
                  <div key={i}>{h.name} 猜 {h.number} → {h.result === 'too_small' ? '太小' : h.result === 'too_big' ? '太大' : '中了（輸）'}</div>
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
          <div className="text-center py-2">
            <p className="text-yellow-400 font-semibold">遊戲結束</p>
            <p className="text-gray-400 text-sm">踩到密碼的是：{room.players?.find((p) => p.account === room.loser)?.name || room.loser}</p>
            <button type="button" onClick={() => setRoomId(null)} className="mt-2 text-yellow-400 text-sm hover:underline">回列表</button>
          </div>
        )}
      </div>
      {message && <p className="mt-3 text-yellow-400/90 text-sm text-center">{message}</p>}
    </div>
  )
}
