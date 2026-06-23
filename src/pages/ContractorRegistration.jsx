import { useState, useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { getCurrentUserRole } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import {
  getContractorRegistrations,
  addContractorRegistration,
  updateContractorRegistration,
  deleteContractorRegistration,
  CONTRACTOR_REGISTRATION_KEY
} from '../utils/contractorRegistrationStorage'

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  taxId: '',
  address: '',
  notes: ''
}

function ContractorRegistration() {
  const [userRole, setUserRole] = useState(() => getCurrentUserRole())
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadList = () => setList(getContractorRegistrations())

  useRealtimeKeys([CONTRACTOR_REGISTRATION_KEY], loadList)

  useEffect(() => {
    setUserRole(getCurrentUserRole())
    loadList()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...list].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant'))
    if (!q) return sorted
    return sorted.filter((r) => {
      const hay = [r.name, r.contactPerson, r.phone, r.taxId, r.address, r.notes]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [list, search])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMessage(null)
  }

  const openEdit = (rec) => {
    setEditingId(rec.id)
    setForm({
      name: rec.name || '',
      contactPerson: rec.contactPerson || '',
      phone: rec.phone || '',
      taxId: rec.taxId || '',
      address: rec.address || '',
      notes: rec.notes || ''
    })
    setShowForm(true)
    setMessage(null)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setMessage(null)
    const payload = { ...form }
    const res = editingId
      ? updateContractorRegistration(editingId, payload)
      : addContractorRegistration(payload)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '儲存失敗' })
      return
    }
    loadList()
    setMessage({ type: 'success', text: editingId ? '已更新承攬商資料。' : '已新增承攬商資料。' })
    closeForm()
  }

  const handleDelete = (rec) => {
    if (!window.confirm(`確定要刪除承攬商「${rec.name || ''}」嗎？`)) return
    const res = deleteContractorRegistration(rec.id)
    if (!res.success) {
      setMessage({ type: 'error', text: res.message || '刪除失敗' })
      return
    }
    if (editingId === rec.id) closeForm()
    loadList()
    setMessage({ type: 'success', text: '已刪除承攬商資料。' })
  }

  if (userRole !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return (
    <div className="max-w-4xl mx-auto w-full text-white px-1 sm:px-0">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">承攬商資料登記</h2>
          <p className="text-gray-400 text-sm mt-1">管理員維護承攬商基本資料；名稱會同步至入廠申請的承攬商選單。</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 min-h-[44px] px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm"
        >
          新增承攬商
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-600'
              : 'bg-red-900/50 text-red-300 border border-red-600'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋承攬商名稱、聯絡人、電話…"
          className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-yellow-400"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">尚無承攬商資料，請按「新增承攬商」建立。</p>
        ) : (
          filtered.map((rec) => (
            <div key={rec.id} className="bg-gray-800 border border-gray-600 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="text-lg font-semibold text-yellow-300">{rec.name}</div>
                  {rec.contactPerson && <div className="text-gray-300">聯絡人：{rec.contactPerson}</div>}
                  {rec.phone && <div className="text-gray-300">電話：{rec.phone}</div>}
                  {rec.taxId && <div className="text-gray-300">統一編號：{rec.taxId}</div>}
                  {rec.address && <div className="text-gray-300">地址：{rec.address}</div>}
                  {rec.notes && <div className="text-gray-500">備註：{rec.notes}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-yellow-400 mb-4">
              {editingId ? '編輯承攬商' : '新增承攬商'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">承攬商名稱 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">聯絡人</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">電話</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">統一編號</label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">備註</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-500 text-white focus:outline-none focus:border-yellow-400 resize-y"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm"
                >
                  儲存
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 min-h-[44px] py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold text-sm"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContractorRegistration
