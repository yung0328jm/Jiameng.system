import { getDisplayNamesForAccount, findBoundAccountForDisplayName, getDropdownOptionsByCategory } from './dropdownStorage'
import { getUsers } from './storage'
import { maskForRecording } from './recordingModeMask'

/**
 * 顯示名稱規則：
 * 1) 優先使用「下拉選單綁定帳號的顯示名稱」
 * 2) 其次用 users.name
 * 3) 特殊：jiameng.system -> 系統
 * 4) 最後回傳帳號本身
 */
export const getDisplayNameForAccount = (account) => {
  const acc = String(account || '').trim()
  if (!acc) return '使用者'

  try {
    const boundNames = getDisplayNamesForAccount(acc) || []
    const preferred = boundNames.find((n) => n && n !== acc)
    if (preferred) return maskForRecording(preferred)
  } catch (_) {}

  try {
    const u = (getUsers() || []).find((x) => String(x?.account || '').trim() === acc)
    if (u?.name) return maskForRecording(u.name)
  } catch (_) {}

  if (acc === 'jiameng.system') return '系統'
  return maskForRecording(acc)
}

/** 將畫面上顯示的姓名／帳號字串解析為可發站內信的帳號；無法解析時回傳空字串 */
export const resolveDisplayNameToAccount = (displayName) => {
  const raw = String(displayName || '').trim()
  if (!raw) return ''
  try {
    const users = getUsers() || []
    const byAccount = users.find((u) => String(u?.account || '').trim() === raw)
    if (byAccount?.account) return String(byAccount.account).trim()

    const byName = users.find((u) => String(u?.name || '').trim() === raw)
    if (byName?.account) return String(byName.account).trim()

    // 下拉「綁定帳號」即為寄信對象，不再強制要求該字串須出現在 users 列表（避免同步落差導致對不到）
    const fromDropdown = findBoundAccountForDisplayName(raw)
    if (fromDropdown) return fromDropdown
  } catch (_) {}
  return ''
}

/** 申請人欄位：帳號對照下拉選單綁定人員顯示姓名；已是姓名則原樣回傳 */
export const resolveApplicantLabel = (applicant) => {
  const raw = String(applicant || '').trim()
  if (!raw) return ''
  try {
    const users = getUsers() || []
    const isKnownAccount = users.some((u) => String(u?.account || '').trim() === raw)
    if (isKnownAccount) return getDisplayNameForAccount(raw)
    const boundAcc = findBoundAccountForDisplayName(raw)
    if (boundAcc) return maskForRecording(raw)
    const acc = resolveDisplayNameToAccount(raw)
    if (acc) return maskForRecording(raw)
  } catch (_) {}
  const display = getDisplayNameForAccount(raw)
  return display && display !== '使用者' ? display : maskForRecording(raw)
}

/** 可選人員（參與人員＋負責人，排除離職）— 申請人／異動人員下拉用 */
export const getSelectablePersonnelNames = () => {
  const users = getUsers() || []
  const resignedAccounts = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.account || '').trim()).filter(Boolean)
  )
  const resignedNames = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.name || '').trim()).filter(Boolean)
  )

  const seen = new Set()
  const out = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t) || resignedNames.has(t)) return
    const acc = resolveDisplayNameToAccount(t)
    if (acc && resignedAccounts.has(acc)) return
    seen.add(t)
    out.push(t)
  }
  ;(getDropdownOptionsByCategory('participants') || []).forEach((opt) => add(opt?.value))
  ;(getDropdownOptionsByCategory('responsible_persons') || []).forEach((opt) => add(opt?.value))
  out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return out
}

