// 終極密碼：1–100 猜數字
import { useState, useCallback } from 'react'

const MIN = 1
const MAX = 100

function randomInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a
}

export default function UltimatePassword({ onBack }) {
  const [secret, setSecret] = useState(null)
  const [low, setLow] = useState(MIN)
  const [high, setHigh] = useState(MAX)
  const [message, setMessage] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [count, setCount] = useState(0)

  const start = useCallback(() => {
    setSecret(randomInt(MIN, MAX))
    setLow(MIN)
    setHigh(MAX)
    setMessage('')
    setGuessInput('')
    setCount(0)
  }, [])

  const submit = () => {
    const n = parseInt(guessInput, 10)
    if (Number.isNaN(n) || n < MIN || n > MAX) {
      setMessage(`請輸入 ${MIN}～${MAX} 的整數`)
      return
    }
    if (secret === null) return
    setCount((c) => c + 1)
    if (n === secret) {
      setMessage(`答對了！答案就是 ${secret}，共猜了 ${count + 1} 次。`)
      setSecret(null)
      return
    }
    if (n < secret) {
      setLow((prev) => Math.max(prev, n + 1))
      setMessage(`${n} 太小，範圍縮小為 ${Math.max(low, n + 1)}～${high}`)
    } else {
      setHigh((prev) => Math.min(prev, n - 1))
      setMessage(`${n} 太大，範圍縮小為 ${low}～${Math.min(high, n - 1)}`)
    }
    setGuessInput('')
  }

  const isPlaying = secret !== null

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-[320px] mb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-yellow-400 text-sm hover:underline touch-manipulation"
        >
          ← 返回
        </button>
      </div>

      {!isPlaying && !message && (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm mb-4">電腦已想好 1～100 的一個數字，請猜出答案。</p>
          <button
            type="button"
            onClick={start}
            className="px-6 py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
          >
            開始遊戲
          </button>
        </div>
      )}

      {isPlaying && (
        <div className="w-full max-w-[280px] space-y-4">
          <p className="text-gray-300 text-sm text-center">
            範圍：<span className="text-yellow-400 font-semibold">{low}～{high}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min={MIN}
              max={MAX}
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="輸入數字"
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
            />
            <button
              type="button"
              onClick={submit}
              className="px-4 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
            >
              猜
            </button>
          </div>
          {message && <p className="text-gray-400 text-sm text-center">{message}</p>}
        </div>
      )}

      {!isPlaying && message && (
        <div className="text-center py-6">
          <p className="text-yellow-400 font-semibold mb-2">{message}</p>
          <button
            type="button"
            onClick={start}
            className="mt-3 px-6 py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
          >
            再玩一次
          </button>
        </div>
      )}
    </div>
  )
}
