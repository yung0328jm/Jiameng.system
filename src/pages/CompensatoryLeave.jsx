import { useMemo, useState, useCallback, useEffect } from 'react'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  canViewAllCompensatoryLeave,
  getCompensatoryLeaveManagerAccount,
  setCompensatoryLeaveManagerAccount
} from '../utils/compensatoryLeaveManagerStorage'
import { getUsers } from '../utils/storage'
import { isSupabaseEnabled as isAuthSupabase, getPublicProfiles } from '../utils/authSupabase'
import { getDisplayNameForAccount } from '../utils/displayName'
import { getDisplayNamesForAccount } from '../utils/dropdownStorage'
import { getOvertimeApplications } from '../utils/overtimeApplicationStorage'
import { getSchedules } from '../utils/scheduleStorage'
import {
  OVERTIME_COMPENSATION_CHOICE_KEY,
  getOvertimeCompensationMode,
  setOvertimeCompensationMode,
  clearOvertimeCompensationMode
} from '../utils/overtimeCompensationChoiceStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

/** 每人每月「領加班費」合計時數上限（僅限本頁所選月份內、依人員加總） */
const OVERTIME_PAY_MONTHLY_CAP_HOURS = 46

/** 行事曆／加班單日期統一成 YYYY-MM-DD（僅供本頁讀取顯示，不寫回行事曆） */
function normalizeYmd(d) {
  const raw = String(d || '').trim().replace(/\//g, '-')
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return raw
  const y = m[1]
  const mo = String(parseInt(m[2], 10)).padStart(2, '0')
  const da = String(parseInt(m[3], 10)).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function currentMonthYm() {
  const n = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}`
}

/** 與個人績效「加班明細」一致：目前使用者是否落在該筆加班單上，並回傳儲存選擇用的 personLabel */
function resolvePersonLabelForUser(oa, namesToMatch) {
  const personnelList = (Array.isArray(oa.overtimePersonnel) ? oa.overtimePersonnel : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (personnelList.length > 0) {
    const hit = personnelList.find((p) => namesToMatch.some((n) => p === n))
    return hit || ''
  }
  const applicant = String(oa.applicant || '').trim()
  if (applicant && namesToMatch.some((n) => applicant === n)) return applicant
  return ''
}

/** 該筆已核准加班單應登記「補休／加班費」的人員清單（與行事曆上欄位一致，僅讀取） */
function getPersonLabelsForOvertimeRecord(oa) {
  const personnelList = (Array.isArray(oa.overtimePersonnel) ? oa.overtimePersonnel : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (personnelList.length > 0) return Array.from(new Set(personnelList))
  const applicant = String(oa.applicant || '').trim()
  return applicant ? [applicant] : []
}

function rowPayHoursForCap(r) {
  const h = r?.hours
  if (h == null || h === '' || Number.isNaN(Number(h))) return 0
  return Math.max(0, Number(h))
}

/** 同月、同人員、已勾「領加班費」的時數合計；可排除某一列（用於試算該列改勾加班費是否超限） */
function sumPayHoursForPersonMonth(rows, personLabel, excludeKey) {
  let sum = 0
  for (const r of rows) {
    if (String(r.personLabel || '') !== String(personLabel || '')) continue
    const key = `${r.id}\u001f${r.personLabel}`
    if (excludeKey && key === excludeKey) continue
    if (getOvertimeCompensationMode(r.id, r.personLabel) === 'pay') {
      sum += rowPayHoursForCap(r)
    }
  }
  return sum
}

/** 是否允許將「領加班費」勾成 on：已為 pay 時一律 true（方便改勾補休或取消） */
function canTurnPayOn(row, rows) {
  const cur = getOvertimeCompensationMode(row.id, row.personLabel)
  if (cur === 'pay') return true
  const excludeKey = `${row.id}\u001f${row.personLabel}`
  const others = sumPayHoursForPersonMonth(rows, row.personLabel, excludeKey)
  return others + rowPayHoursForCap(row) <= OVERTIME_PAY_MONTHLY_CAP_HOURS + 1e-9
}

export default function CompensatoryLeave() {
  const account = String(getCurrentUser() || '').trim()
  const isAdmin = getCurrentUserRole() === 'admin'
  const canViewAll = canViewAllCompensatoryLeave(account, isAdmin)
  const [operatorPickerUsers, setOperatorPickerUsers] = useState([])
  const [filterMonth, setFilterMonth] = useState(currentMonthYm)
  /** 管理員：''＝全部人員；非空＝只顯示該人員（與加班單上姓名一致） */
  const [personFilter, setPersonFilter] = useState('')
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => setTick((t) => t + 1), [])
  useRealtimeKeys(['jiameng_overtime_applications', OVERTIME_COMPENSATION_CHOICE_KEY, 'jiameng_compensatory_leave_manager_account'], bump)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (isAuthSupabase()) {
          const profiles = await getPublicProfiles()
          if (cancelled) return
          const list = (Array.isArray(profiles) ? profiles : [])
            .filter((p) => !p?.is_resigned && String(p?.account || '').trim())
            .map((p) => ({ account: String(p.account).trim(), name: String(p.display_name || p.account || '').trim() || p.account }))
          list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
          if (!cancelled) setOperatorPickerUsers(list)
        } else {
          const u = getUsers() || []
          const list = u
            .filter((x) => x?.role !== 'resigned' && String(x?.account || '').trim())
            .map((x) => ({ account: String(x.account).trim(), name: String(x.name || x.account || '').trim() }))
          list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
          if (!cancelled) setOperatorPickerUsers(list)
        }
      } catch (_) {
        if (!cancelled) setOperatorPickerUsers([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const allRows = useMemo(() => {
    void tick
    const primary = getDisplayNameForAccount(account)
    const aliases = getDisplayNamesForAccount(account) || []
    const namesToMatch = Array.from(new Set([account, primary, ...aliases].map((s) => String(s || '').trim()).filter(Boolean)))

    const schedules = getSchedules() || []
    const byId = new Map(schedules.map((s) => [String(s?.id || ''), s]))

    const list = (getOvertimeApplications() || []).filter((oa) => String(oa?.status || '').trim() === 'approved')
    const out = []
    const ym = String(filterMonth || '').trim()

    list.forEach((oa) => {
      const dateStr = normalizeYmd(oa.date)
      if (!dateStr || ym.length < 7) return
      if (!dateStr.startsWith(ym)) return
      const sid = String(oa.scheduleId || '').trim()
      const schedule = byId.get(sid)
      if (!schedule) return
      const siteName = schedule?.siteName || schedule?.segments?.[0]?.siteName || '—'
      const hours = oa.hours != null && oa.hours !== '' ? Number(oa.hours) : null
      const applicant = String(oa.applicant || '').trim() || '—'

      const labels = getPersonLabelsForOvertimeRecord(oa)
      if (labels.length === 0) return

      labels.forEach((personLabel) => {
        if (!canViewAll) {
          const mine = resolvePersonLabelForUser(oa, namesToMatch)
          if (personLabel !== mine || !mine) return
        }
        out.push({
          id: oa.id,
          dateStr,
          siteName,
          startTime: String(oa.startTime || '').trim() || '—',
          endTime: String(oa.endTime || '').trim() || '—',
          hours,
          applicant,
          personLabel
        })
      })
    })

    out.sort((a, b) => {
      const c = (b.dateStr || '').localeCompare(a.dateStr || '')
      if (c !== 0) return c
      const n = (a.personLabel || '').localeCompare(b.personLabel || '', 'zh-Hant')
      if (n !== 0) return n
      return String(b.id).localeCompare(String(a.id))
    })

    return out
  }, [tick, filterMonth, canViewAll, account])

  useEffect(() => {
    if (!canViewAll) return
    if (!personFilter) return
    const ok = allRows.some((r) => String(r.personLabel) === String(personFilter))
    if (!ok) setPersonFilter('')
  }, [canViewAll, personFilter, allRows])

  const personOptions = useMemo(() => {
    const labels = new Set(allRows.map((r) => String(r.personLabel || '').trim()).filter(Boolean))
    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [allRows])

  const displayRows = useMemo(() => {
    if (!canViewAll || !String(personFilter || '').trim()) return allRows
    const p = String(personFilter).trim()
    return allRows.filter((r) => String(r.personLabel) === p)
  }, [allRows, personFilter, canViewAll])

  const stats = useMemo(() => {
    void tick
    let compHours = 0
    let payHours = 0
    let payCount = 0
    let unset = 0
    displayRows.forEach((r) => {
      const mode = getOvertimeCompensationMode(r.id, r.personLabel)
      if (mode === 'comp_leave') {
        if (r.hours != null && !Number.isNaN(r.hours)) compHours += r.hours
      } else if (mode === 'pay') {
        payCount += 1
        payHours += rowPayHoursForCap(r)
      } else {
        unset += 1
      }
    })
    return { compHours, payHours, payCount, unset }
  }, [displayRows, tick])

  const onPick = (row, mode) => {
    const cur = getOvertimeCompensationMode(row.id, row.personLabel)
    if (mode === 'pay' && cur !== 'pay' && !canTurnPayOn(row, allRows)) {
      return
    }
    if (cur === mode) {
      clearOvertimeCompensationMode(row.id, row.personLabel)
    } else {
      setOvertimeCompensationMode(row.id, row.personLabel, mode)
    }
    bump()
  }

  const monthLabel = filterMonth.replace('-', ' 年 ') + ' 月'

  const handlePrint = () => {
    try {
      window.print()
    } catch (e) {
      console.warn('print failed', e)
    }
  }

  return (
    <>
      <style>{`
        .compensatory-print-only { display: none; }
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          body * { visibility: hidden; }
          .compensatory-print-area,
          .compensatory-print-area * { visibility: visible; }
          .compensatory-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none !important;
            background: #fff !important;
            color: #111 !important;
          }
          .compensatory-no-print { display: none !important; }
          .compensatory-print-only {
            display: block !important;
            visibility: visible !important;
            color: #000 !important;
          }
          .compensatory-print-area h2,
          .compensatory-print-area p,
          .compensatory-print-area span,
          .compensatory-print-area div,
          .compensatory-print-area li { color: #111 !important; }
          .compensatory-print-area .rounded-xl,
          .compensatory-print-area .rounded-lg,
          .compensatory-print-area li {
            background: #fafafa !important;
            border-color: #333 !important;
            box-shadow: none !important;
          }
          .compensatory-print-area input[type="checkbox"] {
            accent-color: #333;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      <div
        id="jiameng-compensatory-print-root"
        className={`compensatory-print-area mx-auto text-cn-parchment ${canViewAll ? 'max-w-5xl' : 'max-w-3xl'}`}
      >
      <div className="flex justify-end mb-3 compensatory-no-print">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg border border-cn-gold/40 bg-cn-panel px-4 py-2.5 text-sm font-semibold text-cn-gold hover:bg-black/30 active:bg-black/40 touch-manipulation min-h-[44px]"
          title="開啟瀏覽器列印；目標選「另存 PDF」即可下載"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
          </svg>
          列印／存成 PDF
        </button>
      </div>

      <div className="compensatory-print-only mb-3 border-b border-black pb-2 text-sm leading-relaxed">
        <div className="text-base font-bold">補休／加班費登記</div>
        <div>月份：{monthLabel}</div>
        {canViewAll && (
          <div>人員：{personFilter ? personFilter : '全部人員'}</div>
        )}
        <div className="text-xs text-gray-700 mt-1">列印時間：{new Date().toLocaleString('zh-TW')}</div>
      </div>

      <div className="rounded-xl border border-cn-gold/30 bg-black/25 p-4 sm:p-5 mb-4">
        <h2 className="text-lg font-bold text-cn-gold font-serif tracking-wide mb-1">補休／加班費登記</h2>
        <p className="text-cn-mist text-sm leading-relaxed">
          {canViewAll ? (
            isAdmin ? (
              <>
                <strong className="text-cn-parchment/90">管理員</strong>：可檢視<strong className="text-cn-parchment/90">全員</strong>加班列、以「選擇人員」切換任何人，並使用<strong className="text-cn-parchment/90">列印／存成 PDF</strong>。您可在下方<strong className="text-cn-parchment/90">指定位操作用戶</strong>，讓該帳號登入後擁有與您相同權限（仍僅能讀取行事曆已核准資料，不會改動行事曆本體）。
              </>
            ) : (
              <>
                <strong className="text-cn-parchment/90">操作用戶</strong>：您已被管理員指定為補休系統操作用戶，可檢視全員、篩選人員並列印。以下僅<strong className="text-amber-200/90">讀取</strong>行事曆上<strong className="text-cn-parchment/90">已核准</strong>之加班申請與排程案名。請選<strong className="text-cn-parchment/90">月份</strong>與<strong className="text-cn-parchment/90">人員</strong>後，可代為勾選<strong className="text-amber-200/95">領加班費</strong>／<strong className="text-emerald-200/95">紀錄補休時數</strong>（儲存於補休登記用資料，與加班單本體分開）。
              </>
            )
          ) : (
            <>
              此處<strong className="text-amber-200/90">讀取</strong>行事曆上與您相關且<strong className="text-cn-parchment/90">已核准</strong>的加班申請，不會改動行事曆。請依<strong className="text-cn-parchment/90">月份</strong>檢視後，逐筆選擇<strong className="text-amber-200/95">領加班費</strong>或<strong className="text-emerald-200/95">轉為補休時數</strong>；再次點選可取消、改回未選。
              <span className="block mt-2 text-cn-mist/90">一般帳號僅能查看與自己相關的加班列。全員檢視與指定操作用戶由管理員於本頁設定。</span>
            </>
          )}
        </p>
        <p className="text-amber-200/85 text-sm mt-2 border-t border-cn-gold/20 pt-2 leading-relaxed">
          規則：以<strong className="text-cn-parchment">人員</strong>為單位、在所選月份內，<strong className="text-cn-parchment">領加班費合計不得超過 {OVERTIME_PAY_MONTHLY_CAP_HOURS} 小時</strong>；已達上限後，其餘加班僅能勾選補休（「領加班費」無法勾選）。管理員或操作用戶代勾選時亦適用同一上限。
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-cn-gold/30 bg-black/25 p-4 sm:p-5 mb-4 compensatory-no-print">
          <label className="block text-cn-mist text-sm mb-1">指定位操作用戶（可檢視全員、篩選任何人、列印）</label>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <select
              value={getCompensatoryLeaveManagerAccount()}
              onChange={(e) => {
                setCompensatoryLeaveManagerAccount(e.target.value)
                bump()
              }}
              className="w-full sm:max-w-md bg-black/35 border border-cn-gold/30 rounded-lg px-3 py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-amber-700/50 min-h-[44px]"
            >
              <option value="">— 不指定（僅管理員可操作全員）—</option>
              {operatorPickerUsers.map((u) => (
                <option key={u.account} value={u.account}>
                  {u.name}（{u.account}）
                </option>
              ))}
            </select>
          </div>
          <p className="text-cn-mist text-xs mt-2 leading-relaxed">
            指定後，該帳號登入補休系統時可選擇<strong className="text-cn-parchment/90">任何用戶</strong>的資料並<strong className="text-cn-parchment/90">列印</strong>；未列入此處的帳號僅能查看與自己相關的加班。
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3 mb-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 compensatory-no-print">
          <label className="flex flex-col gap-1 text-sm text-cn-mist min-w-[200px]">
            <span>選擇月份</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value || currentMonthYm())
              }}
              className="bg-black/35 border border-cn-gold/30 rounded-lg px-3 py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-amber-700/50 min-h-[44px]"
            />
          </label>
        {canViewAll && (
          <label className="flex flex-col gap-1 text-sm text-cn-mist min-w-[200px] flex-1 max-w-md">
              <span>選擇人員</span>
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="bg-black/35 border border-cn-gold/30 rounded-lg px-3 py-2 text-cn-parchment focus:outline-none focus:ring-2 focus:ring-amber-700/50 min-h-[44px]"
              >
                <option value="">全部人員（{personOptions.length} 人於此月有加班列）</option>
                {personOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-cn-mist text-sm pb-2 lg:pb-3 lg:ml-auto">
          目前：
          <span className="text-cn-parchment font-medium">{monthLabel}</span>
          {canViewAll && personFilter ? (
            <> · 人員「<span className="text-cn-gold font-medium">{personFilter}</span>」</>
          ) : canViewAll ? (
            <> · <span className="text-cn-parchment">全部人員</span></>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5 text-sm">
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/25 px-3 py-2">
          <div className="text-cn-mist text-xs">已選補休（合計時數）</div>
          <div className="text-emerald-200 font-semibold tabular-nums">{stats.compHours.toFixed(1)} 小時</div>
        </div>
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2">
          <div className="text-cn-mist text-xs">已選領加班費（合計時數／上限）</div>
          <div className="text-amber-200 font-semibold tabular-nums">
            {stats.payHours.toFixed(1)}／{OVERTIME_PAY_MONTHLY_CAP_HOURS} 小時
            <span className="text-cn-mist font-normal text-[11px] ml-1">（{stats.payCount} 筆）</span>
          </div>
        </div>
        <div className="rounded-lg border border-cn-gold/25 bg-black/20 px-3 py-2">
          <div className="text-cn-mist text-xs">尚未選擇</div>
          <div className="text-cn-parchment font-semibold tabular-nums">{stats.unset} 筆</div>
        </div>
      </div>

      {allRows.length === 0 ? (
        <div className="rounded-xl border border-cn-gold/20 bg-black/20 px-4 py-10 text-center text-cn-mist">
          {canViewAll
            ? '此月份尚無已核准的加班紀錄，或對應工程排程已從行事曆移除（本頁不會刪除任何行事曆資料）。'
            : '此月份沒有與您相關的已核准加班紀錄，或對應排程已不存在。'}
        </div>
      ) : displayRows.length === 0 ? (
        <div className="rounded-xl border border-cn-gold/20 bg-black/20 px-4 py-10 text-center text-cn-mist">
          此月份沒有「{personFilter}」的已核准加班列，請改選其他人員或月份。
        </div>
      ) : (
        <ul className="space-y-3">
          {displayRows.map((r) => {
            const mode = getOvertimeCompensationMode(r.id, r.personLabel)
            const payDisabled = mode !== 'pay' && !canTurnPayOn(r, allRows)
            const othersPayH = sumPayHoursForPersonMonth(allRows, r.personLabel, `${r.id}\u001f${r.personLabel}`)
            const hText = r.hours != null && !Number.isNaN(r.hours) ? `${r.hours} 小時` : '—'
            return (
              <li
                key={`${r.id}-${r.personLabel}`}
                className="rounded-xl border border-cn-gold/25 bg-gradient-to-br from-black/30 to-cn-lacquer/40 px-4 py-3 sm:px-5 sm:py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                  <span className="text-cn-gold font-semibold font-mono tabular-nums">{r.dateStr}</span>
                  <span className="text-cn-parchment font-medium">{r.siteName}</span>
                  {canViewAll && !personFilter && (
                    <span className="text-sm text-emerald-200/90 border border-emerald-800/40 bg-emerald-950/30 px-2 py-0.5 rounded">
                      人員：{r.personLabel}
                    </span>
                  )}
                </div>
                <div className="text-sm text-cn-mist space-y-0.5 mb-3">
                  <div>
                    時間：{r.startTime} ～ {r.endTime}（{hText}）
                  </div>
                  <div>申請人：{r.applicant}</div>
                </div>
                <div className="compensatory-no-print flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <label
                    className={`flex items-center gap-2 touch-manipulation min-h-[44px] ${payDisabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
                    title={payDisabled ? `該員本月已選領加班費 ${othersPayH.toFixed(1)} 小時，再勾此筆將超過 ${OVERTIME_PAY_MONTHLY_CAP_HOURS} 小時上限` : undefined}
                  >
                    <input
                      type="checkbox"
                      disabled={payDisabled}
                      checked={mode === 'pay'}
                      onChange={() => onPick(r, 'pay')}
                      className="w-5 h-5 rounded border-cn-gold/40 shrink-0 disabled:cursor-not-allowed"
                    />
                    <span className="text-amber-100/95">領加班費</span>
                  </label>
                  {payDisabled && (
                    <p className="compensatory-no-print text-[11px] text-cn-mist sm:ml-0 w-full sm:w-auto self-center leading-snug">
                      同一人本月「領加班費」已計 {othersPayH.toFixed(1)} 小時，本筆（{rowPayHoursForCap(r).toFixed(1)} 小時）若再選「領加班費」將超過 {OVERTIME_PAY_MONTHLY_CAP_HOURS} 小時上限，請改勾補休。
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={mode === 'comp_leave'}
                      onChange={() => onPick(r, 'comp_leave')}
                      className="w-5 h-5 rounded border-cn-gold/40 shrink-0"
                    />
                    <span className="text-emerald-100/95">紀錄補休時數</span>
                  </label>
                </div>
                <div className="compensatory-print-only mt-2 border-t border-gray-300 pt-1 text-xs">
                  登記選項：{mode === 'pay' ? '領加班費' : mode === 'comp_leave' ? '紀錄補休時數' : '尚未選擇'}
                </div>
                {mode === 'comp_leave' && r.hours != null && !Number.isNaN(r.hours) && (
                  <p className="mt-2 text-xs text-emerald-300/90">
                    此筆（{r.personLabel}）將計入補休 <span className="font-semibold tabular-nums">{r.hours}</span> 小時（與加班單時數一致）。
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </>
  )
}
