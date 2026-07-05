import { useCallback, useEffect, useMemo, useState } from 'react'
import { getWorkReportsForMonth } from '../utils/workReportStorage'
import { buildPersonStatsMap } from '../utils/workReportStats'
import {
  getWorkBonusConfig,
  setWorkBonusDescription,
  setWorkBonusCombineMode,
  getWorkBonusCombineModeLabel,
  getWorkBonusRules,
  addWorkBonusRule,
  updateWorkBonusRule,
  deleteWorkBonusRule,
  calcPersonBonusProgress,
  calcPersonTotalBonus,
  describeWorkBonusRule,
  formatBonusMoney
} from '../utils/workBonusStorage'
import { getCurrentUser, getCurrentUserRole } from '../utils/authStorage'
import {
  getDropdownOptionsByCategory,
  getDisplayNamesForAccount,
  findBoundAccountForDisplayName
} from '../utils/dropdownStorage'
import { getUsers } from '../utils/storage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function getActiveMemberNames() {
  const users = getUsers() || []
  const resignedAccounts = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.account || '').trim()).filter(Boolean)
  )
  const resignedNames = new Set(
    users.filter((u) => u?.role === 'resigned').map((u) => String(u?.name || '').trim()).filter(Boolean)
  )
  resignedAccounts.forEach((acc) => {
    ;(getDisplayNamesForAccount(acc) || []).forEach((n) => {
      const t = String(n || '').trim()
      if (t) resignedNames.add(t)
    })
  })

  const isResigned = (name) => {
    const t = String(name || '').trim()
    if (!t) return true
    if (resignedNames.has(t) || resignedAccounts.has(t)) return true
    const bound = findBoundAccountForDisplayName(t)
    if (bound && resignedAccounts.has(bound)) return true
    return false
  }

  const seen = new Set()
  const out = []
  const add = (n) => {
    const t = String(n || '').trim()
    if (!t || seen.has(t) || isResigned(t)) return
    seen.add(t)
    out.push(t)
  }
  ;(getDropdownOptionsByCategory('participants') || []).forEach((opt) => add(opt?.value))
  ;(getDropdownOptionsByCategory('responsible_persons') || []).forEach((opt) => add(opt?.value))
  out.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return out
}

const EMPTY_RULE_FORM = {
  label: '',
  type: 'fixed',
  minWorkDays: '26',
  amount: '1500',
  overtimeRatePerHour: '100',
  enabled: true
}

function ProgressBar({ pct, achieved }) {
  const width = Math.min(100, Math.max(0, pct))
  return (
    <div className="h-2.5 rounded-full bg-gray-700/80 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${achieved ? 'bg-emerald-500' : 'bg-yellow-500'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function BonusRuleCard({ item, combineMode }) {
  const {
    rule, currentDays, targetDays, progressPct, daysRemaining, achieved,
    bonusAmount, projectedBonus, overtimeHours, countsTowardTotal, superseded
  } = item
  const isReplaceMode = combineMode === 'replace'
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${
      superseded
        ? 'border-gray-600/40 bg-gray-900/20 opacity-75'
        : achieved
          ? 'border-emerald-600/40 bg-emerald-950/20'
          : 'border-gray-600/50 bg-gray-900/30'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-medium text-white">{rule.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{describeWorkBonusRule(rule)}</div>
        </div>
        {superseded ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400 border border-gray-600/50">
            已被較高階取代
          </span>
        ) : achieved ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-300 border border-emerald-500/40">
            已達成
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-300 border border-gray-600/50">
            進行中
          </span>
        )}
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>出工天數 {currentDays} / {targetDays} 天</span>
          <span>{progressPct}%</span>
        </div>
        <ProgressBar pct={progressPct} achieved={achieved} />
        {!achieved && daysRemaining > 0 && (
          <p className="text-xs text-gray-500 mt-1">尚需 {daysRemaining} 天</p>
        )}
      </div>

      {rule.type === 'overtime_rate' && (
        <p className="text-xs text-gray-400 mb-2">
          本月已核准加班 {overtimeHours} 小時
          {!achieved && projectedBonus > 0 && (
            <span className="text-gray-500">（達成後預估 ${formatBonusMoney(projectedBonus)} 元）</span>
          )}
        </p>
      )}

      <div className={`text-sm font-semibold ${
        superseded ? 'text-gray-500' : achieved ? 'text-emerald-300' : 'text-gray-400'
      }`}>
        {superseded ? (
          <>已達成 ${formatBonusMoney(bonusAmount)} 元（{isReplaceMode ? '取代模式下不計入合計' : '不計入合計'}）</>
        ) : achieved ? (
          <>可獲獎金 <span className="text-yellow-300">${formatBonusMoney(bonusAmount)}</span> 元{countsTowardTotal ? '' : ''}</>
        ) : rule.type === 'overtime_rate' && projectedBonus > 0 ? (
          <>達成後預估 <span className="text-yellow-300/80">${formatBonusMoney(projectedBonus)}</span> 元</>
        ) : (
          <>達成後可獲 <span className="text-yellow-300/80">${formatBonusMoney(rule.type === 'fixed' ? rule.amount : 0)}</span> 元</>
        )}
      </div>
    </div>
  )
}

