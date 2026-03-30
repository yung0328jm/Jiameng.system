import { getDisplayNamesForAccount, findBoundAccountForDisplayName } from './dropdownStorage'
import { getUsers } from './storage'

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
    if (preferred) return preferred
  } catch (_) {}

  try {
    const u = (getUsers() || []).find((x) => String(x?.account || '').trim() === acc)
    if (u?.name) return u.name
  } catch (_) {}

  if (acc === 'jiameng.system') return '系統'
  return acc
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

