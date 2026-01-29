import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { verifyUser } from '../utils/storage'
import { saveCurrentUser } from '../utils/authStorage'
import { isSupabaseEnabled, loginWithAccountOrEmail } from '../utils/authSupabase'

const REMEMBER_ACCOUNT_KEY = 'jiameng_remember_account'
const REMEMBERED_USERNAME_KEY = 'jiameng_remembered_username'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberAccount, setRememberAccount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const remember = localStorage.getItem(REMEMBER_ACCOUNT_KEY) === '1'
      const saved = localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
      setRememberAccount(remember)
      if (remember && saved) setUsername(saved)
    } catch (_) {}
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // 記住帳號（只存帳號/Email，不存密碼）
      // - 不勾選：立即清掉
      // - 勾選：僅在「登入成功」後才寫入，避免誤把註冊/錯誤帳號存進去
      try {
        if (!rememberAccount) {
          localStorage.removeItem(REMEMBER_ACCOUNT_KEY)
          localStorage.removeItem(REMEMBERED_USERNAME_KEY)
        }
      } catch (_) {}

      if (isSupabaseEnabled()) {
        const result = await loginWithAccountOrEmail(username.trim(), password)
        if (result.success) {
          try {
            if (rememberAccount) {
              localStorage.setItem(REMEMBER_ACCOUNT_KEY, '1')
              localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim())
            }
          } catch (_) {}
          onLogin()
          navigate('/dashboard')
          return
        }
        alert(result.message || '帳號或密碼錯誤')
        return
      }
      const result = verifyUser(username, password)
      if (result.success) {
        try {
          if (rememberAccount) {
            localStorage.setItem(REMEMBER_ACCOUNT_KEY, '1')
            localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim())
          }
        } catch (_) {}
        const userRole = result.user?.role || 'user'
        saveCurrentUser(username, userRole)
        onLogin()
        navigate('/dashboard')
      } else {
        alert(result.message || '帳號或密碼錯誤')
      }
    } finally {
      setSubmitting(false)
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
              <label className="block text-gray-300 text-sm mb-1.5 sm:mb-2">帳號或 Email</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號或 Email"
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
            <label className="flex items-center gap-2 text-gray-300 text-sm select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberAccount}
                onChange={(e) => setRememberAccount(e.target.checked)}
                className="w-4 h-4 accent-yellow-400"
              />
              記住帳號
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] bg-yellow-400 text-black font-semibold py-3 rounded-lg hover:bg-yellow-500 active:bg-yellow-500 transition-colors shadow-lg mt-4 touch-manipulation text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? '登入中…' : '登錄'}
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
