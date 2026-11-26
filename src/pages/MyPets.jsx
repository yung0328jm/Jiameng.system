import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import {
  DEFAULT_FISH_SLOTS,
  MAX_FISH_SLOTS,
  getAmbientFishRoster,
  getFishSlotCount,
  getFishSpeciesName
} from '../utils/fishSkinStorage'
import { dropFishFood, feedPetSlots, getUserPets, hungerStatus, setPetName } from '../utils/petStorage'

function hungerClass(key) {
  if (key === 'full') return 'text-emerald-300'
  if (key === 'ok') return 'text-amber-200'
  return 'text-rose-300'
}

export default function MyPets() {
  const navigate = useNavigate()
  const { enabled: recording } = useRecordingMode()
  const user = getCurrentUser() || ''
  const [tick, setTick] = useState(0)
  const [drafts, setDrafts] = useState({})
  const [message, setMessage] = useState('')

  const refresh = () => setTick((n) => n + 1)

  useRealtimeKeys(
    ['jiameng_pets', 'jiameng_equipped_effects', 'jiameng_inventories', 'jiameng_items'],
    refresh
  )

  useEffect(() => {
    const id = window.setInterval(refresh, 60000)
    return () => window.clearInterval(id)
  }, [])

  const roster = useMemo(() => getAmbientFishRoster(user), [user, tick])
  const cap = useMemo(() => getFishSlotCount(user), [user, tick])
  const pets = useMemo(() => getUserPets(user), [user, tick])

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev }
      roster.forEach((fish) => {
        if (next[fish.id] === undefined) next[fish.id] = pets.names[fish.id] || ''
      })
      return next
    })
  }, [roster, pets])

  const saveName = (slotId) => {
    if (!user) return
    const result = setPetName(user, slotId, drafts[slotId])
    if (!result.success) {
      setMessage(result.message || '改名失敗')
      return
    }
    setMessage('名字已更新')
    refresh()
  }

  const feed = (slotIds) => {
    if (!user) return
    dropFishFood()
    const result = feedPetSlots(user, slotIds)
    if (!result.success) {
      setMessage(result.message || '餵食失敗')
      return
    }
    setMessage(slotIds.length > 1 ? '已撒飼料，魚會游過來吃' : '已餵這隻')
    refresh()
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto text-cn-parchment py-10 text-center">
        <p className="text-gray-400">請先登入以查看寵物</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment pb-8">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">我的寵物</h1>
        <p className="text-cn-mist text-sm mt-1">
          這裡是你的魚缸。點畫面也可餵食；外觀與欄位請到背包套用。
        </p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">魚缸欄位</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">
            {roster.length} / {cap}
          </p>
        </div>
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">預設欄</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">{DEFAULT_FISH_SLOTS}</p>
        </div>
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">最多</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">{MAX_FISH_SLOTS} 隻</p>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => feed(roster.map((f) => f.id))}
          className="px-4 py-2 rounded-md bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold text-sm"
        >
          餵全部
        </button>
        <button
          type="button"
          onClick={() => navigate('/my-backpack')}
          className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          去背包換魚
        </button>
        <button
          type="button"
          onClick={() => navigate('/exchange-shop')}
          className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          兌換商城
        </button>
      </div>

      <ul className="space-y-3">
        {roster.map((fish, i) => {
          const species = getFishSpeciesName(fish)
          const hunger = hungerStatus(pets.fedAt[fish.id])
          const nick = String(drafts[fish.id] || '').trim()
          const shown = nick || `第 ${i + 1} 隻`
          return (
            <li
              key={fish.id}
              className="rounded-xl border border-cyan-800/40 bg-gray-900/50 p-3 sm:p-4 flex gap-3 items-center"
            >
              <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                <img src={fish.src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-cyan-100 font-medium truncate">{recording ? m(shown) : shown}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {recording ? m(species) : species}
                  {fish.itemId ? '' : ' · 預設'}
                </p>
                <p className={`text-xs mt-1 ${hungerClass(hunger.key)}`}>{hunger.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="text"
                    maxLength={12}
                    value={drafts[fish.id] || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [fish.id]: e.target.value }))}
                    onBlur={() => saveName(fish.id)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveName(fish.id))}
                    placeholder={`幫第 ${i + 1} 隻取名`}
                    className="flex-1 min-w-[8rem] bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => feed([fish.id])}
                    className="shrink-0 px-3 py-1.5 rounded bg-cyan-800/70 hover:bg-cyan-700 text-sm text-cyan-50"
                  >
                    餵這隻
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
