// 開發中介面：小遊戲入口，之後可在此加入多個小遊戲
import { useState } from 'react'
import UltimatePassword from './minigames/UltimatePassword'
import UltimatePasswordMulti from './minigames/UltimatePasswordMulti'
import Undercover from './minigames/Undercover'
import RockPaperScissors from './minigames/RockPaperScissors'
import Niuniu from './minigames/Niuniu'

export default function MiniGames() {
  const [selectedGame, setSelectedGame] = useState(null)

  const gameSlots = [
    { id: 'slot1', name: '終極密碼', description: '1～100 猜數字', comingSoon: false },
    { id: 'slot2', name: '終極密碼多人', description: '多人輪流猜 1～100，猜中的人全拿獎池', comingSoon: false },
    { id: 'slot3', name: '誰是臥底', description: '輪流發言投票找出臥底', comingSoon: false },
    { id: 'slot4', name: '猜拳', description: '兩人對戰五戰三勝，佳盟幣下注', comingSoon: false },
    { id: 'slot5', name: '妞妞', description: '玩家 vs 莊家比牛，牛牛 2 倍賠，佳盟幣下注', comingSoon: false }
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
      {selectedGame === 'slot3' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <Undercover onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot4' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <RockPaperScissors onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame === 'slot5' && (
        <div className="mt-6 p-4 bg-gray-700 rounded-xl border border-gray-600">
          <Niuniu onBack={() => setSelectedGame(null)} />
        </div>
      )}
      {selectedGame && selectedGame !== 'slot1' && selectedGame !== 'slot2' && selectedGame !== 'slot3' && selectedGame !== 'slot4' && selectedGame !== 'slot5' && (
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
