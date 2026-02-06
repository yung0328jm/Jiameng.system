// 開發中介面：小遊戲入口，之後可在此加入多個小遊戲
import { useState } from 'react'
import UltimatePassword from './minigames/UltimatePassword'
import UltimatePasswordMulti from './minigames/UltimatePasswordMulti'

export default function MiniGames() {
  const [selectedGame, setSelectedGame] = useState(null)

  const gameSlots = [
    { id: 'slot1', name: '終極密碼', description: '1～100 猜數字', comingSoon: false },
    { id: 'slot2', name: '終極密碼多人', description: '多人輪流猜 1～100，猜到的人輸', comingSoon: false },
    { id: 'slot3', name: '小遊戲 3', description: '敬請期待', comingSoon: true }
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-yellow-400">開發中</h2>
        <p className="text-gray-400 text-sm mt-1">小遊戲陸續上線，敬請期待</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {gameSlots.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => game.comingSoon ? null : setSelectedGame(game.id)}
            className={`
              text-left p-4 rounded-xl border-2 transition-all touch-manipulation
              ${game.comingSoon
                ? 'border-gray-600 bg-gray-700/50 text-gray-500 cursor-default'
                : 'border-yellow-400/50 bg-gray-700 text-white hover:border-yellow-400 hover:bg-gray-600 active:bg-gray-600'
              }
            `}
          >
            <div className="font-semibold text-white">{game.name}</div>
            <div className="text-sm mt-1 text-gray-400">{game.description}</div>
            {game.comingSoon && (
              <span className="inline-block mt-2 text-xs text-yellow-400/80">敬請期待</span>
            )}
          </button>
        ))}
      </div>

      {selectedGame === 'slot1' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <UltimatePassword onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot2' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <UltimatePasswordMulti onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame && selectedGame !== 'slot1' && selectedGame !== 'slot2' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <p className="text-gray-300 text-sm">遊戲內容可在此區塊擴充。</p>
          <button type="button" onClick={() => setSelectedGame(null)} className="mt-3 text-yellow-400 text-sm hover:underline">
            返回
          </button>
        </div>
      )}
    </div>
  )
}
