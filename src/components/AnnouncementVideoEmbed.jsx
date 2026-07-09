import { useMemo } from 'react'
import { parseVideoEmbedUrl } from '../utils/videoEmbed'

function AnnouncementVideoEmbed({ videoUrl }) {
  const embed = useMemo(() => parseVideoEmbedUrl(videoUrl), [videoUrl])
  if (!embed) return null

  if (embed.embedUrl) {
    const isVertical = embed.aspect === '9/16'
    return (
      <div
        className={`mt-3 rounded-lg overflow-hidden border border-stone-400/60 bg-black/90 shadow-inner ${
          isVertical ? 'mx-auto max-w-[320px]' : 'max-w-2xl w-full'
        }`}
      >
        <div className={isVertical ? 'aspect-[9/16] w-full' : 'aspect-video w-full'}>
          <iframe
            src={embed.embedUrl}
            title={`${embed.platformLabel} 影片`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className="px-2 py-1 text-[10px] text-stone-500 bg-stone-100/80 text-center">
          {embed.platformLabel}
        </p>
      </div>
    )
  }

  return (
    <a
      href={embed.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 p-3 rounded-lg border border-amber-700/40 bg-amber-50/90 hover:bg-amber-100/90 transition-colors max-w-md"
    >
      <span className="shrink-0 w-10 h-10 rounded-full bg-amber-800/90 text-white flex items-center justify-center text-lg">
        ▶
      </span>
      <div className="min-w-0">
        <p className="text-stone-900 text-sm font-medium">前往觀看影片</p>
        <p className="text-stone-600 text-xs truncate">{embed.platformLabel} · 點擊開啟</p>
      </div>
    </a>
  )
}

export default AnnouncementVideoEmbed
