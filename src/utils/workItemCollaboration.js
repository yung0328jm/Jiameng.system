// 工作項目協作（多負責人/每人實際數量）工具
//
// 目標：
// - 向下相容舊資料：{ responsiblePerson, actualQuantity }
// - 新格式：
//   - 協作模式：collabMode = 'shared'（共同完成/共享實際） | 'separate'（各自分工/各自實際）
//   - collaborators: [{ name, targetQuantity, actualQuantity }]
//   - sharedActualQuantity: '...'（shared 模式下的共同實際）
//   - lastAccumulatedBy: { [name]: isoString }
// - 提供「總實際/總目標」與「個人目標」等計算輔助

const toStr = (v) => String(v ?? '')
const trim = (v) => toStr(v).trim()
const toNum = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const normalizeWorkItem = (item) => {
  const base = (item && typeof item === 'object') ? { ...item } : {}

  // collaborators：去空白、去重
  const rawCollabs = Array.isArray(base.collaborators) ? base.collaborators : []
  let collabs = rawCollabs
    .map((c) => ({
      name: trim(c?.name),
      targetQuantity: c?.targetQuantity ?? '',
      actualQuantity: c?.actualQuantity ?? ''
    }))
    .filter((c) => !!c.name)

  if (collabs.length > 0) {
    const seen = new Set()
    const uniq = []
    collabs.forEach((c) => {
      if (seen.has(c.name)) return
      seen.add(c.name)
      uniq.push(c)
    })
    collabs = uniq
  }

  // 舊格式轉新格式
  if (collabs.length === 0) {
    const rp = trim(base.responsiblePerson)
    if (rp) {
      collabs = [{
        name: rp,
        targetQuantity: base.targetQuantity ?? '',
        actualQuantity: base.actualQuantity ?? ''
      }]
    }
  }

  if (collabs.length > 0) {
    base.collaborators = collabs
  }

  // collabMode：若未指定，嘗試推斷（避免 A100/B50 被誤判成「一起完成」）
  if (base.collabMode !== 'shared' && base.collabMode !== 'separate') {
    const isCollab = (Array.isArray(base.collaborators) ? base.collaborators.length : 0) > 1 || base.isCollaborative === true
    if (!isCollab) {
      base.collabMode = 'separate'
    } else {
      const directShared = toNum(base.sharedActualQuantity)
      if (directShared > 0) {
        base.collabMode = 'shared'
      } else {
        const nums = (Array.isArray(base.collaborators) ? base.collaborators : [])
          .map((c) => toNum(c?.actualQuantity))
          .filter((n) => n > 0)
        if (nums.length === 0) base.collabMode = 'separate'
        else {
          const allSame = nums.every((n) => n === nums[0])
          base.collabMode = allSame ? 'shared' : 'separate'
        }
      }
    }
  }

  // 轉換 lastAccumulatedAt -> lastAccumulatedBy（避免協作下「只記一次」卡死）
  const by = (base.lastAccumulatedBy && typeof base.lastAccumulatedBy === 'object')
    ? { ...base.lastAccumulatedBy }
    : {}
  const legacyAt = base.lastAccumulatedAt
  if (legacyAt) {
    const fallbackName = trim(base.responsiblePerson) || trim(base?.collaborators?.[0]?.name)
    if (fallbackName && !by[fallbackName]) by[fallbackName] = legacyAt
  }
  if (Object.keys(by).length > 0) base.lastAccumulatedBy = by

  // isCollaborative：若多人即視為協作
  if (base.isCollaborative == null) {
    base.isCollaborative = (Array.isArray(base.collaborators) ? base.collaborators.length : 0) > 1
  }

  return base
}

export const getWorkItemCollaborators = (item) => {
  const it = normalizeWorkItem(item)
  return Array.isArray(it.collaborators) ? it.collaborators : []
}

export const getWorkItemCollabMode = (item) => {
  const it = normalizeWorkItem(item)
  return (it.collabMode === 'separate') ? 'separate' : 'shared'
}

// shared 模式下：回傳共同實際（sharedActualQuantity > 若每人實際都相同 > 0）
export const getWorkItemSharedActual = (item) => {
  const it = normalizeWorkItem(item)
  const direct = toNum(it.sharedActualQuantity)
  if (direct > 0) return direct
  const collabs = getWorkItemCollaborators(it)
  if (collabs.length === 0) return 0
  const nums = collabs.map((c) => toNum(c?.actualQuantity)).filter((n) => n > 0)
  if (nums.length === 0) return 0
  const allSame = nums.every((n) => n === nums[0])
  return allSame ? nums[0] : 0
}

// 取得某位負責人的「有效實際」：
// - 非協作：item.actualQuantity
// - 協作 separate：collaborator.actualQuantity
// - 協作 shared：sharedActualQuantity（或推導）——不會因為每人都填 5 而被當成 10
export const getWorkItemActualForName = (item, name) => {
  const it = normalizeWorkItem(item)
  const nName = trim(name)
  if (!it?.isCollaborative) return toNum(it?.actualQuantity)
  const mode = getWorkItemCollabMode(it)
  if (mode === 'shared') return getWorkItemSharedActual(it)
  const collabs = getWorkItemCollaborators(it)
  const mine = collabs.find((c) => trim(c?.name) === nName)
  return toNum(mine?.actualQuantity)
}

