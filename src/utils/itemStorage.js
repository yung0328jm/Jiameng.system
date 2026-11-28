// 道具系統存儲工具
import { syncKeyToSupabase } from './supabaseSync'
import { isSupabaseEnabled } from './supabaseClient'
const ITEM_STORAGE_KEY = 'jiameng_items'
const ITEM_BACKUP_KEY = 'jiameng_items_backup'

// 預定義道具類型
export const ITEM_TYPES = {
  DANMU: 'danmu', // 彈幕道具
  NAME_EFFECT: 'name_effect', // 名子特效道具
  MESSAGE_EFFECT: 'message_effect', // 發話特效道具
  TITLE: 'title', // 稱號道具
  FISH_SKIN: 'fish_skin', // 水族：兌換後進入我的寵物
  FISH_SLOT: 'fish_slot', // 已停用：魚隻擴充欄
  FISH_POTION: 'fish_potion',
  TANK_LIGHT: 'tank_light',
  TANK_DECOR: 'tank_decor'
}

export const SHOP_CAT_LIVE = '活體'
export const SHOP_CAT_PLANT = '植物類'
export const SHOP_CAT_DECOR = '擺件'
export const SHOP_CAT_LIGHT = '燈具'
const PLANT_LOOKS = new Set(['plant', 'fern', 'tape', 'moss'])

export function aquariumShopCategory(item) {
  const type = String(item?.type || '')
  if (type === ITEM_TYPES.FISH_SKIN) return SHOP_CAT_LIVE
  if (type === ITEM_TYPES.TANK_LIGHT) return SHOP_CAT_LIGHT
  if (type === ITEM_TYPES.TANK_DECOR) {
    return PLANT_LOOKS.has(String(item?.look || '')) ? SHOP_CAT_PLANT : SHOP_CAT_DECOR
  }
  return String(item?.category || '').trim()
}

export const FISH_POTION_HEAT_ID = 'fish_potion_heat'
export const FISH_POTION_AFFECTION_ID = 'fish_potion_affection'
export const FISH_POTION_BIRTH_ID = 'fish_potion_birth'
export const FISH_POTION_GROWTH_ID = 'fish_potion_growth'
export const FISH_POTION_GENDER_ID = 'fish_potion_gender'
export const FISH_POTION_WORM_ID = 'fish_potion_worm'

export const FISH_AROANA_ITEM_ID = 'fish_arowana'
export const FISH_AROANA_BLUE_ITEM_ID = 'fish_arowana_blue'
export const FISH_RAY_CROWN_ITEM_ID = 'fish_ray_crown'
export const FISH_RAY_ALBINO_ITEM_ID = 'fish_ray_albino'
export const FISH_ARAPAIMA_ITEM_ID = 'fish_arapaima'
export const FISH_BETTA_ITEM_ID = 'fish_betta'
export const FISH_GUPPY_ITEM_ID = 'fish_guppy'
export const FISH_GAR_ITEM_ID = 'fish_gar'
export const FISH_GENGHIS_ITEM_ID = 'fish_genghis'
export const FISH_KOI_PLATINUM_ITEM_ID = 'fish_koi_platinum'
export const FISH_REDTAIL_CAT_ITEM_ID = 'fish_redtail_cat'
export const FISH_TURTLE_SLIDER_ITEM_ID = 'fish_turtle_slider'
export const FISH_TURTLE_PIG_ITEM_ID = 'fish_turtle_pig'
export const FISH_TURTLE_MAP_ITEM_ID = 'fish_turtle_map'
export const FISH_SLOT_EXPAND_ITEM_ID = 'fish_slot_expand'
export const TANK_LIGHT_ITEM_ID = 'tank_light'
export const TANK_LIGHT_COLOR_ITEM_ID = 'tank_light_color'
export const TANK_LIGHT_BAR_ITEM_ID = 'tank_light_bar'
export const TANK_PLANT_ITEM_ID = 'tank_decor_plant'
export const TANK_WOOD_ITEM_ID = 'tank_decor_wood'
export const TANK_ROCK_ITEM_ID = 'tank_decor_rock'
export const TANK_CAVE_ITEM_ID = 'tank_decor_cave'
export const TANK_FERN_ITEM_ID = 'tank_decor_fern'
export const TANK_MOSS_ITEM_ID = 'tank_decor_moss'
export const TANK_LAVA_ITEM_ID = 'tank_decor_lava'
export const TANK_TAPE_ITEM_ID = 'tank_decor_tape'
export const TANK_DRAGON_ITEM_ID = 'tank_decor_dragon'
export const TANK_PIXIU_ITEM_ID = 'tank_decor_pixiu'
export const TANK_BUDDHA_ITEM_ID = 'tank_decor_buddha'
export const TANK_GUANYIN_ITEM_ID = 'tank_decor_guanyin'
export const TANK_CAISHEN_ITEM_ID = 'tank_decor_caishen'
export const TANK_TOAD_ITEM_ID = 'tank_decor_toad'

