import { getDisplayNamesForAccount } from './dropdownStorage'
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
