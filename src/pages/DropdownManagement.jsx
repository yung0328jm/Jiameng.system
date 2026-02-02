import { useState, useEffect } from 'react'
import { getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getDropdownOptions, getDropdownOptionsByCategory, saveDropdownOptions, addDropdownOption, updateDropdownOption, deleteDropdownOption, reorderDropdownOptionsByCategory } from '../utils/dropdownStorage'
import { getItems, createItem, updateItem, deleteItem, ITEM_TYPES } from '../utils/itemStorage'
import { NAME_EFFECT_PRESETS, MESSAGE_EFFECT_PRESETS, TITLE_BADGE_PRESETS, DECORATION_PRESETS } from '../utils/effectDisplayStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'
import { isSupabaseEnabled as isAuthSupabase, getAllProfiles } from '../utils/authSupabase'

function DropdownManagement({ userRole: propUserRole }) {
  const [userRole, setUserRole] = useState(propUserRole)
  const [selectedCategory, setSelectedCategory] = useState('participants')
  const [dropdownOptions, setDropdownOptions] = useState([])
  const [newOption, setNewOption] = useState('')
  const [newBoundAccount, setNewBoundAccount] = useState('') // 新增時的綁定帳號
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editBoundAccount, setEditBoundAccount] = useState('') // 編輯時的綁定帳號
  const [users, setUsers] = useState([]) // 用戶列表

  // 特效道具庫（固定ID模板）
  const [effectItems, setEffectItems] = useState([])
  const [fxForm, setFxForm] = useState({
    id: '',
    name: '',
    type: ITEM_TYPES.NAME_EFFECT,
    presetId: '',
    decorationPresetId: '',
    icon: '✨',
    description: ''
  })
  const [fxEditingId, setFxEditingId] = useState(null)

  useEffect(() => {
    if (!userRole) {
      const role = getCurrentUserRole()
      setUserRole(role)
    }
    loadUsersAndOptions()
  }, [propUserRole])

  const loadUsersAndOptions = async () => {
    try {
      if (isAuthSupabase()) {
        const profiles = await getAllProfiles()
        setUsers(profiles.map(p => ({ account: p.account, name: p.display_name || p.account, role: p.is_admin ? 'admin' : 'user' })))
      } else {
        setUsers(Array.isArray(getUsers()) ? getUsers() : [])
      }
      loadDropdownOptions()
    } catch (e) {
      setUsers(Array.isArray(getUsers()) ? getUsers() : [])
      loadDropdownOptions()
    }
  }

  const loadDropdownOptions = () => {
    try {
      const options = getDropdownOptionsByCategory(selectedCategory)
      setDropdownOptions(Array.isArray(options) ? options : [])
    } catch (e) {
      setDropdownOptions([])
    }
  }

  const refetchDropdown = () => {
    loadUsersAndOptions()
  }
  useRealtimeKeys(['jiameng_users', 'jiameng_dropdown_options', 'jiameng_items'], refetchDropdown)

  useEffect(() => {
    loadDropdownOptions()
  }, [selectedCategory])

  const loadEffectItems = () => {
    try {
      const list = (getItems() || []).filter((it) => it && it.isEffectTemplate)
      setEffectItems(list)
    } catch (_) {
      setEffectItems([])
    }
  }

  useEffect(() => {
    if (selectedCategory === 'effect_items') loadEffectItems()
  }, [selectedCategory])

  const startEditEffectItem = (it) => {
    setFxEditingId(it.id)
    setFxForm({
      id: it.id || '',
      name: it.name || '',
      type: it.type || ITEM_TYPES.NAME_EFFECT,
      presetId: it.presetId || '',
      decorationPresetId: it.decorationPresetId || '',
      icon: it.icon || '✨',
      description: it.description || ''
    })
  }

  const resetEffectItemForm = () => {
    setFxEditingId(null)
    setFxForm({
      id: '',
      name: '',
      type: ITEM_TYPES.NAME_EFFECT,
      presetId: '',
      decorationPresetId: '',
      icon: '✨',
      description: ''
    })
  }

  const saveEffectItem = () => {
    const id = String(fxForm.id || '').trim()
    const name = String(fxForm.name || '').trim()
    if (!id) return alert('請輸入固定 ID')
    if (!name) return alert('請輸入道具名稱')

    const payload = {
      id,
      name,
      type: fxForm.type,
      presetId: String(fxForm.presetId || '').trim(),
      decorationPresetId: fxForm.type === ITEM_TYPES.NAME_EFFECT ? String(fxForm.decorationPresetId || '').trim() : '',
      icon: String(fxForm.icon || '').trim() || (fxForm.type === ITEM_TYPES.MESSAGE_EFFECT ? '💫' : fxForm.type === ITEM_TYPES.TITLE ? '🏷️' : '✨'),
      description: String(fxForm.description || '').trim(),
      price: 0,
      isEffectTemplate: true
    }

    if (fxEditingId) {
      const res = updateItem(fxEditingId, payload)
      if (!res.success) return alert(res.message || '更新失敗')
      loadEffectItems()
      alert('已更新特效道具')
      return
    }

    const res = createItem(payload)
    if (!res.success) return alert(res.message || '新增失敗')
    loadEffectItems()
    alert('已新增特效道具')
    resetEffectItemForm()
  }

  const removeEffectItem = (id) => {
    if (!window.confirm(`確定刪除特效道具「${id}」？`)) return
    const res = deleteItem(id)
    if (!res.success) return alert(res.message || '刪除失敗')
    loadEffectItems()
    if (fxEditingId === id) resetEffectItemForm()
  }

  const handleAddOption = (e) => {
    e.preventDefault()
    if (!newOption.trim()) return
    
    // "參與人員"和"負責人"分類需要綁定帳號
    const boundAccount = (selectedCategory === 'participants' || selectedCategory === 'responsible_persons') ? newBoundAccount : ''
    const result = addDropdownOption(newOption.trim(), selectedCategory, boundAccount)
    if (result.success) {
      setNewOption('')
      setNewBoundAccount('')
      loadDropdownOptions()
    } else {
      alert(result.message || '添加失敗')
    }
  }

  const handleDeleteOption = (id) => {
    if (!window.confirm('確定要刪除此選項嗎？')) return
    
    const result = deleteDropdownOption(id)
    if (result.success) {
      loadDropdownOptions()
    } else {
      alert(result.message || '刪除失敗')
    }
  }

  const handleStartEdit = (option) => {
    setEditingId(option.id)
    setEditValue(option.value)
    setEditBoundAccount(option.boundAccount || '')
  }

  const handleSaveEdit = (id) => {
    if (!editValue.trim()) return
    
    // "參與人員"和"負責人"分類需要綁定帳號
    const boundAccount = (selectedCategory === 'participants' || selectedCategory === 'responsible_persons') ? editBoundAccount : ''
    const result = updateDropdownOption(id, editValue.trim(), boundAccount)
    if (result.success) {
      setEditingId(null)
      setEditValue('')
      setEditBoundAccount('')
      loadDropdownOptions()
    } else {
      alert(result.message || '更新失敗')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditValue('')
    setEditBoundAccount('')
  }

  const handleMoveOption = (id, delta) => {
    const list = Array.isArray(dropdownOptions) ? dropdownOptions : []
    const from = list.findIndex((x) => x.id === id)
    if (from < 0) return
    const to = from + delta
    if (to < 0 || to >= list.length) return

    const next = [...list]
    const tmp = next[from]
    next[from] = next[to]
    next[to] = tmp
    setDropdownOptions(next)

    const res = reorderDropdownOptionsByCategory(selectedCategory, next.map((x) => x.id))
    if (!res?.success) {
      // 回復到最新資料
      loadDropdownOptions()
      alert(res?.message || '排序失敗')
    }
  }

  const isAdmin = userRole === 'admin'

  if (!isAdmin) {
    return (
      <div className="bg-charcoal rounded-lg p-6">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">下拉選單管理</h2>
        <div className="text-red-400 text-center py-12">
          <p className="text-lg mb-2">權限不足</p>
          <p className="text-sm">只有管理者可以編輯下拉選單</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">下拉選單管理</h2>
      
      {/* 分類選擇 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">選擇分類</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory('participants')}
            className={`px-4 py-2 rounded transition-colors cursor-pointer touch-manipulation min-h-[44px] ${
              selectedCategory === 'participants'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            參與人員
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('vehicles')}
            className={`px-4 py-2 rounded transition-colors cursor-pointer touch-manipulation min-h-[44px] ${
              selectedCategory === 'vehicles'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            車輛
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('responsible_persons')}
            className={`px-4 py-2 rounded transition-colors cursor-pointer touch-manipulation min-h-[44px] ${
              selectedCategory === 'responsible_persons'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            負責人
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('effect_items')}
            className={`px-4 py-2 rounded transition-colors cursor-pointer touch-manipulation min-h-[44px] ${
              selectedCategory === 'effect_items'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            特效道具庫
          </button>
        </div>
      </div>
      
      {selectedCategory === 'effect_items' ? (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">{fxEditingId ? '編輯特效道具（固定ID）' : '新增特效道具（固定ID）'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 text-sm mb-1">固定 ID（不可重複）</label>
                <input
                  value={fxForm.id}
                  onChange={(e) => setFxForm({ ...fxForm, id: e.target.value })}
                  placeholder="例如：fx_name_gold_01"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  disabled={!!fxEditingId}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">道具名稱</label>
                <input
                  value={fxForm.name}
                  onChange={(e) => setFxForm({ ...fxForm, name: e.target.value })}
                  placeholder="例如：金黃光暈（固定）"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">類型</label>
                <select
                  value={fxForm.type}
                  onChange={(e) => {
                    const t = e.target.value
                    setFxForm({
                      ...fxForm,
                      type: t,
                      icon: t === ITEM_TYPES.MESSAGE_EFFECT ? '💫' : t === ITEM_TYPES.TITLE ? '🏷️' : '✨',
                      presetId: '',
                      decorationPresetId: ''
                    })
                  }}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
                >
                  <option value={ITEM_TYPES.NAME_EFFECT}>名子特效</option>
                  <option value={ITEM_TYPES.MESSAGE_EFFECT}>發話特效</option>
                  <option value={ITEM_TYPES.TITLE}>稱號徽章</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">圖示</label>
                <input
                  value={fxForm.icon}
                  onChange={(e) => setFxForm({ ...fxForm, icon: e.target.value })}
                  placeholder="例如：✨"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-gray-400 text-sm mb-1">樣式（Preset）</label>
                <select
                  value={fxForm.presetId}
                  onChange={(e) => setFxForm({ ...fxForm, presetId: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
                >
                  <option value="">（留空 = 全站預設）</option>
                  {(fxForm.type === ITEM_TYPES.NAME_EFFECT ? NAME_EFFECT_PRESETS : fxForm.type === ITEM_TYPES.MESSAGE_EFFECT ? MESSAGE_EFFECT_PRESETS : TITLE_BADGE_PRESETS).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">此處設定會寫入道具本身，之後排行榜只要指定道具 ID 即可。</p>
              </div>

              {fxForm.type === ITEM_TYPES.NAME_EFFECT && (
                <div className="sm:col-span-2">
                  <label className="block text-gray-400 text-sm mb-1">名子旁裝飾（選填）</label>
                  <select
                    value={fxForm.decorationPresetId}
                    onChange={(e) => setFxForm({ ...fxForm, decorationPresetId: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
                  >
                    <option value="">無</option>
                    {DECORATION_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-gray-400 text-sm mb-1">描述（選填）</label>
                <input
                  value={fxForm.description}
                  onChange={(e) => setFxForm({ ...fxForm, description: e.target.value })}
                  placeholder="例如：排行榜獎勵用固定特效"
                  className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              {fxEditingId && (
                <button
                  type="button"
                  onClick={resetEffectItemForm}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  取消編輯
                </button>
              )}
              <button
                type="button"
                onClick={saveEffectItem}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 transition-colors font-semibold"
              >
                {fxEditingId ? '保存更新' : '新增道具'}
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">已建立的特效道具（固定ID）</h3>
              <p className="text-gray-500 text-xs mt-1">這裡的道具 ID 之後可在排行榜「第 1/2/3 名」指定分發。</p>
            </div>
            <div className="p-4 space-y-2">
              {effectItems.length === 0 ? (
                <p className="text-gray-500 text-sm">尚無特效道具，請先新增。</p>
              ) : (
                effectItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 p-3 bg-gray-900 rounded border border-gray-700">
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{it.icon} {it.name}</div>
                      <div className="text-gray-500 text-xs truncate">
                        ID: {it.id} ／ {it.type} ／ preset: {it.presetId || 'default'}{it.decorationPresetId ? ` ／ deco: ${it.decorationPresetId}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditEffectItem(it)}
                        className="text-amber-400 hover:text-amber-300 text-sm"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEffectItem(it.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 新增選項 */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          新增{
            selectedCategory === 'participants' ? '參與人員' : 
            selectedCategory === 'vehicles' ? '車輛' : 
            '負責人'
          }選項
        </h3>
        <form onSubmit={handleAddOption} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              placeholder="請輸入選項名稱"
              className="flex-1 bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
            />
            <button
              type="submit"
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-6 py-2 rounded transition-colors cursor-pointer touch-manipulation min-h-[44px]"
            >
              新增
            </button>
          </div>
          {(selectedCategory === 'participants' || selectedCategory === 'responsible_persons') && (
            <div>
              <label className="block text-gray-400 text-sm mb-2">綁定用戶帳號（選填，用於帶入績效）</label>
              <select
                value={newBoundAccount}
                onChange={(e) => setNewBoundAccount(e.target.value)}
                className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400 cursor-pointer min-h-[44px] touch-manipulation"
              >
                <option value="">不綁定</option>
                {(Array.isArray(users) ? users : []).map(user => (
                  <option key={user.account} value={user.account}>
                    {user.name || user.account}
                  </option>
                ))}
              </select>
              <p className="text-gray-500 text-xs mt-1">選擇帳號後，下拉選單仍顯示設定的名稱，但可帶入該帳號的績效資料</p>
            </div>
          )}
        </form>
      </div>

      {/* 選項列表 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <h3 className="text-lg font-semibold text-white p-4 border-b border-gray-700">選項列表</h3>
        {(Array.isArray(dropdownOptions) ? dropdownOptions : []).length === 0 ? (
          <div className="text-gray-400 text-center py-12">
            <p>尚無選項，請新增選項</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {(Array.isArray(dropdownOptions) ? dropdownOptions : []).map((option, idx) => (
              <div key={option.id} className="p-4 hover:bg-gray-750 flex items-center justify-between gap-3">
                {editingId === option.id ? (
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(option.id)}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
                      >
                        取消
                      </button>
                    </div>
                    {(selectedCategory === 'participants' || selectedCategory === 'responsible_persons') && (
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">綁定用戶帳號（選填）</label>
                        <select
                          value={editBoundAccount}
                          onChange={(e) => setEditBoundAccount(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400 cursor-pointer min-h-[44px] touch-manipulation"
                        >
                          <option value="">不綁定</option>
                          {(Array.isArray(users) ? users : []).map(user => (
                            <option key={user.account} value={user.account}>
                              {user.name || user.account}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-white flex-1">
                      <div>{(selectedCategory === 'participants' || selectedCategory === 'responsible_persons') && option.boundAccount
                        ? (users.find(u => u.account === option.boundAccount)?.name) || option.value
                        : option.value}
                      </div>
                      {(selectedCategory === 'participants' || selectedCategory === 'responsible_persons') && option.boundAccount && (
                        <div className="text-gray-400 text-xs mt-1">
                          已綁定: {(users.find(u => u.account === option.boundAccount)?.name) || option.boundAccount}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveOption(option.id, -1)}
                          disabled={idx === 0}
                          className={`px-2 py-2 rounded text-sm transition-colors min-h-[36px] ${
                            idx === 0 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-700 text-white hover:bg-gray-600'
                          }`}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOption(option.id, 1)}
                          disabled={idx === (Array.isArray(dropdownOptions) ? dropdownOptions.length : 0) - 1}
                          className={`px-2 py-2 rounded text-sm transition-colors min-h-[36px] ${
                            idx === (Array.isArray(dropdownOptions) ? dropdownOptions.length : 0) - 1
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 text-white hover:bg-gray-600'
                          }`}
                          title="下移"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        onClick={() => handleStartEdit(option)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors text-sm"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDeleteOption(option.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors text-sm"
                      >
                        刪除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

export default DropdownManagement
