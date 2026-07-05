import { isRecordingModeEnabled } from './recordingModeStorage'
import { getUsers } from './storage'
import { getDropdownOptionsByCategory } from './dropdownStorage'
import { getContractorRegistrations } from './contractorRegistrationStorage'
import { getProjects } from './projectStorage'
import { getSchedules } from './scheduleStorage'
import { LEAVE_APPLICATION_KEY } from './leaveApplicationMerge'
import { getAllPayRatePersonNames, getAllBonuses } from './paySlipStorage'
import { MONTHLY_LOCATION_OVERRIDES_KEY } from './monthlyLocationReportStorage'

const INDEX_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const SKIP_EXACT = new Set([
  '系統', '請假', '使用者', 'admin', 'jiameng.system', '未命名', '—', '-'
])

let cachedPairs = null

export const invalidateRecordingMaskCache = () => {
  cachedPairs = null
}

const indexToLabel = (i) => {
  let n = i
  let s = ''
  do {
    s = INDEX_LETTERS[n % 26] + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

const addEntry = (bucket, raw) => {
  const t = String(raw || '').trim()
  if (!t || t.length < 2 || SKIP_EXACT.has(t)) return
  if (!bucket.has(t)) bucket.set(t, bucket.size)
}

const collectDropdown = (bucket, categories) => {
  categories.forEach((cat) => {
    ;(getDropdownOptionsByCategory(cat) || []).forEach((opt) => addEntry(bucket, opt?.value))
  })
}

const collectFromJsonKey = (bucket, key, walker) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw)
    walker(parsed, bucket)
  } catch (_) {}
}

const buildMaskPairs = () => {
  const person = new Map()
  const site = new Map()
  const contractor = new Map()
  const worker = new Map()
  const account = new Map()
  const project = new Map()
  const vehicle = new Map()

  ;(getUsers() || []).forEach((u) => {
    addEntry(person, u?.name)
    const acc = String(u?.account || '').trim()
    if (acc && acc !== 'admin' && acc !== 'jiameng.system') addEntry(account, acc)
  })

  collectDropdown(person, ['participants', 'responsible_persons'])
  collectDropdown(site, ['work_report_sites'])
  collectDropdown(vehicle, ['vehicles'])
  collectDropdown(contractor, ['work_report_contractors'])

  ;(getContractorRegistrations() || []).forEach((r) => {
    addEntry(contractor, r?.name)
    addEntry(person, r?.contactPerson)
    ;(r?.personnel || []).forEach((p) => addEntry(worker, p?.name))
  })

  ;(getProjects() || []).forEach((p) => {
    addEntry(project, p?.name)
    addEntry(site, p?.siteName)
  })

  ;(getSchedules() || []).forEach((s) => {
    addEntry(site, s?.siteName)
    const segments = Array.isArray(s?.segments) ? s.segments : []
    segments.forEach((seg) => {
      addEntry(site, seg?.siteName)
      ;(seg?.workItems || []).forEach((wi) => {
        ;(wi?.collaborators || []).forEach((c) => addEntry(person, c?.name))
        addEntry(person, wi?.responsiblePerson)
        addEntry(person, wi?.participant)
      })
    })
  })

  collectFromJsonKey(person, LEAVE_APPLICATION_KEY, (list) => {
    if (!Array.isArray(list)) return
    list.forEach((r) => {
      addEntry(person, r?.userName)
      addEntry(account, r?.userId)
      addEntry(account, r?.submittedBy)
      addEntry(account, r?.approvedBy)
    })
  })

  collectFromJsonKey(site, 'jiameng_work_reports', (list) => {
    if (!Array.isArray(list)) return
    list.forEach((r) => {
      addEntry(site, r?.siteName)
      addEntry(person, r?.personName)
      ;(r?.laborNames || []).forEach((n) => addEntry(person, n))
    })
  })

  collectFromJsonKey(worker, 'jiameng_contractor_work_logs', (list) => {
    if (!Array.isArray(list)) return
    list.forEach((r) => {
      addEntry(worker, r?.personName)
      addEntry(contractor, r?.companyName)
      addEntry(site, r?.siteName)
    })
  })

  getAllPayRatePersonNames().forEach((name) => addEntry(person, name))
  Object.values(getAllBonuses() || {}).forEach((monthMap) => {
    if (monthMap && typeof monthMap === 'object') {
      Object.keys(monthMap).forEach((name) => addEntry(person, name))
    }
  })

  collectFromJsonKey(person, MONTHLY_LOCATION_OVERRIDES_KEY, (all) => {
    if (!all || typeof all !== 'object') return
    Object.values(all).forEach((monthData) => {
      if (!monthData || typeof monthData !== 'object') return
      Object.entries(monthData).forEach(([ck]) => {
        const pipe = String(ck).indexOf('|')
        if (pipe > 0) addEntry(person, ck.slice(0, pipe))
      })
    })
  })

  collectFromJsonKey(person, 'jiameng_memos', (data) => {
    const topics = Array.isArray(data) ? data : []
    topics.forEach((t) => {
      ;(t?.messages || []).forEach((msg) => addEntry(account, msg?.author))
    })
  })

  collectFromJsonKey(person, 'jiameng_danmus', (list) => {
    if (!Array.isArray(list)) return
    list.forEach((d) => addEntry(account, d?.author))
  })

  const prefixByCategory = [
    [person, '員工'],
    [site, '案場'],
    [contractor, '承攬商'],
    [worker, '施工人員'],
    [account, '帳號'],
    [project, '專案'],
    [vehicle, '車輛']
  ]

  const realToFake = new Map()
  prefixByCategory.forEach(([bucket, prefix]) => {
    const keys = [...bucket.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    keys.forEach((real, idx) => {
      if (!realToFake.has(real)) {
        realToFake.set(real, `${prefix}${indexToLabel(idx)}`)
      }
    })
  })

  const pairs = [...realToFake.entries()].sort((a, b) => b[0].length - a[0].length)
  return pairs
}

const getMaskPairs = () => {
  if (!cachedPairs) cachedPairs = buildMaskPairs()
  return cachedPairs
}

/** 遮罩電話／統編等（僅顯示用） */
export const maskPhoneForRecording = (phone) => {
  if (!isRecordingModeEnabled()) return phone
  const s = String(phone ?? '').trim()
  if (!s) return phone
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 8) return `${digits.slice(0, 2)}****${digits.slice(-2)}`
  if (s.length >= 4) return `${s.slice(0, 1)}***`
  return '***'
}

/** 遮罩代碼（出工登記碼等，僅顯示用） */
export const maskCodeForRecording = (code) => {
  if (!isRecordingModeEnabled()) return code
  const s = String(code ?? '').trim()
  if (!s) return code
  return '****'
}

/** 遮罩畫面文字；不修改、不寫入任何儲存資料 */
export const maskForRecording = (text) => {
  if (!isRecordingModeEnabled()) return text
  if (text == null) return text
  let s = String(text)
  if (!s.trim()) return text

  const pairs = getMaskPairs()
  let changed = false
  for (const [real, fake] of pairs) {
    if (s.includes(real)) {
      s = s.split(real).join(fake)
      changed = true
    }
  }
  if (changed) return s

  const digits = s.replace(/\D/g, '')
  if (/^09\d{8}$/.test(digits)) return '09**-***-***'
  if (/^\d{8}$/.test(digits) && s.length <= 12) return `${digits.slice(0, 2)}****${digits.slice(-2)}`

  return text
}
