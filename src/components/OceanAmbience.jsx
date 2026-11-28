import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/authStorage'
import { getDisplayNameForAccount } from '../utils/displayName'
import { FISH_ADULT_CM, FISH_PACKS, TANK_CM, fishScreenSize, getFishSpeciesName, speciesAdultScale, speciesKeyFromRefs, speciesSwimLayer, tankPxPerCm } from '../utils/fishSkinStorage'
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
  PET_GROWTH_GAP_MS,
  tickPetBreeding,
  useFishPotion
} from '../utils/petStorage'
import { REALTIME_UPDATE_EVENT } from '../utils/supabaseRealtime'
import { TANK_LIGHT_ITEM_ID } from '../utils/itemStorage'
import { removeItemFromInventory } from '../utils/inventoryStorage'
import {
  beginPlaceTankLight,
  endPlaceTankLight,
  isPlacingTankLight,
  listTankLights,
  placeTankLight,
  toggleTankLight
} from '../utils/tankLightStorage'
import FishSprite from './FishSprite'

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 17) % 92)}%`,
  size: `${7 + (i % 5) * 3}px`,
  duration: `${10 + (i % 7) * 2.2}s`,
  delay: `${-(i * 1.3)}s`
}))

function TankScenery({ w = 0, h = 0, lights = [] }) {
  const width = Math.max(0, Math.round(Number(w) || 0))
  const height = Math.max(0, Math.round(Number(h) || 0))
  const frame = Math.max(10, Math.min(20, Math.round(width * 0.012)))
  const sized = width > 0 && height > 0
  const lamps = Array.isArray(lights) ? lights : []
  return (
    <div
      className="ocean-tank-scenery"
      aria-hidden
      style={sized ? { width: `${width}px`, height: `${height}px` } : undefined}
    >
      <div className="ocean-tank-back" />
      <div className="ocean-tank-caustic" />
      <div className="ocean-tank-surface" />
      {lamps.map((lamp) => {
        const left = `${Math.max(5, Math.min(95, (Number(lamp.x) || 0.5) * 100))}%`
        return (
          <div key={lamp.id}>
            {lamp.on ? (
              <div className="ocean-tank-beam" style={{ left }}>
                <span className="ocean-tank-beam-core" />
                <span className="ocean-tank-beam-glow" />
              </div>
            ) : null}
            <div className={`ocean-tank-lamp${lamp.on ? ' is-on' : ''}`} style={{ left }}>
              <span className="ocean-tank-lamp-body" />
            </div>
          </div>
        )
      })}
      <div className="ocean-tank-glass" />
      <div className="ocean-tank-rim ocean-tank-rim-top" style={sized ? { width: `${width}px` } : undefined} />
      <div
        className="ocean-tank-frame ocean-tank-frame-left"
        style={sized ? { width: `${frame}px`, height: `${height}px` } : undefined}
      />
      <div
        className="ocean-tank-frame ocean-tank-frame-right"
        style={sized ? { width: `${frame}px`, height: `${height}px`, left: `${Math.max(0, width - frame)}px` } : undefined}
      />
      <div className="ocean-tank-rim ocean-tank-rim-bot" style={sized ? { width: `${width}px` } : undefined} />
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

export const TANK_ZOOM_STEPS = [1, 2, 4, 8]
export const TANK_ZOOM_MAX = 8
const TANK_ZOOM_EVENT = 'ocean-tank-zoom'

let tankZoom = 0
let tankZoomGoal = 0
let zoomRaf = 0

function stopZoomAnim() {
  if (zoomRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(zoomRaf)
  zoomRaf = 0
}

function tankUiBottom() {
  if (typeof document === 'undefined') return 140
  if (isTankWideWatch()) return 56
  const ui = document.querySelector('[data-ocean-tank-ui]')
  if (ui) return Math.max(12, Math.ceil(ui.getBoundingClientRect().bottom) + 10)
  const nav = document.querySelector('[data-ocean-nav]')
  if (nav) return Math.max(12, Math.ceil(nav.getBoundingClientRect().bottom) + 8)
  return isMobile() ? 128 : 148
}

function tankFitZoom() {
  if (typeof window === 'undefined') return 0.12
  const box = viewBox()
  const wide = isTankWideWatch()
  const rotate = wide && box.h > box.w
  const viewHpx = rotate ? box.w : box.h
  const viewSpan = rotate ? box.h : box.w
  const uiTop = rotate ? 0 : tankUiBottom()
  const innerH = Math.max(80, viewHpx - uiTop - 36)
  const heightFillW = Math.max(1, innerH * (TANK_CM.length / TANK_CM.height))
  return Math.max(0.05, Math.min(1, viewSpan / heightFillW))
}

export function getTankZoom() {
  return tankZoom
}

export function setTankZoom(z, opts = {}) {
  const fit = tankFitZoom()
  const raw = Number(z)
  const next = Math.max(fit, Math.min(TANK_ZOOM_MAX, Number.isFinite(raw) ? raw : fit))
  const from = tankZoom > 0 ? tankZoom : fit
  if (opts.instant || typeof requestAnimationFrame !== 'function') {
    stopZoomAnim()
    if (Math.abs(next - from) < 0.0008) {
      tankZoom = next
      return tankZoom
    }
    tankZoom = next
    tankZoomGoal = next
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TANK_ZOOM_EVENT, { detail: { zoom: next } }))
    }
    return next
  }
  tankZoomGoal = next
  stopZoomAnim()
  if (Math.abs(next - from) < 0.0008) {
    tankZoom = next
    return tankZoom
  }
  const t0 = performance.now()
  const dur = 560
  const tick = (now) => {
    const u = Math.min(1, (now - t0) / dur)
    const e = 1 - (1 - u) * (1 - u) * (1 - u)
    tankZoom = from + (next - from) * e
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TANK_ZOOM_EVENT, { detail: { zoom: tankZoom } }))
    }
    if (u < 1) zoomRaf = requestAnimationFrame(tick)
    else {
      zoomRaf = 0
      tankZoom = next
    }
  }
  zoomRaf = requestAnimationFrame(tick)
  return next
}

export function stepTankZoom(dir) {
  const fit = tankFitZoom()
  const z = Math.max(fit, tankZoomGoal || getTankZoom() || fit)
  const factor = 1.4
  return setTankZoom(dir > 0 ? z * factor : z / factor)
}

export function resetTankZoom() {
  stopZoomAnim()
  tankZoom = 0
  tankZoomGoal = 0
  return setTankZoom(tankFitZoom(), { instant: true })
}

export const TANK_RALLY_EVENT = 'ocean-tank-rally'

export function openTankRally() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TANK_RALLY_EVENT, { detail: { action: 'open' } }))
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

function viewBox() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    w: Math.max(1, Math.round(vv?.width || window.innerWidth || 1)),
    h: Math.max(1, Math.round(vv?.height || window.innerHeight || 1))
  }
}

let layoutMemo = { key: '', zoom: 0, at: 0, L: null }

function stableLayout(mode = 'world', fishCount = 0) {
  const L = layout(mode, fishCount)
  const zoom = Number(L.zoom) || 1
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const prev = layoutMemo.L
  if (
    prev &&
    prev.tank === L.tank &&
    prev.pan === L.pan &&
    prev.fit === L.fit &&
    Math.abs((layoutMemo.zoom || 0) - zoom) < 0.0008 &&
    Math.abs(prev.w - L.w) <= 1 &&
    Math.abs(prev.h - L.h) <= 1 &&
    Math.abs((prev.uiTop || 0) - (L.uiTop || 0)) <= 1 &&
    now - layoutMemo.at < 480
  ) {
    return prev
  }
  layoutMemo = { L, zoom, at: now, key: `${L.w}x${L.h}` }
  return L
}

function layout(mode = 'world', fishCount = 0) {
  const mobile = isMobile()
  const box = viewBox()
  const viewW = box.w
  const viewH = box.h
  const wide = mode === 'tank' && isTankWideWatch()
  const rotate = wide && viewH > viewW
  const viewHpx = rotate ? viewW : viewH
  const viewSpan = rotate ? viewH : viewW
  const uiTop = mode === 'tank' && !rotate ? tankUiBottom() : (mode === 'tank' && wide ? 56 : 0)
  const innerH = Math.max(80, viewHpx - uiTop - (mode === 'tank' ? 36 : 0))
  const fitZoom = tankFitZoom()
  const zoom = mode === 'tank' ? Math.max(fitZoom, getTankZoom()) : 1
  const tankFrontW = Math.round(innerH * (TANK_CM.length / TANK_CM.height) * zoom)
  const worldH = Math.round(innerH * zoom)
  const pan = mode === 'tank' && (zoom > fitZoom + 0.03 || viewSpan + 2 < tankFrontW || worldH > innerH + 2)
  const fit = mode === 'tank' && zoom <= fitZoom + 0.02
  let w = pan ? tankFrontW : Math.min(viewSpan, tankFrontW)
  let h = pan ? worldH : Math.min(innerH, worldH)
  if (mode !== 'tank') {
    w = viewSpan
    h = viewHpx
  } else if (fit) {
    const minFitH = Math.round(innerH * (mobile ? 0.34 : 0.22))
    h = Math.min(innerH, Math.max(h, minFitH))
  }
  const floor = mode === 'tank' ? 10 : 8
  return {
    mobile,
    tank: mode === 'tank',
    pan,
    fit,
    wide,
    rotate,
    wrapX: mode === 'world' && mobile,
    viewW,
    viewH: viewHpx,
    uiTop,
    w,
    h,
    zoom,
    fitZoom,
    floor,
    top: 14,
    cruise: (mobile ? 52 : 78) * zoom,
    dash: (mobile ? 260 : 380) * zoom,
    eatRange: Math.max(8, (mobile ? 14 : 18) * zoom + tankPxPerCm(w, h) * 2)
  }
}

function feedPelletPx(worldW, worldH, tank) {
  if (!tank) return 7
  return Math.max(1.6, Math.min(10, 0.28 * tankPxPerCm(worldW, worldH)))
}

function mapClientToTank(clientX, clientY, panEl) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const sl = panEl?.scrollLeft || 0
  const st = panEl?.scrollTop || 0
  const world = panEl?.querySelector?.('.ocean-world')
  const worldRect = world?.getBoundingClientRect?.()
  if (isTankWideWatch() && vh > vw) {
    if (worldRect && worldRect.width > 1 && worldRect.height > 1) {
      const dx = clientX - vw / 2
      const dy = clientY - vh / 2
      const lx = -dy
      const ly = dx
      const cx = worldRect.left + worldRect.width / 2 - vw / 2
      const cy = worldRect.top + worldRect.height / 2 - vh / 2
      return { x: lx - cx + worldRect.width / 2, y: ly - cy + worldRect.height / 2 }
    }
    const w = vh
    const h = vw
    const dx = clientX - vw / 2
    const dy = clientY - vh / 2
    return { x: -dy + w / 2 + sl, y: dx + h / 2 + st }
  }
  if (worldRect && worldRect.width > 1 && worldRect.height > 1) {
    return { x: clientX - worldRect.left, y: clientY - worldRect.top }
  }
  const rect = panEl?.getBoundingClientRect?.()
  const padTop = panEl && typeof getComputedStyle === 'function'
    ? parseFloat(getComputedStyle(panEl).paddingTop) || 0
    : 0
  const left = rect?.left || 0
  const top = rect?.top || 0
  return { x: clientX - left + sl, y: clientY - top - padTop + st }
}

function clampRallyPoint(x, y, L) {
  const r = rallyRadius(L)
  const top = Math.max(12, Number(L?.top) || 14)
  const floor = Math.max(12, (Number(L?.floor) || 10) + 8)
  const w = Math.max(8, Number(L?.w) || 8)
  const h = Math.max(8, Number(L?.h) || 8)
  const minX = Math.min(r, w / 2)
  const maxX = Math.max(minX, w - r)
  const minY = Math.min(top + r * 0.25, h / 2)
  const maxY = Math.max(minY, h - floor - r * 0.2)
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
    r
  }
}

function scaleSimToWorld(state, sx, sy) {
  if (!state || !(sx !== 1 || sy !== 1)) return
  ;(state.fish || []).forEach((f) => {
    f.x *= sx
    f.y *= sy
    f.tx = (Number(f.tx) || 0) * sx
    f.ty = (Number(f.ty) || 0) * sy
  })
  ;(state.food || []).forEach((p) => {
    p.x *= sx
    p.y *= sy
  })
  ;(state.hearts || []).forEach((h) => {
    h.x *= sx
    h.y *= sy
  })
  if (state.rally) {
    state.rally.x *= sx
    state.rally.y *= sy
    state.rally.r *= (Math.abs(sx) + Math.abs(sy)) * 0.5
  }
}

function showcaseFishSize(entry, mobile, form = {}) {
  const sp = speciesAdultScale(entry?.key)
  let width
  let height
  if (entry?.shape === 'ray' || entry?.shape === 'turtle') {
    width = Math.round((mobile ? 70 : 118) * sp)
    height = Math.round(width * (entry?.shape === 'turtle' ? 0.72 : 0.58))
  } else if (entry?.shape === 'cichlid') {
    width = Math.round((mobile ? 78 : 132) * sp)
    height = Math.round(width * 0.56)
  } else if (entry?.shape === 'shark') {
    width = Math.round((mobile ? 90 : 152) * sp)
    height = Math.round(width * 0.46)
  } else if (entry?.shape === 'koi') {
    width = Math.round((mobile ? 86 : 146) * sp)
    height = Math.round(width * 0.5)
  } else if (entry?.shape === 'giant') {
    width = Math.round((mobile ? 96 : 160) * sp)
    height = Math.round(width * 0.28)
  } else if (entry?.wide) {
    width = Math.round((mobile ? 88 : 148) * sp)
    height = Math.round(width * 0.32)
  } else {
    width = Math.round((mobile ? 72 : 128) * sp)
    height = Math.round(width * 0.52)
  }
  const s = spriteLengthRatio(form, entry?.key)
  const length = Number(form.lengthMul) > 0 ? form.lengthMul : 1
  const girth = Number(form.girthMul) > 0 ? form.girthMul : 1
  return {
    width: Math.max(36, Math.round(width * s)),
    height: Math.max(20, Math.round(height * s * (girth / length)))
  }
}

function fishSize(entry, L, form = {}) {
  if (!L?.tank) return showcaseFishSize(entry, !!L?.mobile, form)
  const cm = Number(form.lengthCm)
  const lengthCm = Number.isFinite(cm) && cm > 0 ? cm : (FISH_ADULT_CM[entry?.key] || FISH_ADULT_CM.betta)
  const length = Number(form.lengthMul) > 0 ? form.lengthMul : 1
  const girth = Number(form.girthMul) > 0 ? form.girthMul : 1
  const size = fishScreenSize(lengthCm, L?.w, L?.h, entry?.shape, entry?.wide, girth / length)
  const maxH = Math.max(8, (Number(L?.h) || size.height) - (Number(L?.top) || 0) - (Number(L?.floor) || 0) - 2)
  const maxW = Math.max(16, (Number(L?.w) || size.width) - 8)
  let width = size.width
  let height = size.height
  if (height > maxH) {
    const k = maxH / height
    width = Math.max(8, Math.round(width * k))
    height = maxH
  }
  if (width > maxW) {
    const k = maxW / width
    width = maxW
    height = Math.max(8, Math.round(height * k))
  }
  return { width, height }
}

function beamFromLight(L, xFrac) {
  const cx = L.w * Math.max(0.05, Math.min(0.95, Number(xFrac) || 0.5))
  const topHalf = L.w * (L.mobile ? 0.055 : 0.042)
  const botHalf = L.w * (L.mobile ? 0.13 : 0.11)
  return { cx, topHalf, botHalf }
}

function fishInTankBeam(fish, size, L, lights) {
  const ons = (lights || []).filter((row) => row && row.on)
  if (!ons.length) return 0
  const midX = (fish?.x || 0) + (size?.width || 0) * 0.5
  const midY = (fish?.y || 0) + (size?.height || 0) * 0.45
  const t = Math.max(0, Math.min(1, midY / Math.max(1, L.h)))
  let best = 0
  ons.forEach((lamp) => {
    const { cx, topHalf, botHalf } = beamFromLight(L, lamp.x)
    const half = topHalf + (botHalf - topHalf) * t
    const d = Math.abs(midX - cx)
    if (d >= half) return
    best = Math.max(best, 1 - d / half)
  })
  return Math.max(0, Math.min(1, best))
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

function startKick(fish, now, strength = 0.7) {
  fish.kick = Math.max(fish.kick || 0, strength)
  fish.kickDecay = 0.55 + Math.random() * 1.15
  fish.nextKick = now + 220 + Math.random() * 520
}

function inHomeLayer(fish, L, size) {
  const { minY, maxY } = layerBand(L, size, fish._layer)
  return fish.y >= minY - 8 && fish.y <= maxY + 8
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

function tankBox(L, size) {
  const side = L.tank ? 14 : 0
  const top = L.tank ? Math.max(12, Number(L.top) || 12) : (L.top ?? headerClearance())
  const floor = Number(L.floor) || 8
  const maxX = Math.max(0, L.w - size.width - side)
  const minX = Math.min(side, maxX)
  const maxY = Math.max(0, L.h - size.height - floor)
  const minY = Math.min(top, maxY)
  return { minX, maxX, minY, maxY }
}

function layerBand(L, size, layer) {
  const box = tankBox(L, size)
  const [t0, t1] = LAYER_BANDS[layer] || LAYER_BANDS.mid
  const topPad = box.minY
  const floor = Number(L.floor) || 8
  const usable = Math.max(8, L.h - topPad - floor)
  let minY = topPad + usable * t0
  let maxY = topPad + usable * t1 - size.height
  if (maxY < minY + 8) {
    minY = box.minY
    maxY = box.maxY
  }
  return {
    minY: Math.max(box.minY, Math.min(minY, box.maxY)),
    maxY: Math.max(box.minY, Math.min(Math.max(minY, maxY), box.maxY))
  }
}

function waterColumn(L, size) {
  const box = tankBox(L, size)
  return { minY: box.minY, maxY: box.maxY }
}

function swimBand(L, size, layer, roamAll) {
  return roamAll ? waterColumn(L, size) : layerBand(L, size, layer)
}

function fishIsFull(fish, look, now) {
  if (!fish) return true
  if (fish.sated || now < (fish.satedUntil || 0)) return true
  if (look?.hunger === 'full') return true
  const wait = look?.feedWait
  if (wait?.waiting || wait?.reason === 'day') return true
  return false
}

function mouthOf(fish, size, entry) {
  const mouthRatio = entry?.shape === 'ray' || entry?.shape === 'turtle' ? 0.9 : (entry?.wide ? 0.9 : 0.84)
  return {
    x: fish.face === 1 ? fish.x + size.width * mouthRatio : fish.x + size.width * (1 - mouthRatio),
    y: fish.y + size.height * 0.5
  }
}

function separateFish(fish, i, all, sizes) {
  const size = sizes[i]
  const cx = fish.x + size.width * 0.5
  const cy = fish.y + size.height * 0.5
  let sx = 0
  let sy = 0
  all.forEach((other, j) => {
    if (j === i || !sizes[j]) return
    const ox = other.x + sizes[j].width * 0.5
    const oy = other.y + sizes[j].height * 0.5
    const dx = cx - ox
    const dy = cy - oy
    const minD = (size.width + sizes[j].width) * 0.42
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001
    if (d >= minD) return
    const push = (minD - d) / minD
    sx += (dx / d) * push
    sy += (dy / d) * push
  })
  return { sx, sy }
}

function clampFish(fish, L, size, layer = fish._layer, roamAll = false) {
  const box = tankBox(L, size)
  const { minY, maxY } = swimBand(L, size, layer, roamAll)
  const lo = Math.max(box.minY, Math.min(minY, box.maxY))
  const hi = Math.max(lo, Math.min(maxY, box.maxY))
  if (L.wrapX && !L.tank) {
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
    fish.y = Math.max(lo, Math.min(hi, fish.y))
    if (wrapped) {
      const inward = fish.face >= 0 ? L.w * 0.28 : L.w * 0.55
      fish.tx = Math.max(box.minX, Math.min(box.maxX, inward))
      fish.ty = Math.max(lo, Math.min(hi, Number(fish.ty) || fish.y))
      fish.turnAt = performance.now() + 1400 + Math.random() * 1800
    }
    return
  }
  fish.x = Math.max(box.minX, Math.min(box.maxX, fish.x))
  fish.y = Math.max(lo, Math.min(hi, fish.y))
  fish.tx = Math.max(box.minX, Math.min(box.maxX, Number(fish.tx) || fish.x))
  fish.ty = Math.max(lo, Math.min(hi, Number(fish.ty) || fish.y))
}

function pickWander(fish, L, size, roamAll = false) {
  if (L.tank && fish._rally) {
    setFishRallyTarget(fish, L, size, fish._rally)
    return
  }
  const box = tankBox(L, size)
  const { minY, maxY } = swimBand(L, size, fish._layer, roamAll)
  const lo = Math.max(box.minY, Math.min(minY, box.maxY))
  const hi = Math.max(lo, Math.min(maxY, box.maxY))
  const spanY = Math.max(4, hi - lo)
  fish.ty = lo + Math.random() * spanY
  if (L.wrapX && !L.tank) {
    const padX = L.pan ? 8 : 16
    const face = fish.face >= 0 ? 1 : -1
    if (Math.random() < 0.62) {
      fish.tx = face > 0 ? L.w + size.width * 0.85 : -size.width * 0.85
    } else {
      fish.tx = padX + Math.random() * Math.max(40, L.w - size.width - padX * 2)
    }
    fish.turnAt = performance.now() + 1800 + Math.random() * 3800
    startKick(fish, performance.now(), 0.55 + Math.random() * 0.4)
    return
  }
  fish.tx = box.minX + Math.random() * Math.max(4, box.maxX - box.minX)
  fish.turnAt = performance.now() + 1600 + Math.random() * 4200
  startKick(fish, performance.now(), 0.55 + Math.random() * 0.4)
}

function rallyRadius(L) {
  return Math.max(28, Math.min(Number(L?.h) * 0.14, Number(L?.w) * 0.07) || 40)
}

function fishMatchesRally(entry, look, rally) {
  if (!rally || !entry) return false
  if (!rally.species || rally.species === 'all') return true
  const key = speciesKeyFromRefs({
    itemId: entry.itemId,
    key: entry.key,
    rec: { species: look?.species, itemId: entry.itemId },
    nick: entry.nick
  })
  return key === rally.species
}

function rosterSpeciesOptions(roster) {
  const seen = new Map()
  ;(roster || []).forEach((entry) => {
    const key = speciesKeyFromRefs({
      itemId: entry?.itemId,
      key: entry?.key,
      rec: { itemId: entry?.itemId },
      nick: entry?.nick
    }) || entry?.key
    if (!key || seen.has(key)) return
    seen.set(key, getFishSpeciesName({ ...entry, key }))
  })
  return Array.from(seen, ([key, name]) => ({ key, name }))
}

function setFishRallyTarget(fish, L, size, rally) {
  const box = tankBox(L, size)
  const { minY, maxY } = swimBand(L, size, fish._layer, true)
  const lo = Math.max(box.minY, Math.min(minY, box.maxY))
  const hi = Math.max(lo, Math.min(maxY, box.maxY))
  const ang = Math.random() * Math.PI * 2
  const rad = Math.sqrt(Math.random()) * Math.max(12, Number(rally.r) || 40)
  const tx = Number(rally.x) + Math.cos(ang) * rad - size.width * 0.5
  const ty = Number(rally.y) + Math.sin(ang) * rad - size.height * 0.5
  fish.tx = Math.max(box.minX, Math.min(box.maxX, tx))
  fish.ty = Math.max(lo, Math.min(hi, ty))
  fish.turnAt = performance.now() + 800 + Math.random() * 1400
  startKick(fish, performance.now(), 0.45 + Math.random() * 0.3)
}

function spawnFish(i, count, L, size, layer, roamAll = false) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))))
  const col = i % cols
  const cellW = L.w / cols
  const { minY, maxY } = swimBand(L, size, layer, roamAll)
  const y = minY + ((i * 37) % Math.max(12, maxY - minY))
  return {
    x: col * cellW + Math.max(10, (cellW - size.width) * 0.28),
    y,
    face: i % 2 === 0 ? 1 : -1,
    tilt: 0,
    eatUntil: 0,
    fleeUntil: 0,
    _layer: layer,
    _roamAll: roamAll,
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
  const box = tankBox(L, size)
  const { minY, maxY } = swimBand(L, size, fish._layer, !!fish._roamAll)
  const nx = fish.x + (dx / dist) * run
  fish.tx = L.wrapX && !L.tank ? nx : Math.max(box.minX, Math.min(box.maxX, nx))
  fish.ty = Math.max(box.minY, Math.min(box.maxY, Math.max(minY, Math.min(maxY, fish.y + (dy / dist) * run))))
  fish.fleeUntil = performance.now() + 900
  fish.turnAt = fish.fleeUntil + 500
  fish.eatUntil = 0
  fish.dash = true
  startKick(fish, performance.now(), 1)
}

function rosterKey(roster) {
  return (roster || []).map((f) => `${f.id}:${f.key}:${f.src}:${f.owner || ''}`).join('|')
}

function actorLookSig(roster, looks) {
  return (roster || []).map((entry) => {
    const look = looks?.[entry?.id] || {}
    return [
      entry?.id,
      look.art === 'b' ? 'b' : 'a',
      look.gender || '',
      look.pregnant ? 1 : 0,
      look.generation || 0,
      entry?.nick || '',
      look.morphLabel || '',
      look.shineText || '',
      look.feedWait?.waiting ? 1 : 0,
      look.feedWait?.today || 0,
      look.feedWait?.helpToday || 0,
      (look.helpers || []).length
    ].join(':')
  }).join('|')
}

function syncFloatLayer(map, layer, items, className, apply, text) {
  if (!layer) {
    map.forEach((el) => el.remove())
    map.clear()
    return
  }
  const keep = new Set()
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (!item?.id) continue
    keep.add(item.id)
    let el = map.get(item.id)
    if (!el) {
      el = document.createElement('span')
      el.className = className
      if (text) el.textContent = text
      layer.appendChild(el)
      map.set(item.id, el)
    }
    apply(el, item)
  }
  map.forEach((el, id) => {
    if (keep.has(id)) return
    el.remove()
    map.delete(id)
  })
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
  const busyPage = path.includes('my-backpack') || path.includes('fish-auction') || path.includes('fish-swap')
  const hidden = (mode === 'world' && (onTankPage || busyPage)) || (mode === 'tank' && !onTankPage)
  const bubbles = useMemo(() => BUBBLES, [])
  const [rallyPhase, setRallyPhase] = useState('')
  const [rallySpecies, setRallySpecies] = useState('all')
  const [rallyLabel, setRallyLabel] = useState('全部')
  const rallyPhaseRef = useRef('')
  const rallySpeciesRef = useRef('all')
  const rallyMarkRef = useRef(null)
  const rallyIgnoreFeedUntil = useRef(0)
  const tankOwner = visiting ? host : me
  const [tankLights, setTankLights] = useState(() => listTankLights(tankOwner))
  const tankLightsRef = useRef(tankLights)
  const [placeLight, setPlaceLight] = useState(() => !visiting && isPlacingTankLight())
  const placeLightRef = useRef(false)
  const [inspect, setInspect] = useState(null)
  const [potionMsg, setPotionMsg] = useState('')
  const [feedHud, setFeedHud] = useState('')
  const feedHudRef = useRef('')
  const lookBump = useRef(0)
  const shooRef = useRef([])
  const panRef = useRef(null)
  const foodLayerRef = useRef(null)
  const heartLayerRef = useRef(null)
  const foodNodeRef = useRef(new Map())
  const heartNodeRef = useRef(new Map())
  const actorNodeRef = useRef(new Map())
  const tipRef = useRef(null)
  const inspectRef = useRef(null)
  const actorSigRef = useRef('')
  const fitZoomRef = useRef(typeof window === 'undefined' ? 0.12 : tankFitZoom())
  const rosterRef = useRef(loadRoster(mode, host))
  const bootLayout = typeof window === 'undefined' ? { w: 0, pan: false, wide: false, rotate: false } : layout(mode, (rosterRef.current || []).length)
  const uiTopRef = useRef(bootLayout.uiTop || 0)
  const worldWRef = useRef(bootLayout.w)
  const worldHRef = useRef(bootLayout.h || 0)
  const panFlagRef = useRef(!!bootLayout.pan)
  const wideFlagRef = useRef(!!bootLayout.wide)
  const rotateFlagRef = useRef(!!bootLayout.rotate)
  const [worldW, setWorldW] = useState(bootLayout.w)
  const [worldH, setWorldH] = useState(bootLayout.h || 0)
  const [pan, setPan] = useState(!!bootLayout.pan)
  const [wide, setWide] = useState(!!bootLayout.wide)
  const [rotate, setRotate] = useState(!!bootLayout.rotate)
  const [zoom, setZoom] = useState(() => getTankZoom())
  const [fitZoom, setFitZoom] = useState(() => (typeof window === 'undefined' ? 0.12 : tankFitZoom()))
  const [uiTop, setUiTop] = useState(() => bootLayout.uiTop || 0)
  const zoomRef = useRef(getTankZoom())
  const pinchRef = useRef(null)
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
  inspectRef.current = inspect
  rallyPhaseRef.current = rallyPhase
  rallySpeciesRef.current = rallySpecies
  tankLightsRef.current = tankLights
  placeLightRef.current = !!placeLight

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
      resetTankZoom()
      return undefined
    }
    return () => {
      exitTankWideWatch()
      resetTankZoom()
    }
  }, [hidden, mode])

  useEffect(() => {
    if (hidden || mode !== 'tank') return undefined
    const onZoom = (e) => {
      const next = Number(e?.detail?.zoom) || getTankZoom()
      const prev = Math.max(0.01, zoomRef.current || 1)
      zoomRef.current = next
      setZoom(next)
      const el = panRef.current
      if (!el || Math.abs(prev - next) < 0.001) return
      const ratio = next / prev
      const vw = el.clientWidth
      const vh = el.clientHeight
      const sl = el.scrollLeft
      const st = el.scrollTop
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (sl + vw / 2) * ratio - vw / 2)
        el.scrollTop = Math.max(0, (st + vh / 2) * ratio - vh / 2)
      })
    }
    window.addEventListener(TANK_ZOOM_EVENT, onZoom)
    const el = panRef.current
    const distOf = (e) => {
      if (!e.touches || e.touches.length < 2) return 0
      const a = e.touches[0]
      const b = e.touches[1]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }
    const onStart = (e) => {
      if (e.touches.length === 2) pinchRef.current = { dist: distOf(e), zoom: getTankZoom() }
    }
    const onMove = (e) => {
      if (!pinchRef.current || e.touches.length !== 2) return
      e.preventDefault()
      const d = distOf(e)
      if (d < 10 || pinchRef.current.dist < 10) return
      setTankZoom(pinchRef.current.zoom * (d / pinchRef.current.dist), { instant: true })
    }
    const onEnd = () => {
      pinchRef.current = null
    }
    if (el) {
      el.addEventListener('touchstart', onStart, { passive: true })
      el.addEventListener('touchmove', onMove, { passive: false })
      el.addEventListener('touchend', onEnd)
      el.addEventListener('touchcancel', onEnd)
    }
    return () => {
      window.removeEventListener(TANK_ZOOM_EVENT, onZoom)
      if (el) {
        el.removeEventListener('touchstart', onStart)
        el.removeEventListener('touchmove', onMove)
        el.removeEventListener('touchend', onEnd)
        el.removeEventListener('touchcancel', onEnd)
      }
    }
  }, [hidden, mode, pan])

  useEffect(() => {
    if (mode !== 'tank' || visiting) return undefined
    if (location?.state?.placeLight || isPlacingTankLight()) {
      beginPlaceTankLight()
      setPlaceLight(true)
    }
    return undefined
  }, [mode, visiting, location?.state?.placeLight])

  useEffect(() => {
    const owner = visiting ? host : getCurrentUser()
    const refresh = () => setTankLights(listTankLights(owner))
    refresh()
    const onRt = (e) => {
      const key = e?.detail?.key
      if (key && key !== '__ALL__' && key !== 'jiameng_tank_lights') return
      refresh()
    }
    window.addEventListener(REALTIME_UPDATE_EVENT, onRt)
    return () => window.removeEventListener(REALTIME_UPDATE_EVENT, onRt)
  }, [visiting, host])

  useEffect(() => {
    if (hidden || mode !== 'tank') return undefined
    const onRally = (e) => {
      const action = e?.detail?.action
      if (action === 'clear') {
        if (sim.current) sim.current.rally = null
        setRallyPhase('')
        return
      }
      setRallyPhase('pick')
    }
    window.addEventListener(TANK_RALLY_EVENT, onRally)
    return () => window.removeEventListener(TANK_RALLY_EVENT, onRally)
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
    setWorldH(L0.h)
    if (L0.fitZoom) setFitZoom(L0.fitZoom)
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
      rally: null,
      fish: startRoster.map((entry, i) =>
        spawnFish(i, startRoster.length, L0, fishSize(entry, L0, startLooks[entry.id]), speciesSwimLayer(entry?.key), mode !== 'tank')
      )
    }

    let last = performance.now()
    let raf = 0

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = stableLayout(mode, (rosterRef.current || []).length)
      if (worldWRef.current !== L.w || worldHRef.current !== L.h) {
        const ox = Math.max(1, worldWRef.current || L.w)
        const oy = Math.max(1, worldHRef.current || L.h)
        if (sim.current && ox > 8 && oy > 8) {
          scaleSimToWorld(sim.current, L.w / ox, L.h / oy)
        }
        worldWRef.current = L.w
        worldHRef.current = L.h
        setWorldW(L.w)
        setWorldH(L.h)
      }
      if (L.fitZoom && Math.abs(fitZoomRef.current - L.fitZoom) > 0.0008) {
        fitZoomRef.current = L.fitZoom
        setFitZoom(L.fitZoom)
      }
      if (L.uiTop != null && uiTopRef.current !== L.uiTop) {
        uiTopRef.current = L.uiTop
        setUiTop(L.uiTop)
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
        const size = fishSize(currentRoster[i], L, look)
        state.fish.push(spawnFish(i, currentRoster.length, L, size, speciesSwimLayer(currentRoster[i]?.key), mode !== 'tank'))
      }
      if (state.fish.length > currentRoster.length) {
        state.fish.length = currentRoster.length
      }

      const aimAlong = (fish, vx, vy) => {
        const ax = Math.abs(vx)
        const ay = Math.abs(vy)
        if (ax > 2.8 && ax > ay * 0.5) {
          const wantFace = vx >= 0 ? 1 : -1
          if (wantFace === fish.face) {
            fish._flipHold = 0
          } else {
            fish._flipHold = (fish._flipHold || 0) + dt
            if (fish._flipHold > 0.18) {
              fish.face = wantFace
              fish._flipHold = 0
            }
          }
        }
        const want = ax < 1.2 ? 0 : Math.atan2(vy, ax + 0.0001) * (180 / Math.PI)
        const maxTilt = L.tank ? 16 : (ay >= ax * 0.65 ? 88 : 68)
        const clamped = Math.max(-maxTilt, Math.min(maxTilt, want))
        fish.tilt += (clamped - (fish.tilt || 0)) * Math.min(1, 3.4 * dt)
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
        fishSize(entry, L, state.looks?.[entry?.id])
      )
      state.fish.forEach((fish, i) => {
        const size = sizes[i]
        const entry = currentRoster[i]
        const look = state.looks?.[entry?.id]
        const hungry = !fishIsFull(fish, look, now)
        fish._w = size.width
        fish._h = size.height
        fish._layer = speciesSwimLayer(entry?.key)
        fish._headHome = mode === 'tank' && !hungry && !inHomeLayer(fish, L, size)
        const rallied = mode === 'tank' && fishMatchesRally(entry, look, state.rally)
        fish._rally = rallied ? state.rally : null
        fish._roamAll = mode !== 'tank' || hungry || fish._headHome || rallied
        clampFish(fish, L, size, fish._layer, fish._roamAll)
      })

      const foodClaim = new Map()
      ;(state.food || []).forEach((p) => {
        if (p.eaten) return
        let bestI = -1
        let bestD = Infinity
        state.fish.forEach((fish, i) => {
          if (now < (fish.fleeUntil || 0)) return
          if (fishIsFull(fish, state.looks?.[currentRoster[i]?.id], now)) return
          const mouth = mouthOf(fish, sizes[i], currentRoster[i])
          const d = (p.x - mouth.x) ** 2 + (p.y - mouth.y) ** 2
          if (d < bestD) {
            bestD = d
            bestI = i
          }
        })
        if (bestI >= 0) foodClaim.set(p.id, bestI)
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
        const look = state.looks?.[entry?.id]
        const mouth = mouthOf(fish, size, entry)
        const target = (state.food || []).find((p) => !p.eaten && foodClaim.get(p.id) === i) || null
        const full = fishIsFull(fish, look, now)
        const sep = separateFish(fish, i, state.fish, sizes)

        if (now < fish.eatUntil) {
          fish.dash = false
          fish.tilt += (0 - (fish.tilt || 0)) * Math.min(1, 8 * dt)
          fish.x += sep.sx * 90 * dt
          fish.y += sep.sy * 90 * dt
          clampFish(fish, L, size, fish._layer, fish._roamAll)
          return
        }

        if (now < (fish.fleeUntil || 0)) {
          const fx = (fish.tx ?? fish.x) - fish.x
          const fy = (fish.ty ?? fish.y) - fish.y
          const fd = Math.sqrt(fx * fx + fy * fy) || 1
          if (fd < 28) {
            fish.fleeUntil = 0
            pickWander(fish, L, size, fish._headHome ? false : fish._roamAll)
          } else {
            fish.dash = true
            aimAlong(fish, fx, fy)
            const sprint = L.dash * (L.mobile ? 1.7 : 1.85)
            fish.x += (fx / fd) * sprint * dt + sep.sx * 110 * dt
            fish.y += (fy / fd) * sprint * dt + sep.sy * 110 * dt
            clampFish(fish, L, size, fish._layer, fish._roamAll)
            return
          }
        }

        if (target && !full) {
          const dx = target.x - mouth.x
          const dy = target.y - mouth.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < L.eatRange) {
            target.eaten = true
            fish.eatUntil = now + 220
            fish.sated = true
            fish.satedUntil = now + PET_GROWTH_GAP_MS
            fish._headHome = mode === 'tank' && !inHomeLayer(fish, L, size)
            fish._roamAll = mode !== 'tank' || fish._headHome
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
            state.fish.forEach((other, j) => {
              if (j === i || !sizes[j]) return
              const ocx = other.x + sizes[j].width * 0.5
              const ocy = other.y + sizes[j].height * 0.5
              const od = Math.hypot(ocx - target.x, ocy - target.y)
              if (od < 140) shooFish(other, L, sizes[j], target.x, target.y)
            })
            pickWander(fish, L, size, false)
            return
          }
          fish.dash = true
          aimAlong(fish, dx, dy)
          fish.x += (dx / dist) * L.dash * dt + sep.sx * 80 * dt
          fish.y += (dy / dist) * L.dash * dt + sep.sy * 80 * dt
          clampFish(fish, L, size, fish._layer, true)
        } else {
          if (!full) {
            const near = (state.food || []).find((p) => !p.eaten)
            if (near) {
              const nd = Math.hypot(near.x - mouth.x, near.y - mouth.y)
              if (nd < 130) {
                shooFish(fish, L, size, near.x, near.y)
                fish.dash = true
                return
              }
            }
          }
          fish.dash = false
          if (fish._rally) {
            const rcx = fish.x + size.width * 0.5
            const rcy = fish.y + size.height * 0.5
            const rd = Math.hypot(rcx - fish._rally.x, rcy - fish._rally.y)
            if (rd > fish._rally.r * 1.2) {
              fish.tx = fish._rally.x - size.width * 0.5
              fish.ty = fish._rally.y - size.height * 0.5
              fish.dash = rd > fish._rally.r * 1.8
              fish.turnAt = now + 360
            }
          } else if (mode === 'tank' && (!fish.turnAt || now > fish.turnAt)) {
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
          const near = dist < Math.max(14, Math.min(36, size.width * 0.45))
          if (!fish.turnAt || now > fish.turnAt) {
            pickWander(fish, L, size, fish._headHome ? false : fish._roamAll)
          } else if (near) {
            fish.tilt += (0 - (fish.tilt || 0)) * Math.min(1, 4 * dt)
            fish.x += sep.sx * 18 * dt
            fish.y += sep.sy * 18 * dt
            clampFish(fish, L, size, fish._layer, fish._roamAll)
            return
          }
          const wx = (fish.tx ?? fish.x) - fish.x + sep.sx * 22
          const wy = (fish.ty ?? fish.y) - fish.y + sep.sy * 22
          const wd = Math.sqrt(wx * wx + wy * wy) || 1
          aimAlong(fish, wx, wy)
          const speed = cruiseSpeed(L, entry, size) * (fish._headHome ? 1.2 : 1)
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

      const lookSig = actorLookSig(currentRoster, state.looks)
      if (lookSig !== actorSigRef.current) {
        actorSigRef.current = lookSig
        setActors(currentRoster.map((entry, i) => {
          const look = state.looks?.[entry.id] || {}
          const speciesKey = speciesKeyFromRefs({
            itemId: entry.itemId,
            key: entry.key,
            rec: { species: look.species, itemId: entry.itemId },
            nick: entry.nick
          })
          const pack = FISH_PACKS[speciesKey] || FISH_PACKS[entry.key] || FISH_PACKS.betta
          const size = sizes[i] || fishSize({ ...entry, key: pack.key, wide: pack.wide, shape: pack.shape || 'fish' }, L, look)
          const art = look.art === 'b' ? 'b' : 'a'
          const f = state.fish[i] || {}
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
            dash: !!f.dash,
            eating: now < f.eatUntil,
            lit: 0,
            feedWait: look.feedWait || null,
            helpers: look.helpers || []
          }
        }))
      }

      const pellet = feedPelletPx(L.w, L.h, !!L.tank)
      const pelletH = Math.max(1.2, pellet * 0.78)
      syncFloatLayer(foodNodeRef.current, foodLayerRef.current, state.food || [], 'ocean-feed', (el, p) => {
        el.style.width = `${pellet}px`
        el.style.height = `${pelletH}px`
        el.style.marginLeft = `${-pellet / 2}px`
        el.style.marginTop = `${-pelletH / 2}px`
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
      })
      syncFloatLayer(
        heartNodeRef.current,
        heartLayerRef.current,
        mode === 'tank' ? (state.hearts || []) : [],
        'ocean-heart',
        (el, h) => {
          const life = Math.max(0, Math.min(1, h.life))
          el.style.transform = `translate3d(${h.x}px, ${h.y}px, 0) scale(${0.7 + (1 - life) * 0.45})`
          el.style.opacity = `${life}`
        },
        '♥'
      )

      const mark = rallyMarkRef.current
      if (mark) {
        const rally = state.rally
        if (rally && Number.isFinite(rally.x) && Number.isFinite(rally.y)) {
          const rr = Math.max(16, Number(rally.r) || 32)
          mark.style.display = 'block'
          mark.style.width = `${rr * 2}px`
          mark.style.height = `${rr * 2}px`
          mark.style.transform = `translate3d(${rally.x - rr}px, ${rally.y - rr}px, 0)`
        } else {
          mark.style.display = 'none'
        }
      }

      const nodes = actorNodeRef.current
      currentRoster.forEach((entry, i) => {
        const f = state.fish[i]
        const size = sizes[i]
        const id = entry?.id || `fish-${i}`
        if (!f || !size) return
        let node = nodes.get(id)
        if (node?.el && (!node.face || !node.sprite)) {
          node.face = node.el.querySelector('.ocean-fish-face')
          node.sprite = node.el.querySelector('.ocean-betta')
        }
        if (!node?.el) return
        const lit = mode === 'tank' ? fishInTankBeam(f, size, L, tankLightsRef.current) : 0
        const px = Math.round(f.x * 4) / 4
        const py = Math.round(f.y * 4) / 4
        const tf = `translate3d(${px}px, ${py}px, 0)`
        if (node.tf !== tf) {
          node.tf = tf
          node.el.style.transform = tf
        }
        if (node.sw !== size.width || node.sh !== size.height) {
          node.sw = size.width
          node.sh = size.height
          node.el.style.width = `${size.width}px`
          node.el.style.height = `${size.height}px`
          if (node.sprite) {
            node.sprite.style.width = `${size.width}px`
            node.sprite.style.height = `${size.height}px`
          }
        }
        const dash = !!f.dash
        const eating = now < f.eatUntil
        const isLit = lit > 0.18
        if (node.dash !== dash) {
          node.dash = dash
          node.el.classList.toggle('is-dash', dash)
        }
        if (node.eating !== eating) {
          node.eating = eating
          node.el.classList.toggle('is-eating', eating)
        }
        if (node.isLit !== isLit) {
          node.isLit = isLit
          node.el.classList.toggle('is-lit', isLit)
        }
        const filter = lit > 0.04
          ? `saturate(${(1 + lit * 1.15).toFixed(2)}) brightness(${(1 + lit * 0.28).toFixed(2)}) contrast(${(1 + lit * 0.1).toFixed(2)})`
          : ''
        if (node.filter !== filter) {
          node.filter = filter
          node.el.style.filter = filter
        }
        const faceTf = `scaleX(${f.face}) rotate(${(Math.round((f.tilt || 0) * 4) / 4)}deg)`
        if (node.face && node.faceTf !== faceTf) {
          node.faceTf = faceTf
          node.face.style.transform = faceTf
        }
      })

      const tip = tipRef.current
      const inspectId = inspectRef.current
      if (tip && inspectId) {
        const i = currentRoster.findIndex((row) => row?.id === inspectId)
        const f = i >= 0 ? state.fish[i] : null
        const size = i >= 0 ? sizes[i] : null
        if (f && size) {
          tip.style.transform = `translate3d(${f.x + size.width / 2}px, ${f.y}px, 0) translate(-50%, calc(-100% - 8px))`
        }
      }

      if (mode === 'tank') {
        let ready = 0
        let soonest = Infinity
        currentRoster.forEach((row) => {
          const w = state.looks?.[row?.id]?.feedWait
          if (!w || w.reason === 'adult') return
          if (!w.waiting) ready += 1
          else if (w.readyAt && w.readyAt < soonest) soonest = w.readyAt
        })
        const left = soonest < Infinity ? Math.max(0, soonest - Date.now()) : 0
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
      if (performance.now() < (rallyIgnoreFeedUntil.current || 0)) return
      if (mode === 'tank' && rallyPhaseRef.current === 'aim') {
        const L = stableLayout(mode, (rosterRef.current || []).length)
        sim.current.rally = {
          species: rallySpeciesRef.current || 'all',
          ...clampRallyPoint(x, y, L)
        }
        rallyPhaseRef.current = 'on'
        rallyIgnoreFeedUntil.current = performance.now() + 700
        setRallyPhase('on')
        return
      }
      if (mode === 'tank' && placeLightRef.current && !visiting) {
        const L = stableLayout(mode, (rosterRef.current || []).length)
        const placed = placeTankLight(getCurrentUser(), x / Math.max(1, L.w))
        if (placed.success) {
          removeItemFromInventory(getCurrentUser(), TANK_LIGHT_ITEM_ID, 1)
          endPlaceTankLight()
          placeLightRef.current = false
          setPlaceLight(false)
          setTankLights(placed.lights || [])
          rallyIgnoreFeedUntil.current = performance.now() + 700
        }
        return
      }
      const roster = rosterRef.current || []
      const looks = sim.current.looks || {}
      const anyHungry = roster.some((row, i) => !fishIsFull(sim.current.fish[i], looks[row?.id], Date.now()))
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
      foodNodeRef.current.forEach((el) => el.remove())
      foodNodeRef.current.clear()
      heartNodeRef.current.forEach((el) => el.remove())
      heartNodeRef.current.clear()
    }
  }, [hidden, mode, host, visiting])

  if (hidden || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panRef}
      className={`ocean-ambience${mode === 'tank' ? ' is-tank' : ''}${visiting ? ' is-visiting' : ''}${pan ? ' is-pan' : ''}${pan ? ' is-close' : ''}${mode === 'tank' && !pan && zoom <= fitZoom + 0.02 ? ' is-fit' : ''}${wide ? ' is-widewatch' : ''}${rotate ? ' is-widewatch-rotate' : ''}${rallyPhase === 'aim' ? ' is-rally-aim' : ''}${rallyPhase === 'on' ? ' is-rally-on' : ''}${placeLight ? ' is-place-light' : ''}`}
      style={
        mode === 'tank' && !rotate
          ? { ['--tank-ui-top']: `${uiTop || 0}px` }
          : undefined
      }
      aria-hidden={!wide}
      onPointerDown={(e) => {
        if (e.target.closest('.ocean-fish-owner-tip, .ocean-widewatch-exit, .ocean-zoom-bar, .ocean-rally-panel, .ocean-light-hud')) return
        if (rallyPhase === 'aim' || placeLight) {
          e.preventDefault()
          e.stopPropagation()
          const p = mapClientToTank(e.clientX, e.clientY, panRef.current)
          window.dispatchEvent(new CustomEvent('ocean-feed', { detail: { x: p.x, y: p.y, mapped: true } }))
          return
        }
        if (!wide) return
        if (!visiting && e.target.closest('.ocean-fish-actor')) return
        const p = mapClientToTank(e.clientX, e.clientY, panRef.current)
        window.dispatchEvent(new CustomEvent('ocean-feed', { detail: { x: p.x, y: p.y, mapped: true } }))
      }}
    >
      {mode === 'tank' && feedHud ? (
        <div className="ocean-feed-hud">{feedHud}</div>
      ) : null}
      {mode === 'tank' ? (
        <div className="ocean-zoom-bar">
          <button
            type="button"
            className="ocean-zoom-btn"
            disabled={zoom <= fitZoom + 0.02}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              stepTankZoom(-1)
            }}
          >
            拉開
          </button>
          <span className="ocean-zoom-label">{zoom <= fitZoom + 0.02 ? '整缸' : zoom < 1.02 ? '遠看' : `${zoom % 1 ? zoom.toFixed(1) : zoom}×`}</span>
          <button
            type="button"
            className="ocean-zoom-btn"
            disabled={zoom >= TANK_ZOOM_MAX - 0.02}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              stepTankZoom(1)
            }}
          >
            走近看
          </button>
          {rallyPhase === 'on' ? (
            <button
              type="button"
              className="ocean-zoom-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (sim.current) sim.current.rally = null
                setRallyPhase('')
              }}
            >
              解散
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === 'tank' && rallyPhase === 'pick' ? createPortal(
        <>
          <div
            className="ocean-rally-scrim"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setRallyPhase(sim.current?.rally ? 'on' : '')
            }}
          />
          <div
            className="ocean-rally-panel"
            style={{ top: Math.max(12, (uiTop || 0) + 8) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p>集結誰？</p>
            <button
              type="button"
              className={rallySpecies === 'all' ? 'is-on' : ''}
              onClick={() => {
                setRallySpecies('all')
                setRallyLabel('全部')
                setRallyPhase('aim')
              }}
            >
              全部
            </button>
            {rosterSpeciesOptions(rosterRef.current).map((row) => (
              <button
                key={row.key}
                type="button"
                className={rallySpecies === row.key ? 'is-on' : ''}
                onClick={() => {
                  setRallySpecies(row.key)
                  setRallyLabel(row.name)
                  setRallyPhase('aim')
                }}
              >
                {row.name}
              </button>
            ))}
            <button
              type="button"
              className="is-cancel"
              onClick={() => setRallyPhase(sim.current?.rally ? 'on' : '')}
            >
              取消
            </button>
          </div>
        </>,
        document.body
      ) : null}
      {mode === 'tank' && rallyPhase === 'aim' ? createPortal(
        <div className="ocean-rally-hud" style={{ top: Math.max(12, (uiTop || 0) + 8) }}>
          點魚缸指定集結處 · {rallyLabel}
        </div>,
        document.body
      ) : null}
      {mode === 'tank' && rallyPhase === 'on' ? createPortal(
        <div className="ocean-rally-hud is-actions" style={{ top: Math.max(12, (uiTop || 0) + 8) }}>
          <span>集結中 · {rallyLabel}</span>
          <button
            type="button"
            onClick={() => {
              if (sim.current) sim.current.rally = null
              setRallyPhase('')
            }}
          >
            解散
          </button>
        </div>,
        document.body
      ) : null}
      {mode === 'tank' && placeLight && !visiting ? createPortal(
        <div className="ocean-rally-hud is-actions" style={{ top: Math.max(12, (uiTop || 0) + 8) }}>
          <span>點魚缸頂部擺放魚缸燈</span>
          <button
            type="button"
            onClick={() => {
              endPlaceTankLight()
              setPlaceLight(false)
            }}
          >
            取消
          </button>
        </div>,
        document.body
      ) : null}
      {mode === 'tank' && !placeLight && tankLights.length ? createPortal(
        <div
          className="ocean-light-hud"
          style={{ top: Math.max(12, (uiTop || 0) + (rallyPhase ? 48 : 8)) }}
        >
          {tankLights.map((lamp, i) => (
            <button
              key={lamp.id}
              type="button"
              className={lamp.on ? 'is-on' : ''}
              disabled={visiting}
              onClick={() => {
                if (visiting) return
                const r = toggleTankLight(tankOwner, lamp.id)
                if (r.success) setTankLights(r.lights || [])
              }}
            >
              {tankLights.length > 1 ? `燈${i + 1} ` : '魚缸燈 '}
              {lamp.on ? '開' : '關'}
            </button>
          ))}
        </div>,
        document.body
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
      <div
        className={mode === 'tank' ? 'ocean-tank-shell' : undefined}
        style={
          mode === 'tank' && worldW
            ? { width: `${worldW}px` }
            : (pan || rotate) && worldW
              ? { width: `${worldW}px` }
              : undefined
        }
      >
      <div
        className="ocean-world"
        style={
          mode === 'tank' && worldW && worldH
            ? { width: `${worldW}px`, height: `${worldH}px` }
            : undefined
        }
      >
      {mode === 'tank' ? <TankScenery w={worldW} h={worldH} lights={tankLights} /> : null}
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

      <span ref={rallyMarkRef} className="ocean-rally-mark" />
      <div ref={foodLayerRef} className="ocean-float-layer" />
      <div ref={heartLayerRef} className="ocean-float-layer is-hearts" />

      {actors.map((fish) => (
        <div
          key={fish.id}
          ref={(el) => {
            const map = actorNodeRef.current
            if (!el) {
              map.delete(fish.id)
              return
            }
            map.set(fish.id, {
              el,
              face: el.querySelector('.ocean-fish-face'),
              sprite: el.querySelector('.ocean-betta')
            })
          }}
          role="button"
          tabIndex={-1}
          className={`ocean-fish-actor${visiting ? ' is-viewonly' : ''}`}
          style={{
            transform: `translate3d(${fish.x}px, ${fish.y}px, 0)`,
            width: fish.width ? `${fish.width}px` : undefined,
            height: fish.height ? `${fish.height}px` : undefined
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
            ref={tipRef}
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
      {mode === 'tank' ? <div className="ocean-tank-base" /> : null}
      </div>
    </div>,
    document.body
  )
}
