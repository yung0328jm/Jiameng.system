import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FishSprite from '../components/FishSprite'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { FISH_PACKS, getFishSpeciesName } from '../utils/fishSkinStorage'
import {
  acceptFishSwap,
  cancelFishSwap,
  getFishSwap,
  getOpenFishSwaps
} from '../utils/fishSwapStorage'
import {
  canTradeTankFish,
  genderLabel,
  getPetAppearance,
  getTankRoster,
  getUserPets,
  lookFromSnapshot
} from '../utils/petStorage'

function packOf(species) {
  return FISH_PACKS[species] || FISH_PACKS.betta
}

function FishShow({ snap, size = 'md' }) {
  const pack = packOf(snap?.species)
  const look = lookFromSnapshot(snap)
  const art = look.art === 'b' ? 'b' : 'a'
  const wide = !!pack.wide
  const shape = pack.shape || 'fish'
  const disc = shape === 'ray' || shape === 'turtle'
  const cichlid = shape === 'cichlid'
  const shark = shape === 'shark'
  const koi = shape === 'koi'
  const w = size === 'lg' ? (disc ? 280 : koi ? 300 : shark ? 320 : cichlid ? 260 : wide ? 340 : 220) : disc ? 118 : koi ? 140 : shark ? 148 : cichlid ? 110 : wide ? 140 : 92
  const h = size === 'lg' ? (disc ? 160 : koi ? 150 : shark ? 148 : cichlid ? 150 : wide ? 120 : 110) : disc ? 68 : koi ? 70 : shark ? 68 : cichlid ? 62 : wide ? 52 : 44
  return (
    <FishSprite
      src={pack[art]}
      variant={art}
      wide={wide}
      shape={shape}
      width={w}
      height={h}
      parts={look.parts}
    />
  )
}

export default function FishSwap() {
  const navigate = useNavigate()
  const { swapId } = useParams()
  const user = getCurrentUser() || ''
  const [tick, setTick] = useState(0)
  const [pickId, setPickId] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => setTick((n) => n + 1)

  useRealtimeKeys(['jiameng_fish_swaps', 'jiameng_pets', 'jiameng_equipped_effects'], refresh)

  useEffect(() => {
    refresh()
  }, [])

  const live = useMemo(() => getOpenFishSwaps(user), [user, tick])
  const detail = useMemo(() => (swapId ? getFishSwap(swapId) : null), [swapId, tick])
  const mine = useMemo(() => getTankRoster(user), [user, tick])

  const offers = useMemo(() => {
    const species = detail?.species
    if (!species) return []
    return mine.filter((f) => canTradeTankFish(f) && f.key === species)
  }, [mine, detail?.species])

  if (swapId && !detail) {
    return (
      <div className="max-w-3xl mx-auto text-cn-parchment py-10 text-center">
        <p className="text-gray-400">找不到這筆交換</p>
        <button type="button" className="mt-4 text-cyan-300" onClick={() => navigate('/fish-swap')}>
          回交換列表
        </button>
      </div>
    )
  }

  if (detail) {
    const snap = detail.pet || {}
    const look = lookFromSnapshot(snap)
    const species = getFishSpeciesName({ key: snap.species, itemId: snap.itemId })
    const open = detail.status === 'open'
    const own = detail.seller === user
    return (
      <div className="max-w-2xl mx-auto text-cn-parchment pb-10">
        <button type="button" className="text-sm text-cyan-300 mb-4" onClick={() => navigate('/fish-swap')}>
          ← 全部交換
        </button>
        <div className="rounded-2xl border border-cyan-800/50 bg-gray-900/70 p-4 sm:p-6">
          <div className="flex justify-center rounded-xl bg-black/40 border border-gray-700 py-6 overflow-hidden">
            <FishShow snap={snap} size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-cn-gold font-serif mt-4">{detail.itemName}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {species}
            {look.gender ? ` · ${look.gender === 'f' ? '母' : '公'}` : ''}
            {look.stage?.label ? ` · ${look.stage.label}` : ''}
            {look.lengthText ? ` · ${look.lengthText}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">掛出者：{getDisplayNameForAccount(detail.seller)}</p>
          <p className="text-sm text-cyan-200 mt-3">同類免費交換，不限公母，不用毓承幣。</p>
          {!open && (
            <p className="mt-3 text-sm text-amber-200">
              {detail.status === 'done'
                ? `已與 ${getDisplayNameForAccount(detail.taker)} 交換完成`
                : '已取消，魚已退回掛出者'}
            </p>
          )}
          {open && own && (
            <button
              type="button"
              className="mt-4 px-4 py-2 rounded bg-gray-700 text-sm"
              onClick={() => {
                const r = cancelFishSwap(detail.id, user)
                setMessage(r.success ? '已取消，魚已回缸' : r.message || '取消失敗')
                if (r.success) navigate('/fish-swap')
                refresh()
              }}
            >
              取消掛出
            </button>
          )}
          {open && !own && (
            <div className="mt-4">
              {offers.length === 0 ? (
                <p className="text-sm text-amber-200">你沒有同種類可交換的魚。</p>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-2">選一隻同類的魚換給對方</p>
                  <ul className="space-y-2">
                    {offers.map((fish) => {
                      const app = getPetAppearance(user, fish.id, fish.itemId, fish.key)
                      const nick = String(getUserPets(user).names?.[fish.id] || '').trim()
                      return (
                        <li key={fish.id}>
                          <label className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 cursor-pointer">
                            <input
                              type="radio"
                              name="swap-offer"
                              checked={pickId === fish.id}
                              onChange={() => setPickId(fish.id)}
                            />
                            <span className="text-sm text-cyan-100">
                              {nick || species}
                              {app.gender ? ` · ${genderLabel(app.gender)}` : ''}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    type="button"
                    disabled={!pickId}
                    className="mt-3 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm"
                    onClick={() => {
                      const r = acceptFishSwap(detail.id, user, pickId)
                      setMessage(r.success ? '交換完成，魚已進缸' : r.message || '交換失敗')
                      if (r.success) navigate('/my-pets')
                      refresh()
                    }}
                  >
                    確認交換
                  </button>
                </>
              )}
            </div>
          )}
          {message && <p className="text-sm text-emerald-200 mt-2">{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment pb-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">魚類交換</h1>
      <p className="text-gray-400 text-sm mt-1">掛上自己的魚，別人用同一種類換你。免費、不限公母。</p>
      {live.length === 0 ? (
        <p className="text-gray-500 mt-8 text-center">目前沒有掛出的魚，到「我的寵物」可掛上交換。</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {live.map((row) => {
            const snap = row.pet || {}
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/fish-swap/${row.id}`)}
                  className="w-full text-left rounded-xl border border-cyan-800/40 bg-gray-900/50 p-3 flex gap-3 items-center hover:border-cyan-500/60"
                >
                  <div className="shrink-0 w-28 h-16 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                    <FishShow snap={snap} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-cyan-100 font-medium truncate">{row.itemName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {getFishSpeciesName({ key: row.species, itemId: snap.itemId })} · {getDisplayNameForAccount(row.seller)}
                      {row.seller === user ? ' · 我掛的' : ''}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
