import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { FISH_PACKS, getFishSpeciesName, speciesAdultScale, speciesKeyFromRefs, speciesSwimLayer } from '../utils/fishSkinStorage'
import {
  getPetAppearance,
  getShowcaseWorldRoster,
  getTankRoamRoster,
  getUserPets,
  formatFeedCountdown,
  hungerStatus,
  nextFeedWait,
  spriteLengthRatio,
  listBreedPairs,
  listOwnedFishPotions,
  recentHelpers,
  recordPetEat,
  tickPetBreeding,
  useFishPotion
} from '../utils/petStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import FishSprite from './FishSprite'

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 17) % 92)}%`,
  size: `${7 + (i % 5) * 3}px`,
  duration: `${10 + (i % 7) * 2.2}s`,
  delay: `${-(i * 1.3)}s`
}))

function TankScenery() {
  return (
    <div className="ocean-tank-scenery" aria-hidden>
      <div className="ocean-tank-back" />
      <div className="ocean-tank-caustic" />
      <div className="ocean-tank-surface" />
      <div className="ocean-tank-beam">
        <span className="ocean-tank-beam-core" />
        <span className="ocean-tank-beam-glow" />
      </div>
      <div className="ocean-tank-glass" />
      <div className="ocean-tank-rim ocean-tank-rim-top" />
      <div className="ocean-tank-rim ocean-tank-rim-bot" />
    </div>
  )
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const TANK_WIDE_CLASS = 'tank-widewatch'

export function isTankWideWatch() {
  return typeof document !== 'undefined' && document.body.classList.contains(TANK_WIDE_CLASS)
}

export async function enterTankWideWatch() {
  if (typeof document === 'undefined') return
  document.body.classList.add(TANK_WIDE_CLASS)
  try {
    const el = document.documentElement
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
  } catch (_) {}
  try {
    if (typeof screen !== 'undefined' && screen.orientation?.lock) {
      await screen.orientation.lock('landscape')
    }
  } catch (_) {}
}

export async function exitTankWideWatch() {
  if (typeof document === 'undefined') return
  document.body.classList.remove(TANK_WIDE_CLASS)
  try {
    if (typeof screen !== 'undefined' && screen.orientation?.unlock) screen.orientation.unlock()
  } catch (_) {}
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) await document.webkitExitFullscreen()
  } catch (_) {}
}

function isMobile() {
  if (typeof window === 'undefined') return false
  return Math.min(window.innerWidth, window.innerHeight) <= 640
}

function headerClearance() {
  if (typeof document === 'undefined') return 140
  if (isTankWideWatch()) return 36
  const nav = document.querySelector('[data-ocean-nav]')
  if (nav) {
    const bottom = nav.getBoundingClientRect().bottom
    return Math.max(8, Math.ceil(bottom) + 8)
  }
  return isMobile() ? 128 : 148
}

function layout(mode = 'world', fishCount = 0) {
  const mobile = isMobile()
  const viewW = window.innerWidth
  const viewH = window.innerHeight
  const wide = mode === 'tank' && isTankWideWatch()
  const rotate = wide && viewH > viewW
  const pan = mode === 'tank' && mobile && !wide
  const n = Math.max(0, Number(fishCount) || 0)
  const w = rotate
    ? viewH
    : pan
      ? Math.round(Math.min(viewW * 6, Math.max(viewW * 2.7, viewW + n * 64)))
      : viewW
  const h = rotate ? viewW : viewH
  const floor = mode === 'tank' ? 16 : 8
  return {
    mobile,
    pan,
    wide,
    rotate,
    wrapX: mode === 'world' && mobile,
    viewW,
    w,
    h,
    floor,
    top: headerClearance(),
    cruise: mobile ? 52 : 78,
    dash: mobile ? 260 : 380,
    eatRange: mobile ? 36 : 48
  }
}

function mapClientToTank(clientX, clientY, panEl) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (isTankWideWatch() && vh > vw) {
    const w = vh
    const h = vw
    const dx = clientX - vw / 2
    const dy = clientY - vh / 2
    return { x: -dy + w / 2, y: dx + h / 2 }
  }
  return { x: clientX + (panEl?.scrollLeft || 0), y: clientY }
}

function baseFishSize(entry, mobile) {
  const sp = speciesAdultScale(entry?.key)
  if (entry?.shape === 'ray' || entry?.shape === 'turtle') {
    const w = Math.round((mobile ? 70 : 118) * sp)
    return { width: w, height: Math.round(w * (entry?.shape === 'turtle' ? 0.72 : 0.58)) }
  }
  if (entry?.shape === 'cichlid') {
    const w = Math.round((mobile ? 78 : 132) * sp)
    return { width: w, height: Math.round(w * 0.56) }
  }
  if (entry?.shape === 'shark') {
    const w = Math.round((mobile ? 90 : 152) * sp)
    return { width: w, height: Math.round(w * 0.46) }
  }
  if (entry?.shape === 'koi') {
    const w = Math.round((mobile ? 86 : 146) * sp)
    return { width: w, height: Math.round(w * 0.5) }
  }
  if (entry?.shape === 'giant') {
    const w = Math.round((mobile ? 96 : 160) * sp)
    return { width: w, height: Math.round(w * 0.28) }
  }
  if (entry?.wide) {
    const w = Math.round((mobile ? 88 : 148) * sp)
    return { width: w, height: Math.round(w * 0.32) }
  }
  const w = Math.round((mobile ? 72 : 128) * sp)
  return { width: w, height: Math.round(w * 0.52) }
}

function fishSize(entry, index, mobile, scale = 1, form = {}) {
  const base = baseFishSize(entry, mobile)
  const s = spriteLengthRatio(form, entry?.key)
  const length = Number(form.lengthMul) > 0 ? form.lengthMul : 1
  const girth = Number(form.girthMul) > 0 ? form.girthMul : 1
  return {
    width: Math.max(36, Math.round(base.width * s)),
    height: Math.max(20, Math.round(base.height * s * (girth / length)))
  }
}

function tankBeam(L) {
  const cx = L.w * 0.4
  const topHalf = L.w * (L.mobile ? 0.07 : 0.055)
  const botHalf = L.w * (L.mobile ? 0.16 : 0.13)
  return { cx, topHalf, botHalf }
}

function fishInTankBeam(fish, size, L) {
  const { cx, topHalf, botHalf } = tankBeam(L)
  const midX = (fish?.x || 0) + (size?.width || 0) * 0.5
  const midY = (fish?.y || 0) + (size?.height || 0) * 0.45
  const t = Math.max(0, Math.min(1, midY / Math.max(1, L.h)))
  const half = topHalf + (botHalf - topHalf) * t
  const d = Math.abs(midX - cx)
  if (d >= half) return 0
  return Math.max(0, Math.min(1, 1 - d / half))
}

function cruiseSpeed(L, entry, size) {
  const w = Math.max(40, Number(size?.width) || 80)
  const fromWidth = Math.max(0.72, Math.min(1.08, 150 / (w + 40)))
  let kind = 1
  if (entry?.shape === 'giant') kind = 0.9
  else if (entry?.shape === 'shark') kind = 0.92
  else if (entry?.shape === 'koi') kind = 0.9
  else if (entry?.wide) kind = 0.94
  else if (entry?.shape === 'cichlid') kind = 0.9
  else if (entry?.shape === 'turtle') kind = 0.72
  else if (entry?.shape === 'ray') kind = 0.92
  return L.cruise * fromWidth * kind
}

function tankHostFromPath(pathname) {
  const m = String(pathname || '').match(/\/tank\/([^/?#]+)/)
  if (!m) return ''
  try {
    return decodeURIComponent(m[1])
  } catch (_) {
    return String(m[1] || '')
  }
}

function loadLooks(roster, asHelper) {
  const map = {}
  const petsByOwner = {}
  const opts = { asHelper: !!asHelper }
  ;(roster || []).forEach((entry) => {
    const id = entry?.id || ''
    const owner = entry?.owner || getCurrentUser()
    const slot = entry?.growthSlotId || id
    if (!petsByOwner[owner]) petsByOwner[owner] = getUserPets(owner)
    const rec = petsByOwner[owner]?.growth?.[slot]
    const fedAt = petsByOwner[owner]?.fedAt?.[slot]
    const wait = nextFeedWait(fedAt, rec, Date.now(), opts)
    map[id] = {
      ...getPetAppearance(owner, slot, entry?.itemId, entry?.key),
      hunger: hungerStatus(fedAt, rec, Date.now(), opts).key,
      helpers: recentHelpers(rec),
      feedWait: {
        ...wait,
        readyAt: wait.waiting ? Date.now() + wait.ms : 0
      }
    }
  })
  return map
}

const LAYER_BANDS = {
  top: [0.00, 0.20],
  upperMid: [0.16, 0.38],
  mid: [0.34, 0.56],
  lowerMid: [0.50, 0.74],
  bottom: [0.68, 0.96]
}

function layerBand(L, size, layer) {
  const [t0, t1] = LAYER_BANDS[layer] || LAYER_BANDS.mid
  const topPad = L.top ?? headerClearance()
  const floor = L.floor ?? 8
  const usable = Math.max(120, L.h - topPad - floor)
  let minY = topPad + usable * t0
  let maxY = topPad + usable * t1 - size.height
  if (maxY < minY + 16) {
    minY = topPad
    maxY = Math.min(L.h - size.height - floor, minY + Math.max(20, size.height * 0.3))
    if (maxY < minY) minY = maxY
  }
  return { minY, maxY }
}

function waterColumn(L, size) {
  const topPad = L.top ?? headerClearance()
  const floor = L.floor ?? 8
  const minY = topPad
  const maxY = Math.max(minY, L.h - size.height - floor)
  return { minY, maxY }
}

function swimBand(L, size, layer, roamAll) {
  return roamAll ? waterColumn(L, size) : layerBand(L, size, layer)
}

function clampFish(fish, L, size, layer = fish._layer, roamAll = false) {
  const { minY, maxY } = swimBand(L, size, layer, roamAll)
  fish.y = Math.max(minY, Math.min(maxY, fish.y))
  if (L.wrapX) {
    const span = L.w + size.width
    if (span <= 1) return
    let wrapped = false
    if (fish.x > L.w) {
      fish.x -= span
      wrapped = true
    } else if (fish.x < -size.width) {
      fish.x += span
      wrapped = true
    }
    if (wrapped) {
      const inward = fish.face >= 0 ? L.w * 0.28 : L.w * 0.55
      fish.tx = Math.max(12, Math.min(L.w - size.width - 12, inward))
      fish.turnAt = performance.now() + 1400 + Math.random() * 1800
    }
    return
  }
  fish.x = Math.max(-size.width * 0.25, Math.min(L.w - size.width * 0.3, fish.x))
}

function pickWander(fish, L, size, roamAll = false) {
  const padX = L.pan ? 8 : 16
  const { minY, maxY } = swimBand(L, size, fish._layer, roamAll)
  const spanY = Math.max(12, maxY - minY)
  fish.ty = minY + Math.random() * spanY
  if (L.wrapX) {
    const face = fish.face >= 0 ? 1 : -1
    if (Math.random() < 0.62) {
      fish.tx = face > 0 ? L.w + size.width * 0.85 : -size.width * 0.85
    } else {
      fish.tx = padX + Math.random() * Math.max(40, L.w - size.width - padX * 2)
    }
    fish.turnAt = performance.now() + 1800 + Math.random() * 3800
    return
  }
  const maxX = Math.max(40, L.w - size.width - padX * 2)
  fish.tx = padX + Math.random() * maxX
  fish.turnAt = performance.now() + 1600 + Math.random() * 4200
}

function spawnFish(i, count, L, size, layer) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))))
  const col = i % cols
  const cellW = L.w / cols
  const { minY, maxY } = layerBand(L, size, layer)
  const y = minY + ((i * 37) % Math.max(12, maxY - minY))
  return {
    x: col * cellW + Math.max(10, (cellW - size.width) * 0.28),
    y,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    eatUntil: 0,
    fleeUntil: 0,
    _layer: layer,
    tx: col * cellW + cellW * 0.45,
    ty: minY + (maxY - minY) * 0.45,
    turnAt: 0
  }
}

function shooFish(fish, L, size, fromX, fromY) {
  const cx = fish.x + size.width * 0.5
  const cy = fish.y + size.height * 0.5
  let dx = cx - fromX
  let dy = cy - fromY
  if (dx * dx + dy * dy < 36) {
    dx = cx < L.w * 0.5 ? 1 : -1
    dy = cy < L.h * 0.5 ? 0.65 : -0.65
  }
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const run = L.mobile ? 220 : 300
  const { minY, maxY } = swimBand(L, size, fish._layer, !!fish._roamAll)
  const nx = fish.x + (dx / dist) * run
  fish.tx = L.wrapX ? nx : Math.max(12, Math.min(L.w - size.width - 12, nx))
  fish.ty = Math.max(minY, Math.min(maxY, fish.y + (dy / dist) * run))
  fish.fleeUntil = performance.now() + 650
  fish.turnAt = fish.fleeUntil + 500
  fish.eatUntil = 0
  fish.dash = true
}

function rosterKey(roster) {
  return (roster || []).map((f) => `${f.id}:${f.key}:${f.src}:${f.owner || ''}`).join('|')
}


function loadRoster(mode, host) {
  const user = mode === 'tank' ? (host || getCurrentUser()) : getCurrentUser()
  return mode === 'tank' ? getTankRoamRoster(user) : getShowcaseWorldRoster(user)
}

export default function OceanAmbience({ mode = 'world' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = String(location?.pathname || '')
  const host = tankHostFromPath(path)
  const me = getCurrentUser()
  const visiting = mode === 'tank' && !!host && host !== me
  const onTankPage = path.includes('my-tank') || /\/tank\//.test(path)
  const hidden = (mode === 'world' && onTankPage) || (mode === 'tank' && !onTankPage)
  const bubbles = useMemo(() => BUBBLES, [])
  const [food, setFood] = useState([])
  const [hearts, setHearts] = useState([])
  const [inspect, setInspect] = useState(null)
  const [potionMsg, setPotionMsg] = useState('')
  const [feedHud, setFeedHud] = useState('')
  const feedHudRef = useRef('')
  const lookBump = useRef(0)
  const shooRef = useRef([])
  const panRef = useRef(null)
  const rosterRef = useRef(loadRoster(mode, host))
  const bootLayout = typeof window === 'undefined' ? { w: 0, pan: false, wide: false, rotate: false } : layout(mode, (rosterRef.current || []).length)
  const worldWRef = useRef(bootLayout.w)
  const panFlagRef = useRef(!!bootLayout.pan)
  const wideFlagRef = useRef(!!bootLayout.wide)
  const rotateFlagRef = useRef(!!bootLayout.rotate)
  const [worldW, setWorldW] = useState(bootLayout.w)
  const [pan, setPan] = useState(!!bootLayout.pan)
  const [wide, setWide] = useState(!!bootLayout.wide)
  const [rotate, setRotate] = useState(!!bootLayout.rotate)
  const [actors, setActors] = useState(() => loadRoster(mode, host).map((f, i) => ({
    ...f,
    x: 40 + i * 80,
    y: 120 + i * 80,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    dash: false,
    eating: false
  })))
  const sim = useRef(null)

  useEffect(() => {
    setPotionMsg('')
    if (visiting) {
      setInspect(null)
      return undefined
    }
    if (!inspect) return undefined
    const t = window.setTimeout(() => setInspect(null), 14000)
    return () => window.clearTimeout(t)
  }, [inspect, visiting])

  useEffect(() => {
    if (mode !== 'tank') return undefined
    if (hidden) {
      exitTankWideWatch()
      return undefined
    }
    return () => {
      exitTankWideWatch()
    }
  }, [hidden, mode])

  useEffect(() => {
    const refresh = () => {
      const next = loadRoster(mode, host)
      if (rosterKey(rosterRef.current) === rosterKey(next)) return
      rosterRef.current = next
    }
    refresh()
    const onRt = (e) => {
      const key = e?.detail?.key
      if (
        key &&
        key !== '__ALL__' &&
        key !== 'jiameng_equipped_effects' &&
        key !== 'jiameng_inventories' &&
        key !== 'jiameng_items' &&
        key !== 'jiameng_pets'
      ) return
      refresh()
    }
    const timer = window.setInterval(refresh, 1200)
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
    }
  }, [mode, host])

  useEffect(() => {
    if (hidden) return undefined
    const startRoster = rosterRef.current
    const L0 = layout(mode, startRoster.length)
    worldWRef.current = L0.w
    panFlagRef.current = !!L0.pan
    wideFlagRef.current = !!L0.wide
    rotateFlagRef.current = !!L0.rotate
    setWorldW(L0.w)
    setPan(!!L0.pan)
    setWide(!!L0.wide)
    setRotate(!!L0.rotate)
    const startLooks = loadLooks(startRoster, visiting)
    sim.current = {
      food: [],
      hearts: [],
      heartAt: {},
      looks: startLooks,
      looksAt: 0,
      breedPairs: mode === 'tank' ? listBreedPairs(host || getCurrentUser()) : [],
      fish: startRoster.map((entry, i) =>
        spawnFish(i, startRoster.length, L0, fishSize(entry, i, L0.mobile, startLooks[entry.id]?.scale, startLooks[entry.id]), speciesSwimLayer(entry?.key))
      )
    }

    let last = performance.now()
    let raf = 0

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = layout(mode, (rosterRef.current || []).length)
      if (worldWRef.current !== L.w) {
        worldWRef.current = L.w
        setWorldW(L.w)
      }
      if (panFlagRef.current !== !!L.pan) {
        panFlagRef.current = !!L.pan
        setPan(!!L.pan)
      }
      if (wideFlagRef.current !== !!L.wide) {
        wideFlagRef.current = !!L.wide
        setWide(!!L.wide)
      }
      if (rotateFlagRef.current !== !!L.rotate) {
        rotateFlagRef.current = !!L.rotate
        setRotate(!!L.rotate)
      }
      const state = sim.current
      if (!state) return
      const currentRoster = rosterRef.current || []

      const sig = rosterKey(currentRoster)
      if (
        state.rosterSig !== sig ||
        !state.looks ||
        now - (state.looksAt || 0) > (mode === 'tank' ? 800 : 2000) ||
        state.lookTick !== lookBump.current
      ) {
        if (!visiting) tickPetBreeding(getCurrentUser())
        state.looks = loadLooks(currentRoster, visiting)
        state.looksAt = now
        state.lookTick = lookBump.current
        state.rosterSig = sig
        if (mode === 'tank') state.breedPairs = listBreedPairs(host || getCurrentUser())
      }

      while (state.fish.length < currentRoster.length) {
        const i = state.fish.length
        const look = state.looks?.[currentRoster[i]?.id] || {}
        const size = fishSize(currentRoster[i], i, L.mobile, look.scale, look)
        state.fish.push(spawnFish(i, currentRoster.length, L, size, speciesSwimLayer(currentRoster[i]?.key)))
      }
      if (state.fish.length > currentRoster.length) {
        state.fish.length = currentRoster.length
      }

      const aimAlong = (fish, vx, vy) => {
        const ax = Math.abs(vx)
        const ay = Math.abs(vy)
        if (ax > 0.12 && ax > ay * 0.34) {
          fish.face = vx >= 0 ? 1 : -1
        }
        const want = Math.atan2(vy, ax + 0.0001) * (180 / Math.PI)
        const maxTilt = ay >= ax * 0.65 ? 88 : 68
        const clamped = Math.max(-maxTilt, Math.min(maxTilt, want))
        fish.tilt += (clamped - (fish.tilt || 0)) * Math.min(1, 7 * dt)
      }

      state.food = state.food.filter((p) => {
        p.vy += 90 * dt
        if (p.vy > 62) p.vy = 62
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        return p.y < L.h + 20 && p.y > -40 && p.life > 0 && !p.eaten
      })

      const sizes = currentRoster.map((entry, i) =>
        fishSize(entry, i, L.mobile, state.looks?.[entry?.id]?.scale, state.looks?.[entry?.id])
      )
      state.fish.forEach((fish, i) => {
        const size = sizes[i]
        const entry = currentRoster[i]
        const look = state.looks?.[entry?.id]
        if (look?.hunger !== 'full') fish.sated = false
        const hungry = look?.hunger !== 'full' && !fish.sated
        fish._w = size.width
        fish._h = size.height
        fish._layer = speciesSwimLayer(entry?.key)
        fish._roamAll = mode === 'tank' && hungry
        clampFish(fish, L, size, fish._layer, fish._roamAll)
      })

      const pendingShoo = shooRef.current
      if (pendingShoo.length) {
        pendingShoo.forEach((s) => {
          const i = currentRoster.findIndex((entry) => entry?.id === s.id)
          if (i < 0 || !state.fish[i] || !sizes[i]) return
          shooFish(state.fish[i], L, sizes[i], s.x, s.y)
        })
        shooRef.current = []
      }

      state.fish.forEach((fish, i) => {
        const entry = currentRoster[i]
        const size = sizes[i]
        const mouthRatio = entry?.shape === 'ray' || entry?.shape === 'turtle' ? 0.9 : (entry?.wide ? 0.9 : 0.84)
        const mouthX = fish.face === 1 ? fish.x + size.width * mouthRatio : fish.x + size.width * (1 - mouthRatio)
        const mouthY = fish.y + size.height * 0.5
        const live = state.food.filter((p) => !p.eaten)
        let target = null
        let best = Infinity
        live.forEach((p) => {
          const dx = p.x - mouthX
          const dy = p.y - mouthY
          const d = dx * dx + dy * dy
          if (d < best) {
            best = d
            target = p
          }
        })

        if (now < fish.eatUntil) {
          fish.dash = false
          fish.tilt += (0 - (fish.tilt || 0)) * Math.min(1, 8 * dt)
          return
        }

        if (now < (fish.fleeUntil || 0)) {
          const fx = (fish.tx ?? fish.x) - fish.x
          const fy = (fish.ty ?? fish.y) - fish.y
          const fd = Math.sqrt(fx * fx + fy * fy) || 1
          if (fd < 28) {
            fish.fleeUntil = 0
            pickWander(fish, L, size, fish._roamAll)
          } else {
            fish.dash = true
            aimAlong(fish, fx, fy)
            const sprint = L.dash * (L.mobile ? 1.65 : 1.75)
            fish.x += (fx / fd) * sprint * dt
            fish.y += (fy / fd) * sprint * dt
            clampFish(fish, L, size, fish._layer, fish._roamAll)
            return
          }
        }

        const full = state.looks?.[entry?.id]?.hunger === 'full' || !!fish.sated
        if (target && !full) {
          const dx = target.x - mouthX
          const dy = target.y - mouthY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < L.eatRange) {
            target.eaten = true
            fish.eatUntil = now + 280
            fish.sated = true
            fish._roamAll = false
            fish.dash = false
            const owner = entry?.owner || getCurrentUser()
            const helper = visiting || (owner && owner !== getCurrentUser()) ? getCurrentUser() : ''
            recordPetEat(
              owner,
              entry?.growthSlotId || entry?.id,
              entry?.itemId,
              entry?.key,
              helper
            )
            state.looks = loadLooks(currentRoster, visiting)
            state.looksAt = now
            pickWander(fish, L, size, false)
            return
          }
          fish.dash = true
          aimAlong(fish, dx, dy)
          fish.x += (dx / dist) * L.dash * dt
          fish.y += (dy / dist) * L.dash * dt
          clampFish(fish, L, size, fish._layer, true)
        } else {
          fish.dash = false
          if (mode === 'tank' && (!fish.turnAt || now > fish.turnAt)) {
            const slot = entry?.growthSlotId || entry?.id
            const pair = (state.breedPairs || []).find((p) => p.maleId === slot || p.femaleId === slot)
            const mateId = pair ? (pair.maleId === slot ? pair.femaleId : pair.maleId) : ''
            const mateIdx = mateId ? currentRoster.findIndex((row) => (row.growthSlotId || row.id) === mateId) : -1
            if (mateIdx >= 0 && state.fish[mateIdx] && sizes[mateIdx]) {
              const mate = state.fish[mateIdx]
              const msize = sizes[mateIdx]
              const dxm = (mate.x + msize.width * 0.5) - (fish.x + size.width * 0.5)
              const dym = (mate.y + msize.height * 0.5) - (fish.y + size.height * 0.5)
              const dm = Math.sqrt(dxm * dxm + dym * dym) || 1
              if (dm > 88) {
                const band = swimBand(L, size, fish._layer, fish._roamAll)
                fish.tx = Math.max(12, Math.min(L.w - size.width - 12, mate.x + dxm * 0.35))
                fish.ty = Math.max(band.minY, Math.min(band.maxY, mate.y + dym * 0.2))
                fish.turnAt = now + 900 + Math.random() * 700
              }
            }
          }
          const dx = (fish.tx ?? fish.x) - fish.x
          const dy = (fish.ty ?? fish.y) - fish.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (!fish.turnAt || now > fish.turnAt || dist < 18) {
            pickWander(fish, L, size, fish._roamAll)
          }
          const wx = (fish.tx ?? fish.x) - fish.x
          const wy = (fish.ty ?? fish.y) - fish.y
          const wd = Math.sqrt(wx * wx + wy * wy) || 1
          aimAlong(fish, wx, wy)
          const speed = cruiseSpeed(L, entry, size)
          fish.x += (wx / wd) * speed * dt
          fish.y += (wy / wd) * speed * dt
          clampFish(fish, L, size, fish._layer, fish._roamAll)
        }
      })

      if (mode === 'tank') {
        if (!state.hearts) state.hearts = []
        if (!state.heartAt) state.heartAt = {}
        ;(state.breedPairs || []).forEach((pair) => {
          const ia = currentRoster.findIndex((row) => (row.growthSlotId || row.id) === pair.maleId)
          const ib = currentRoster.findIndex((row) => (row.growthSlotId || row.id) === pair.femaleId)
          if (ia < 0 || ib < 0 || !state.fish[ia] || !state.fish[ib] || !sizes[ia] || !sizes[ib]) return
          const a = state.fish[ia]
          const b = state.fish[ib]
          const sa = sizes[ia]
          const sb = sizes[ib]
          const pad = 14
          const hit = !(a.x + sa.width + pad < b.x || b.x + sb.width + pad < a.x || a.y + sa.height + pad < b.y || b.y + sb.height + pad < a.y)
          if (!hit) return
          const key = `${pair.maleId}:${pair.femaleId}`
          if (now - (state.heartAt[key] || 0) < 520) return
          state.heartAt[key] = now
          const cx = (a.x + sa.width * 0.5 + b.x + sb.width * 0.5) / 2
          const cy = Math.min(a.y, b.y) + 8
          state.hearts.push({
            id: genId(),
            x: cx + (Math.random() - 0.5) * 18,
            y: cy,
            vy: -38 - Math.random() * 18,
            life: 1.15
          })
        })
        state.hearts = state.hearts.filter((h) => {
          h.y += h.vy * dt
          h.life -= dt
          return h.life > 0
        }).slice(-24)
      }

      setFood(state.food.map((p) => ({ id: p.id, x: p.x, y: p.y })))
      setHearts(mode === 'tank' ? (state.hearts || []).map((h) => ({ id: h.id, x: h.x, y: h.y, life: h.life })) : [])
      setActors(state.fish.map((f, i) => {
        const entry = currentRoster[i] || {}
        const look = state.looks?.[entry.id] || {}
        const speciesKey = speciesKeyFromRefs({
          itemId: entry.itemId,
          key: entry.key,
          rec: { species: look.species, itemId: entry.itemId },
          nick: entry.nick
        })
        const pack = FISH_PACKS[speciesKey] || FISH_PACKS[entry.key] || FISH_PACKS.betta
        const size = sizes[i] || fishSize({ ...entry, key: pack.key, wide: pack.wide, shape: pack.shape || 'fish' }, i, L.mobile, look.scale, look)
        const art = look.art === 'b' ? 'b' : 'a'
        return {
          id: entry.id || `fish-${i}`,
          src: pack[art] || entry.src,
          wide: !!pack.wide,
          shape: pack.shape || entry.shape || 'fish',
          variant: art,
          parts: look.parts || null,
          morphLabel: look.morphLabel || '',
          shineText: look.shineText || '',
          gender: look.gender || '',
          pregnant: !!look.pregnant,
          generation: Math.max(0, Number(look.generation) || 0),
          width: size.width,
          height: size.height,
          owner: entry.owner || getCurrentUser() || '',
          growthSlotId: entry.growthSlotId || entry.id || '',
          nick: entry.nick || '',
          species: getFishSpeciesName({ ...entry, key: pack.key }),
          x: f.x,
          y: f.y,
          face: f.face,
          tilt: f.tilt || 0,
          dash: f.dash,
          eating: now < f.eatUntil,
          lit: mode === 'tank' ? fishInTankBeam(f, size, L) : 0,
          feedWait: look.feedWait || null,
          helpers: look.helpers || []
        }
      }))

      if (mode === 'tank') {
        let ready = 0
        let soonest = Infinity
        currentRoster.forEach((row) => {
          const w = state.looks?.[row?.id]?.feedWait
          if (!w || w.reason === 'adult') return
          if (!w.waiting) ready += 1
          else if (w.readyAt && w.readyAt < soonest) soonest = w.readyAt
        })
        const left = soonest < Infinity ? soonest - now : 0
        const anyGrow = currentRoster.some((row) => {
          const w = state.looks?.[row?.id]?.feedWait
          return w && w.reason !== 'adult'
        })
        const line = ready > 0
          ? (visiting ? `幫忙可餵 ${ready} 隻` : `可餵食 ${ready} 隻`)
          : left > 0
            ? (visiting ? `下次幫忙 ${formatFeedCountdown(left)}` : `下次可餵 ${formatFeedCountdown(left)}`)
            : visiting && anyGrow
              ? '今天幫忙次數已滿'
              : ''
        if (line !== feedHudRef.current) {
          feedHudRef.current = line
          setFeedHud(line)
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onFeed = (e) => {
      const mapped = e.detail?.mapped
        ? { x: Number(e.detail.x), y: Number(e.detail.y) }
        : mapClientToTank(Number(e.detail?.x), Number(e.detail?.y), panRef.current)
      const x = mapped.x
      const y = mapped.y
      if (!Number.isFinite(x) || !Number.isFinite(y) || !sim.current) return
      const roster = rosterRef.current || []
      const looks = sim.current.looks || {}
      const anyHungry = roster.some((row, i) => looks[row?.id]?.hunger !== 'full' && !sim.current.fish[i]?.sated)
      if (!anyHungry) {
        let soonest = Infinity
        roster.forEach((row) => {
          const at = looks[row?.id]?.feedWait?.readyAt || 0
          if (at > 0 && at < soonest) soonest = at
        })
        const left = soonest < Infinity ? soonest - Date.now() : 0
        const line = left > 0
          ? (visiting ? `下次幫忙 ${formatFeedCountdown(left)}` : `下次可餵 ${formatFeedCountdown(left)}`)
          : visiting
            ? '今天幫忙次數已滿'
            : '今天都餵滿了'
        feedHudRef.current = line
        setFeedHud(line)
        return
      }
      const next = [{
        id: genId(),
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.2) * 6,
        vx: (Math.random() - 0.5) * 10,
        vy: -36 - Math.random() * 16,
        life: 6,
        eaten: false
      }]
      sim.current.food = [...sim.current.food, ...next].slice(-12)
    }

    window.addEventListener('ocean-feed', onFeed)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('ocean-feed', onFeed)
    }
  }, [hidden, mode, host, visiting])

  if (hidden || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panRef}
      className={`ocean-ambience${mode === 'tank' ? ' is-tank' : ''}${visiting ? ' is-visiting' : ''}${pan ? ' is-pan' : ''}${wide ? ' is-widewatch' : ''}${rotate ? ' is-widewatch-rotate' : ''}`}
      aria-hidden={!wide}
      onPointerDown={(e) => {
        if (!wide) return
        if (!visiting && e.target.closest('.ocean-fish-actor')) return
        if (e.target.closest('.ocean-fish-owner-tip, .ocean-widewatch-exit')) return
        const p = mapClientToTank(e.clientX, e.clientY, panRef.current)
        window.dispatchEvent(new CustomEvent('ocean-feed', { detail: { x: p.x, y: p.y, mapped: true } }))
      }}
    >
      {mode === 'tank' && feedHud ? (
        <div className="ocean-feed-hud">{feedHud}</div>
      ) : null}
      {wide ? (
        <button
          type="button"
          className="ocean-widewatch-exit"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            exitTankWideWatch()
          }}
        >
          結束橫向
        </button>
      ) : null}
      {mode === 'tank' ? <TankScenery /> : null}
      <div className="ocean-world" style={(pan || rotate) && worldW ? { width: `${worldW}px` } : undefined}>
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="ocean-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            WebkitAnimationDuration: b.duration,
            animationDuration: b.duration,
            WebkitAnimationDelay: b.delay,
            animationDelay: b.delay
          }}
        />
      ))}

      {food.map((p) => (
        <span
          key={p.id}
          className="ocean-feed"
          style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
        />
      ))}

      {hearts.map((h) => (
        <span
          key={h.id}
          className="ocean-heart"
          style={{
            transform: `translate3d(${h.x}px, ${h.y}px, 0) scale(${0.7 + (1 - Math.max(0, Math.min(1, h.life))) * 0.45})`,
            opacity: Math.max(0, Math.min(1, h.life))
          }}
        >
          ♥
        </span>
      ))}

      {actors.map((fish) => (
        <div
          key={fish.id}
          role="button"
          tabIndex={-1}
          className={`ocean-fish-actor${visiting ? ' is-viewonly' : ''}${fish.dash ? ' is-dash' : ''}${fish.eating ? ' is-eating' : ''}${fish.lit > 0.18 ? ' is-lit' : ''}`}
          style={{
            transform: `translate3d(${fish.x}px, ${fish.y}px, 0)`,
            width: fish.width ? `${fish.width}px` : undefined,
            height: fish.height ? `${fish.height}px` : undefined,
            filter: fish.lit > 0.04
              ? `saturate(${(1 + fish.lit * 1.15).toFixed(3)}) brightness(${(1 + fish.lit * 0.28).toFixed(3)}) contrast(${(1 + fish.lit * 0.1).toFixed(3)})`
              : undefined
          }}
          onClick={(e) => {
            if (visiting) return
            e.preventDefault()
            e.stopPropagation()
            const p = mapClientToTank(e.clientX, e.clientY, panRef.current)
            shooRef.current.push({
              id: fish.id,
              x: p.x,
              y: p.y
            })
            setInspect((cur) => (cur === fish.id ? null : fish.id))
          }}
        >
          <div
            className="ocean-fish-face"
            style={{
              transform: `scaleX(${fish.face}) rotate(${fish.tilt || 0}deg)`
            }}
          >
            <div className="ocean-fish-bob">
              <FishSprite
                src={fish.src}
                variant={fish.variant}
                wide={fish.wide}
                shape={fish.shape}
                width={fish.width}
                height={fish.height}
                parts={fish.parts}
              />
            </div>
          </div>
        </div>
      ))}

      {inspect && !visiting && (() => {
        const fish = actors.find((f) => f.id === inspect)
        if (!fish) return null
        const me = getCurrentUser()
        const ownerName = getDisplayNameForAccount(fish.owner || me)
        const mine = String(fish.owner || '') === String(me || '')
        const potions = mine ? listOwnedFishPotions(me) : { heat: 0, affection: 0, birth: 0, growth: 0, gender: 0, worm: 0 }
        const slot = fish.growthSlotId || fish.id
        const pairedFemale = mine && fish.gender === 'f' && listBreedPairs(me).some((p) => p.femaleId === slot)
        const canBreedPotions = mine && (fish.gender !== 'f' || pairedFemale)
        const canPotions = mine
        const showVisit = !mine && !!fish.owner && !visiting
        const potionNames = { worm: '紅蟲', growth: '成長藥水', gender: '變性藥水', heat: '發情藥水', affection: '好感藥水', birth: '催生藥水' }
        const give = (kind) => {
          const label = potionNames[kind] || '藥水'
          if ((potions[kind] || 0) < 1) {
            setPotionMsg(`背包沒有${label}`)
            return
          }
          if (!window.confirm(`確定對「${fish.nick || fish.species || '這隻魚'}」使用${label}？`)) return
          const r = useFishPotion(me, fish.growthSlotId || fish.id, kind)
          setPotionMsg(r.message || (r.success ? '已使用' : '無法使用'))
          if (r.success) {
            lookBump.current += 1
            rosterRef.current = loadRoster(mode, host)
          }
        }
        return (
          <div
            className={`ocean-fish-owner-tip${canPotions || showVisit ? ' is-actions' : ''}`}
            style={{
              transform: `translate3d(${fish.x + (fish.width || 0) / 2}px, ${fish.y}px, 0) translate(-50%, calc(-100% - 8px))`
            }}
          >
            {fish.nick ? <strong>{fish.nick}</strong> : null}
            <span>{fish.species || '魚'}{fish.gender === 'f' ? ' · 母' : fish.gender === 'm' ? ' · 公' : ''}{fish.generation > 0 ? ` · 第${fish.generation}代` : ''}{fish.gender === 'f' && fish.pregnant ? ' · 懷孕' : ''}</span>
            <span>{mine ? `主人：${ownerName}（我的）` : `主人：${ownerName}`}</span>
            {fish.feedWait && fish.feedWait.reason !== 'adult' ? (
              <span>
                {mine
                  ? `今天 ${Math.min(fish.feedWait.today || 0, 5)}/5 次`
                  : `幫忙 ${Math.min(fish.feedWait.helpToday || fish.feedWait.used || 0, fish.feedWait.cap || 3)}/${fish.feedWait.cap || 3} 次`}
                {fish.feedWait.waiting
                  ? ` · ${mine ? '下次可餵' : '下次幫忙'} ${formatFeedCountdown(Math.max(0, (fish.feedWait.readyAt || 0) - Date.now()))}`
                  : mine ? ' · 現在可餵' : ' · 現在可幫忙'}
              </span>
            ) : null}
            {(fish.helpers || []).length ? (
              <span>
                {(fish.helpers || []).map((h) => getDisplayNameForAccount(h.account)).filter(Boolean).join('、')}幫忙餵食過
              </span>
            ) : null}
            {showVisit ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/tank/${encodeURIComponent(fish.owner)}`)
                }}
              >
                參觀魚缸
              </button>
            ) : null}
            {potionMsg ? <span className="ocean-fish-potion-msg">{potionMsg}</span> : null}
            {canPotions ? (
              <div className="ocean-fish-potion-row">
                <button type="button" onClick={(e) => { e.stopPropagation(); give('worm') }}>紅蟲</button>
                {canBreedPotions ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); give('growth') }}>成長藥水</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); give('gender') }}>變性藥水</button>
                  </>
                ) : null}
                {pairedFemale ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); give('heat') }}>發情藥水</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); give('affection') }}>好感藥水</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); give('birth') }}>催生藥水</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })()}
      </div>
    </div>,
    document.body
  )
}
