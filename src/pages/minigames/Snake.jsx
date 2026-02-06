// 貪食蛇小遊戲
import { useState, useEffect, useCallback, useRef } from 'react'

const COLS = 17
const ROWS = 17
const CELL_PX = 18
const INITIAL_SPEED_MS = 180

function randomFood(snakeSet) {
  const list = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!snakeSet.has(`${x},${y}`)) list.push({ x, y })
    }
  }
  if (list.length === 0) return null
  return list[Math.floor(Math.random() * list.length)]
}

export default function Snake({ onBack }) {
  const [snake, setSnake] = useState([{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }])
  const [nextDirection, setNextDirection] = useState({ dx: 1, dy: 0 })
  const [food, setFood] = useState(() => {
    const s = new Set(['8,8'])
    return randomFood(s) || { x: 5, y: 5 }
  })
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [started, setStarted] = useState(false)
  const [speedMs, setSpeedMs] = useState(INITIAL_SPEED_MS)
  const tickRef = useRef(null)
  const touchStartRef = useRef({ x: 0, y: 0 })
  const MIN_SWIPE_PX = 28

  const reset = useCallback(() => {
    setSnake([{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }])
    setNextDirection({ dx: 1, dy: 0 })
    const s = new Set([`${Math.floor(COLS / 2)},${Math.floor(ROWS / 2)}`])
    setFood(randomFood(s) || { x: 5, y: 5 })
    setScore(0)
    setGameOver(false)
    setStarted(true)
    setSpeedMs(INITIAL_SPEED_MS)
  }, [])

  useEffect(() => {
    if (!started || gameOver) return

    const run = () => {
      setSnake((prev) => {
        const head = prev[0]
        const dx = nextDirection.dx
        const dy = nextDirection.dy
        const nx = (head.x + dx + COLS) % COLS
        const ny = (head.y + dy + ROWS) % ROWS
        const hitSelf = prev.some((p) => p.x === nx && p.y === ny)
        if (hitSelf) {
          setGameOver(true)
          return prev
        }
        const newSnake = [{ x: nx, y: ny }, ...prev]
        if (nx === food.x && ny === food.y) {
          setScore((s) => s + 1)
          setSpeedMs((ms) => Math.max(80, ms - 6))
          const set = new Set(newSnake.map((p) => `${p.x},${p.y}`))
          setFood(randomFood(set) || { x: nx, y: ny })
          return newSnake
        }
        newSnake.pop()
        return newSnake
      })
    }

    tickRef.current = setInterval(run, speedMs)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [started, gameOver, nextDirection, food, speedMs])

  useEffect(() => {
    const onKey = (e) => {
      if (!started || gameOver) return
      const key = e.key
      if (key === 'ArrowUp') {
        e.preventDefault()
        setNextDirection((d) => (d.dy === 1 ? d : { dx: 0, dy: -1 }))
      } else if (key === 'ArrowDown') {
        e.preventDefault()
        setNextDirection((d) => (d.dy === -1 ? d : { dx: 0, dy: 1 }))
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        setNextDirection((d) => (d.dx === 1 ? d : { dx: -1, dy: 0 }))
      } else if (key === 'ArrowRight') {
        e.preventDefault()
        setNextDirection((d) => (d.dx === -1 ? d : { dx: 1, dy: 0 }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, gameOver])

  const setDir = (dx, dy) => {
    if (!started || gameOver) return
    setNextDirection((d) => {
      if (d.dx === -dx && d.dy === -dy) return d
      return { dx, dy }
    })
  }

  const handleTouchStart = (e) => {
    if (!started || gameOver) return
    const t = e.touches?.[0]
    if (t) {
      touchStartRef.current = { x: t.clientX, y: t.clientY }
    }
  }

  const handleTouchEnd = (e) => {
    if (!started || gameOver) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const { x: sx, y: sy } = touchStartRef.current
    const dx = t.clientX - sx
    const dy = t.clientY - sy
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (ax < MIN_SWIPE_PX && ay < MIN_SWIPE_PX) return
    if (ax >= ay) {
      setDir(dx > 0 ? 1 : -1, 0)
    } else {
      setDir(0, dy > 0 ? 1 : -1)
    }
  }

  const gridW = COLS * CELL_PX
  const gridH = ROWS * CELL_PX

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
        <span className="text-gray-300 text-sm">分數：{score}</span>
      </div>

      {!started ? (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm mb-4">手機：在遊戲區滑動上下左右。電腦：方向鍵。吃到食物會變長。</p>
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
          >
            開始遊戲
          </button>
        </div>
      ) : gameOver ? (
        <div className="text-center py-6">
          <p className="text-yellow-400 font-semibold mb-2">遊戲結束</p>
          <p className="text-gray-400 text-sm mb-4">得分：{score}</p>
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 bg-yellow-400 text-gray-800 font-semibold rounded-lg touch-manipulation"
          >
            再玩一次
          </button>
        </div>
      ) : (
        <div
          className="relative rounded-lg overflow-hidden border-2 border-gray-600 bg-gray-900 select-none touch-none"
          style={{ width: gridW, height: gridH }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {snake.map((p, i) => (
            <div
              key={`${p.x}-${p.y}-${i}`}
              className="absolute rounded-sm bg-yellow-400"
              style={{
                left: p.x * CELL_PX + 1,
                top: p.y * CELL_PX + 1,
                width: CELL_PX - 2,
                height: CELL_PX - 2
              }}
            />
          ))}
          <div
            className="absolute rounded-full bg-red-500"
            style={{
              left: food.x * CELL_PX + 2,
              top: food.y * CELL_PX + 2,
              width: CELL_PX - 4,
              height: CELL_PX - 4
            }}
          />
        </div>
      )}
    </div>
  )
}
