import { NextResponse } from 'next/server'
import { SHARE_COOKIE, shareStatus, verifySharePin } from '@/lib/shares'

export async function POST(request: Request) {
  const body = await request.json()
  const token = String(body.token || '').trim()
  const pin = String(body.pin || '').trim()
  if (!/^\d{1,6}$/.test(pin)) return NextResponse.json({ ok: false, reason: 'Wrong PIN' }, { status: 400 })

  const result = await verifySharePin(token, pin)
  if (!result.ok) {
    const status = result.reason === 'Too many attempts' ? 403 : result.reason === 'Link expired or revoked' ? 403 : 401
    return NextResponse.json({ ok: false, reason: result.reason }, { status })
  }

  const share = result.share
  const response = NextResponse.json({
    ok: true,
    date: String(share.date).slice(0, 10),
    role: String(share.role || 'owner'),
    groupNumber: share.group_number ? Number(share.group_number) : null,
    expiresAt: share.expires_at,
    status: shareStatus(share),
  })

  const secure = process.env.NODE_ENV === 'production'
  response.cookies.set(SHARE_COOKIE, share.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return response
}