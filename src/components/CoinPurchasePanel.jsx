import { useMemo, useState } from 'react'
import {
  PAY_METHODS,
  approveCoinPurchase,
  createCoinPurchase,
  getCoinPackages,
  getPendingCoinPurchases,
  getUserCoinPurchases,
  rejectCoinPurchase,
  saveCoinPackages
} from '../utils/coinPurchaseStorage'
import { getDisplayNameForAccount } from '../utils/displayName'

const statusText = {
  pending: '待審核',
  approved: '已入帳',
  rejected: '已拒絕'
}

export default function CoinPurchasePanel({ currentUser, userRole, revision = 0, onBalanceChange }) {
  const [tick, setTick] = useState(0)
  const [note, setNote] = useState('')
  const [payMethod, setPayMethod] = useState('transfer')
  const [pkgForm, setPkgForm] = useState({ coins: 10, price: 100 })
  const refresh = () => setTick((n) => n + 1)
  const packages = useMemo(() => getCoinPackages(), [tick, revision])
  const mine = useMemo(() => (currentUser ? getUserCoinPurchases(currentUser) : []), [currentUser, tick, revision])
  const pending = useMemo(() => (userRole === 'admin' ? getPendingCoinPurchases() : []), [userRole, tick, revision])

  const buy = (pkg) => {
    if (!currentUser) {
      alert('請先登入')
      return
    }
    const extra = String(note || '').trim()
    const methodLabel = PAY_METHODS[payMethod] || payMethod
    const extraHint = payMethod === 'advance'
      ? '\n核准後會記入工程款借貸。'
      : '\n管理員確認收款後才會入帳。'
    if (!window.confirm(`確定以「${methodLabel}」申請購買 ${pkg.coins} 毓承幣（NT$${pkg.price}）？${extraHint}`)) return
    const r = createCoinPurchase({
      username: currentUser,
      packageId: pkg.id,
      coins: pkg.coins,
      price: pkg.price,
      payMethod,
      note: extra
    })
    if (!r.success) {
      alert(r.message || '申請失敗')
      return
    }
    setNote('')
    refresh()
    alert('已送出購幣申請，待管理員核准後入帳')
  }

  const addPackage = () => {
    const coins = Math.max(1, Math.floor(Number(pkgForm.coins) || 0))
    const price = Math.max(0, Math.floor(Number(pkgForm.price) || 0))
    if (coins < 1) {
      alert('請輸入毓承幣數量')
      return
    }
    const next = [...packages, { id: `pkg_${Date.now()}`, coins, price }]
    saveCoinPackages(next)
    setPkgForm({ coins: 10, price: 100 })
    refresh()
  }

  return (
    <div className="mb-6 rounded-lg border border-yellow-400/40 bg-black/25 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-yellow-400">購幣</h2>
        <p className="text-gray-400 text-xs">可用借支、轉帳或現金</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(PAY_METHODS).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPayMethod(id)}
            className={`min-h-[40px] px-4 rounded-md border text-sm ${
              payMethod === id
                ? 'border-yellow-400 bg-yellow-400/20 text-yellow-300'
                : 'border-gray-600 text-gray-300 hover:bg-black/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {packages.map((pkg) => (
          <div key={pkg.id} className="rounded-lg border border-gray-700 bg-gray-800/80 p-4 flex flex-col gap-2">
            <div className="text-2xl font-bold text-yellow-300">{pkg.coins} 毓承幣</div>
            <div className="text-gray-300 text-sm">NT$ {Number(pkg.price).toLocaleString()}</div>
            <button
              type="button"
              onClick={() => buy(pkg)}
              className="mt-auto min-h-[44px] rounded-md bg-yellow-400 text-gray-900 font-semibold hover:bg-yellow-500"
            >
              申請購買
            </button>
            {userRole === 'admin' ? (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`刪除方案 ${pkg.coins} 毓承幣？`)) return
                  saveCoinPackages(packages.filter((x) => x.id !== pkg.id))
                  refresh()
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                刪除此方案
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <label className="block mt-3 text-sm text-gray-400">
        備註（選填{payMethod === 'transfer' ? '，轉帳可填後五碼' : payMethod === 'cash' ? '，現金可填經手人' : '，借支可填說明'}）
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full min-h-[44px] rounded-md bg-gray-800 border border-gray-600 px-3 text-white"
          maxLength={80}
          placeholder="方便管理員核對"
        />
      </label>

      {userRole === 'admin' ? (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-300 mb-2">新增購幣方案</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="number"
              min="1"
              value={pkgForm.coins}
              onChange={(e) => setPkgForm((s) => ({ ...s, coins: e.target.value }))}
              className="w-28 min-h-[44px] rounded-md bg-gray-800 border border-gray-600 px-2 text-white"
              placeholder="毓承幣"
            />
            <span className="text-gray-500 text-sm">毓承幣 ／ NT$</span>
            <input
              type="number"
              min="0"
              value={pkgForm.price}
              onChange={(e) => setPkgForm((s) => ({ ...s, price: e.target.value }))}
              className="w-28 min-h-[44px] rounded-md bg-gray-800 border border-gray-600 px-2 text-white"
              placeholder="金額"
            />
            <button type="button" onClick={addPackage} className="min-h-[44px] px-4 rounded-md bg-gray-700 hover:bg-gray-600">
              新增方案
            </button>
          </div>
          {pending.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-yellow-300">待審核（{pending.length}）</p>
              {pending.map((row) => (
                <div key={row.id} className="rounded-md border border-gray-700 bg-gray-800 p-3 flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm">
                    <div className="text-white font-medium">{getDisplayNameForAccount(row.username)}（{row.username}）</div>
                    <div className="text-gray-400 text-xs">
                      {row.coins} 毓承幣 · NT${Number(row.price || 0).toLocaleString()} · {PAY_METHODS[row.payMethod] || row.payMethod || '未填'}
                      {row.note ? ` · ${row.note}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-[40px] px-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-sm"
                      onClick={() => {
                        const how = PAY_METHODS[row.payMethod] || '轉帳'
                        const extra = row.payMethod === 'advance' ? '（同時記入工程款借貸）' : ''
                        if (!window.confirm(`核准並發放 ${row.coins} 毓承幣給 ${row.username}？\n付款方式：${how}${extra}`)) return
                        const r = approveCoinPurchase(row.id, currentUser)
                        if (!r.success) alert(r.message || '核准失敗')
                        else {
                          refresh()
                          onBalanceChange?.()
                        }
                      }}
                    >
                      核准入帳
                    </button>
                    <button
                      type="button"
                      className="min-h-[40px] px-3 rounded-md bg-red-800 hover:bg-red-700 text-sm"
                      onClick={() => {
                        if (!window.confirm('拒絕這筆購幣申請？')) return
                        const r = rejectCoinPurchase(row.id, currentUser)
                        if (!r.success) alert(r.message || '拒絕失敗')
                        else refresh()
                      }}
                    >
                      拒絕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-xs mt-3">目前沒有待審核購幣</p>
          )}
        </div>
      ) : null}

      {mine.length ? (
        <div className="mt-4 pt-3 border-t border-gray-700">
          <p className="text-sm text-gray-300 mb-2">我的購幣紀錄</p>
          <ul className="space-y-1 text-xs text-gray-400">
            {mine.slice(0, 8).map((row) => (
              <li key={row.id}>
                {row.coins} 毓承幣 · NT${Number(row.price || 0).toLocaleString()} · {PAY_METHODS[row.payMethod] || row.payMethod || ''} · {statusText[row.status] || row.status}
                {row.note ? ` · ${row.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
