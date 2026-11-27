import { useEffect, useMemo, useState } from 'react'
import FishSprite from '../components/FishSprite'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { useRecordingMode } from '../contexts/RecordingModeContext'
import { maskForRecording as m } from '../utils/recordingModeMask'
import { createAuction } from '../utils/auctionStorage'
import {
  FISH_PACKS,
  MAX_FISH_SLOTS,
  getFishSpeciesName
} from '../utils/fishSkinStorage'
import { listSpeciesMorphLooks } from '../utils/fishMorphs'
import { createFishSwap } from '../utils/fishSwapStorage'
import {
  attachLiveFish,
  canTradeTankFish,
  clearShowcaseFish,
  MAX_BREED_BIRTHS,
  femaleBirthsLeft,
  findBreedPair,
  genderLabel,
  getFishShopPrice,
  getPairBreedingMap,
  getPetAppearance,
  getPublicShowcaseFish,
  getTankRoster,
  getUserPets,
  hungerStatus,
  listBreedPairs,
  listOwnedFishPotions,
  listRoamingSlotIds,
  MAX_BREED_PAIRS,
  MAX_ROAM_FISH,
  PET_RELEASE_RATES,
  releasePayoutCoins,
  releaseRateForGrowth,
  releaseLiveFish,
  removeLiveFish,
  setFishRoaming,
  setPetName,
  setShowcaseFish,
  startBreedPair,
  stopBreedPair,
  tickPetBreeding,
  useFishPotion
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
  const isAdmin = getCurrentUserRole() === 'admin'
  const [tick, setTick] = useState(0)
  const [drafts, setDrafts] = useState({})
  const [message, setMessage] = useState('')
  const [auctionFish, setAuctionFish] = useState(null)
  const [reserve, setReserve] = useState('10')
  const [hours, setHours] = useState(24)
  const [pickMale, setPickMale] = useState('')
  const [pickFemale, setPickFemale] = useState('')

  const refresh = () => {
    if (user) tickPetBreeding(user)
    setTick((n) => n + 1)
  }

  useRealtimeKeys(
    ['jiameng_pets', 'jiameng_equipped_effects', 'jiameng_inventories', 'jiameng_items', 'jiameng_auctions', 'jiameng_fish_swaps'],
    refresh
  )

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 1000)
    return () => window.clearInterval(id)
  }, [])

  const roster = useMemo(() => getTankRoster(user), [user, tick])
  const cap = MAX_FISH_SLOTS
  const pets = useMemo(() => getUserPets(user), [user, tick])
  const others = useMemo(() => getPublicShowcaseFish(user), [user, tick])
  const breeding = useMemo(() => getPairBreedingMap(user), [user, tick])
  const showcaseSlotId = pets.showcaseSlotId || ''
  const roamIds = useMemo(() => listRoamingSlotIds(user), [user, tick])
  const potions = useMemo(() => listOwnedFishPotions(user), [user, tick])
  const breedPairs = useMemo(() => listBreedPairs(user), [user, tick])

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

  const hangSwap = (fish) => {
    if (!user) return
    const removed = removeLiveFish(user, fish.id)
    if (!removed.success) {
      setMessage(removed.message || '下缸失敗')
      return
    }
    const species = getFishSpeciesName(fish)
    const name = String(removed.snapshot.name || '').trim()
    const result = createFishSwap({
      seller: user,
      pet: removed.snapshot,
      itemName: name ? `${species}（${name}）` : species
    })
    if (!result.success) {
      attachLiveFish(user, removed.snapshot)
      setMessage(result.message || '掛出失敗，魚已放回魚缸')
      refresh()
      return
    }
    setMessage('已掛上交換，等別人用同類來換')
    refresh()
    navigate(`/fish-swap/${result.swap.id}`)
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
          商城兌換與繁育的魚都會直接進「我的寵物」（最多 {MAX_FISH_SLOTS} 隻）。點「放入魚缸」才會去「我的魚缸」游，魚缸上限同樣 {MAX_FISH_SLOTS} 隻。繁育請手動選一公一母（同品種、成魚），同時最多 {MAX_BREED_PAIRS} 組。配對後懷孕週期 7 日一輪（交配 2 日＋懷孕 3 日＋冷卻 2 日）；缸裡碰面飄愛心只是特效，與週期無關。公母各一生 {MAX_BREED_BIRTHS} 次。後代花色混父母基因，越後代越可能更大、更長、更寬胖；第三代起小機率主色微光，第四代起較常發光，微光可遺傳也可突變。掛交易所或競拍都從這裡選魚。系統會送兩隻鬥魚。放生依階段回收販售價：魚苗 {Math.round(PET_RELEASE_RATES.fry * 100)}%、幼魚 {Math.round(PET_RELEASE_RATES.juvenile * 100)}%、亞成 {Math.round(PET_RELEASE_RATES.subadult * 100)}%、成魚 {Math.round(PET_RELEASE_RATES.adult * 100)}%。
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">我的寵物</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">
            {roster.length} / {cap}
          </p>
        </div>
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">放入魚缸</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">
            {roamIds.length} / {MAX_ROAM_FISH}
          </p>
        </div>
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-3">
          <p className="text-gray-400 text-xs">空欄</p>
          <p className="text-cyan-200 font-semibold tabular-nums mt-0.5">{Math.max(0, cap - roster.length)}</p>
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
          onClick={() => navigate('/my-tank')}
          className="px-4 py-2 rounded-md border border-cyan-700 text-sm text-cyan-100 hover:bg-cyan-950/40"
        >
          進我的魚缸
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
        <button
          type="button"
          onClick={() => navigate('/fish-swap')}
          className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          魚類交換
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-rose-800/40 bg-rose-950/20 p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-rose-100">繁育系統</h2>
          <p className="text-xs text-rose-200/80">進行中 {breedPairs.length} / {MAX_BREED_PAIRS} 組</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          先選公魚再選母魚，同品種才能組成。兩隻放入魚缸後開始 7 日懷孕週期。碰面愛心只是特效，跟週期無關。次數用盡無法再選。
        </p>
        {breedPairs.length > 0 && (
          <ul className="mt-3 space-y-2">
            {breedPairs.map((pair) => {
              const dad = roster.find((f) => f.id === pair.maleId)
              const mom = roster.find((f) => f.id === pair.femaleId)
              const dadLook = dad ? getPetAppearance(user, dad.id, dad.itemId, dad.key) : null
              const momLook = mom ? getPetAppearance(user, mom.id, mom.itemId, mom.key) : null
              const dadName = String(drafts[pair.maleId] || pets.names[pair.maleId] || getFishSpeciesName(dad || { key: 'betta' })).trim()
              const momName = String(drafts[pair.femaleId] || pets.names[pair.femaleId] || getFishSpeciesName(mom || { key: 'betta' })).trim()
              const bothIn = roamIds.includes(pair.maleId) && roamIds.includes(pair.femaleId)
              const momLeft = momLook ? femaleBirthsLeft(pets.growth?.[pair.femaleId]) : 0
              const dadLeft = dadLook ? femaleBirthsLeft(pets.growth?.[pair.maleId]) : 0
              return (
                <li key={`${pair.maleId}-${pair.femaleId}`} className="flex flex-wrap items-center gap-2 text-sm text-rose-50">
                  <span className="min-w-0 truncate">
                    公 {recording ? m(dadName) : dadName}
                    {dadLook?.gender === 'm' ? '' : ''}
                    {' × '}
                    母 {recording ? m(momName) : momName}
                    {` · 公剩 ${dadLeft}/${MAX_BREED_BIRTHS} · 母剩 ${momLeft}/${MAX_BREED_BIRTHS}`}
                    {bothIn ? ' · 已在缸裡' : ' · 請放入魚缸'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const r = stopBreedPair(user, pair.femaleId)
                      setMessage(r.success ? '已取消這組繁育' : r.message || '取消失敗')
                      refresh()
                    }}
                    className="shrink-0 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600"
                  >
                    取消這組
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!pickMale || !pickFemale}
            onClick={() => {
              const r = startBreedPair(user, pickMale, pickFemale)
              setMessage(r.success ? '已組成繁育，請把兩隻放入魚缸' : r.message || '配對失敗')
              if (r.success) {
                setPickMale('')
                setPickFemale('')
              }
              refresh()
            }}
            className="px-3 py-1.5 rounded text-sm bg-rose-700 hover:bg-rose-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"
          >
            {pickMale && pickFemale ? '組成這一組' : '請先點魚選公、選母'}
          </button>
          {(pickMale || pickFemale) && (
            <button
              type="button"
              onClick={() => {
                setPickMale('')
                setPickFemale('')
              }}
              className="px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600"
            >
              清除選擇
            </button>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/90">
          目前有 {others.length} 人展示中，他們的展示魚會出現在系統各頁；你放入魚缸的魚只在「我的魚缸」。
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
          const pack = FISH_PACKS[fish.key] || FISH_PACKS.betta
          const art = look.art === 'b' ? 'b' : 'a'
          const pairOf = findBreedPair(user, fish.id)
          const adult = !look.growable || look.stage?.key === 'adult'
          const usesLeft = femaleBirthsLeft(pets.growth?.[fish.id])
          const picked = pickMale === fish.id || pickFemale === fish.id
          return (
            <li
              key={fish.id}
              className={`rounded-xl border p-3 sm:p-4 flex gap-3 items-center ${
                picked
                  ? 'border-rose-400 bg-rose-950/30'
                  : pairOf
                    ? 'border-rose-800/50 bg-gray-900/50'
                    : 'border-cyan-800/40 bg-gray-900/50'
              }`}
            >
              <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                <div style={{ transform: `scale(${imgScale})` }}>
                  <FishSprite
                    src={pack[art]}
                    variant={art}
                    wide={!!fish.wide}
                    shape={fish.shape}
                    width={Math.round((fish.shape === 'ray' || fish.shape === 'turtle' ? 118 : fish.shape === 'koi' ? 140 : fish.shape === 'shark' ? 148 : fish.shape === 'cichlid' ? 110 : fish.wide ? 140 : 92) * (look.lengthMul || 1))}
                    height={Math.round((fish.shape === 'ray' || fish.shape === 'turtle' ? 68 : fish.shape === 'koi' ? 70 : fish.shape === 'shark' ? 68 : fish.shape === 'cichlid' ? 62 : fish.wide ? 52 : 44) * (look.girthMul || 1))}
                    parts={look.parts}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-cyan-100 font-medium truncate">{recording ? m(shown) : shown}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {recording ? m(species) : species}
                  {sex ? ` · ${sex}` : ''}
                  {fish.born ? ' · 育成' : ''}
                  {look.growable ? ` · ${look.stage.label}` : ''}
                  {look.lengthText ? ` · ${look.lengthText}` : ''}
                  {` · 繁育 ${usesLeft}/${MAX_BREED_BIRTHS}`}
                  {look.glowText ? ` · ${look.glowText}` : ''}
                  {look.pregnant || breed?.phase === 'pregnant' ? ' · 懷孕中' : ''}
                  {pairOf ? ' · 繁育中' : ''}
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
                {roamIds.includes(fish.id) && (
                  <p className="text-[11px] text-sky-200 mt-1">已放入我的魚缸</p>
                )}
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
                  <button
                    type="button"
                    onClick={() => {
                      const on = !roamIds.includes(fish.id)
                      const r = setFishRoaming(user, fish.id, on)
                      setMessage(r.success ? (on ? '已放入魚缸' : '已從魚缸收回') : r.message || '設定失敗')
                      refresh()
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded text-sm ${
                      roamIds.includes(fish.id)
                        ? 'bg-sky-500 text-cn-ink font-semibold'
                        : 'bg-gray-700 hover:bg-gray-600 text-cn-parchment'
                    }`}
                  >
                    {roamIds.includes(fish.id) ? '收回魚缸' : '放入魚缸'}
                  </button>
                  {pairOf ? (
                    <button
                      type="button"
                      onClick={() => {
                        const r = stopBreedPair(user, fish.id)
                        setMessage(r.success ? '已退出繁育' : r.message || '取消失敗')
                        refresh()
                      }}
                      className="shrink-0 px-3 py-1.5 rounded text-sm bg-rose-800 hover:bg-rose-700 text-white"
                    >
                      取消繁育
                    </button>
                  ) : adult && look.gender === 'm' && usesLeft > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPickMale(fish.id === pickMale ? '' : fish.id)}
                      className={`shrink-0 px-3 py-1.5 rounded text-sm ${
                        pickMale === fish.id ? 'bg-sky-400 text-cn-ink font-semibold' : 'bg-sky-800 hover:bg-sky-700 text-white'
                      }`}
                    >
                      {pickMale === fish.id ? '已選公魚' : '選為公魚'}
                    </button>
                  ) : adult && look.gender === 'f' && usesLeft > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPickFemale(fish.id === pickFemale ? '' : fish.id)}
                      className={`shrink-0 px-3 py-1.5 rounded text-sm ${
                        pickFemale === fish.id ? 'bg-pink-400 text-cn-ink font-semibold' : 'bg-pink-800 hover:bg-pink-700 text-white'
                      }`}
                    >
                      {pickFemale === fish.id ? '已選母魚' : '選為母魚'}
                    </button>
                  ) : adult && usesLeft <= 0 ? (
                    <span className="shrink-0 px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-500">繁育已盡</span>
                  ) : null}
                  {canTradeTankFish(fish) && (
                    <>
                      <button
                        type="button"
                        onClick={() => hangSwap(fish)}
                        className="shrink-0 px-3 py-1.5 rounded text-sm bg-emerald-700 hover:bg-emerald-600 text-white"
                      >
                        掛上交換
                      </button>
                      <button
                        type="button"
                        onClick={() => openAuction(fish)}
                        className="shrink-0 px-3 py-1.5 rounded text-sm bg-rose-700 hover:bg-rose-600 text-white"
                      >
                        送去競拍
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`放生後無法復原，獲得販售價 ${Math.round(releaseRateForGrowth(look.meals, fish.key, look.growable) * 100)}%（${releasePayoutCoins(fish.itemId, fish.key, look.meals, look.growable)} 毓承幣）。確定放生？`)) return
                      const r = releaseLiveFish(user, fish.id)
                      setMessage(r.success ? `已放生，獲得 ${r.coins} 毓承幣` : r.message || '放生失敗')
                      refresh()
                    }}
                    className="shrink-0 px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    放生
                  </button>
                  {look.gender === 'f' && (potions.heat > 0 || potions.affection > 0 || potions.birth > 0) ? (
                    <>
                      {potions.heat > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const r = useFishPotion(user, fish.id, 'heat')
                            setMessage(r.message || (r.success ? '已使用' : '無法使用'))
                            refresh()
                          }}
                          className="shrink-0 px-3 py-1.5 rounded text-sm bg-fuchsia-800 hover:bg-fuchsia-700 text-white"
                        >
                          發情藥水
                        </button>
                      ) : null}
                      {potions.affection > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const r = useFishPotion(user, fish.id, 'affection')
                            setMessage(r.message || (r.success ? '已使用' : '無法使用'))
                            refresh()
                          }}
                          className="shrink-0 px-3 py-1.5 rounded text-sm bg-pink-800 hover:bg-pink-700 text-white"
                        >
                          好感藥水
                        </button>
                      ) : null}
                      {potions.birth > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const r = useFishPotion(user, fish.id, 'birth')
                            setMessage(r.message || (r.success ? '已使用' : '無法使用'))
                            refresh()
                          }}
                          className="shrink-0 px-3 py-1.5 rounded text-sm bg-sky-800 hover:bg-sky-700 text-white"
                        >
                          催生藥水
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {isAdmin ? (
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-cn-gold">體色圖鑑</h2>
        <p className="text-xs text-gray-400 mt-1">僅管理員可見。花色混父母基因；另含巨體／長體／寬胖，以及三代微光、四代發光（主色紅發紅光、藍發藍光，可遺傳與突變）。</p>
        {Object.keys(FISH_PACKS).map((key) => {
          const pack = FISH_PACKS[key]
          const rows = listSpeciesMorphLooks(key)
          return (
            <div key={key} className="mt-4">
              <p className="text-sm text-cyan-100 mb-2">{getFishSpeciesName({ key })}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-gray-700 bg-black/30 p-2 flex flex-col items-center"
                  >
                    <div className="h-16 w-full flex items-center justify-center overflow-hidden gap-1">
                      {(row.samples?.length ? row.samples : [row.parts]).map((look, i) => (
                        <FishSprite
                          key={`${row.id}-${i}`}
                          src={pack[row.art === 'b' ? 'b' : 'a']}
                          variant={row.art === 'b' ? 'b' : 'a'}
                          wide={!!pack.wide}
                          shape={pack.shape || 'fish'}
                          width={Math.round((pack.shape === 'ray' || pack.shape === 'turtle' ? 96 : pack.shape === 'koi' ? 112 : pack.shape === 'shark' ? 118 : pack.shape === 'cichlid' ? 90 : pack.wide ? 108 : 72) * (row.form?.length || 1))}
                          height={Math.round((pack.shape === 'ray' || pack.shape === 'turtle' ? 54 : pack.shape === 'koi' ? 56 : pack.shape === 'shark' ? 54 : pack.shape === 'cichlid' ? 50 : pack.wide ? 40 : 36) * (row.form?.girth || 1) * (row.form?.size || 1))}
                          parts={look}
                        />
                      ))}
                    </div>
                    {row.tag ? <p className="text-[10px] text-amber-200/90 mt-1">{row.tag}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      ) : null}

      {auctionFish && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-cyan-800/50 bg-gray-900 p-4">
            <h2 className="text-lg font-semibold text-cn-gold">送去競拍</h2>
            <p className="text-xs text-gray-400 mt-1">{getFishSpeciesName(auctionFish)} · 全員可喊價，價高者得</p>
            <label className="block mt-3 text-sm">
              <span className="text-gray-400 text-xs">底價（毓承幣）</span>
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
