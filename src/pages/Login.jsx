import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { verifyUser } from '../utils/storage'
import { saveCurrentUser } from '../utils/authStorage'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    // 验证用户
    const result = verifyUser(username, password)
    if (result.success) {
      // 保存当前登录用户名和角色
      const userRole = result.user?.role || 'user'
      saveCurrentUser(username, userRole)
      onLogin()
      navigate('/dashboard')
    } else {
      alert(result.message || '帳號或密碼錯誤')
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-800 flex items-center justify-center p-4 w-full"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))' }}
    >
      <div className="w-full max-w-md">
        <div className="bg-charcoal rounded-xl border border-yellow-400/80 p-5 sm:p-8 shadow-2xl">
          {/* 标题 */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-2">
              佳盟事業群
            </h1>
            <p className="text-white text-sm">
              企業管理系統
            </p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">用戶名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入用戶名"
                className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-3 text-white text-base placeholder-gray-400 focus:outline-none focus:border-yellow-400 transition-colors touch-manipulation"
                required
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="w-full bg-gray-700 border border-gray-500 rounded px-4 py-3 text-white text-base placeholder-gray-400 focus:outline-none focus:border-yellow-400 transition-colors touch-manipulation"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] bg-yellow-400 text-black font-semibold py-3 rounded-lg hover:bg-yellow-500 active:bg-yellow-500 transition-colors shadow-lg mt-4 touch-manipulation text-base"
            >
              登錄
            </button>
          </form>

          <div className="mt-5 sm:mt-6 text-center">
            <span className="text-gray-400 text-sm">還沒有帳號? </span>
            <Link to="/register" className="text-yellow-400 text-sm hover:text-yellow-500 active:text-yellow-500 transition-colors touch-manipulation inline-block py-2">
              立即註冊
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