// shared 模式下，避免「每人都拿到共同總數」造成績效膨脹：
// - 若全員有 per-person target：按 target 比例分配共同實際
// - 若未填 per-person target：平均分配共同實際
// - separate 模式：回到各自實際
export const getWorkItemActualForNameForPerformance = (item, name) => {
  const it = normalizeWorkItem(item)
  if (!it?.isCollaborative) return toNum(it?.actualQuantity)

  const mode = getWorkItemCollabMode(it)
  if (mode === 'separate') return getWorkItemActualForName(it, name)

  // shared：共同實際，每位協作者同分同扣
  return getWorkItemSharedActual(it)
}

// 績效用目標：
// - shared：使用「總目標」（item.targetQuantity），每位協作者同分同扣
// - separate：使用每人目標（向下相容仍可平均分攤）
export const getWorkItemTargetForNameForPerformance = (item, name) => {
  const it = normalizeWorkItem(item)
  if (!it?.isCollaborative) return toNum(it?.targetQuantity)
  const mode = getWorkItemCollabMode(it)
  if (mode === 'shared') return toNum(it?.targetQuantity)
  return getWorkItemTargetForName(it, name)
}

// 取得「總實際」：提供 UI 顯示用
// - shared：共同實際（不加總）
// - separate：各自實際加總
export const getWorkItemTotalActual = (item) => {
  const it = normalizeWorkItem(item)
  if (it?.isCollaborative && getWorkItemCollabMode(it) === 'shared') return getWorkItemSharedActual(it)
  return getWorkItemCollaborators(it).reduce((sum, c) => sum + toNum(c?.actualQuantity), 0)
}

export const getWorkItemTotalTarget = (item) => {
  const it = normalizeWorkItem(item)
  const collabs = getWorkItemCollaborators(it)
  const perPersonSum = collabs.reduce((sum, c) => sum + toNum(c?.targetQuantity), 0)
  if (it?.isCollaborative) {
    // 若已開始填「每人目標」，總目標就用加總
    if (perPersonSum > 0) return perPersonSum
    // 向下相容：舊資料仍可能只填 item.targetQuantity（代表總目標）
    return toNum(it?.targetQuantity)
  }
  return toNum(it?.targetQuantity)
}

// 取得某位負責人的目標（協作：每人各自填）
// 向下相容策略：
// - 若該人有填 targetQuantity：用它
// - 若協作且沒人填 per-person target：用 item.targetQuantity / 人數（舊版平均分攤）
// - 若非協作：用 item.targetQuantity
export const getWorkItemTargetForName = (item, name) => {
  const it = normalizeWorkItem(item)
  const nName = trim(name)
  const collabs = getWorkItemCollaborators(it)
  const mine = collabs.find((c) => trim(c?.name) === nName)
  const mineTarget = toNum(mine?.targetQuantity)
  if (mineTarget > 0) return mineTarget

  const itemTarget = toNum(it?.targetQuantity)
  if (!it?.isCollaborative) return itemTarget

  const anyPerPerson = collabs.some((c) => toNum(c?.targetQuantity) > 0)
  if (anyPerPerson) return 0

  const cnt = collabs.length
  if (itemTarget > 0 && cnt > 0) return itemTarget / cnt
  return 0
}

export const toCollaboratorsCsv = (item) => {
  return getWorkItemCollaborators(item).map((c) => c.name).join(', ')
}

export const parseCollaboratorsCsv = (csv) => {
  const parts = toStr(csv)
    .split(/[,\n]/g)
    .map((s) => trim(s))
    .filter(Boolean)
  const seen = new Set()
  const uniq = []
  parts.forEach((name) => {
    if (seen.has(name)) return
    seen.add(name)
    uniq.push({ name, targetQuantity: '', actualQuantity: '' })
  })
  return uniq
}

export const upsertCollaboratorActual = (item, name, actualQuantity) => {
  const it = normalizeWorkItem(item)
  const n = trim(name)
  if (!n) return it
  const next = getWorkItemCollaborators(it).map((c) => ({ ...c }))
  const idx = next.findIndex((c) => trim(c.name) === n)
  if (idx >= 0) next[idx].actualQuantity = actualQuantity
  else next.push({ name: n, targetQuantity: '', actualQuantity })
  return { ...it, collaborators: next, isCollaborative: (it?.isCollaborative || next.length > 1) }
}

export const upsertCollaboratorTarget = (item, name, targetQuantity) => {
  const it = normalizeWorkItem(item)
  const n = trim(name)
  if (!n) return it
  const next = getWorkItemCollaborators(it).map((c) => ({ ...c }))
  const idx = next.findIndex((c) => trim(c.name) === n)
  if (idx >= 0) next[idx].targetQuantity = targetQuantity
  else next.push({ name: n, targetQuantity, actualQuantity: '' })
  return { ...it, collaborators: next, isCollaborative: (it?.isCollaborative || next.length > 1) }
}

