import { useEffect, useMemo, useState } from 'react'
import FishSprite from '../components/FishSprite'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { createAuction } from '../utils/auctionStorage'
import {
  DEFAULT_FISH_SLOTS,
  MAX_FISH_SLOTS,
  getFishSlotCount,
  getFishSpeciesName
} from '../utils/fishSkinStorage'
import {
  attachLiveFish,
  canTradeTankFish,
  clearShowcaseFish,
  genderLabel,
  getFishShopPrice,
  getPairBreedingMap,
  getPetAppearance,
  getPublicShowcaseFish,
  getTankRoster,
  getUserPets,
  hungerStatus,
  removeLiveFish,
  setPetName,
  setShowcaseFish,
  tickPetBreeding
} from '../utils/petStorage'

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
  const [auctionFish, setAuctionFish] = useState(null)
  const [reserve, setReserve] = useState('10')
  const [hours, setHours] = useState(24)

  const refresh = () => {
    if (user) tickPetBreeding(user)
    setTick((n) => n + 1)
  }

  useRealtimeKeys(
    ['jiameng_pets', 'jiameng_equipped_effects', 'jiameng_inventories', 'jiameng_items', 'jiameng_auctions'],
    refresh
  )

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 1000)
    return () => window.clearInterval(id)
  }, [])

  const roster = useMemo(() => getTankRoster(user), [user, tick])
  const cap = useMemo(() => getFishSlotCount(user), [user, tick])
  const pets = useMemo(() => getUserPets(user), [user, tick])
  const others = useMemo(() => getPublicShowcaseFish(user), [user, tick])
  const breeding = useMemo(() => getPairBreedingMap(user), [user, tick])
  const showcaseSlotId = pets.showcaseSlotId || ''

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

  const toggleShowcase = (slotId) => {
    if (!user) return
    const result =
      showcaseSlotId === slotId ? clearShowcaseFish(user) : setShowcaseFish(user, slotId)
    if (!result.success) {
      setMessage(result.message || '設定失敗')
      return
    }
    setMessage(showcaseSlotId === slotId ? '已取消展示' : '已指定給全部人看，不占對方欄位')
    refresh()
  }

  const openAuction = (fish) => {
    setAuctionFish(fish)
    setReserve(String(getFishShopPrice(fish.itemId, fish.key)))
    setHours(24)
  }

  const submitAuction = () => {
    if (!user || !auctionFish) return
    const removed = removeLiveFish(user, auctionFish.id)
    if (!removed.success) {
      setMessage(removed.message || '下缸失敗')
      return
    }
    const species = getFishSpeciesName(auctionFish)
    const name = String(removed.snapshot.name || '').trim()
    const result = createAuction({
      seller: user,
      pet: removed.snapshot,
      itemName: name ? `${species}（${name}）` : species,
      reserve,
      hours
    })
    if (!result.success) {
      attachLiveFish(user, removed.snapshot)
      setMessage(result.message || '送拍失敗，魚已放回魚缸')
      refresh()
      return
    }
    setAuctionFish(null)
    setMessage('已送去競拍')
    refresh()
    navigate(`/fish-auction/${result.auction.id}`)
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
          點螢幕撒飼料。預設兩隻鬥魚一公一母，相處約七天會懷孕；魚缸要多一欄空位才生得出魚苗，懷孕約五天，生完約兩週才能再配。可交易的魚可設底價與時間送去競拍，全員喊價、價高者得。
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
        <button
          type="button"
          onClick={() => navigate('/fish-auction')}
          className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          魚類競拍
        </button>
      </div>

      {others.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/90">
          目前有 {others.length} 人展示中，你畫面最多 {cap} 隻自己的魚，再加他們的展示魚。
        </div>
      )}

      <ul className="space-y-3">
        {roster.map((fish, i) => {
          const species = getFishSpeciesName(fish)
          const hunger = hungerStatus(pets.fedAt[fish.id])
          const look = getPetAppearance(user, fish.id, fish.itemId, fish.key)
          const nick = String(drafts[fish.id] || '').trim()
          const shown = nick || `第 ${i + 1} 隻`
          const imgScale = look.growable ? Math.max(0.22, look.scale) : 1
          const sex = genderLabel(look.gender)
          const breed = breeding[fish.id]
          return (
            <li
              key={fish.id}
              className="rounded-xl border border-cyan-800/40 bg-gray-900/50 p-3 sm:p-4 flex gap-3 items-center"
            >
              <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                <div style={{ transform: `scale(${imgScale})` }}>
                  <FishSprite
                    src={fish.src}
                    variant={i % 2 === 0 ? 'a' : 'b'}
                    wide={!!fish.wide}
                    shape={fish.shape}
                    width={fish.shape === 'ray' ? 118 : fish.wide ? 140 : 92}
                    height={fish.shape === 'ray' ? 68 : fish.wide ? 52 : 44}
                    parts={look.parts}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-cyan-100 font-medium truncate">{recording ? m(shown) : shown}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {recording ? m(species) : species}
                  {sex ? ` · ${sex}` : ''}
                  {fish.born ? ' · 育成' : fish.itemId ? '' : ' · 預設'}
                  {look.growable ? ` · ${look.stage.label}` : ''}
                  {look.morphLabel ? ` · ${look.morphLabel}` : ''}
                  {look.shineText ? ` · ${look.shineText}` : ''}
                  {look.lengthText ? ` · ${look.lengthText}` : ''}
                  {look.pregnant || breed?.phase === 'pregnant' ? ' · 懷孕中' : ''}
                </p>
                {look.growable && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400/80"
                      style={{ width: `${Math.round(look.progress * 100)}%` }}
                    />
                  </div>
                )}
                {breed ? (
                  <div className="mt-1.5">
                    <p className="text-[11px] text-rose-200">
                      {breed.title}
                      {breed.detail ? ` · ${breed.detail}` : ''}
                    </p>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full ${
                          breed.phase === 'pregnant'
                            ? 'bg-amber-400/90'
                            : breed.phase === 'cooldown'
                              ? 'bg-gray-500'
                              : 'bg-rose-400/90'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, breed.barPct || 0))}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                <p className={`text-xs mt-1 ${hungerClass(hunger.key)}`}>{hunger.label}</p>
                {showcaseSlotId === fish.id && (
                  <p className="text-[11px] text-amber-200 mt-1">全員可見 · 不占別人欄位</p>
                )}
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
                    onClick={() => toggleShowcase(fish.id)}
                    className={`shrink-0 px-3 py-1.5 rounded text-sm ${
                      showcaseSlotId === fish.id
                        ? 'bg-amber-400 text-cn-ink font-semibold'
                        : 'bg-gray-700 hover:bg-gray-600 text-cn-parchment'
                    }`}
                  >
                    {showcaseSlotId === fish.id ? '取消展示' : '展示給全部人'}
                  </button>
                  {canTradeTankFish(fish) && (
                    <button
                      type="button"
                      onClick={() => openAuction(fish)}
                      className="shrink-0 px-3 py-1.5 rounded text-sm bg-rose-700 hover:bg-rose-600 text-white"
                    >
                      送去競拍
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {auctionFish && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-cyan-800/50 bg-gray-900 p-4">
            <h2 className="text-lg font-semibold text-cn-gold">送去競拍</h2>
            <p className="text-xs text-gray-400 mt-1">{getFishSpeciesName(auctionFish)} · 全員可喊價，價高者得</p>
            <label className="block mt-3 text-sm">
              <span className="text-gray-400 text-xs">底價（佳盟幣）</span>
              <input
                type="number"
                min="1"
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                className="mt-1 w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </label>
            <label className="block mt-3 text-sm">
              <span className="text-gray-400 text-xs">競拍時間</span>
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="mt-1 w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
              >
                <option value={1}>1 小時</option>
                <option value={6}>6 小時</option>
                <option value={12}>12 小時</option>
                <option value={24}>1 日</option>
                <option value={72}>3 日</option>
                <option value={168}>7 日</option>
              </select>
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAuctionFish(null)}
                className="flex-1 px-3 py-2 rounded bg-gray-700 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitAuction}
                className="flex-1 px-3 py-2 rounded bg-rose-600 text-sm text-white"
              >
                開始競拍
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
