import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OceanAmbience, { enterTankWideWatch, stepTankZoom } from '../components/OceanAmbience'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { isTankClosed, listTankVisitors, listVisitTanks, noteTankVisit } from '../utils/petStorage'
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
  const tankOwner = visiting ? host : me
  const [tanks, setTanks] = useState(() => listVisitTanks(me))
  const [visitors, setVisitors] = useState(() => listTankVisitors(tankOwner))
  const [openList, setOpenList] = useState('')

  useEffect(() => {
    if (host && host === me) navigate('/my-tank', { replace: true })
  }, [host, me, navigate])

  useEffect(() => {
    if (!visiting || !host) return
    if (isTankClosed(host) && getCurrentUserRole() !== 'admin') {
      navigate('/my-tank', { replace: true })
      return
    }
    if (me) noteTankVisit(host, me)
  }, [visiting, host, me, navigate])

  useEffect(() => {
    const refresh = () => {
      const user = getCurrentUser()
      setTanks(listVisitTanks(user))
      setVisitors(listTankVisitors(visiting ? host : user))
    }
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
  }, [visiting, host])

  const hostName = visiting ? getDisplayNameForAccount(host) : ''
  const toggle = (id) => setOpenList((cur) => (cur === id ? '' : id))

  return (
    <div className="relative z-[41] max-w-3xl mx-auto text-cn-parchment pb-8 pointer-events-none">
      <div className="pointer-events-auto mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
          {visiting ? `${hostName}的魚缸` : '我的魚缸'}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/my-pets')}
            className="px-4 py-2 rounded-md border border-gray-600/80 bg-black/40 text-sm text-cn-parchment hover:bg-black/55"
          >
            回我的寵物
          </button>
          {visiting ? (
            <button
              type="button"
              onClick={() => navigate('/my-tank')}
              className="px-4 py-2 rounded-md border border-gray-600/80 bg-black/40 text-sm text-cn-parchment hover:bg-black/55"
            >
              回自己的魚缸
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => enterTankWideWatch()}
            className="px-4 py-2 rounded-md border border-cn-gold/50 bg-black/40 text-sm text-cn-gold hover:bg-black/55"
          >
            橫向模式
          </button>
          <button
            type="button"
            onClick={() => stepTankZoom(1)}
            className="px-4 py-2 rounded-md border border-cn-gold/50 bg-black/40 text-sm text-cn-gold hover:bg-black/55"
          >
            走近看
          </button>
          <button
            type="button"
            onClick={() => stepTankZoom(-1)}
            className="px-4 py-2 rounded-md border border-gray-600/80 bg-black/40 text-sm text-cn-parchment hover:bg-black/55"
          >
            拉開
          </button>
          <button
            type="button"
            onClick={() => toggle('visit')}
            className={`px-4 py-2 rounded-md border text-sm bg-black/40 hover:bg-black/55 ${
              openList === 'visit' ? 'border-cn-gold/70 text-cn-gold' : 'border-gray-600/80 text-cn-parchment'
            }`}
          >
            參觀別人的魚缸
          </button>
          <button
            type="button"
            onClick={() => toggle('guests')}
            className={`px-4 py-2 rounded-md border text-sm bg-black/40 hover:bg-black/55 ${
              openList === 'guests' ? 'border-cn-gold/70 text-cn-gold' : 'border-gray-600/80 text-cn-parchment'
            }`}
          >
            誰來過
          </button>
        </div>
        {openList === 'visit' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tanks.length ? tanks.map((row) => {
              const active = visiting && row.account === host
              return (
                <button
                  key={row.account}
                  type="button"
                  onClick={() => {
                    setOpenList('')
                    navigate(`/tank/${encodeURIComponent(row.account)}`)
                  }}
                  className={`px-3 py-1.5 rounded-md border text-xs bg-black/40 hover:bg-black/55 ${
                    active ? 'border-cn-gold/70 text-cn-gold' : 'border-gray-600/80 text-cn-parchment'
                  }`}
                >
                  {getDisplayNameForAccount(row.account)}
                </button>
              )
            }) : (
              <p className="text-xs text-gray-500">目前沒有可參觀的魚缸</p>
            )}
          </div>
        ) : null}
        {openList === 'guests' ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {visitors.length ? visitors.map((row) => (
              <p key={row.account} className="text-sm text-slate-800">
                {getDisplayNameForAccount(row.account)}
                {row.fed ? <span className="ml-2 text-sky-200/90">幫忙餵食過魚</span> : null}
              </p>
            )) : (
              <p className="text-xs text-gray-500">還沒有人來過</p>
            )}
          </div>
        ) : null}
      </div>
      <OceanAmbience mode="tank" />
    </div>
  )
}
