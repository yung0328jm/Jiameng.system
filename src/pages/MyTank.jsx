import { useNavigate } from 'react-router-dom'
import OceanAmbience, { enterTankWideWatch } from '../components/OceanAmbience'

export default function MyTank() {
  const navigate = useNavigate()
  return (
    <div className="relative z-[41] max-w-3xl mx-auto text-cn-parchment pb-8 pointer-events-none">
      <div className="pointer-events-auto mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-cn-gold font-serif">我的魚缸</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/my-pets')}
            className="px-4 py-2 rounded-md border border-gray-600 text-sm text-cn-parchment hover:bg-black/30"
          >
            回我的寵物
          </button>
          <button
            type="button"
            onClick={() => enterTankWideWatch()}
            className="px-4 py-2 rounded-md border border-cn-gold/50 text-sm text-cn-gold hover:bg-black/30"
          >
            橫向模式
          </button>
        </div>
      </div>
      <OceanAmbience mode="tank" />
    </div>
  )
}
