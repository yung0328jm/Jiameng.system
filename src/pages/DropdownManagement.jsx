import { useState, useEffect } from 'react'
import { getCurrentUserRole } from '../utils/authStorage'
import { getUsers } from '../utils/storage'
import { getDropdownOptions, getDropdownOptionsByCategory, saveDropdownOptions, addDropdownOption, updateDropdownOption, deleteDropdownOption } from '../utils/dropdownStorage'

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

  useEffect(() => {
    if (!userRole) {
      const role = getCurrentUserRole()
      setUserRole(role)
    }
    // 載入用戶列表（用於帳號綁定）
    const allUsers = getUsers()
    setUsers(allUsers)
    loadDropdownOptions()
  }, [propUserRole])

  const loadDropdownOptions = () => {
    try {
      const options = getDropdownOptionsByCategory(selectedCategory)
      setDropdownOptions(Array.isArray(options) ? options : [])
    } catch (e) {
      setDropdownOptions([])
    }
  }

  const refetchDropdown = () => {
    try {
      setUsers(Array.isArray(getUsers()) ? getUsers() : [])
      loadDropdownOptions()
    } catch (e) {
      setUsers([])
      setDropdownOptions([])
    }
  }
  useRealtimeKeys(['jiameng_users', 'jiameng_dropdown_options'], refetchDropdown)

  useEffect(() => {
    loadDropdownOptions()
  }, [selectedCategory])

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
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedCategory('participants')}
            className={`px-4 py-2 rounded transition-colors ${
              selectedCategory === 'participants'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            參與人員
          </button>
          <button
            onClick={() => setSelectedCategory('vehicles')}
            className={`px-4 py-2 rounded transition-colors ${
              selectedCategory === 'vehicles'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            車輛
          </button>
          <button
            onClick={() => setSelectedCategory('responsible_persons')}
            className={`px-4 py-2 rounded transition-colors ${
              selectedCategory === 'responsible_persons'
                ? 'bg-yellow-400 text-gray-800 font-semibold'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            負責人
          </button>
        </div>
      </div>
      
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
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-6 py-2 rounded transition-colors"
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
                className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="">不綁定</option>
                {(Array.isArray(users) ? users : []).map(user => (
                  <option key={user.account} value={user.account}>
                    {user.account} {user.name ? `(${user.name})` : ''}
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
            {(Array.isArray(dropdownOptions) ? dropdownOptions : []).map((option) => (
              <div key={option.id} className="p-4 hover:bg-gray-750 flex items-center justify-between">
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
                          className="w-full bg-gray-700 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                        >
                          <option value="">不綁定</option>
                          {(Array.isArray(users) ? users : []).map(user => (
                            <option key={user.account} value={user.account}>
                              {user.account} {user.name ? `(${user.name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-white flex-1">
                      <div>{option.value}</div>
                      {(selectedCategory === 'participants' || selectedCategory === 'responsible_persons') && option.boundAccount && (
                        <div className="text-gray-400 text-xs mt-1">
                          已綁定帳號: {option.boundAccount}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
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
    </div>
  )
}

export default DropdownManagement