export default function WorkBonus() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState(null)
  const [config, setConfig] = useState(() => getWorkBonusConfig())
  const [rules, setRules] = useState(() => getWorkBonusRules())
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM)
  const [openPersons, setOpenPersons] = useState({})

  const currentUser = getCurrentUser()
  const userRole = getCurrentUserRole()
  const isAdmin = userRole === 'admin'
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  const refetch = useCallback(() => {
    setConfig(getWorkBonusConfig())
    setRules(getWorkBonusRules())
    setRevision((v) => v + 1)
  }, [])

  useRealtimeKeys(
    ['jiameng_work_bonus_config', 'jiameng_work_bonus_rules', 'jiameng_work_reports', 'jiameng_overtime_applications'],
    refetch
  )

  useEffect(() => {
    refetch()
  }, [refetch])

  const selfDisplayNames = useMemo(() => {
    if (!currentUser) return []
    try {
      return (getDisplayNamesForAccount(currentUser) || []).filter(Boolean)
    } catch {
      return [currentUser]
    }
  }, [currentUser])

  const memberNames = useMemo(() => getActiveMemberNames(), [revision])
  const monthRecords = useMemo(() => getWorkReportsForMonth(year, month), [year, month, revision])
  const statsMap = useMemo(() => buildPersonStatsMap(monthRecords), [monthRecords])

  const visiblePersons = useMemo(() => {
    const set = new Set(memberNames)
    statsMap.forEach((v) => set.add(v.personName))
    const list = [...set].filter((name) => isAdmin || selfDisplayNames.includes(name))
    list.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    return list
  }, [memberNames, statsMap, isAdmin, selfDisplayNames])

  const personRows = useMemo(() => {
    const combineMode = config.combineMode
    return visiblePersons.map((name) => {
      const s = statsMap.get(name)
      const stats = s
        ? { fullDays: s.fullDays, overtimeHours: s.overtimeHours }
        : { fullDays: 0, overtimeHours: 0 }
      const progress = calcPersonBonusProgress(stats, rules, { combineMode })
      const totalBonus = calcPersonTotalBonus(stats, rules, { combineMode })
      return { personName: name, stats, progress, totalBonus }
    })
  }, [visiblePersons, statsMap, rules, config.combineMode])

  const handleCombineModeChange = (mode) => {
    setWorkBonusCombineMode(mode)
    refetch()
    setMessage({
      type: 'success',
      text: `已切換為「${getWorkBonusCombineModeLabel(mode)}」模式`
    })
  }

  const startEditDesc = () => {
    setDescDraft(config.description || '')
    setEditingDesc(true)
  }

  const saveDesc = () => {
    setWorkBonusDescription(descDraft)
    setEditingDesc(false)
    refetch()
    setMessage({ type: 'success', text: '已儲存規則說明' })
  }

  const startAddRule = () => {
    setEditingRuleId(null)
    setRuleForm(EMPTY_RULE_FORM)
    setShowRuleForm(true)
  }

  const startEditRule = (rule) => {
    setEditingRuleId(rule.id)
    setRuleForm({
      label: rule.label,
      type: rule.type,
      minWorkDays: String(rule.minWorkDays),
      amount: String(rule.amount || ''),
      overtimeRatePerHour: String(rule.overtimeRatePerHour || ''),
      enabled: rule.enabled
    })
    setShowRuleForm(true)
  }

  const cancelRuleForm = () => {
    setShowRuleForm(false)
    setEditingRuleId(null)
    setRuleForm(EMPTY_RULE_FORM)
  }

  const saveRuleForm = () => {
    const label = String(ruleForm.label || '').trim()
    if (!label) {
      setMessage({ type: 'error', text: '請填寫獎金名稱' })
      return
    }
    const payload = {
      label,
      type: ruleForm.type === 'overtime_rate' ? 'overtime_rate' : 'fixed',
      minWorkDays: Number(ruleForm.minWorkDays) || 1,
      amount: Number(ruleForm.amount) || 0,
      overtimeRatePerHour: Number(ruleForm.overtimeRatePerHour) || 0,
      enabled: ruleForm.enabled !== false
    }
    const result = editingRuleId
      ? updateWorkBonusRule(editingRuleId, payload)
      : addWorkBonusRule(payload)
    if (!result.success) {
      setMessage({ type: 'error', text: result.message || '儲存失敗' })
      return
    }
    cancelRuleForm()
    refetch()
    setMessage({ type: 'success', text: editingRuleId ? '已更新獎金條件' : '已新增獎金條件' })
  }

  const handleDeleteRule = (id) => {
    if (!window.confirm('確定要刪除此獎金條件？')) return
    deleteWorkBonusRule(id)
    refetch()
    setMessage({ type: 'success', text: '已刪除獎金條件' })
  }

  const togglePerson = (name) => {
    setOpenPersons((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const myRow = personRows.find((p) => selfDisplayNames.includes(p.personName))

  return (
    <div className="max-w-6xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-yellow-400">獎金制度</h1>
        <p className="text-gray-400 text-sm mt-1">
          依出工天數與加班時數計算月度獎金進度。
          {!isAdmin && '（僅顯示您自己的獎金狀態）'}
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-200'
              : 'border-red-600/50 bg-red-950/30 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-xs text-gray-400 hover:text-gray-200">✕</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6 space-y-4 mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-gray-400 text-xs">年份</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="block mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-400 text-xs">月份</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="block mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </label>
          <span className="text-gray-500 text-sm pb-2">{yearMonth} 統計</span>
        </div>
      </div>

      {/* 規則說明 */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-yellow-300">獎金規則說明</h2>
          {isAdmin && !editingDesc && (
            <button
              type="button"
              onClick={startEditDesc}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50"
            >
              編輯說明
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={5}
              placeholder="在此說明獎金制度規則，所有人皆可閱讀…"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white resize-y"
            />
            <div className="flex gap-2">
              <button type="button" onClick={saveDesc} className="px-4 py-2 rounded-lg bg-yellow-600/80 text-gray-900 text-sm font-medium hover:bg-yellow-500">儲存</button>
              <button type="button" onClick={() => setEditingDesc(false)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-700/50">取消</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">
            {config.description || '（管理員尚未設定規則說明）'}
          </p>
        )}
      </div>

      {/* 管理員：條件設定 */}
      {isAdmin && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/10 p-4 sm:p-6 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-amber-300">獎金條件設定</h2>
            <button
              type="button"
              onClick={startAddRule}
              className="text-sm px-3 py-1.5 rounded-lg bg-amber-600/80 text-gray-900 font-medium hover:bg-amber-500"
            >
              ＋ 新增條件
            </button>
          </div>

          <div className="rounded-lg border border-gray-600/50 bg-gray-900/40 p-3 mb-4">
            <div className="text-xs text-gray-400 mb-2">多條件合併方式</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleCombineModeChange('cumulative')}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                  config.combineMode === 'cumulative'
                    ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                    : 'border-gray-600 text-gray-400 hover:bg-gray-800/50'
                }`}
              >
                累加
                <span className="block text-[10px] mt-0.5 opacity-80">達成幾個加幾個</span>
              </button>
              <button
                type="button"
                onClick={() => handleCombineModeChange('replace')}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                  config.combineMode === 'replace'
                    ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                    : 'border-gray-600 text-gray-400 hover:bg-gray-800/50'
                }`}
              >
                取代
                <span className="block text-[10px] mt-0.5 opacity-80">只取最高出工天數門檻</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              目前模式：<span className="text-gray-300">{getWorkBonusCombineModeLabel(config.combineMode)}</span>
              {config.combineMode === 'replace' && '（例：28 天時只拿 28 天那階，不含 26、27 天）'}
            </p>
          </div>

          {showRuleForm && (
            <div className="rounded-lg border border-gray-600 bg-gray-900/50 p-4 mb-4 space-y-3">
              <h3 className="text-sm font-medium text-white">{editingRuleId ? '編輯條件' : '新增條件'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="text-gray-400 text-xs">獎金名稱</span>
                  <input
                    type="text"
                    value={ruleForm.label}
                    onChange={(e) => setRuleForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="例：全勤獎、加班加成獎"
                    className="block w-full mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-gray-400 text-xs">獎金類型</span>
                  <select
                    value={ruleForm.type}
                    onChange={(e) => setRuleForm((f) => ({ ...f, type: e.target.value }))}
                    className="block w-full mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
                  >
                    <option value="fixed">固定金額（出工滿 N 天 → 固定獎金）</option>
                    <option value="overtime_rate">加班加成（出工滿 N 天 → 加班時數 × 金額）</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-gray-400 text-xs">出工天數門檻</span>
                  <input
                    type="number"
                    min="1"
                    value={ruleForm.minWorkDays}
                    onChange={(e) => setRuleForm((f) => ({ ...f, minWorkDays: e.target.value }))}
                    className="block w-full mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
                  />
                </label>
                {ruleForm.type === 'fixed' ? (
                  <label className="block">
                    <span className="text-gray-400 text-xs">獎金金額（元）</span>
                    <input
                      type="number"
                      min="0"
                      value={ruleForm.amount}
                      onChange={(e) => setRuleForm((f) => ({ ...f, amount: e.target.value }))}
                      className="block w-full mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-gray-400 text-xs">每小時加成金額（元）</span>
                    <input
                      type="number"
                      min="0"
                      value={ruleForm.overtimeRatePerHour}
                      onChange={(e) => setRuleForm((f) => ({ ...f, overtimeRatePerHour: e.target.value }))}
                      className="block w-full mt-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={ruleForm.enabled}
                    onChange={(e) => setRuleForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-300">啟用此條件</span>
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={saveRuleForm} className="px-4 py-2 rounded-lg bg-amber-600/80 text-gray-900 text-sm font-medium hover:bg-amber-500">儲存條件</button>
                <button type="button" onClick={cancelRuleForm} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-700/50">取消</button>
              </div>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="text-sm text-gray-500">尚未設定任何獎金條件，請點「新增條件」開始設定。</p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-600/50 bg-gray-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{rule.label}</span>
                      {!rule.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">已停用</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{describeWorkBonusRule(rule)}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => startEditRule(rule)} className="text-xs px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-700/50">編輯</button>
                    <button type="button" onClick={() => handleDeleteRule(rule.id)} className="text-xs px-2.5 py-1 rounded border border-red-700/50 text-red-300 hover:bg-red-950/30">刪除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 一般使用者：自己的摘要 */}
      {!isAdmin && myRow && (
        <div className="rounded-xl border border-yellow-600/30 bg-yellow-950/10 p-4 sm:p-6 mb-4">
          <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-yellow-300">我的獎金進度</h2>
              <p className="text-sm text-gray-400 mt-1">
                本月出工 {myRow.stats.fullDays} 天
                {myRow.stats.overtimeHours > 0 && `，加班 ${myRow.stats.overtimeHours} 小時`}
                <span className="block text-xs text-gray-500 mt-0.5">
                  合併方式：{getWorkBonusCombineModeLabel(config.combineMode)}
                </span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">已達成獎金合計</div>
              <div className="text-xl font-bold text-yellow-300">${formatBonusMoney(myRow.totalBonus)} 元</div>
            </div>
          </div>
          {rules.filter((r) => r.enabled).length === 0 ? (
            <p className="text-sm text-gray-500">管理員尚未設定獎金條件。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myRow.progress.map((item) => (
                <BonusRuleCard key={item.rule.id} item={item} combineMode={config.combineMode} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 管理員：全員列表 */}
      {isAdmin && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white">全員獎金狀態</h2>
          {rules.filter((r) => r.enabled).length === 0 ? (
            <p className="text-sm text-gray-500">請先設定獎金條件，才能顯示進度。</p>
          ) : personRows.length === 0 ? (
            <p className="text-sm text-gray-500">尚無可顯示的成員。</p>
          ) : (
            personRows.map((row) => {
              const isOpen = openPersons[row.personName] !== false
              const achievedCount = row.progress.filter((p) => p.achieved).length
              return (
                <div key={row.personName} className="rounded-xl border border-gray-700 bg-gray-800/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => togglePerson(row.personName)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-700/20"
                  >
                    <div>
                      <span className="font-medium text-white">{row.personName}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        出工 {row.stats.fullDays} 天
                        {row.stats.overtimeHours > 0 && ` · 加班 ${row.stats.overtimeHours}h`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-400">
                        已達成 {achievedCount}/{row.progress.length}
                      </span>
                      <span className="text-sm font-semibold text-yellow-300">
                        ${formatBonusMoney(row.totalBonus)} 元
                      </span>
                      <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-gray-700/50 pt-3">
                      {row.progress.map((item) => (
                        <BonusRuleCard key={item.rule.id} item={item} combineMode={config.combineMode} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {!isAdmin && !myRow && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-6 text-center text-gray-400 text-sm">
          找不到與您帳號綁定的顯示名稱，請聯繫管理員確認下拉選單綁定。
        </div>
      )}
    </div>
  )
}
