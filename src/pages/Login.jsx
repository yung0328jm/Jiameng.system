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
      className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4 w-full bg-gradient-to-b from-cn-ink via-cn-lacquer to-cn-ink"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))' }}
    >
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-b from-cn-panel/95 to-cn-lacquer rounded-xl border-2 border-cn-gold/50 p-5 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,230,200,0.06)]">
          {/* 标题 */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold mb-2 font-serif tracking-widest">
              毓承事業群
            </h1>
            <p className="text-cn-parchment/90 text-sm font-serif">
              企業管理系統
            </p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">帳號或 Email</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號或 Email"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
              />
            </div>
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-cn-mist text-sm select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberAccount}
                onChange={(e) => setRememberAccount(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              記住帳號
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold py-3 rounded-md hover:from-amber-100 hover:to-amber-300 active:brightness-95 transition-colors border border-amber-900/35 shadow-lg mt-4 touch-manipulation text-base disabled:opacity-60 disabled:cursor-not-allowed font-serif"
            >
              {submitting ? '登入中…' : '登錄'}
            </button>
          </form>

          <div className="mt-4">
            <Link
              to="/contractor-work"
              className="flex items-center justify-center w-full min-h-[48px] py-3 rounded-md border-2 border-teal-500/70 bg-teal-950/40 text-teal-200 hover:bg-teal-900/50 active:bg-teal-900/60 transition-colors text-base font-serif touch-manipulation"
            >
              廠商登記入口
            </Link>
          </div>

          <div className="mt-5 sm:mt-6 text-center">
            <span className="text-cn-mist text-sm">還沒有帳號? </span>
            <Link to="/register" className="text-cn-gold text-sm hover:text-amber-200 active:text-amber-200 transition-colors touch-manipulation inline-block py-2 font-serif">
              立即註冊
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
