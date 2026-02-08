// 誰是臥底：多人輪流發言描述詞彙，投票淘汰臥底
import { useState, useEffect } from 'react'
import { useSyncRevision, useRealtimeKeys } from '../../contexts/SyncContext'
import {
  getRooms,
  getRoom,
  createRoom,
  joinRoom,
  startRoom,
  submitSpeech,
  submitVote,
  resolveVoting,
  getLastJoined,
  saveLastJoined,
  disbandRoom,
  getMyWord,
  getAlivePlayers
} from '../../utils/undercoverRoomsStorage'
import { getCurrentUser } from '../../utils/authStorage'
import { getWalletBalance } from '../../utils/walletStorage'

export default function Undercover({ onBack }) {
  const [roomId, setRoomId] = useState(null)
  const [speechInput, setSpeechInput] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exitedRoomIds, setExitedRoomIds] = useState(() => new Set())
  const revision = useSyncRevision()
  const account = getCurrentUser() || ''

  const rooms = getRooms()
  const room = roomId ? getRoom(roomId) : null
  const isHost = room && room.host === account
  const myWord = room ? getMyWord(room, account) : null
  const alivePlayers = room ? getAlivePlayers(room) : []
  const currentSpeaker = room?.phase === 'speaking' ? alivePlayers[room.currentSpeakerIndex] : null
  const isMyTurnToSpeak = currentSpeaker?.account === account
  const votes = room?.votes || {}
  const hasVoted = votes[account]
  const phase = room?.phase

  // 即時更新：房間資料變更時（他人發言、投票等）立即重讀
  useRealtimeKeys(['jiameng_undercover_rooms'], () => setRefresh((r) => r + 1))

  // 房主：投票階段且所有人都投完時自動結算
  useEffect(() => {
    if (!roomId || !room || !isHost || room.status !== 'playing' || room.phase !== 'voting') return
    const alive = getAlivePlayers(room)
    const votedCount = alive.filter((p) => votes[p.account]).length
    if (votedCount < alive.length) return
    resolveVoting(roomId)
    setRefresh((r) => r + 1)
  }, [roomId, room?.phase, room?.votes, isHost, revision, refresh])

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
        <div className="flex justify-between w-full max-w-[320px] mb-3">
          <button type="button" onClick={onBack} className="text-yellow-400 text-sm hover:underline touch-manipulation">← 返回</button>
        </div>
        <p className="text-gray-400 text-sm mb-2">大家拿到相似的詞，臥底拿到不同詞。輪流發言後投票淘汰，找出臥底即平民勝利。</p>
        <p className="text-yellow-400/90 text-xs mb-3">參與者每人支付 1 佳盟幣，贏家平分獎池。我的佳盟幣：{getWalletBalance(account).toLocaleString()}</p>
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
    const res = startRoom(roomId)
    if (res.ok) setMessage('')
    else setMessage(res.error || '')
  }

  const handleSubmitSpeech = () => {
    const t = speechInput.trim()
    if (!t) { setMessage('請輸入發言'); return }
    const res = submitSpeech(roomId, account, t)
    if (res.ok) {
      setSpeechInput('')
      setMessage('')
      setRefresh((r) => r + 1)
    } else {
      setMessage(res.error || '')
    }
  }

  const handleVote = (votedFor) => {
    const res = submitVote(roomId, account, votedFor)
    if (res.ok) {
      setMessage('')
      setRefresh((r) => r + 1)
    } else {
      setMessage(res.error || '')
    }
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[320px]">
      <div className="flex justify-between w-full mb-3">
        <button type="button" onClick={() => { handleExitRoom(roomId); setRoomId(null); setMessage('') }} className="text-yellow-400 text-sm hover:underline">← 返回</button>
        <span className="text-gray-500 text-xs">房間 {room.shortCode || room.id}</span>
      </div>

      <div className="w-full space-y-3">
        <p className="text-gray-400 text-xs">玩家：{room.players?.map((p) => p.name || p.account).join('、')}</p>

        {room.status === 'waiting' && (
          <>
            <p className="text-gray-500 text-xs">至少 3 人才能開始，分享房間給其他人加入。</p>
            {isHost && (
              (room.players?.length || 0) < 3 ? (
                <p className="text-yellow-400/90 text-sm">目前 {(room.players?.length || 0)} 人，需至少 3 人才能開始</p>
              ) : (
                <button type="button" onClick={handleStart} className="w-full py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation">
                  開始遊戲
                </button>
              )
            )}
            {!isHost && <p className="text-gray-500 text-sm">等房主開始…</p>}
          </>
        )}

        {room.status === 'playing' && (
          <>
            {/* 我的詞（僅自己可見） */}
            <div className="p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">你的詞</p>
              <p className="text-yellow-400 font-semibold text-lg">{myWord || '—'}</p>
            </div>

            {phase === 'speaking' && (
              <>
                <p className="text-gray-400 text-sm">第 {room.currentRound} 輪 · 發言階段</p>
                <p className="text-gray-500 text-xs mb-1">輪到：{currentSpeaker?.name || currentSpeaker?.account}</p>
                {room.speeches?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-gray-500 text-xs mb-1">本輪發言（所有人可見）</p>
                    <div className="text-gray-400 text-xs space-y-1 max-h-28 overflow-y-auto p-2 bg-gray-800/50 rounded">
                      {room.speeches.filter((s) => s.round === room.currentRound).map((s, i) => (
                        <div key={i}>{s.name}：{s.text}</div>
                      ))}
                    </div>
                  </div>
                )}
                {isMyTurnToSpeak && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={speechInput}
                      onChange={(e) => setSpeechInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitSpeech()}
                      placeholder="描述你的詞（不可直接說出）"
                      maxLength={50}
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                    />
                    <button type="button" onClick={handleSubmitSpeech} className="px-4 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation">發言</button>
                  </div>
                )}
                {!isMyTurnToSpeak && currentSpeaker && <p className="text-gray-500 text-sm">等 {currentSpeaker.name} 發言…</p>}
              </>
            )}

            {phase === 'voting' && (
              <>
                <p className="text-gray-400 text-sm">第 {room.currentRound} 輪 · 投票階段</p>
                {room.speeches?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-gray-500 text-xs mb-1">本輪發言（所有人可見）</p>
                    <div className="text-gray-400 text-xs space-y-1 max-h-32 overflow-y-auto p-2 bg-gray-800/50 rounded">
                      {room.speeches.filter((s) => s.round === room.currentRound).map((s, i) => (
                        <div key={i}>{s.name}：{s.text}</div>
                      ))}
                    </div>
                  </div>
                )}
                {hasVoted ? (
                  <p className="text-gray-500 text-sm">已投票，等其他人…</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-gray-500 text-xs mb-2">投票淘汰你認為是臥底的人：</p>
                    {alivePlayers.filter((p) => p.account !== account).map((p) => (
                      <button
                        key={p.account}
                        type="button"
                        onClick={() => handleVote(p.account)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 touch-manipulation"
                      >
                        {p.name || p.account}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {room.eliminated?.length > 0 && (
              <p className="text-gray-500 text-xs">已淘汰：{room.eliminated.map((a) => room.players?.find((p) => p.account === a)?.name || a).join('、')}</p>
            )}
          </>
        )}

        {room.status === 'ended' && (
          <div className="text-center py-2">
            <p className="text-yellow-400 font-semibold">遊戲結束</p>
            <p className="text-gray-400 text-sm">
              {room.winner === 'civilians' ? '平民勝利！臥底被淘汰' : '臥底勝利！'}
            </p>
            <p className="text-gray-500 text-xs mt-2">平民詞：{room.civilianWord} · 臥底詞：{room.undercoverWord}</p>
            <p className="text-gray-500 text-xs">臥底：{room.undercoverAccounts?.map((a) => room.players?.find((p) => p.account === a)?.name || a).join('、')}</p>
            <button type="button" onClick={() => setRoomId(null)} className="mt-4 text-yellow-400 text-sm hover:underline">回列表</button>
          </div>
        )}
      </div>
      {message && <p className="mt-3 text-yellow-400/90 text-sm text-center">{message}</p>}
    </div>
  )
}
