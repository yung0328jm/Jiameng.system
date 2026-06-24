import { useState } from 'react'
import { isSupabaseEnabled, changePassword } from '../utils/authSupabase'
import { setLocalUserPasswordFromSession } from '../utils/storage'
import { getCurrentUser } from '../utils/authStorage'

const MIN_LEN = 3

function ChangePassword() {
  const account = getCurrentUser() || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (!newPassword.trim()) {
      setMessage('請填寫新密碼')
      return
    }
    if (newPassword.length < MIN_LEN) {
      setMessage(`新密碼至少 ${MIN_LEN} 個字元`)
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('兩次新密碼不一致')
      return
    }

    setSubmitting(true)
    try {
      if (isSupabaseEnabled()) {
        const result = await changePassword(newPassword)
        if (result.success) {
          setMessage('密碼已更新。若使用其他裝置，請用新密碼重新登入。')
          setNewPassword('')
          setConfirmPassword('')
        } else {
          setMessage(result.message || '更新失敗')
        }
      } else {
        const result = await setLocalUserPasswordFromSession(newPassword)
        if (result.success) {
          setMessage('密碼已更新。')
          setNewPassword('')
          setConfirmPassword('')
        } else {
          setMessage(result.message || '更新失敗')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-cn-panel/90 border border-cn-gold/35 rounded-xl p-5 sm:p-6 shadow-lg">
        <h2 className="text-xl font-bold text-cn-gold font-serif tracking-wide mb-1">修改密碼</h2>
        <p className="text-cn-mist text-sm mb-3 leading-relaxed">
          只要<strong className="text-cn-parchment">本裝置仍為登入狀態</strong>，即可直接設定新密碼，<strong className="text-cn-parchment">不必輸入舊密碼</strong>（適合忘記密碼但尚未登出的情況）。
        </p>
        <p className="text-cn-vermilion/90 text-xs mb-5 leading-relaxed border border-cn-vermilion/35 rounded-lg px-3 py-2 bg-black/20">
          他人若可使用您的裝置，也可能修改密碼；離開電腦請登出。若已登出且忘記密碼，請洽管理員或使用信箱重設。
        </p>
        {account && (
          <p className="text-cn-parchment/80 text-sm mb-4">
            目前帳號：<span className="text-cn-gold font-medium">{account}</span>
          </p>
        )}

        {message && (
          <div
            className={`mb-4 p-3 rounded-md text-sm border ${
              message.includes('已更新')
                ? 'bg-emerald-950/50 text-emerald-200 border-cn-jade/45'
                : 'bg-red-950/45 text-red-200 border-cn-vermilion/45'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-cn-parchment/90 text-sm mb-1">新密碼</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-800/90 border border-cn-gold/30 rounded-lg px-3 py-2.5 text-cn-parchment placeholder:text-cn-mist/60 focus:outline-none focus:border-cn-gold/60"
              placeholder={`至少 ${MIN_LEN} 個字元`}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-cn-parchment/90 text-sm mb-1">確認新密碼</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800/90 border border-cn-gold/30 rounded-lg px-3 py-2.5 text-cn-parchment placeholder:text-cn-mist/60 focus:outline-none focus:border-cn-gold/60"
              placeholder="再次輸入新密碼"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-gradient-to-b from-amber-200 to-amber-400 text-cn-ink font-semibold hover:from-amber-100 hover:to-amber-300 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
          >
            {submitting ? '更新中…' : '更新密碼'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChangePassword
