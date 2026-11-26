import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { createTrade } from '../utils/tradeStorage'
import { addTransaction, addWalletBalance } from '../utils/walletStorage'
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
  getFishSellBackPrice,
  getFishShopPrice,
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

  const refresh = () => {
    if (user) tickPetBreeding(user)
    setTick((n) => n + 1)
  }

  useRealtimeKeys(
    ['jiameng_pets', 'jiameng_equipped_effects', 'jiameng_inventories', 'jiameng_items'],
    refresh
  )

  useEffect(() => {
    const id = window.setInterval(refresh, 15000)
    return () => window.clearInterval(id)
  }, [])

  const roster = useMemo(() => getTankRoster(user), [user, tick])
  const cap = useMemo(() => getFishSlotCount(user), [user, tick])
  const pets = useMemo(() => getUserPets(user), [user, tick])
  const others = useMemo(() => getPublicShowcaseFish(user), [user, tick])
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

  const listOnExchange = (fish) => {
    if (!user) return
    const shop = getFishShopPrice(fish.itemId, fish.key)
    const buyback = getFishSellBackPrice(fish.itemId, fish.key)
    const raw = window.prompt(
      `放到交易所，請輸入佳盟幣價格（商城 ${shop}，系統回收 ${buyback}）`,
      String(shop)
    )
    if (raw == null) return
    const price = Math.floor(Number(raw))
    if (!Number.isFinite(price) || price <= 0) {
      setMessage('請輸入有效價格')
      return
    }
    const removed = removeLiveFish(user, fish.id)
    if (!removed.success) {
      setMessage(removed.message || '下缸失敗')
      return
    }
    const species = getFishSpeciesName(fish)
    const name = String(removed.snapshot.name || '').trim()
    const result = createTrade({
      seller: user,
      itemId: removed.snapshot.itemId || `live_fish:${fish.key}`,
      itemName: name ? `${species}（${name}）` : species,
      quantity: 1,
      price,
      currency: 'jiameng_coin',
      description: '缸中活魚，含成長與體色',
      pet: removed.snapshot
    })
    if (!result.success) {
      attachLiveFish(user, removed.snapshot)
      setMessage(result.message || '上架失敗，魚已放回魚缸')
      refresh()
      return
    }
    setMessage('已放到交易所')
    refresh()
  }

  const sellBackToSystem = (fish) => {
    if (!user) return
    const coins = getFishSellBackPrice(fish.itemId, fish.key)
    const shop = getFishShopPrice(fish.itemId, fish.key)
    if (!window.confirm(`賣回系統可得 ${coins} 佳盟幣（商城價 ${shop} 的五折）？`)) return
    const removed = removeLiveFish(user, fish.id)
    if (!removed.success) {
      setMessage(removed.message || '賣出失敗')
      return
    }
    addWalletBalance(user, coins)
    addTransaction({
      type: 'sell_back',
      from: 'system',
      to: user,
      amount: coins,
      description: `半價賣回 ${getFishSpeciesName(fish)}`
    })
    setMessage(`已賣回系統，獲得 ${coins} 佳盟幣`)
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
          點螢幕撒飼料。預設兩隻鬥魚一公一母，相處約七天會懷孕；魚缸要多一欄空位才生得出魚苗，懷孕約五天，生完約兩週才能再配。鬥魚後代賣回系統 2 幣，其他魚為商城五折。
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
          onClick={() => navigate('/exchange')}
          className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          交易所
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
          return (
            <li
              key={fish.id}
              className="rounded-xl border border-cyan-800/40 bg-gray-900/50 p-3 sm:p-4 flex gap-3 items-center"
            >
              <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                <img
                  src={fish.src}
                  alt=""
                  className="max-h-full max-w-full object-contain origin-center"
                  style={{
                    transform: `scale(${imgScale})`,
                    filter: look.filter || undefined,
                    WebkitFilter: look.filter || undefined
                  }}
                  draggable={false}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-cyan-100 font-medium truncate">{recording ? m(shown) : shown}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {recording ? m(species) : species}
                  {sex ? ` · ${sex}` : ''}
                  {fish.born ? ' · 育成' : fish.itemId ? '' : ' · 預設'}
                  {look.growable ? ` · ${look.stage.label}` : ''}
                  {look.lengthText ? ` · ${look.lengthText}` : ''}
                  {look.pregnant ? ' · 懷孕中' : ''}
                </p>
                {look.growable && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400/80"
                      style={{ width: `${Math.round(look.progress * 100)}%` }}
                    />
                  </div>
                )}
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
                    <>
                      <button
                        type="button"
                        onClick={() => listOnExchange(fish)}
                        className="shrink-0 px-3 py-1.5 rounded text-sm bg-indigo-700 hover:bg-indigo-600 text-white"
                      >
                        放到交易所
                      </button>
                      <button
                        type="button"
                        onClick={() => sellBackToSystem(fish)}
                        className="shrink-0 px-3 py-1.5 rounded text-sm bg-rose-800 hover:bg-rose-700 text-white"
                      >
                        五折賣回
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
