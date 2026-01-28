import { useState, useEffect } from 'react'
import { getCompanyActivities, addCompanyActivity, updateCompanyActivity, deleteCompanyActivity, signUpForActivity, cancelSignUp } from '../utils/companyActivityStorage'
import { getCurrentUserRole, getCurrentUser } from '../utils/authStorage'
import { useRealtimeKeys } from '../contexts/SyncContext'

function CompanyActivities() {
  const [activities, setActivities] = useState([])
  const [filteredActivities, setFilteredActivities] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSignUpModal, setShowSignUpModal] = useState(false)
  const [signUpActivityId, setSignUpActivityId] = useState(null)
  const [signUpForm, setSignUpForm] = useState({ includeFamily: false, familyCount: 0 })
  const [editingActivity, setEditingActivity] = useState(null)
  const [viewingActivityId, setViewingActivityId] = useState(null)
  const [editingStatusId, setEditingStatusId] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    status: 'planning'
  })
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    const role = getCurrentUserRole()
    setUserRole(role)
    loadActivities()
  }, [])

  useEffect(() => {
    filterActivities()
  }, [activities, filterStatus])

  const loadActivities = () => {
    const data = getCompanyActivities()
    // 按日期排序（最新的在前）
    data.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    setActivities(data)
  }
  useRealtimeKeys(['jiameng_company_activities'], loadActivities)

  const filterActivities = () => {
    if (filterStatus === 'all') {
      setFilteredActivities(activities)
    } else {
      setFilteredActivities(activities.filter(activity => activity.status === filterStatus))
    }
  }

  const handleAdd = () => {
    setEditingActivity(null)
    setFormData({
      title: '',
      description: '',
      date: '',
      time: '',
      location: '',
      status: 'planning'
    })
    setShowAddModal(true)
  }

  const handleEdit = (activity) => {
    setEditingActivity(activity)
    setFormData({
      title: activity.title || '',
      description: activity.description || '',
      date: activity.date || '',
      time: activity.time || '',
      location: activity.location || '',
      status: activity.status || 'planning'
    })
    setShowAddModal(true)
  }

  const handleOpenSignUp = (activityId) => {
    setSignUpActivityId(activityId)
    setSignUpForm({ includeFamily: false, familyCount: 0 })
    setShowSignUpModal(true)
  }

  const handleConfirmSignUp = () => {
    const username = getCurrentUser()
    if (!username) {
      alert('請先登入後再報名')
      return
    }
    if (!signUpActivityId) return
    const res = signUpForActivity(signUpActivityId, {
      username,
      includeFamily: signUpForm.includeFamily,
      familyCount: signUpForm.includeFamily ? signUpForm.familyCount : 0
    })
    if (res.success) {
      alert('報名成功')
      loadActivities()
      setShowSignUpModal(false)
      setSignUpActivityId(null)
    } else {
      alert(res.message || '報名失敗')
    }
  }

  const handleCancelSignUp = (activityId) => {
    const username = getCurrentUser()
    if (!username) return
    if (!window.confirm('確定要取消報名嗎？')) return
    const res = cancelSignUp(activityId, username)
    if (res.success) {
      loadActivities()
    } else {
      alert(res.message || '取消報名失敗')
    }
  }

  const handleViewActivity = (activityId) => {
    setViewingActivityId(activityId)
    setShowAddModal(false)
  }

  const handleBackToActivityList = () => {
    setViewingActivityId(null)
  }

  const handleSave = () => {
    if (userRole !== 'admin') {
      alert('只有管理者可以新增或編輯活動')
      return
    }
    if (!formData.title.trim()) {
      alert('請輸入活動標題')
      return
    }

    if (editingActivity) {
      const result = updateCompanyActivity(editingActivity.id, formData)
      if (result.success) {
        alert('更新成功')
        loadActivities()
        setShowAddModal(false)
        setEditingActivity(null)
      } else {
        alert(result.message || '更新失敗')
      }
    } else {
      const result = addCompanyActivity(formData)
      if (result.success) {
        alert('添加成功')
        loadActivities()
        setShowAddModal(false)
        setFormData({
          title: '',
          description: '',
          date: '',
          time: '',
          location: '',
          status: 'planning'
        })
      } else {
        alert(result.message || '添加失敗')
      }
    }
  }

  const handleDelete = (id) => {
    if (window.confirm('確定要刪除此活動嗎？')) {
      const result = deleteCompanyActivity(id)
      if (result.success) {
        alert('刪除成功')
        loadActivities()
      } else {
        alert(result.message || '刪除失敗')
      }
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'planning':
        return 'bg-blue-500'
      case 'registration':
        return 'bg-yellow-400'
      case 'ongoing':
        return 'bg-orange-500'
      case 'ended':
      case 'completed':
        return 'bg-green-500'
      case 'in-progress':
        return 'bg-yellow-400'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'planning':
        return '規劃中'
      case 'registration':
        return '開始報名'
      case 'ongoing':
        return '進行中'
      case 'ended':
      case 'completed':
        return '活動結束'
      case 'in-progress':
        return '開始報名'
      default:
        return status
    }
  }

  const formatActivityDate = (dateStr) => {
    if (!dateStr) return '—'
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-')
      const year = parseInt(y) - 1911
      return `${year}/${m}/${d}`
    }
    return dateStr
  }

  const viewingActivity = viewingActivityId ? activities.find(a => a.id === viewingActivityId) : null

  return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <div className="bg-charcoal rounded-lg p-4 sm:p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-2xl font-bold text-yellow-400">公司活動</h2>
        </div>
        {!viewingActivityId && userRole === 'admin' && (
          <button
            onClick={handleAdd}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>新增活動</span>
          </button>
        )}
      </div>

      {/* 活動管理內容 */}
      {!viewingActivityId && (
        <>
          {/* 狀態分類標籤 */}
          <div className="flex items-center flex-wrap gap-3 sm:gap-2 mb-6 pb-4 border-b border-gray-700">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterStatus === 'all'
                  ? 'bg-yellow-400 text-gray-800'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilterStatus('planning')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterStatus === 'planning'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              規劃中
            </button>
            <button
              onClick={() => setFilterStatus('registration')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterStatus === 'registration'
                  ? 'bg-yellow-400 text-gray-800'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              開始報名
            </button>
            <button
              onClick={() => setFilterStatus('ongoing')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterStatus === 'ongoing'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              進行中
            </button>
            <button
              onClick={() => setFilterStatus('ended')}
              className={`px-5 sm:px-4 py-3 sm:py-2 rounded-lg font-semibold transition-colors text-base sm:text-sm min-h-[44px] sm:min-h-0 ${
                filterStatus === 'ended'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              活動結束
            </button>
          </div>

          {/* 活動網格 - 排行榜風格 */}
          {filteredActivities.length === 0 ? (
            <div className="text-gray-400 text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-lg mb-2">
                {activities.length === 0 
                  ? '目前尚無活動' 
                  : `目前沒有「${getStatusText(filterStatus)}」狀態的活動`}
              </p>
              <p className="text-sm">
                {activities.length === 0 
                  ? '點擊「新增活動」開始建立' 
                  : '請選擇其他分類或新增活動'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredActivities.map((activity, index) => (
                <div
                  key={activity.id}
                  className="relative rounded-lg overflow-hidden shadow-lg bg-gray-800 border border-gray-700 min-h-[200px] flex flex-col"
                >
                  {/* 刪除按鈕 */}
                  {userRole === 'admin' && (
                    <div className="absolute top-3 right-3 z-20">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(activity.id) }}
                        className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                        title="刪除活動"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <div
                    onClick={() => handleViewActivity(activity.id)}
                    className="relative cursor-pointer flex-1 flex flex-col p-6 items-center justify-center z-10"
                  >
                    {/* 進度標籤 */}
                    <div className="absolute top-3 left-3 z-20">
                      <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${getStatusColor(activity.status)} text-white`}>
                        {getStatusText(activity.status)}
                      </span>
                    </div>
                    {/* 只顯示活動標題 */}
                    <h3 className="text-white text-3xl font-bold text-center relative z-10">
                      {activity.title || '活動'}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 活動詳情頁面 */}
      {viewingActivityId && viewingActivity && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-yellow-400">
              活動內容: {viewingActivity.title || ''}
            </h2>
            <button
              onClick={handleBackToActivityList}
              className="bg-gray-700 hover:bg-gray-600 text-yellow-400 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>返回活動列表</span>
            </button>
          </div>

          {/* 活動基本資訊 */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動標題</label>
                <p className="text-white font-semibold">{viewingActivity.title || '—'}</p>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動狀態</label>
                <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${getStatusColor(viewingActivity.status)} text-white`}>
                  {getStatusText(viewingActivity.status)}
                </span>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動日期</label>
                <p className="text-white font-semibold">{formatActivityDate(viewingActivity.date) || '—'}</p>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動時間</label>
                <p className="text-white font-semibold">{viewingActivity.time || '—'}</p>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動地點</label>
                <p className="text-white font-semibold">{viewingActivity.location || '—'}</p>
              </div>
              {viewingActivity.description && (
                <div className="md:col-span-2">
                  <label className="block text-gray-400 text-sm mb-2">活動描述</label>
                  <p className="text-white">{viewingActivity.description}</p>
                </div>
              )}
            </div>

            {/* 報名區塊：開始報名時顯示報名按鈕或已報名狀態 */}
            {viewingActivity.status === 'registration' && (() => {
              const signups = viewingActivity.signups || []
              const currentUser = getCurrentUser()
              const hasSignedUp = currentUser && signups.some(s => s.username === currentUser)
              return (
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-yellow-400 font-semibold">我要報名</h4>
                    {hasSignedUp ? (
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 font-semibold">已報名</span>
                        <button
                          onClick={() => handleCancelSignUp(viewingActivity.id)}
                          className="bg-gray-600 hover:bg-gray-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          取消報名
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenSignUp(viewingActivity.id)}
                        className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        報名參加
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 報名名單 */}
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h4 className="text-yellow-400 font-semibold mb-3">
                報名名單（{(viewingActivity.signups || []).length} 人）
              </h4>
              {(viewingActivity.signups || []).length === 0 ? (
                <p className="text-gray-400 text-sm">尚無報名</p>
              ) : (
                <ul className="space-y-2">
                  {(viewingActivity.signups || []).map((s, i) => (
                    <li key={i} className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-lg">
                      <span className="text-white">
                        {s.username}
                        {s.includeFamily && (
                          <span className="text-yellow-400 text-sm ml-2">
                            ＋眷屬{s.familyCount > 0 ? ` ${s.familyCount} 人` : ''}
                          </span>
                        )}
                      </span>
                      {getCurrentUser() === s.username && (
                        <button
                          onClick={() => handleCancelSignUp(viewingActivity.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          取消報名
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {userRole === 'admin' && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={() => handleEdit(viewingActivity)}
                  className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  編輯活動
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 新增/編輯活動彈窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 border border-yellow-400 w-full max-w-md">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">
              {editingActivity ? '編輯活動' : '新增活動'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動標題 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  placeholder="輸入活動標題"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動日期</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動時間</label>
                <input
                  type="text"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  placeholder="例：14:00 或 14:00-16:00"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動地點</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  placeholder="輸入活動地點"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                  rows="3"
                  placeholder="輸入活動描述（選填）"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">活動狀態</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="planning">規劃中</option>
                  <option value="registration">開始報名</option>
                  <option value="ongoing">進行中</option>
                  <option value="ended">活動結束</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingActivity(null)
                  setFormData({
                    title: '',
                    description: '',
                    date: '',
                    time: '',
                    location: '',
                    status: 'planning'
                  })
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 transition-colors font-semibold"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 報名參加彈窗：包含眷屬選項 */}
      {showSignUpModal && signUpActivityId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 border border-yellow-400 w-full max-w-md">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">報名參加</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={signUpForm.includeFamily}
                  onChange={(e) => setSignUpForm({ ...signUpForm, includeFamily: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
                />
                <span className="text-white">包含眷屬</span>
              </label>
              {signUpForm.includeFamily && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">眷屬人數</label>
                  <input
                    type="number"
                    min={0}
                    value={signUpForm.familyCount}
                    onChange={(e) => setSignUpForm({ ...signUpForm, familyCount: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
                    placeholder="0"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowSignUpModal(false); setSignUpActivityId(null) }}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSignUp}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded hover:bg-yellow-500 transition-colors font-semibold"
              >
                確認報名
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CompanyActivities
