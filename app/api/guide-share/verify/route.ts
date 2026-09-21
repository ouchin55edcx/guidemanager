import { NextResponse } from 'next/server'
import { GUIDE_SHARE_COOKIE, shareStatus, verifySharePin } from '@/lib/shares'

export async function POST(request: Request) {
  const body = await request.json()
  const token = String(body.token || '').trim()
  const pin = String(body.pin || '').trim()
  if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ ok: false, reason: 'Wrong PIN' }, { status: 400 })
  const result = await verifySharePin(token, pin)
  if (!result.ok || String(result.share.role) !== 'guide') {
    const reason = !result.ok && result.reason === 'Too many attempts' ? result.reason : 'Link expired or revoked'
    return NextResponse.json({ ok: false, reason }, { status: 403 })
  }
  const share = result.share
  const response = NextResponse.json({ ok: true, date: String(share.date).slice(0, 10), groupNumber: Number(share.group_number), expiresAt: share.expires_at, status: shareStatus(share) })
  response.cookies.set(GUIDE_SHARE_COOKIE, share.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 })
  return response
}