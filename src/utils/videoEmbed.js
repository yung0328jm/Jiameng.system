/** 解析外部影片網址，供公佈欄嵌入播放 */
export function parseVideoEmbedUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null

  let match

  // YouTube: watch, youtu.be, shorts, embed
  match = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  )
  if (match) {
    const videoId = match[1]
    return {
      platform: 'youtube',
      platformLabel: 'YouTube',
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      originalUrl: raw,
      aspect: '16/9'
    }
  }

  // TikTok: /@user/video/1234567890
  match = raw.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)
  if (match) {
    const videoId = match[1]
    return {
      platform: 'tiktok',
      platformLabel: 'TikTok',
      videoId,
      embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
      originalUrl: raw,
      aspect: '9/16'
    }
  }

  // 抖音：完整影片頁
  match = raw.match(/douyin\.com\/video\/(\d+)/)
  if (match) {
    return {
      platform: 'douyin',
      platformLabel: '抖音',
      videoId: match[1],
      embedUrl: null,
      originalUrl: raw,
      aspect: '9/16'
    }
  }

  // 抖音短連結（無法直接嵌入，提供外部連結）
  if (/v\.douyin\.com|iesdouyin\.com/i.test(raw)) {
    return {
      platform: 'douyin',
      platformLabel: '抖音',
      videoId: null,
      embedUrl: null,
      originalUrl: raw,
      aspect: '9/16'
    }
  }

  // 其他 http(s) 連結
  if (/^https?:\/\//i.test(raw)) {
    return {
      platform: 'unknown',
      platformLabel: '外部影片',
      videoId: null,
      embedUrl: null,
      originalUrl: raw,
      aspect: '16/9'
    }
  }

  return null
}

export function isValidVideoEmbedUrl(url) {
  return !!parseVideoEmbedUrl(url)
}
