import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { FISH_PACKS, getFishSpeciesName, speciesAdultScale, speciesSwimLayer } from '../utils/fishSkinStorage'
import {
  getPetAppearance,
  getUserPets,
  getWorldFishRoster,
  hungerStatus,
  listOwnedFishPotions,
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

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function layout() {
  const mobile = isMobile()
  const w = window.innerWidth
  const h = window.innerHeight
  return {
    mobile,
    w,
    h,
    cruise: mobile ? 52 : 78,
    dash: mobile ? 260 : 380,
    eatRange: mobile ? 22 : 32
  }
}

function baseFishSize(entry, index, mobile) {
  const sp = speciesAdultScale(entry?.key)
  const k = index % 2 === 0 ? 1 : 0.88
  if (entry?.shape === 'ray' || entry?.shape === 'turtle') {
    const w = Math.round((mobile ? 70 : 118) * sp * k)
    return { width: w, height: Math.round(w * (entry?.shape === 'turtle' ? 0.72 : 0.58)) }
  }
  if (entry?.shape === 'cichlid') {
    const w = Math.round((mobile ? 78 : 132) * sp * k)
    return { width: w, height: Math.round(w * 0.56) }
  }
  if (entry?.shape === 'shark') {
    const w = Math.round((mobile ? 90 : 152) * sp * k)
    return { width: w, height: Math.round(w * 0.46) }
  }
  if (entry?.shape === 'koi') {
    const w = Math.round((mobile ? 86 : 146) * sp * k)
    return { width: w, height: Math.round(w * 0.5) }
  }
  if (entry?.shape === 'giant') {
    const w = Math.round((mobile ? 96 : 160) * sp * k)
    return { width: w, height: Math.round(w * 0.28) }
  }
  if (entry?.wide) {
    const w = Math.round((mobile ? 88 : 148) * sp * k)
    return { width: w, height: Math.round(w * 0.32) }
  }
  const w = Math.round((mobile ? 72 : 128) * sp * k)
  return { width: w, height: Math.round(w * 0.52) }
}

function fishSize(entry, index, mobile, scale = 1) {
  const base = baseFishSize(entry, index, mobile)
  const raw = Number(scale)
  const s = Number.isFinite(raw) && raw > 0 ? Math.max(0.18, raw) : 1
  return {
    width: Math.max(36, Math.round(base.width * s)),
    height: Math.max(20, Math.round(base.height * s))
  }
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

function loadLooks(roster) {
  const map = {}
  const petsByOwner = {}
  ;(roster || []).forEach((entry) => {
    const id = entry?.id || ''
    const owner = entry?.owner || getCurrentUser()
    const slot = entry?.growthSlotId || id
    if (!petsByOwner[owner]) petsByOwner[owner] = getUserPets(owner)
    map[id] = {
      ...getPetAppearance(owner, slot, entry?.itemId, entry?.key),
      hunger: hungerStatus(petsByOwner[owner]?.fedAt?.[slot]).key
    }
  })
  return map
}

const LAYER_BANDS = {
  top: [0.03, 0.22],
  upperMid: [0.18, 0.40],
  mid: [0.36, 0.58],
  lowerMid: [0.52, 0.76],
  bottom: [0.70, 0.96]
}

function layerBand(L, size, layer) {
  const [t0, t1] = LAYER_BANDS[layer] || LAYER_BANDS.mid
  let minY = Math.max(8, L.h * t0)
  let maxY = Math.min(L.h - size.height - 8, L.h * t1 - size.height)
  if (maxY < minY + 16) {
    const mid = ((t0 + t1) / 2) * L.h - size.height * 0.5
    minY = Math.max(8, mid)
    maxY = Math.min(L.h - size.height - 8, minY + Math.max(20, size.height * 0.3))
    if (maxY < minY) minY = maxY
  }
  return { minY, maxY }
}

function clampFish(fish, L, size, layer = fish._layer) {
  const { minY, maxY } = layerBand(L, size, layer)
  fish.x = Math.max(-size.width * 0.25, Math.min(L.w - size.width * 0.3, fish.x))
  fish.y = Math.max(minY, Math.min(maxY, fish.y))
}

function pickWander(fish, L, size) {
  const padX = 16
  const { minY, maxY } = layerBand(L, size, fish._layer)
  const maxX = Math.max(40, L.w - size.width - padX * 2)
  const spanY = Math.max(12, maxY - minY)
  fish.tx = padX + Math.random() * maxX
  fish.ty = minY + Math.random() * spanY
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
  const { minY, maxY } = layerBand(L, size, fish._layer)
  fish.tx = Math.max(12, Math.min(L.w - size.width - 12, fish.x + (dx / dist) * run))
  fish.ty = Math.max(minY, Math.min(maxY, fish.y + (dy / dist) * run))
  fish.fleeUntil = performance.now() + 650
  fish.turnAt = fish.fleeUntil + 500
  fish.eatUntil = 0
  fish.dash = true
}

function rosterKey(roster) {
  return (roster || []).map((f) => `${f.id}:${f.key}:${f.src}:${f.owner || ''}`).join('|')
}


export default function OceanAmbience() {
  const bubbles = useMemo(() => BUBBLES, [])
  const [food, setFood] = useState([])
  const [inspect, setInspect] = useState(null)
  const [potionMsg, setPotionMsg] = useState('')
  const lookBump = useRef(0)
  const shooRef = useRef([])
  const [actors, setActors] = useState(() => getWorldFishRoster(getCurrentUser()).map((f, i) => ({
    ...f,
    x: 40 + i * 80,
    y: 120 + i * 80,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    dash: false,
    eating: false
  })))
  const sim = useRef(null)
  const rosterRef = useRef(getWorldFishRoster(getCurrentUser()))

  useEffect(() => {
    setPotionMsg('')
    if (!inspect) return undefined
    const t = window.setTimeout(() => setInspect(null), 14000)
    return () => window.clearTimeout(t)
  }, [inspect])

  useEffect(() => {
    const refresh = () => {
      const next = getWorldFishRoster(getCurrentUser())
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
  }, [])

  useEffect(() => {
    const L0 = layout()
    const startRoster = rosterRef.current
    const startLooks = loadLooks(startRoster)
    sim.current = {
      food: [],
      looks: startLooks,
      looksAt: 0,
      fish: startRoster.map((entry, i) =>
        spawnFish(i, startRoster.length, L0, fishSize(entry, i, L0.mobile, startLooks[entry.id]?.scale), speciesSwimLayer(entry?.key))
      )
    }

    let last = performance.now()
    let raf = 0

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = layout()
      const state = sim.current
      if (!state) return
      const currentRoster = rosterRef.current || []

      if (!state.looks || now - (state.looksAt || 0) > 2000 || state.lookTick !== lookBump.current) {
        tickPetBreeding(getCurrentUser())
        state.looks = loadLooks(currentRoster)
        state.looksAt = now
        state.lookTick = lookBump.current
      }

      while (state.fish.length < currentRoster.length) {
        const i = state.fish.length
        const look = state.looks?.[currentRoster[i]?.id] || {}
        const size = fishSize(currentRoster[i], i, L.mobile, look.scale)
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
        fishSize(entry, i, L.mobile, state.looks?.[entry?.id]?.scale)
      )
      state.fish.forEach((fish, i) => {
        const size = sizes[i]
        fish._w = size.width
        fish._h = size.height
        fish._layer = speciesSwimLayer(currentRoster[i]?.key)
        clampFish(fish, L, size, fish._layer)
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
        const band = layerBand(L, size, fish._layer)
        const live = state.food.filter((p) => {
          if (p.eaten) return false
          return p.y >= band.minY - 36 && p.y <= band.maxY + size.height + 36
        })
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
            pickWander(fish, L, size)
          } else {
            fish.dash = true
            aimAlong(fish, fx, fy)
            const sprint = L.dash * (L.mobile ? 1.65 : 1.75)
            fish.x += (fx / fd) * sprint * dt
            fish.y += (fy / fd) * sprint * dt
            clampFish(fish, L, size)
            return
          }
        }

        const full = state.looks?.[entry?.id]?.hunger === 'full'
        if (target && !full) {
          const dx = target.x - mouthX
          const dy = target.y - mouthY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < L.eatRange) {
            target.eaten = true
            fish.eatUntil = now + 220
            fish.dash = false
            recordPetEat(
              entry?.owner || getCurrentUser(),
              entry?.growthSlotId || entry?.id,
              entry?.itemId,
              entry?.key
            )
            state.looks = loadLooks(currentRoster)
            state.looksAt = now
            pickWander(fish, L, size)
            return
          }
          fish.dash = true
          aimAlong(fish, dx, dy)
          fish.x += (dx / dist) * L.dash * dt
          fish.y += (dy / dist) * L.dash * dt
          clampFish(fish, L, size)
        } else {
          fish.dash = false
          const dx = (fish.tx ?? fish.x) - fish.x
          const dy = (fish.ty ?? fish.y) - fish.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (!fish.turnAt || now > fish.turnAt || dist < 18) {
            pickWander(fish, L, size)
          }
          const wx = (fish.tx ?? fish.x) - fish.x
          const wy = (fish.ty ?? fish.y) - fish.y
          const wd = Math.sqrt(wx * wx + wy * wy) || 1
          aimAlong(fish, wx, wy)
          const speed = cruiseSpeed(L, entry, size)
          fish.x += (wx / wd) * speed * dt
          fish.y += (wy / wd) * speed * dt
          clampFish(fish, L, size)
        }
      })

      setFood(state.food.map((p) => ({ id: p.id, x: p.x, y: p.y })))
      setActors(state.fish.map((f, i) => {
        const entry = currentRoster[i] || {}
        const look = state.looks?.[entry.id] || {}
        const size = sizes[i] || fishSize(entry, i, L.mobile, look.scale)
        const pack = FISH_PACKS[entry.key] || FISH_PACKS.betta
        const art = look.art === 'b' ? 'b' : 'a'
        return {
          id: entry.id || `fish-${i}`,
          src: pack[art] || entry.src,
          wide: !!entry.wide,
          shape: entry.shape || 'fish',
          variant: art,
          parts: look.parts || null,
          morphLabel: look.morphLabel || '',
          shineText: look.shineText || '',
          gender: look.gender || '',
          pregnant: !!look.pregnant,
          width: size.width,
          height: size.height,
          owner: entry.owner || getCurrentUser() || '',
          nick: entry.nick || '',
          species: getFishSpeciesName(entry),
          x: f.x,
          y: f.y,
          face: f.face,
          tilt: f.tilt || 0,
          dash: f.dash,
          eating: now < f.eatUntil
        }
      }))

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onFeed = (e) => {
      const x = Number(e.detail?.x)
      const y = Number(e.detail?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !sim.current) return
      const next = Array.from({ length: 3 }, (_, i) => ({
        id: genId() + i,
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.2) * 10,
        vx: (Math.random() - 0.5) * 18,
        vy: -42 - Math.random() * 28,
        life: 6,
        eaten: false
      }))
      sim.current.food = [...sim.current.food, ...next].slice(-18)
    }

    window.addEventListener('ocean-feed', onFeed)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('ocean-feed', onFeed)
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="ocean-ambience" aria-hidden>
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

      {actors.map((fish) => (
        <div
          key={fish.id}
          role="button"
          tabIndex={-1}
          className={`ocean-fish-actor${fish.dash ? ' is-dash' : ''}${fish.eating ? ' is-eating' : ''}`}
          style={{
            transform: `translate3d(${fish.x}px, ${fish.y}px, 0)`,
            width: fish.width ? `${fish.width}px` : undefined,
            height: fish.height ? `${fish.height}px` : undefined
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            shooRef.current.push({ id: fish.id, x: e.clientX, y: e.clientY })
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

      {inspect && (() => {
        const fish = actors.find((f) => f.id === inspect)
        if (!fish) return null
        const me = getCurrentUser()
        const ownerName = getDisplayNameForAccount(fish.owner || me)
        const mine = String(fish.owner || '') === String(me || '')
        const potions = mine && fish.gender === 'f' ? listOwnedFishPotions(me) : { heat: 0, affection: 0, birth: 0 }
        const canPotions = mine && fish.gender === 'f' && (potions.heat > 0 || potions.affection > 0 || potions.birth > 0)
        const give = (kind) => {
          const r = useFishPotion(me, fish.id, kind)
          setPotionMsg(r.message || (r.success ? '已使用' : '無法使用'))
          if (r.success) {
            lookBump.current += 1
            rosterRef.current = getWorldFishRoster(me)
          }
        }
        return (
          <div
            className={`ocean-fish-owner-tip${canPotions ? ' is-actions' : ''}`}
            style={{
              transform: `translate3d(${fish.x + (fish.width || 0) / 2}px, ${fish.y}px, 0) translate(-50%, calc(-100% - 8px))`
            }}
          >
            {fish.nick ? <strong>{fish.nick}</strong> : null}
            <span>{fish.species || '魚'}{fish.morphLabel ? ` · ${fish.morphLabel}` : ''}{fish.shineText ? ` · ${fish.shineText}` : ''}{fish.gender === 'f' ? ' · 母' : fish.gender === 'm' ? ' · 公' : ''}{fish.pregnant ? ' · 懷孕' : ''}</span>
            <span>{mine ? `主人：${ownerName}（我的）` : `主人：${ownerName}`}</span>
            {potionMsg ? <span className="ocean-fish-potion-msg">{potionMsg}</span> : null}
            {canPotions ? (
              <div className="ocean-fish-potion-row">
                {potions.heat > 0 ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); give('heat') }}>發情藥水</button>
                ) : null}
                {potions.affection > 0 ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); give('affection') }}>好感藥水</button>
                ) : null}
                {potions.birth > 0 ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); give('birth') }}>催生藥水</button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })()}
    </div>,
    document.body
  )
}
