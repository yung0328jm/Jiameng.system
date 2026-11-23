import { getCurrentUser } from './authStorage'
import { getEquippedEffects } from './effectStorage'
import { getUserInventory } from './inventoryStorage'
import { getItem, ITEM_TYPES } from './itemStorage'

export const FISH_PACKS = {
  betta: {
    key: 'betta',
    wide: false,
    a: '/images/betta-a.png',
    b: '/images/betta-b.png'
  },
  arowana: {
    key: 'arowana',
    wide: true,
    a: '/images/arowana-a.png',
    b: '/images/arowana-b.png'
  }
}

export function getEquippedAmbientFishPack(username = getCurrentUser()) {
  const fallback = FISH_PACKS.betta
  if (!username) return fallback
  const equipped = getEquippedEffects(username)
  const itemId = equipped?.fish
  if (!itemId) return fallback
  const owned = getUserInventory(username).some(
    (row) => String(row?.itemId || '') === String(itemId) && (Number(row?.quantity) || 0) > 0
  )
  if (!owned) return fallback
  const item = getItem(itemId)
  if (!item || item.type !== ITEM_TYPES.FISH_SKIN) return fallback
  return FISH_PACKS[item.fishKey] || fallback
}
