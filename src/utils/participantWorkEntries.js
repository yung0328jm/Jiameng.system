/**
 * 「工作/項目」（藍標）與「出差」（黃標）排程：依參與人員名單，每人各自填寫當日工作內容（participantWorkEntries）。
 * 績效僅對「該員」未填寫者扣分，與他人無關。
 */

/** 此日「之前」的藍標仍保留預排 workItems；當天起改以每人 participantWorkEntries 為主並清空預排。 */
export const BLUE_TAG_LEGACY_WORKITEMS_BEFORE = '2026-04-01'

export function scheduleDateYmdForCutoff(d) {
  const s = String(d ?? '').trim().replace(/\//g, '-').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** 排程日期早於上線日：藍標沿用預排工項模式（避免誤存清空 3 月舊資料）。 */
export function isBlueTagLegacyWorkScheduleByDate(dateVal, tag) {
  if (String(tag || 'blue').trim() !== 'blue') return false
  const ymd = scheduleDateYmdForCutoff(dateVal)
  return !!ymd && ymd < BLUE_TAG_LEGACY_WORKITEMS_BEFORE
}

export function mergeParticipantWorkEntries(participantsCsv, existing, options) {
  const scheduleId = String(options?.scheduleId ?? '').trim()
  const names = String(participantsCsv || '')
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean)
  const existingList = Array.isArray(existing) ? existing : []
  const byName = new Map(existingList.map((e) => [String(e.participantName || '').trim(), e]))
  return names.map((name) => {
    const prev = byName.get(name)
    const stableSynthetic =
      scheduleId && !prev?.id
        ? `pwe-${scheduleId}-${encodeURIComponent(name)}`
        : null
    return {
      id: prev?.id || stableSynthetic || `pwe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      participantName: name,
      workContent: prev?.workContent != null ? String(prev.workContent) : ''
    }
  })
}

/** 藍標工作排程儲存前：寫入合併後的參與人工作列；4/1 起清空預排 workItems（改以每人填寫為準）。 */
export function prepareBlueTagScheduleForSave(form) {
  if (String(form?.tag || 'blue') !== 'blue') return { ...form }
  const participantWorkEntries = mergeParticipantWorkEntries(form.participants, form.participantWorkEntries)
  if (isBlueTagLegacyWorkScheduleByDate(form?.date, form?.tag)) {
    return { ...form, participantWorkEntries }
  }
  const next = { ...form, participantWorkEntries }
  if (Array.isArray(next.segments) && next.segments.length > 0) {
    next.segments = next.segments.map((s) => ({ ...s, workItems: [] }))
  }
  next.workItems = []
  return next
}
