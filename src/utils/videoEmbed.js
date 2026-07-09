const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/

function normalizeUrl(url) {
  let raw = String(url || '').trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`
  return raw
}

function parseYoutubeId(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return YT_ID_RE.test(id) ? id : null
    }
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      const fromQuery = u.searchParams.get('v')
      if (YT_ID_RE.test(fromQuery || '')) return fromQuery
      const pathMatch = u.pathname.match(/\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/)
      if (pathMatch) return pathMatch[1]
    }
  } catch (_) {}
  return null
}

function parseTiktokId(url) {
  const match = String(url || '').match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i)
  return match ? match[1] : null
}

function looksLikeYoutube(url) {
  return /youtube\.com|youtu\.be|m\.youtube\.com/i.test(url)
}

function looksLikeTiktok(url) {
  return /tiktok\.com|vm\.tiktok\.com/i.test(url)
}

/** 從 oEmbed / noembed 回傳的 html 取出 iframe src */
export function extractIframeSrcFromHtml(html) {
  const match = String(html || '').match(/src=["']([^"']+)["']/i)
  return match ? match[1].replace(/&amp;/g, '&') : null
}

/** 解析外部影片網址，供公佈欄嵌入播放 */
export function parseVideoEmbedUrl(url) {
  const originalUrl = normalizeUrl(url)
  if (!originalUrl) return null

  const youtubeId = parseYoutubeId(originalUrl)
  if (youtubeId) {
    return {
      platform: 'youtube',
      platformLabel: 'YouTube',
      videoId: youtubeId,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      originalUrl,
      aspect: '16/9'
    }
  }

  const tiktokId = parseTiktokId(originalUrl)
  if (tiktokId) {
    return {
      platform: 'tiktok',
      platformLabel: 'TikTok',
      videoId: tiktokId,
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokId}`,
      originalUrl,
      aspect: '9/16'
    }
  }

  if (/douyin\.com\/video\/(\d+)/i.test(originalUrl)) {
    const videoId = originalUrl.match(/douyin\.com\/video\/(\d+)/i)?.[1]
    return {
      platform: 'douyin',
      platformLabel: '抖音',
      videoId,
      embedUrl: null,
      originalUrl,
      aspect: '9/16'
    }
  }

  if (/v\.douyin\.com|iesdouyin\.com/i.test(originalUrl)) {
    return {
      platform: 'douyin',
      platformLabel: '抖音',
      videoId: null,
      embedUrl: null,
      originalUrl,
      aspect: '9/16'
    }
  }

  // YouTube / TikTok 短連結等：稍後用 oEmbed 解析
  if (looksLikeYoutube(originalUrl)) {
    return {
      platform: 'youtube',
      platformLabel: 'YouTube',
      videoId: null,
      embedUrl: null,
      originalUrl,
      aspect: '16/9',
      needsOEmbed: true
    }
  }

  if (looksLikeTiktok(originalUrl)) {
    return {
      platform: 'tiktok',
      platformLabel: 'TikTok',
      videoId: null,
      embedUrl: null,
      originalUrl,
      aspect: '9/16',
      needsOEmbed: true
    }
  }

  if (/^https?:\/\//i.test(originalUrl)) {
    return {
      platform: 'unknown',
      platformLabel: '外部影片',
      videoId: null,
      embedUrl: null,
      originalUrl,
      aspect: '16/9'
    }
  }

  return null
}

/** 透過 noembed 取得可嵌入的 iframe 網址（支援 YouTube / TikTok 短連結） */
export async function resolveVideoEmbedViaOEmbed(url) {
  const originalUrl = normalizeUrl(url)
  if (!originalUrl) return null
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(originalUrl)}`)
    if (!res.ok) return null
    const data = await res.json()
    const embedUrl = extractIframeSrcFromHtml(data?.html)
    if (!embedUrl) return null
    const isVertical = looksLikeTiktok(originalUrl)
    return {
      platform: looksLikeTiktok(originalUrl) ? 'tiktok' : 'youtube',
      platformLabel: looksLikeTiktok(originalUrl) ? 'TikTok' : 'YouTube',
      videoId: null,
      embedUrl,
      originalUrl,
      aspect: isVertical ? '9/16' : '16/9'
    }
  } catch (_) {
    return null
  }
}

export function isValidVideoEmbedUrl(url) {
  const parsed = parseVideoEmbedUrl(url)
  if (!parsed) return false
  if (parsed.embedUrl || parsed.needsOEmbed) return true
  return parsed.platform === 'douyin' || parsed.platform === 'unknown'
}
