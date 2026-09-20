import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { createOwnerShare, listShares, revokeShare, shareStatus } from '@/lib/shares'

async function authorized() { return Boolean((await auth.api.getSession({ headers: await headers() }))?.user) }

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const date = String(body.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  const share = await createOwnerShare(date)
  return NextResponse.json(share, { status: 201 })
}

export async function GET() {
  if (!await authorized()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await listShares()
  const shares = rows.map(row => ({
    token: String(row.token),
    role: String(row.role),
    date: String(row.date).slice(0, 10),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: shareStatus({ expires_at: row.expires_at, revoked: Boolean(row.revoked), attempts: Number(row.attempts) }),
    url: `/share/${String(row.token)}`,
  }))
  return NextResponse.json({ shares })
}

export async function DELETE(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const token = String(body.token || '').trim()
  if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  await revokeShare(token)
  return NextResponse.json({ ok: true })
}