import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FishSprite from '../components/FishSprite'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { FISH_PACKS, getFishSpeciesName } from '../utils/fishSkinStorage'
import {
  availableBidBalance,
  auctionRemain,
  cancelAuction,
  formatAuctionRemain,
  getAuction,
  getLiveAuctions,
  minNextBid,
  placeBid,
  settleEndedAuctions
} from '../utils/auctionStorage'
import { lookFromSnapshot } from '../utils/petStorage'
import { getWalletBalance } from '../utils/walletStorage'

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
  const w = size === 'lg' ? (disc ? 280 : shark ? 320 : cichlid ? 260 : wide ? 340 : 220) : disc ? 118 : shark ? 148 : cichlid ? 110 : wide ? 140 : 92
  const h = size === 'lg' ? (disc ? 160 : shark ? 148 : cichlid ? 150 : wide ? 120 : 110) : disc ? 68 : shark ? 68 : cichlid ? 62 : wide ? 52 : 44
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

export default function FishAuction() {
  const navigate = useNavigate()
  const { auctionId } = useParams()
  const user = getCurrentUser() || ''
  const [tick, setTick] = useState(0)
  const [bidAmt, setBidAmt] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => {
    settleEndedAuctions()
    setTick((n) => n + 1)
  }

  useRealtimeKeys(['jiameng_auctions', 'jiameng_wallets', 'jiameng_pets'], refresh)

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 1000)
    return () => window.clearInterval(id)
  }, [])

  const live = useMemo(() => getLiveAuctions(), [tick])
  const detail = useMemo(() => (auctionId ? getAuction(auctionId) : null), [auctionId, tick])
  const wallet = useMemo(() => (user ? getWalletBalance(user) : 0), [user, tick])

  useEffect(() => {
    if (!detail) return
    setBidAmt(String(minNextBid(detail)))
  }, [detail?.id, detail?.currentBid])

  const submitBid = () => {
    if (!user || !detail) return
    const result = placeBid(detail.id, user, bidAmt)
    setMessage(result.success ? `已喊 ${Math.floor(Number(bidAmt))} 佳盟幣` : result.message || '喊價失敗')
    refresh()
  }

  if (auctionId && !detail) {
    return (
      <div className="max-w-3xl mx-auto text-cn-parchment py-10 text-center">
        <p className="text-gray-400">找不到這場競拍</p>
        <button type="button" className="mt-4 text-cyan-300" onClick={() => navigate('/fish-auction')}>
          回競拍列表
        </button>
      </div>
    )
  }

  if (detail) {
    const snap = detail.pet || {}
    const look = lookFromSnapshot(snap)
    const species = getFishSpeciesName({ key: snap.species, itemId: snap.itemId })
    const liveAuc = detail.status === 'live' && auctionRemain(detail) > 0
    const need = minNextBid(detail)
    const canPay = availableBidBalance(user, detail)
    const mine = detail.seller === user
    const remain = liveAuc ? formatAuctionRemain(auctionRemain(detail)) : '已結束'
    return (
      <div className="max-w-2xl mx-auto text-cn-parchment pb-10">
        <button type="button" className="text-sm text-cyan-300 mb-4" onClick={() => navigate('/fish-auction')}>
          ← 全部競拍
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
            {look.morphLabel && look.morphLabel !== '未顯色' ? ` · ${look.morphLabel}` : ''}
            {look.lengthText ? ` · ${look.lengthText}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">賣家：{getDisplayNameForAccount(detail.seller)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-gray-700 px-3 py-2">
              <p className="text-gray-500 text-xs">底價</p>
              <p className="text-amber-200 font-semibold">{detail.reserve} 幣</p>
            </div>
            <div className="rounded-lg border border-gray-700 px-3 py-2">
              <p className="text-gray-500 text-xs">目前最高</p>
              <p className="text-rose-200 font-semibold">
                {detail.currentBid ? `${detail.currentBid} 幣` : '尚無喊價'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-700 px-3 py-2">
              <p className="text-gray-500 text-xs">剩餘時間</p>
              <p className="text-cyan-200 font-semibold">{remain}</p>
            </div>
            <div className="rounded-lg border border-gray-700 px-3 py-2">
              <p className="text-gray-500 text-xs">最高出價人</p>
              <p className="text-gray-200">
                {detail.currentBidder ? getDisplayNameForAccount(detail.currentBidder) : '—'}
              </p>
            </div>
          </div>
          {!liveAuc && (
            <p className="mt-3 text-sm text-amber-200">
              {detail.status === 'sold'
                ? `得標：${getDisplayNameForAccount(detail.buyer)} · ${detail.currentBid} 幣`
                : detail.status === 'cancelled'
                  ? '已取消，魚已退回賣家'
                  : '流標，魚已退回賣家'}
            </p>
          )}
          {liveAuc && !mine && (
            <div className="mt-4 flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[8rem]">
                <span className="block text-xs text-gray-400 mb-1">
                  喊價（至少 {need}，你有 {canPay}）
                </span>
                <input
                  type="number"
                  min={need}
                  value={bidAmt}
                  onChange={(e) => setBidAmt(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </label>
              <button
                type="button"
                disabled={canPay < need}
                onClick={submitBid}
                className="shrink-0 px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              >
                {canPay < need ? '幣不足' : '喊價'}
              </button>
            </div>
          )}
          {liveAuc && mine && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">這是你送拍的魚，不能自己喊價。</p>
              {!detail.currentBidder && (
                <button
                  type="button"
                  onClick={() => {
                    const r = cancelAuction(detail.id, user)
                    setMessage(r.success ? '已取消，魚已回缸' : r.message || '取消失敗')
                    if (r.success) navigate('/fish-auction')
                    refresh()
                  }}
                  className="px-4 py-2 rounded bg-gray-700 text-sm"
                >
                  取消競拍
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">你的佳盟幣：{wallet}</p>
          {message && <p className="text-sm text-emerald-200 mt-2">{message}</p>}
          {(detail.bids || []).length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-gray-400">
              {[...(detail.bids || [])].reverse().map((b, i) => (
                <li key={`${b.at}-${i}`}>
                  {getDisplayNameForAccount(b.user)} 喊 {b.amount} · {new Date(b.at).toLocaleString('zh-TW')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto text-cn-parchment pb-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">魚類競拍</h1>
      <p className="text-gray-400 text-sm mt-1">全員可喊價，價高者得。幣不夠不能出價，時間到自動結標。</p>
      <p className="text-sm text-amber-200 mt-2">佳盟幣 {wallet}</p>
      {live.length === 0 ? (
        <p className="text-gray-500 mt-8 text-center">目前沒有競拍中的魚</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {live.map((auc) => {
            const snap = auc.pet || {}
            return (
              <li key={auc.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/fish-auction/${auc.id}`)}
                  className="w-full text-left rounded-xl border border-cyan-800/40 bg-gray-900/50 p-3 flex gap-3 items-center hover:border-cyan-500/60"
                >
                  <div className="shrink-0 w-28 h-16 flex items-center justify-center rounded-lg bg-black/30 border border-gray-700 overflow-hidden">
                    <FishShow snap={snap} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-cyan-100 font-medium truncate">{auc.itemName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      底價 {auc.reserve} · 目前 {auc.currentBid || '尚無'} · 剩 {formatAuctionRemain(auctionRemain(auc))}
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
