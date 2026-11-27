import { useNavigate } from 'react-router-dom'
import OceanAmbience from '../components/OceanAmbience'
import { MAX_ROAM_FISH } from '../utils/petStorage'

export default function MyTank() {
  const navigate = useNavigate()
  return (
    <div className="relative z-[41] max-w-3xl mx-auto text-cn-parchment pb-8 pointer-events-none">
      <div className="pointer-events-auto mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">我的魚缸</h1>
        <p className="text-cn-mist text-sm mt-1">
          從「我的寵物」點放入魚缸的魚會在這裡游。配對的公母游近會飄愛心，只是特效，與 7 日懷孕週期無關。點畫面撒飼料。系統其他頁面只看得到展示中的魚。
        </p>
        <p className="text-gray-500 text-xs mt-1">魚缸最多 {MAX_ROAM_FISH} 隻，與寵物欄相同。</p>
        <button
          type="button"
          onClick={() => navigate('/my-pets')}
          className="mt-3 px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
        >
          回我的寵物
        </button>
      </div>
      <OceanAmbience mode="tank" />
    </div>
  )
}
