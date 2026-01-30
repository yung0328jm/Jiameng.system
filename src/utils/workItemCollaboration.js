// 工作項目協作（多負責人/每人實際數量）工具
//
// 目標：
// - 向下相容舊資料：{ responsiblePerson, actualQuantity }
// - 新格式：{ collaborators: [{ name, targetQuantity, actualQuantity }], lastAccumulatedBy: { [name]: isoString } }
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

export const getWorkItemTotalActual = (item) => {
  return getWorkItemCollaborators(item).reduce((sum, c) => sum + toNum(c?.actualQuantity), 0)
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

