import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { saveUser } from '../utils/storage'
import { checkRegistrationPassword } from '../utils/registrationPasswordStorage'
import { isSupabaseEnabled, signUpWithProfile } from '../utils/authSupabase'

function Register({ onLogin }) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    account: '',
    registrationPassword: '', // 由管理員設置的註冊密碼
    password: '',
    confirmPassword: ''
  })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name || !formData.account || !formData.password || !formData.confirmPassword) {
      setMessage('請填寫所有必填欄位')
      return
    }

    const pwdCheck = checkRegistrationPassword(formData.registrationPassword || '')
    if (!pwdCheck.success) {
      setMessage(pwdCheck.message || '註冊密碼錯誤')
      return
    }

    if (formData.password.length < 3) {
      setMessage('密碼至少需要3個字符')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setMessage('兩次輸入的密碼不一致')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      if (isSupabaseEnabled()) {
        const result = await signUpWithProfile({
          email: `${formData.account}@jiameng.local`,
          password: formData.password,
          account: formData.account,
          display_name: formData.name
        })
        if (result.success) {
          setMessage('註冊成功！用戶資料已儲存，正在跳轉...')
          onLogin?.()
          setTimeout(() => navigate('/dashboard'), 1000)
        } else {
          setMessage(result.message || '註冊失敗')
        }
        return
      }
      const result = await saveUser({
        name: formData.name,
        account: formData.account,
        password: formData.password
      })
      if (result.success) {
        setMessage('註冊成功！正在跳轉到登錄頁面...')
        setTimeout(() => navigate('/login'), 1500)
      } else {
        setMessage(result.message)
      }
    } catch (err) {
      setMessage('註冊失敗，請稍後再試')
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
            <h1 className="text-2xl sm:text-3xl font-bold text-cn-vermilion mb-2 font-serif tracking-widest">
              毓承事業群
            </h1>
            <p className="text-cn-vermilion/90 text-sm font-serif">
              企業管理系統 · 註冊
            </p>
            <p className="text-cn-mist/80 text-xs mt-1">
              目前註冊會寫入：{isSupabaseEnabled() ? 'Supabase（會出現在 Auth 用戶列表）' : '僅本地（不會出現在 Supabase）'}
            </p>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`mb-6 p-3 rounded-md text-sm ${
              message.includes('成功')
                ? 'bg-emerald-950/50 text-emerald-200 border border-cn-jade/45'
                : 'bg-red-950/45 text-red-200 border border-cn-vermilion/45'
            }`}>
              {message}
            </div>
          )}

          {/* 注册表单 */}
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5 sm:space-y-6">
            {/* 防止瀏覽器把登入帳密自動帶入註冊欄位（特別是 Chrome） */}
            <input type="text" name="fake_username" autoComplete="username" style={{ display: 'none' }} />
            <input type="password" name="fake_password" autoComplete="new-password" style={{ display: 'none' }} />
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">姓名 *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="請輸入姓名"
                autoComplete="off"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
              />
            </div>

            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">帳號 *</label>
              <input
                type="text"
                name="account"
                value={formData.account}
                onChange={handleChange}
                placeholder="請輸入帳號"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
              />
            </div>
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">註冊密碼</label>
              <input
                type="password"
                name="registrationPassword"
                value={formData.registrationPassword}
                onChange={handleChange}
                placeholder="由管理員提供，未設置則可留空"
                autoComplete="off"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
              />
            </div>
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">密碼 *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="請輸入密碼 (至少3個字符)"
                autoComplete="new-password"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
                minLength={3}
              />
            </div>
            <div>
              <label className="block text-cn-mist text-sm mb-1.5 sm:mb-2">確認密碼 *</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="請再次輸入密碼"
                autoComplete="new-password"
                className="w-full bg-black/30 border border-cn-gold/35 rounded-md px-4 py-3 text-cn-parchment text-base placeholder-cn-mist/50 focus:outline-none focus:ring-2 focus:ring-cn-gold/40 transition-colors touch-manipulation"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold py-3 rounded-md hover:from-amber-100 hover:to-amber-300 active:brightness-95 transition-colors border border-amber-900/35 shadow-lg mt-4 touch-manipulation text-base disabled:opacity-60 disabled:cursor-not-allowed font-serif"
            >
              {submitting ? '註冊中並同步…' : '立即註冊'}
            </button>
          </form>

          <div className="mt-5 sm:mt-6 text-center">
            <span className="text-cn-mist text-sm">已有帳號? </span>
            <Link to="/login" className="text-cn-gold text-sm hover:text-amber-200 transition-colors font-serif">
              返回登錄
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
