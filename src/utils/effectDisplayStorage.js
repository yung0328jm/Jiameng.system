// 特效顯示效果配置存儲（名子特效、發話特效、稱號徽章）
const EFFECT_DISPLAY_STORAGE_KEY = 'jiameng_effect_display_config'

const defaultNameEffect = {
  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF6347 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 165, 0, 0.6)',
  fontWeight: '900',
  fontSize: '1.1em',
  animation: 'nameEffectGlow 2s ease-in-out infinite',
  filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.6))'
}

const defaultMessageEffect = {
  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4AF37 50%, #C9A961 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textShadow: '0 0 15px rgba(232, 213, 183, 0.6), 0 0 25px rgba(212, 175, 55, 0.4)',
  fontWeight: '700',
  animation: 'messageEffectShimmer 3s linear infinite',
  backgroundSize: '200% 100%'
}

const defaultTitleBadge = {
  color: '#e9d5ff',
  backgroundColor: 'rgba(192, 132, 252, 0.2)',
  borderColor: '#a78bfa',
  borderWidth: '1px',
  borderStyle: 'solid',
  padding: '2px 8px',
  borderRadius: '4px',
  fontWeight: '700',
  fontSize: '0.75rem'
}

// 名子特效預設樣式（約 30 種）。華麗=動畫強、有裝飾；簡約=動畫淡。
export const NAME_EFFECT_PRESETS = [
  { id: 'gold', label: '金黃光暈', style: { ...defaultNameEffect }, decoration: true },
  { id: 'gold-rich', label: '金黃光暈-華麗', style: { ...defaultNameEffect, animation: 'nameEffectGlowStrong 1.2s ease-in-out infinite' }, decoration: true },
  { id: 'gold-simple', label: '金黃光暈-簡約', style: { ...defaultNameEffect, animation: 'nameEffectGlow 2.5s ease-in-out infinite' }, decoration: false },
  { id: 'gold-red', label: '金橘紅漸層', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF6347 100%)', textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 165, 0, 0.6)' }, decoration: true },
  { id: 'ice', label: '冰藍晶透', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #93C5FD 0%, #60A5FA 50%, #3B82F6 100%)', textShadow: '0 0 20px rgba(96, 165, 250, 0.8), 0 0 30px rgba(59, 130, 246, 0.6)', filter: 'drop-shadow(0 0 10px rgba(96, 165, 250, 0.6))' }, decoration: true },
  { id: 'ice-rich', label: '冰藍晶透-華麗', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #93C5FD 0%, #60A5FA 50%, #3B82F6 100%)', textShadow: '0 0 25px rgba(96, 165, 250, 1), 0 0 40px rgba(59, 130, 246, 0.8)', filter: 'drop-shadow(0 0 15px rgba(96, 165, 250, 0.8))', animation: 'nameEffectGlowStrong 1.2s ease-in-out infinite' }, decoration: true },
  { id: 'ice-simple', label: '冰藍晶透-簡約', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #93C5FD 0%, #60A5FA 50%, #3B82F6 100%)', textShadow: '0 0 12px rgba(96, 165, 250, 0.6)', animation: 'nameEffectGlow 2.5s ease-in-out infinite' }, decoration: false },
  { id: 'emerald', label: '翠綠星芒', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #34D399 0%, #10B981 50%, #059669 100%)', textShadow: '0 0 20px rgba(52, 211, 153, 0.8), 0 0 30px rgba(16, 185, 129, 0.6)', filter: 'drop-shadow(0 0 10px rgba(52, 211, 153, 0.6))' }, decoration: true },
  { id: 'rose', label: '玫瑰金', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #F9A8D4 0%, #EC4899 50%, #DB2777 100%)', textShadow: '0 0 20px rgba(249, 168, 212, 0.8), 0 0 30px rgba(236, 72, 153, 0.6)', filter: 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.6))' }, decoration: true },
  { id: 'purple', label: '紫羅蘭', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #C4B5FD 0%, #A78BFA 50%, #8B5CF6 100%)', textShadow: '0 0 20px rgba(167, 139, 250, 0.8), 0 0 30px rgba(139, 92, 246, 0.6)', filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.6))' }, decoration: true },
  { id: 'cyan', label: '青碧流光', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #67E8F9 0%, #22D3EE 50%, #06B6D4 100%)', textShadow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 30px rgba(6, 182, 212, 0.6)', filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.6))' }, decoration: true },
  { id: 'amber', label: '琥珀暖光', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 50%, #D97706 100%)', textShadow: '0 0 20px rgba(245, 158, 11, 0.8), 0 0 30px rgba(217, 119, 6, 0.6)' }, decoration: true },
  { id: 'coral', label: '珊瑚晨曦', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #FDA4AF 0%, #FB7185 50%, #F43F5E 100%)', textShadow: '0 0 20px rgba(251, 113, 133, 0.8), 0 0 30px rgba(244, 63, 94, 0.6)' }, decoration: true },
  { id: 'slate', label: '墨灰沉穩', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #94A3B8 0%, #64748B 50%, #475569 100%)', textShadow: '0 0 18px rgba(100, 116, 139, 0.7)' }, decoration: false },
  { id: 'lime', label: '檸檬青芒', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #BEF264 0%, #84CC16 50%, #65A30D 100%)', textShadow: '0 0 20px rgba(132, 204, 22, 0.8)' }, decoration: true },
  { id: 'indigo', label: '靛藍深邃', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #818CF8 0%, #6366F1 50%, #4F46E5 100%)', textShadow: '0 0 20px rgba(99, 102, 241, 0.8)' }, decoration: true },
  { id: 'teal', label: '碧潭凝翠', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #2DD4BF 0%, #14B8A6 50%, #0D9488 100%)', textShadow: '0 0 20px rgba(20, 184, 166, 0.8)' }, decoration: true },
  { id: 'fuchsia', label: '桃紫霓虹', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #F0ABFC 0%, #D946EF 50%, #A21CAF 100%)', textShadow: '0 0 20px rgba(217, 70, 239, 0.8)' }, decoration: true },
  { id: 'sky', label: '晴空蔚藍', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #38BDF8 0%, #0EA5E9 50%, #0284C7 100%)', textShadow: '0 0 20px rgba(14, 165, 233, 0.8)' }, decoration: true },
  { id: 'orange', label: '橙陽烈芒', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #FB923C 0%, #F97316 50%, #EA580C 100%)', textShadow: '0 0 20px rgba(249, 115, 22, 0.8)' }, decoration: true },
  { id: 'violet', label: '紫藤夢境', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #6D28D9 100%)', textShadow: '0 0 20px rgba(139, 92, 246, 0.8)' }, decoration: true },
  { id: 'pink', label: '櫻花粉嫩', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #FBCFE8 0%, #F472B6 50%, #EC4899 100%)', textShadow: '0 0 20px rgba(244, 114, 182, 0.8)' }, decoration: true },
  { id: 'copper', label: '銅棕古韻', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #D97706 0%, #B45309 50%, #92400E 100%)', textShadow: '0 0 18px rgba(180, 83, 9, 0.7)' }, decoration: false },
  { id: 'pearl', label: '珍珠奶白', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 50%, #CBD5E1 100%)', textShadow: '0 0 15px rgba(203, 213, 225, 0.6)' }, decoration: false },
  { id: 'midnight', label: '午夜幽藍', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 50%, #3730A3 100%)', textShadow: '0 0 22px rgba(30, 64, 175, 0.9)' }, decoration: true },
  { id: 'forest', label: '森林墨綠', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #166534 0%, #15803D 50%, #16A34A 100%)', textShadow: '0 0 20px rgba(21, 128, 61, 0.8)' }, decoration: true },
  { id: 'crimson', label: '深紅熾烈', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #991B1B 100%)', textShadow: '0 0 20px rgba(185, 28, 28, 0.8)' }, decoration: true },
  { id: 'arctic', label: '極光銀白', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #E0E7FF 0%, #C7D2FE 50%, #A5B4FC 100%)', textShadow: '0 0 18px rgba(165, 180, 252, 0.7)' }, decoration: true },
  { id: 'sunset', label: '日落橙紫', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #F97316 0%, #C026D3 50%, #7C3AED 100%)', textShadow: '0 0 22px rgba(192, 38, 211, 0.8)' }, decoration: true },
  { id: 'ocean', label: '海洋層次', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #0EA5E9 0%, #06B6D4 50%, #10B981 100%)', textShadow: '0 0 20px rgba(6, 182, 212, 0.8)' }, decoration: true },
  { id: 'ruby', label: '紅寶石光', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 50%, #BE123C 100%)', textShadow: '0 0 20px rgba(225, 29, 72, 0.8)' }, decoration: true },
  { id: 'jade', label: '翡翠琉璃', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)', textShadow: '0 0 20px rgba(5, 150, 105, 0.8)' }, decoration: true },
  { id: 'sapphire', label: '藍寶石輝', style: { ...defaultNameEffect, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', textShadow: '0 0 20px rgba(37, 99, 235, 0.8)' }, decoration: true }
]

// 發話特效預設樣式（約 30 種）
export const MESSAGE_EFFECT_PRESETS = [
  { id: 'gold', label: '金棕雅緻', style: { ...defaultMessageEffect } },
  { id: 'silver', label: '銀灰沉穩', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #E5E7EB 0%, #9CA3AF 50%, #6B7280 100%)', textShadow: '0 0 15px rgba(156, 163, 175, 0.6), 0 0 25px rgba(107, 114, 128, 0.4)' } },
  { id: 'mint', label: '薄荷清爽', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #99F6E4 0%, #2DD4BF 50%, #14B8A6 100%)', textShadow: '0 0 15px rgba(45, 212, 191, 0.6), 0 0 25px rgba(20, 184, 166, 0.4)' } },
  { id: 'lavender', label: '薰衣草', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #DDD6FE 0%, #A78BFA 50%, #7C3AED 100%)', textShadow: '0 0 15px rgba(167, 139, 250, 0.6), 0 0 25px rgba(124, 58, 237, 0.4)' } },
  { id: 'sunset', label: '夕陽暖橘', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FED7AA 0%, #FB923C 50%, #EA580C 100%)', textShadow: '0 0 15px rgba(251, 146, 60, 0.6), 0 0 25px rgba(234, 88, 12, 0.4)' } },
  { id: 'ice', label: '冰藍雅緻', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #BAE6FD 0%, #7DD3FC 50%, #38BDF8 100%)', textShadow: '0 0 15px rgba(56, 189, 248, 0.5)' } },
  { id: 'emerald', label: '翠綠沉穩', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #A7F3D0 0%, #6EE7B7 50%, #34D399 100%)', textShadow: '0 0 15px rgba(52, 211, 153, 0.5)' } },
  { id: 'rose', label: '玫瑰淡雅', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FBCFE8 0%, #F9A8D4 50%, #F472B6 100%)', textShadow: '0 0 15px rgba(244, 114, 182, 0.5)' } },
  { id: 'amber', label: '琥珀暖調', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FDE68A 0%, #FCD34D 50%, #F59E0B 100%)', textShadow: '0 0 15px rgba(245, 158, 11, 0.5)' } },
  { id: 'slate', label: '墨灰簡約', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #CBD5E1 0%, #94A3B8 50%, #64748B 100%)', textShadow: '0 0 12px rgba(100, 116, 139, 0.4)' } },
  { id: 'cyan', label: '青碧柔光', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #A5F3FC 0%, #67E8F9 50%, #22D3EE 100%)', textShadow: '0 0 15px rgba(34, 211, 238, 0.5)' } },
  { id: 'violet', label: '紫藤淡雅', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #E9D5FF 0%, #D8B4FE 50%, #C084FC 100%)', textShadow: '0 0 15px rgba(192, 132, 252, 0.5)' } },
  { id: 'teal', label: '碧潭沉靜', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #99F6E4 0%, #5EEAD4 50%, #2DD4BF 100%)', textShadow: '0 0 15px rgba(45, 212, 191, 0.5)' } },
  { id: 'coral', label: '珊瑚暖意', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FECDD3 0%, #FDA4AF 50%, #FB7185 100%)', textShadow: '0 0 15px rgba(251, 113, 133, 0.5)' } },
  { id: 'indigo', label: '靛藍雅緻', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #C7D2FE 0%, #A5B4FC 50%, #818CF8 100%)', textShadow: '0 0 15px rgba(129, 140, 248, 0.5)' } },
  { id: 'lime', label: '檸檬清新', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #D9F99D 0%, #BEF264 50%, #84CC16 100%)', textShadow: '0 0 15px rgba(132, 204, 22, 0.5)' } },
  { id: 'fuchsia', label: '桃紫霓虹', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #F5D0FE 0%, #F0ABFC 50%, #E879F9 100%)', textShadow: '0 0 15px rgba(232, 121, 249, 0.5)' } },
  { id: 'sky', label: '晴空淡藍', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #BAE6FD 0%, #7DD3FC 50%, #0EA5E9 100%)', textShadow: '0 0 15px rgba(14, 165, 233, 0.5)' } },
  { id: 'orange', label: '橙陽暖調', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 50%, #FDBA74 100%)', textShadow: '0 0 15px rgba(251, 146, 60, 0.5)' } },
  { id: 'pink', label: '櫻花粉調', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 50%, #F9A8D4 100%)', textShadow: '0 0 15px rgba(249, 168, 212, 0.5)' } },
  { id: 'copper', label: '銅棕古雅', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FED7AA 0%, #FDBA74 50%, #F97316 100%)', textShadow: '0 0 12px rgba(249, 115, 22, 0.4)' } },
  { id: 'pearl', label: '珍珠奶白', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 50%, #E2E8F0 100%)', textShadow: '0 0 12px rgba(226, 232, 240, 0.4)' } },
  { id: 'midnight', label: '午夜幽藍', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #BFDBFE 0%, #93C5FD 50%, #60A5FA 100%)', textShadow: '0 0 15px rgba(96, 165, 250, 0.5)' } },
  { id: 'forest', label: '森林綠意', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #BBF7D0 0%, #86EFAC 50%, #4ADE80 100%)', textShadow: '0 0 15px rgba(74, 222, 128, 0.5)' } },
  { id: 'crimson', label: '深紅沉穩', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FECACA 0%, #FCA5A5 50%, #F87171 100%)', textShadow: '0 0 15px rgba(248, 113, 113, 0.5)' } },
  { id: 'arctic', label: '極光銀白', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #C7D2FE 100%)', textShadow: '0 0 12px rgba(199, 210, 254, 0.4)' } },
  { id: 'ocean', label: '海洋層次', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #A5F3FC 0%, #67E8F9 50%, #06B6D4 100%)', textShadow: '0 0 15px rgba(6, 182, 212, 0.5)' } },
  { id: 'ruby', label: '紅寶石調', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #FECDD3 0%, #FDA4AF 50%, #FB7185 100%)', textShadow: '0 0 15px rgba(251, 113, 133, 0.5)' } },
  { id: 'jade', label: '翡翠沉靜', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #A7F3D0 0%, #6EE7B7 50%, #10B981 100%)', textShadow: '0 0 15px rgba(16, 185, 129, 0.5)' } },
  { id: 'sapphire', label: '藍寶石雅', style: { ...defaultMessageEffect, background: 'linear-gradient(135deg, #BFDBFE 0%, #93C5FD 50%, #3B82F6 100%)', textShadow: '0 0 15px rgba(59, 130, 246, 0.5)' } }
]

// 稱號徽章預設樣式（約 30 種）
const badge = (color, bg, border) => ({ color, backgroundColor: bg, borderColor: border, borderWidth: '1px', borderStyle: 'solid', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', fontSize: '0.75rem' })
export const TITLE_BADGE_PRESETS = [
  { id: 'purple', label: '紫羅蘭徽章', style: { ...defaultTitleBadge } },
  { id: 'gold', label: '金黃徽章', style: badge('#FEF3C7', 'rgba(245, 158, 11, 0.25)', '#F59E0B') },
  { id: 'emerald', label: '翠綠徽章', style: badge('#A7F3D0', 'rgba(16, 185, 129, 0.2)', '#10B981') },
  { id: 'blue', label: '天藍徽章', style: badge('#BFDBFE', 'rgba(59, 130, 246, 0.2)', '#3B82F6') },
  { id: 'rose', label: '玫瑰徽章', style: badge('#FBCFE8', 'rgba(236, 72, 153, 0.2)', '#EC4899') },
  { id: 'dark', label: '黑金徽章', style: badge('#FDE68A', 'rgba(30, 30, 30, 0.9)', '#F59E0B') },
  { id: 'ice', label: '冰藍徽章', style: badge('#BAE6FD', 'rgba(56, 189, 248, 0.2)', '#38BDF8') },
  { id: 'amber', label: '琥珀徽章', style: badge('#FDE68A', 'rgba(245, 158, 11, 0.2)', '#F59E0B') },
  { id: 'coral', label: '珊瑚徽章', style: badge('#FECDD3', 'rgba(251, 113, 133, 0.2)', '#FB7185') },
  { id: 'teal', label: '碧潭徽章', style: badge('#99F6E4', 'rgba(45, 212, 191, 0.2)', '#2DD4BF') },
  { id: 'indigo', label: '靛藍徽章', style: badge('#C7D2FE', 'rgba(99, 102, 241, 0.2)', '#6366F1') },
  { id: 'cyan', label: '青碧徽章', style: badge('#A5F3FC', 'rgba(34, 211, 238, 0.2)', '#22D3EE') },
  { id: 'lime', label: '檸檬徽章', style: badge('#D9F99D', 'rgba(132, 204, 22, 0.2)', '#84CC16') },
  { id: 'violet', label: '紫藤徽章', style: badge('#E9D5FF', 'rgba(139, 92, 246, 0.2)', '#8B5CF6') },
  { id: 'fuchsia', label: '桃紫徽章', style: badge('#F5D0FE', 'rgba(217, 70, 239, 0.2)', '#D946EF') },
  { id: 'slate', label: '墨灰徽章', style: badge('#E2E8F0', 'rgba(100, 116, 139, 0.2)', '#64748B') },
  { id: 'sky', label: '晴空徽章', style: badge('#BAE6FD', 'rgba(14, 165, 233, 0.2)', '#0EA5E9') },
  { id: 'orange', label: '橙陽徽章', style: badge('#FFEDD5', 'rgba(249, 115, 22, 0.2)', '#F97316') },
  { id: 'pink', label: '櫻花粉徽章', style: badge('#FCE7F3', 'rgba(244, 114, 182, 0.2)', '#F472B6') },
  { id: 'midnight', label: '午夜藍徽章', style: badge('#93C5FD', 'rgba(37, 99, 235, 0.25)', '#2563EB') },
  { id: 'forest', label: '森林綠徽章', style: badge('#BBF7D0', 'rgba(22, 163, 74, 0.2)', '#16A34A') },
  { id: 'crimson', label: '深紅徽章', style: badge('#FECACA', 'rgba(220, 38, 38, 0.2)', '#DC2626') },
  { id: 'pearl', label: '珍珠徽章', style: badge('#F8FAFC', 'rgba(148, 163, 184, 0.2)', '#94A3B8') },
  { id: 'copper', label: '銅棕徽章', style: badge('#FED7AA', 'rgba(180, 83, 9, 0.2)', '#B45309') },
  { id: 'ruby', label: '紅寶石徽章', style: badge('#FECDD3', 'rgba(225, 29, 72, 0.2)', '#E11D48') },
  { id: 'jade', label: '翡翠徽章', style: badge('#A7F3D0', 'rgba(5, 150, 105, 0.2)', '#059669') },
  { id: 'sapphire', label: '藍寶石徽章', style: badge('#BFDBFE', 'rgba(29, 78, 216, 0.2)', '#1D4ED8') },
  { id: 'arctic', label: '極光銀徽章', style: badge('#EEF2FF', 'rgba(129, 140, 248, 0.2)', '#818CF8') },
  { id: 'ocean', label: '海洋徽章', style: badge('#A5F3FC', 'rgba(6, 182, 212, 0.2)', '#06B6D4') }
]

export const getEffectDisplayConfig = () => {
  try {
    const raw = localStorage.getItem(EFFECT_DISPLAY_STORAGE_KEY)
    if (!raw) {
      return {
        nameEffect: { ...defaultNameEffect },
        messageEffect: { ...defaultMessageEffect },
        titleBadge: { ...defaultTitleBadge }
      }
    }
    const parsed = JSON.parse(raw)
    return {
      nameEffect: { ...defaultNameEffect, ...(parsed.nameEffect || {}) },
      messageEffect: { ...defaultMessageEffect, ...(parsed.messageEffect || {}) },
      titleBadge: { ...defaultTitleBadge, ...(parsed.titleBadge || {}) }
    }
  } catch (e) {
    console.error('getEffectDisplayConfig:', e)
    return {
      nameEffect: { ...defaultNameEffect },
      messageEffect: { ...defaultMessageEffect },
      titleBadge: { ...defaultTitleBadge }
    }
  }
}

export const saveEffectDisplayConfig = (config) => {
  try {
    localStorage.setItem(EFFECT_DISPLAY_STORAGE_KEY, JSON.stringify(config))
    return { success: true }
  } catch (e) {
    console.error('saveEffectDisplayConfig:', e)
    return { success: false, message: '保存失敗' }
  }
}

// 依預設 id 取得樣式；rank 1/2/3 可調整動畫強度（1=華麗、3=簡約）。若 presetId 為空則回傳全站預設。
export const getStyleForPreset = (type, presetId, rank) => {
  const config = getEffectDisplayConfig()
  if (!presetId) {
    if (type === 'name') return { ...config.nameEffect }
    if (type === 'message') return { ...config.messageEffect }
    if (type === 'title') return { ...config.titleBadge }
    return {}
  }
  const presets = type === 'name' ? NAME_EFFECT_PRESETS : type === 'message' ? MESSAGE_EFFECT_PRESETS : TITLE_BADGE_PRESETS
  const preset = presets.find((p) => p.id === presetId)
  if (!preset) {
    if (type === 'name') return { ...config.nameEffect }
    if (type === 'message') return { ...config.messageEffect }
    if (type === 'title') return { ...config.titleBadge }
    return {}
  }
  let style = { ...preset.style }
  // rank 1=華麗(強)、2=中等、3=簡約(弱)：調整動畫時長與強度
  if (rank != null && rank >= 1 && rank <= 3 && preset.style?.animation) {
    const dur = rank === 1 ? '1.5s' : rank === 2 ? '2s' : '2.5s'
    style = { ...style, animation: style.animation.replace(/\d+(\.\d+)?s/g, dur) }
  }
  return style
}

// 名子旁裝飾預設（約 30 種）：高貴尊榮風格，動畫對應 Memo 內 .decoration-*
export const DECORATION_PRESETS = [
  { id: 'crown', label: '皇冠', emoji: '👑', animationKey: 'bounce-1' },
  { id: 'trophy', label: '獎盃', emoji: '🏆', animationKey: 'bounce-1' },
  { id: 'gold_medal', label: '金牌', emoji: '🥇', animationKey: 'swing' },
  { id: 'silver_medal', label: '銀牌', emoji: '🥈', animationKey: 'spin' },
  { id: 'bronze_medal', label: '銅牌', emoji: '🥉', animationKey: 'twinkle' },
  { id: 'diamond', label: '鑽石', emoji: '💎', animationKey: 'float' },
  { id: 'sparkle', label: '星光', emoji: '✨', animationKey: 'twinkle' },
  { id: 'starburst', label: '星芒', emoji: '🌟', animationKey: 'float' },
  { id: 'shooting_star', label: '流星', emoji: '💫', animationKey: 'pulse' },
  { id: 'star_solid', label: '實星', emoji: '★', animationKey: 'bounce-1' },
  { id: 'star_hollow', label: '空星', emoji: '☆', animationKey: 'twinkle' },
  { id: 'rhombus', label: '菱形', emoji: '✦', animationKey: 'bounce-2' },
  { id: 'gem', label: '寶石', emoji: '◆', animationKey: 'spin' },
  { id: 'pearl', label: '珍珠', emoji: '●', animationKey: 'float' },
  { id: 'sun', label: '金陽', emoji: '☀️', animationKey: 'bounce-1' },
  { id: 'flame', label: '火焰', emoji: '🔥', animationKey: 'twinkle' },
  { id: 'rose', label: '玫瑰', emoji: '🌹', animationKey: 'swing' },
  { id: 'cherry_blossom', label: '櫻花', emoji: '🌸', animationKey: 'float' },
  { id: 'ribbon', label: '蝴蝶結', emoji: '🎀', animationKey: 'bounce-2' },
  { id: 'confetti', label: '彩帶', emoji: '🎉', animationKey: 'twinkle' },
  { id: 'balloon', label: '彩球', emoji: '🎊', animationKey: 'pulse' },
  { id: 'heart', label: '愛心', emoji: '♥', animationKey: 'swing' },
  { id: 'diamond_suit', label: '方塊', emoji: '♦', animationKey: 'twinkle' },
  { id: 'club', label: '梅花', emoji: '♣', animationKey: 'spin' },
  { id: 'spade', label: '黑桃', emoji: '♠', animationKey: 'float' },
  { id: 'moon', label: '弦月', emoji: '🌙', animationKey: 'pulse' },
  { id: 'double_circle', label: '雙圈', emoji: '◉', animationKey: 'spin' },
  { id: 'dot', label: '珠點', emoji: '·', animationKey: 'bounce-3' },
  { id: 'square', label: '方點', emoji: '▪', animationKey: 'pulse' },
  { id: 'hollow_circle', label: '玉環', emoji: '○', animationKey: 'swing' },
  { id: 'laurel', label: '桂冠', emoji: '✦', animationKey: 'float' }
]

// 依裝飾預設 id 取得 { emoji, className }；id 為空或 'none' 則回傳 null
export const getDecorationById = (id) => {
  if (!id || id === 'none') return null
  const p = DECORATION_PRESETS.find((x) => x.id === id)
  if (!p) return null
  return { emoji: p.emoji, className: `decoration-${p.animationKey}` }
}

// 依名次回傳小物件裝飾（舊邏輯：依名子特效 preset 與 rank 推斷；若已設 decorationPresetId 則改由 getDecorationById 取）
export const getDecorationForPreset = (type, presetId, rank) => {
  if (rank == null || rank < 1 || rank > 3) return null
  const presets = type === 'name' ? NAME_EFFECT_PRESETS : type === 'message' ? MESSAGE_EFFECT_PRESETS : TITLE_BADGE_PRESETS
  const preset = presets.find((p) => p.id === presetId)
  const hasDeco = preset?.decoration !== false
  if (!hasDeco) return null
  if (rank === 1) return { emoji: '✨', className: 'decoration-bounce-1' }
  if (rank === 2) return { emoji: '✦', className: 'decoration-bounce-2' }
  return { emoji: '·', className: 'decoration-bounce-3' }
}
