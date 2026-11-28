import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OceanAmbience, { enterTankWideWatch } from '../components/OceanAmbience'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { listVisitTanks } from '../utils/petStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'

export default function MyTank() {
  const navigate = useNavigate()
  const { account } = useParams()
  const me = getCurrentUser()
  let host = ''
  try {
    host = decodeURIComponent(account || '')
  } catch (_) {
    host = String(account || '')
  }
  const visiting = !!(host && host !== me)
  const [tanks, setTanks] = useState(() => listVisitTanks(me))

  useEffect(() => {
    if (host && host === me) navigate('/my-tank', { replace: true })
  }, [host, me, navigate])

  useEffect(() => {
    const refresh = () => setTanks(listVisitTanks(getCurrentUser()))
    refresh()
    const onRt = (e) => {
      const key = e?.detail?.key
      if (key && key !== '__ALL__' && key !== 'jiameng_pets') return
      refresh()
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    const timer = window.setInterval(refresh, 4000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
    }
  }, [])

  const hostName = visiting ? getDisplayNameForAccount(host) : ''

  return (
    <div className="relative z-[41] max-w-3xl mx-auto text-cn-parchment pb-8 pointer-events-none">
      <div className="pointer-events-auto mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">
          {visiting ? `${hostName}的魚缸` : '我的魚缸'}
        </h1>
        {visiting ? (
          <p className="mt-2 text-sm text-gray-400">可以幫忙餵食，每天每隻最多幫忙 3 次（主人自己還有 5 次）</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/my-pets')}
            className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
          >
            回我的寵物
          </button>
          {visiting ? (
            <button
              type="button"
              onClick={() => navigate('/my-tank')}
              className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
            >
              回自己的魚缸
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => enterTankWideWatch()}
            className="px-4 py-2 rounded-md border border-cn-gold/50 text-sm text-cn-gold hover:bg-black/30"
          >
            橫向模式
          </button>
        </div>
        {tanks.length ? (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">參觀別人的魚缸</p>
            <div className="flex flex-wrap gap-2">
              {tanks.map((row) => {
                const active = visiting && row.account === host
                return (
                  <button
                    key={row.account}
                    type="button"
                    onClick={() => navigate(`/tank/${encodeURIComponent(row.account)}`)}
                    className={`px-3 py-1.5 rounded-md border text-xs hover:bg-black/30 ${
                      active
                        ? 'border-cn-gold/70 text-cn-gold'
                        : 'border-gray-600 text-cn-parchment'
                    }`}
                  >
                    {getDisplayNameForAccount(row.account)} · {row.count}隻
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
      <OceanAmbience mode="tank" />
    </div>
  )
}
