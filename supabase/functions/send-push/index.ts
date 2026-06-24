// Supabase Edge Function: 依帳號發送 FCM 推播（站內信等）
// 需設定 Secrets: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_JSON（整份 service account JSON 字串）
// 部署: supabase functions deploy send-push --no-verify-jwt
// 前端呼叫: supabase.functions.invoke('send-push', { body: { account: 'user1' } }) 或 accounts: ['user1','user2']

import { createClient } from 'npm:@supabase/supabase-js@2'
import * as jose from 'npm:jose@5'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

function getEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

interface Body {
  account?: string
  accounts?: string[]
  title?: string
  body?: string
}

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id?: string
}

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const pem = sa.private_key.replace(/\\n/g, '\n')
  const key = await jose.importPKCS8(pem, 'RS256')
  const projectId = sa.project_id || getEnv('FIREBASE_PROJECT_ID')
  const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setSubject(sa.client_email)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OAuth error: ${res.status} ${t}`)
  }
  const data = await res.json()
  return data.access_token
}

async function sendFcm(accessToken: string, projectId: string, fcmToken: string, title: string, body: string): Promise<void> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        android: { priority: 'high' },
      },
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`FCM error: ${res.status} ${t}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const projectId = getEnv('FIREBASE_PROJECT_ID')
    const raw = getEnv('FIREBASE_SERVICE_ACCOUNT_JSON')
    const sa: ServiceAccount = JSON.parse(raw)
    const body: Body = await req.json().catch(() => ({}))
    const isAll =
      body.account === '__all__' ||
      (Array.isArray(body.accounts) && body.accounts.length === 1 && body.accounts[0] === '__all__')
    const accounts: string[] = body.accounts?.length
      ? body.accounts
      : body.account
      ? [body.account]
      : []
    const title = String(body.title ?? '佳盟事業群').slice(0, 100)
    const msgBody = String(body.body ?? '您有新的站內信，請至「個人服務」→ 站內信 查看。').slice(0, 500)

    if (!isAll && accounts.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'account or accounts required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
    let query = supabase.from('push_tokens').select('token')
    if (!isAll) query = query.in('account', accounts)
    const { data: rows, error: selectError } = await query

    if (selectError) throw selectError
    const tokens = (rows || []).map((r: { token: string }) => r.token).filter(Boolean)
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No tokens for accounts' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getGoogleAccessToken(sa)
    let sent = 0
    for (const token of tokens) {
      try {
        await sendFcm(accessToken, projectId, token, title, msgBody)
        sent++
      } catch (e) {
        console.error('FCM send failed for token:', e)
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, total: tokens.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('send-push error:', e)
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