const AROWANA_SHOP_ITEM = {
  id: FISH_AROANA_ITEM_ID,
  name: '龍魚',
  type: 'fish_skin',
  fishKey: 'arowana',
  description: '兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐉',
  image: '/images/arowana-a.png',
  price: 40,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const AROWANA_BLUE_SHOP_ITEM = {
  id: FISH_AROANA_BLUE_ITEM_ID,
  name: '藍底過背',
  type: 'fish_skin',
  fishKey: 'arowana_blue',
  description: '藍底過背金龍。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐉',
  image: '/images/arowana-blue-b.png',
  price: 45,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const RAY_CROWN_SHOP_ITEM = {
  id: FISH_RAY_CROWN_ITEM_ID,
  name: '皇冠魟',
  type: 'fish_skin',
  fishKey: 'ray_crown',
  description: '皇冠魟。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/ray-crown-a.png',
  price: 35,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const RAY_ALBINO_SHOP_ITEM = {
  id: FISH_RAY_ALBINO_ITEM_ID,
  name: '黃冠白子魟',
  type: 'fish_skin',
  fishKey: 'ray_albino',
  description: '黃冠白子魟。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/ray-albino-a.png',
  price: 45,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const ARAPAIMA_SHOP_ITEM = {
  id: FISH_ARAPAIMA_ITEM_ID,
  name: '巨骨蛇魚',
  type: 'fish_skin',
  fishKey: 'arapaima',
  description: '巨骨蛇魚，體型比一般魚種更大。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/arapaima-a.png',
  price: 70,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const BETTA_SHOP_ITEM = {
  id: FISH_BETTA_ITEM_ID,
  name: '鬥魚',
  type: 'fish_skin',
  fishKey: 'betta',
  description: '暹羅鬥魚。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/betta-a.png',
  price: 10,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GUPPY_SHOP_ITEM = {
  id: FISH_GUPPY_ITEM_ID,
  name: '孔雀魚',
  type: 'fish_skin',
  fishKey: 'guppy',
  description: '小型孔雀魚。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/guppy-a.png',
  price: 6,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GAR_SHOP_ITEM = {
  id: FISH_GAR_ITEM_ID,
  name: '雀鱔',
  type: 'fish_skin',
  fishKey: 'gar',
  description: '顎雀鱔／雀鱔，長體型。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/gar-a.png',
  price: 40,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const GENGHIS_SHOP_ITEM = {
  id: FISH_GENGHIS_ITEM_ID,
  name: '成吉思汗',
  type: 'fish_skin',
  fishKey: 'genghis',
  description: '成吉思汗（巨鯊鯰）。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/genghis-a.png',
  price: 30,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const KOI_PLATINUM_SHOP_ITEM = {
  id: FISH_KOI_PLATINUM_ITEM_ID,
  name: '白金蝴蝶龍鯉',
  type: 'fish_skin',
  fishKey: 'koi_platinum',
  description: '白金蝴蝶龍鯉（長鰭錦鯉）。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/koi-platinum-a.png',
  price: 25,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const REDTAIL_CAT_SHOP_ITEM = {
  id: FISH_REDTAIL_CAT_ITEM_ID,
  name: '招財貓',
  type: 'fish_skin',
  fishKey: 'redtail_cat',
  description: '紅尾招財貓，體型較大。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐟',
  image: '/images/redtail-cat-a.png',
  price: 30,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_SLIDER_SHOP_ITEM = {
  id: FISH_TURTLE_SLIDER_ITEM_ID,
  name: '巴西龜',
  type: 'fish_skin',
  fishKey: 'turtle_slider',
  description: '巴西彩龜。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐢',
  image: '/images/turtle-slider-a.png',
  price: 15,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_PIG_SHOP_ITEM = {
  id: FISH_TURTLE_PIG_ITEM_ID,
  name: '豬鼻龜',
  type: 'fish_skin',
  fishKey: 'turtle_pig',
  description: '豬鼻龜。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐢',
  image: '/images/turtle-pig-a.png',
  price: 60,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const TURTLE_MAP_SHOP_ITEM = {
  id: FISH_TURTLE_MAP_ITEM_ID,
  name: '地圖龜',
  type: 'fish_skin',
  fishKey: 'turtle_map',
  description: '地圖龜。兌換後直接進入我的寵物，再點「放入魚缸」才會去游。',
  icon: '🐢',
  image: '/images/turtle-map-a.png',
  price: 18,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const FISH_SLOT_SHOP_ITEM = {
  id: FISH_SLOT_EXPAND_ITEM_ID,
  name: '魚隻擴充欄',
  type: 'fish_slot',
  description: '購買後請到背包自行套用。每套用 1 個，畫面多游 1 隻魚（預設 2 隻，最多 50 隻）。',
  icon: '➕',
  price: 68,
  category: '特殊道具',
  createdAt: new Date().toISOString()
}

const FISH_POTION_HEAT_ITEM = {
  id: FISH_POTION_HEAT_ID,
  name: '發情藥水',
  type: 'fish_potion',
  potion: 'heat',
  description: '給自己的母魚使用，立刻結束產後冷卻，可再與同缸公魚交配。請點畫面上自己的母魚。',
  icon: '💗',
  price: 12,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_POTION_AFFECTION_ITEM = {
  id: FISH_POTION_AFFECTION_ID,
  name: '好感藥水',
  type: 'fish_potion',
  potion: 'affection',
  description: '給已在繁育系統配對的母魚使用，立刻懷孕，不必等 7 日週期。請點自己的母魚。',
  icon: '💞',
  price: 18,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_POTION_BIRTH_ITEM = {
  id: FISH_POTION_BIRTH_ID,
  name: '催生藥水',
  type: 'fish_potion',
  potion: 'birth',
  description: '給懷孕中的母魚使用，立刻產下魚苗，不必等懷孕日數。後代混父母花色與體型。魚苗直接進入我的寵物。',
  icon: '🫧',
  price: 22,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const FISH_POTION_GROWTH_ITEM = {
  id: FISH_POTION_GROWTH_ID,
  name: '魚隻成長藥水',
  type: 'fish_potion',
  potion: 'growth',
  description: '給自己的魚使用，立刻增加 20 次餵食成長（成魚需 45 次，每天最多 5 次約 9 天）。已成魚無效。公母都能用。僅管理員可兌換。',
  icon: '🌿',
  price: 16,
  category: '水族藥水',
  isHidden: true,
  createdAt: new Date().toISOString()
}

const FISH_POTION_GENDER_ITEM = {
  id: FISH_POTION_GENDER_ID,
  name: '變性藥水',
  type: 'fish_potion',
  potion: 'gender',
  description: '給自己的魚使用，公轉母、母轉公。懷孕中不可用。僅管理員可兌換。',
  icon: '🔮',
  price: 28,
  category: '水族藥水',
  isHidden: true,
  createdAt: new Date().toISOString()
}

const FISH_POTION_WORM_ITEM = {
  id: FISH_POTION_WORM_ID,
  name: '紅蟲',
  type: 'fish_potion',
  potion: 'worm',
  description: '給自己的魚使用，立刻增加 2 次餵食。每隻魚每天最多吃 2 次。公母都能用。',
  icon: '🪱',
  price: 4,
  category: '水族藥水',
  createdAt: new Date().toISOString()
}

const TANK_DECOR_DESC = '到我的魚缸點「編輯」即可擺放、換位置或收回背包。'

const TANK_PLANT_SHOP_ITEM = {
  id: TANK_PLANT_ITEM_ID,
  name: '皇冠草',
  type: 'tank_decor',
  look: 'plant',
  description: TANK_DECOR_DESC,
  icon: '🌿',
  price: 12,
  category: SHOP_CAT_PLANT,
  createdAt: new Date().toISOString()
}

const TANK_WOOD_SHOP_ITEM = {
  id: TANK_WOOD_ITEM_ID,
  name: '沉木',
  type: 'tank_decor',
  look: 'wood',
  description: TANK_DECOR_DESC,
  icon: '🪵',
  price: 16,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_ROCK_SHOP_ITEM = {
  id: TANK_ROCK_ITEM_ID,
  name: '青龍石',
  type: 'tank_decor',
  look: 'rock',
  description: TANK_DECOR_DESC,
  icon: '🪨',
  price: 14,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_CAVE_SHOP_ITEM = {
  id: TANK_CAVE_ITEM_ID,
  name: '陶穴',
  type: 'tank_decor',
  look: 'cave',
  description: TANK_DECOR_DESC,
  icon: '🛖',
  price: 15,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_FERN_SHOP_ITEM = {
  id: TANK_FERN_ITEM_ID,
  name: '鐵皇冠',
  type: 'tank_decor',
  look: 'fern',
  description: TANK_DECOR_DESC,
  icon: '🌱',
  price: 13,
  category: SHOP_CAT_PLANT,
  createdAt: new Date().toISOString()
}

const TANK_MOSS_SHOP_ITEM = {
  id: TANK_MOSS_ITEM_ID,
  name: '莫斯沉木',
  type: 'tank_decor',
  look: 'moss',
  description: TANK_DECOR_DESC,
  icon: '🍃',
  price: 14,
  category: SHOP_CAT_PLANT,
  createdAt: new Date().toISOString()
}

const TANK_LAVA_SHOP_ITEM = {
  id: TANK_LAVA_ITEM_ID,
  name: '熔岩石',
  type: 'tank_decor',
  look: 'lava',
  description: TANK_DECOR_DESC,
  icon: '🌋',
  price: 13,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_TAPE_SHOP_ITEM = {
  id: TANK_TAPE_ITEM_ID,
  name: '苦草',
  type: 'tank_decor',
  look: 'tape',
  description: TANK_DECOR_DESC,
  icon: '🌾',
  price: 11,
  category: SHOP_CAT_PLANT,
  createdAt: new Date().toISOString()
}

const TANK_DRAGON_SHOP_ITEM = {
  id: TANK_DRAGON_ITEM_ID,
  name: '金龍擺件',
  type: 'tank_decor',
  look: 'dragon',
  description: TANK_DECOR_DESC,
  icon: '🐉',
  price: 22,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_PIXIU_SHOP_ITEM = {
  id: TANK_PIXIU_ITEM_ID,
  name: '貔貅',
  type: 'tank_decor',
  look: 'pixiu',
  description: TANK_DECOR_DESC,
  icon: '🦁',
  price: 20,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_BUDDHA_SHOP_ITEM = {
  id: TANK_BUDDHA_ITEM_ID,
  name: '佛像',
  type: 'tank_decor',
  look: 'buddha',
  description: TANK_DECOR_DESC,
  icon: '🪷',
  price: 18,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_GUANYIN_SHOP_ITEM = {
  id: TANK_GUANYIN_ITEM_ID,
  name: '觀音',
  type: 'tank_decor',
  look: 'guanyin',
  description: TANK_DECOR_DESC,
  icon: '🙏',
  price: 18,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_CAISHEN_SHOP_ITEM = {
  id: TANK_CAISHEN_ITEM_ID,
  name: '財神',
  type: 'tank_decor',
  look: 'caishen',
  description: TANK_DECOR_DESC,
  icon: '🧧',
  price: 19,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_TOAD_SHOP_ITEM = {
  id: TANK_TOAD_ITEM_ID,
  name: '金蟾',
  type: 'tank_decor',
  look: 'toad',
  description: TANK_DECOR_DESC,
  icon: '🐸',
  price: 16,
  category: '擺件',
  createdAt: new Date().toISOString()
}

const TANK_SCAPE_SHOP_ITEMS = [
  { id: 'tank_decor_ohko', name: '龍王石', look: 'ohko', icon: '🪨', price: 14 },
  { id: 'tank_decor_ryuoh', name: '黑山石', look: 'ryuoh', icon: '⛰️', price: 15 },
  { id: 'tank_decor_strata', name: '千層石', look: 'strata', icon: '🧱', price: 15 },
  { id: 'tank_decor_petrified', name: '木化石', look: 'petrified', icon: '🪵', price: 16 },
  { id: 'tank_decor_river', name: '溪流石', look: 'river', icon: '⚪', price: 12 },
  { id: 'tank_decor_elephant', name: '象皮石', look: 'elephant', icon: '🪨', price: 15 },
  { id: 'tank_decor_taihu', name: '太湖石', look: 'taihu', icon: '🕳️', price: 16 },
  { id: 'tank_decor_blacklava', name: '黑熔岩', look: 'blacklava', icon: '🖤', price: 13 },
  { id: 'tank_decor_spider', name: '杜鵑根', look: 'spider', icon: '🌿', price: 17 },
  { id: 'tank_decor_redmoor', name: '紅木根', look: 'redmoor', icon: '🪵', price: 17 },
  { id: 'tank_decor_mangrove', name: '紅樹沉木', look: 'mangrove', icon: '🌳', price: 16 },
  { id: 'tank_decor_cholla', name: '枝桠沉木', look: 'cholla', icon: '🪵', price: 15 },
  { id: 'tank_decor_pagoda', name: '寶塔', look: 'pagoda', icon: '🏯', price: 18 },
  { id: 'tank_decor_bridge', name: '拱橋', look: 'bridge', icon: '🌉', price: 16 },
  { id: 'tank_decor_pavilion', name: '涼亭', look: 'pavilion', icon: '🏛️', price: 17 },
  { id: 'tank_decor_lantern', name: '石燈籠', look: 'lantern', icon: '🏮', price: 15 },
  { id: 'tank_decor_hut', name: '茅屋', look: 'hut', icon: '🏠', price: 16 },
  { id: 'tank_decor_boat', name: '小漁船', look: 'boat', icon: '🛶', price: 14 },
  { id: 'tank_decor_mountain', name: '假山', look: 'mountain', icon: '🏔️', price: 18 },
  { id: 'tank_decor_waterfall', name: '小瀑布', look: 'waterfall', icon: '💧', price: 17 }
].map((row) => ({
  ...row,
  type: 'tank_decor',
  description: TANK_DECOR_DESC,
  category: '擺件',
  createdAt: new Date().toISOString()
}))

const TANK_LIGHT_DESC = '到我的魚缸點「編輯」即可擺在缸頂。每盞有獨立開關。'

const TANK_LIGHT_SHOP_ITEM = {
  id: TANK_LIGHT_ITEM_ID,
  name: '桶燈',
  type: 'tank_light',
  look: 'barrel',
  description: TANK_LIGHT_DESC,
  icon: '💡',
  price: 18,
  category: SHOP_CAT_LIGHT,
  createdAt: new Date().toISOString()
}

const TANK_LIGHT_COLOR_SHOP_ITEM = {
  id: TANK_LIGHT_COLOR_ITEM_ID,
  name: '調色桶燈',
  type: 'tank_light',
  look: 'color',
  description: '白光、藍光、紅光可切換。每盞有獨立開關。',
  icon: '🔵',
  price: 24,
  category: SHOP_CAT_LIGHT,
  createdAt: new Date().toISOString()
}

const TANK_LIGHT_BAR_SHOP_ITEM = {
  id: TANK_LIGHT_BAR_ITEM_ID,
  name: '排燈',
  type: 'tank_light',
  look: 'bar',
  description: '長條燈，約兩盞可罩滿整缸長度。每盞有獨立開關。',
  icon: '▬',
  price: 28,
  category: SHOP_CAT_LIGHT,
  createdAt: new Date().toISOString()
}

const FISH_PRICE_SEED = 20261127
const FISH_SHOP_CATALOG = {
  [FISH_AROANA_ITEM_ID]: AROWANA_SHOP_ITEM,
  [FISH_AROANA_BLUE_ITEM_ID]: AROWANA_BLUE_SHOP_ITEM,
  [FISH_RAY_CROWN_ITEM_ID]: RAY_CROWN_SHOP_ITEM,
  [FISH_RAY_ALBINO_ITEM_ID]: RAY_ALBINO_SHOP_ITEM,
  [FISH_ARAPAIMA_ITEM_ID]: ARAPAIMA_SHOP_ITEM,
  [FISH_BETTA_ITEM_ID]: BETTA_SHOP_ITEM,
  [FISH_GUPPY_ITEM_ID]: GUPPY_SHOP_ITEM,
  [FISH_GAR_ITEM_ID]: GAR_SHOP_ITEM,
  [FISH_GENGHIS_ITEM_ID]: GENGHIS_SHOP_ITEM,
  [FISH_KOI_PLATINUM_ITEM_ID]: KOI_PLATINUM_SHOP_ITEM,
  [FISH_REDTAIL_CAT_ITEM_ID]: REDTAIL_CAT_SHOP_ITEM,
  [FISH_TURTLE_SLIDER_ITEM_ID]: TURTLE_SLIDER_SHOP_ITEM,
  [FISH_TURTLE_PIG_ITEM_ID]: TURTLE_PIG_SHOP_ITEM,
  [FISH_TURTLE_MAP_ITEM_ID]: TURTLE_MAP_SHOP_ITEM
}

const RETIRED_ITEM_IDS = new Set(['fish_duckbill', FISH_SLOT_EXPAND_ITEM_ID])

function seedFishSkinItems(items, { allowCloudWrite } = { allowCloudWrite: true }) {
  const raw = Array.isArray(items) ? items : []
  const list = raw.filter((it) => !RETIRED_ITEM_IDS.has(String(it?.id || '')))
  const pruned = list.length !== raw.length
  const looksPlaceholder = list.length <= 1 && (!list[0] || String(list[0].id) === 'danmu_item')
  if (isSupabaseEnabled() && looksPlaceholder) return list
  const extras = []
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_ITEM_ID)) extras.push({ ...AROWANA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_AROANA_BLUE_ITEM_ID)) extras.push({ ...AROWANA_BLUE_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_CROWN_ITEM_ID)) extras.push({ ...RAY_CROWN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_RAY_ALBINO_ITEM_ID)) extras.push({ ...RAY_ALBINO_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_ARAPAIMA_ITEM_ID)) extras.push({ ...ARAPAIMA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_BETTA_ITEM_ID)) extras.push({ ...BETTA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GUPPY_ITEM_ID)) extras.push({ ...GUPPY_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GAR_ITEM_ID)) extras.push({ ...GAR_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_GENGHIS_ITEM_ID)) extras.push({ ...GENGHIS_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_KOI_PLATINUM_ITEM_ID)) extras.push({ ...KOI_PLATINUM_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_REDTAIL_CAT_ITEM_ID)) extras.push({ ...REDTAIL_CAT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_SLIDER_ITEM_ID)) extras.push({ ...TURTLE_SLIDER_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_PIG_ITEM_ID)) extras.push({ ...TURTLE_PIG_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_TURTLE_MAP_ITEM_ID)) extras.push({ ...TURTLE_MAP_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_HEAT_ID)) extras.push({ ...FISH_POTION_HEAT_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_AFFECTION_ID)) extras.push({ ...FISH_POTION_AFFECTION_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_BIRTH_ID)) extras.push({ ...FISH_POTION_BIRTH_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_GROWTH_ID)) extras.push({ ...FISH_POTION_GROWTH_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_GENDER_ID)) extras.push({ ...FISH_POTION_GENDER_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === FISH_POTION_WORM_ID)) extras.push({ ...FISH_POTION_WORM_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_LIGHT_ITEM_ID)) extras.push({ ...TANK_LIGHT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_LIGHT_COLOR_ITEM_ID)) extras.push({ ...TANK_LIGHT_COLOR_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_LIGHT_BAR_ITEM_ID)) extras.push({ ...TANK_LIGHT_BAR_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_PLANT_ITEM_ID)) extras.push({ ...TANK_PLANT_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_WOOD_ITEM_ID)) extras.push({ ...TANK_WOOD_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_ROCK_ITEM_ID)) extras.push({ ...TANK_ROCK_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_CAVE_ITEM_ID)) extras.push({ ...TANK_CAVE_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_FERN_ITEM_ID)) extras.push({ ...TANK_FERN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_MOSS_ITEM_ID)) extras.push({ ...TANK_MOSS_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_LAVA_ITEM_ID)) extras.push({ ...TANK_LAVA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_TAPE_ITEM_ID)) extras.push({ ...TANK_TAPE_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_DRAGON_ITEM_ID)) extras.push({ ...TANK_DRAGON_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_PIXIU_ITEM_ID)) extras.push({ ...TANK_PIXIU_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_BUDDHA_ITEM_ID)) extras.push({ ...TANK_BUDDHA_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_GUANYIN_ITEM_ID)) extras.push({ ...TANK_GUANYIN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_CAISHEN_ITEM_ID)) extras.push({ ...TANK_CAISHEN_SHOP_ITEM, createdAt: new Date().toISOString() })
  if (!list.some((it) => String(it?.id || '') === TANK_TOAD_ITEM_ID)) extras.push({ ...TANK_TOAD_SHOP_ITEM, createdAt: new Date().toISOString() })
  TANK_SCAPE_SHOP_ITEMS.forEach((item) => {
    if (!list.some((it) => String(it?.id || '') === item.id)) extras.push({ ...item, createdAt: new Date().toISOString() })
  })
  const birthWanted = FISH_POTION_BIRTH_ITEM.description
  const affectionWanted = FISH_POTION_AFFECTION_ITEM.description
  const growthWanted = FISH_POTION_GROWTH_ITEM.description
  const genderWanted = FISH_POTION_GENDER_ITEM.description
  const wormWanted = FISH_POTION_WORM_ITEM.description
  const patched = list.map((it) => {
    const id = String(it?.id || '')
    let next = it
    if (id === FISH_POTION_BIRTH_ID && String(it?.description || '') !== birthWanted) {
      next = { ...next, description: birthWanted }
    }
    if (id === FISH_POTION_AFFECTION_ID && String(it?.description || '') !== affectionWanted) {
      next = { ...next, description: affectionWanted }
    }
    if (id === FISH_POTION_GROWTH_ID && String(it?.description || '') !== growthWanted) {
      next = { ...next, description: growthWanted }
    }
    if (id === FISH_POTION_GENDER_ID && String(it?.description || '') !== genderWanted) {
      next = { ...next, description: genderWanted }
    }
    if (id === FISH_POTION_WORM_ID && String(it?.description || '') !== wormWanted) {
      next = { ...next, description: wormWanted, name: FISH_POTION_WORM_ITEM.name, price: FISH_POTION_WORM_ITEM.price }
    }
    if (id === TANK_PLANT_ITEM_ID && (it?.name !== TANK_PLANT_SHOP_ITEM.name || it?.look !== 'plant')) {
      next = { ...next, name: TANK_PLANT_SHOP_ITEM.name, look: 'plant', description: TANK_DECOR_DESC, icon: TANK_PLANT_SHOP_ITEM.icon }
    }
    if (id === TANK_LIGHT_ITEM_ID && (it?.name !== TANK_LIGHT_SHOP_ITEM.name || it?.look !== 'barrel')) {
      next = { ...next, name: TANK_LIGHT_SHOP_ITEM.name, look: 'barrel', description: TANK_LIGHT_DESC, icon: TANK_LIGHT_SHOP_ITEM.icon }
    }
    const aquaCat = aquariumShopCategory(next)
    if (aquaCat && String(next?.category || '') !== aquaCat && (next?.type === ITEM_TYPES.FISH_SKIN || next?.type === ITEM_TYPES.TANK_LIGHT || next?.type === ITEM_TYPES.TANK_DECOR)) {
      next = { ...next, category: aquaCat }
    }
    if ((id === FISH_POTION_GROWTH_ID || id === FISH_POTION_GENDER_ID) && !next.isHidden) {
      next = { ...next, isHidden: true }
    }
    const catalog = FISH_SHOP_CATALOG[id]
    if (catalog) {
      if (Number(it?.priceSeedVer) !== FISH_PRICE_SEED) {
        next = { ...next, price: catalog.price, priceSeedVer: FISH_PRICE_SEED }
      }
      if (catalog.description && String(it?.description || '') !== catalog.description) {
        next = { ...next, description: catalog.description }
      }
    }
    return next
  })
  const descChanged = patched.some((it, i) => it !== list[i])
  if (extras.length === 0 && !pruned && !descChanged) return list
  const next = [...patched, ...extras]
  try {
    const val = JSON.stringify(next)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    if (allowCloudWrite) syncKeyToSupabase(ITEM_STORAGE_KEY, val)
  } catch (_) {}
  return next
}

// 獲取所有道具定義（保證回傳陣列）
export const getItems = () => {
  try {
    const data = localStorage.getItem(ITEM_STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      return seedFishSkinItems(Array.isArray(parsed) ? parsed : [])
    }
    // 初始化默認道具
    const defaultItems = [
      {
        id: 'danmu_item',
        name: '彈幕道具',
        type: ITEM_TYPES.DANMU,
        description: '使用後可以發送彈幕',
        icon: '💬',
        price: 10, // 毓承幣價格
        createdAt: new Date().toISOString()
      }
    ]
    const val = JSON.stringify(defaultItems)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    // Supabase 模式下，避免在「尚未完成雲端同步」前用預設值覆蓋雲端資料
    // 只有在非 Supabase 模式才主動把預設道具寫回雲端
    if (!isSupabaseEnabled()) {
      syncKeyToSupabase(ITEM_STORAGE_KEY, val)
      return seedFishSkinItems(defaultItems, { allowCloudWrite: true })
    }
    return defaultItems
  } catch (error) {
    console.error('Error getting items:', error)
    return []
  }
}

// 獲取特定道具
export const getItem = (itemId) => {
  try {
    const items = getItems()
    return items.find(item => item.id === itemId) || null
  } catch (error) {
    console.error('Error getting item:', error)
    return null
  }
}

const backupItemsSnapshot = (items) => {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      items: Array.isArray(items) ? items : []
    }
    const val = JSON.stringify(payload)
    localStorage.setItem(ITEM_BACKUP_KEY, val)
    syncKeyToSupabase(ITEM_BACKUP_KEY, val)
  } catch (e) {
    console.warn('backupItemsSnapshot failed', e)
  }
}

// 創建新道具（管理員功能）
export const createItem = (itemData) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const desiredId = String(itemData?.id || '').trim()
    if (desiredId && items.some((it) => String(it?.id || '').trim() === desiredId)) {
      return { success: false, message: `道具 ID 已存在：${desiredId}` }
    }
    const newItem = {
      id: desiredId || `item_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      ...itemData,
      createdAt: itemData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    items.push(newItem)
    const val = JSON.stringify(items)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, item: newItem }
  } catch (error) {
    console.error('Error creating item:', error)
    return { success: false, message: '創建道具失敗' }
  }
}

// 更新道具（管理員功能）
export const updateItem = (itemId, updates) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const itemIndex = items.findIndex(item => item.id === itemId)
    if (itemIndex === -1) {
      return { success: false, message: '道具不存在' }
    }
    items[itemIndex] = { ...items[itemIndex], ...updates, updatedAt: new Date().toISOString() }
    const val = JSON.stringify(items)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, item: items[itemIndex] }
  } catch (error) {
    console.error('Error updating item:', error)
    return { success: false, message: '更新道具失敗' }
  }
}

// 刪除道具（管理員功能）
export const deleteItem = (itemId) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const items = Array.isArray(prev) ? [...prev] : []
    const filtered = items.filter(item => item.id !== itemId)
    const val = JSON.stringify(filtered)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true }
  } catch (error) {
    console.error('Error deleting item:', error)
    return { success: false, message: '刪除道具失敗' }
  }
}

/** 批次覆寫整份道具（會先做備份，再同步雲端） */
export const setItems = (items) => {
  try {
    const prev = getItems()
    backupItemsSnapshot(prev)
    const next = Array.isArray(items) ? items : []
    const val = JSON.stringify(next)
    localStorage.setItem(ITEM_STORAGE_KEY, val)
    syncKeyToSupabase(ITEM_STORAGE_KEY, val)
    return { success: true, count: next.length }
  } catch (e) {
    console.error('setItems failed', e)
    return { success: false, message: '更新道具清單失敗' }
  }
}
