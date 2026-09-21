import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createGuideShare, revokeShare } from '@/lib/shares'

async function authorized() { return Boolean((await auth.api.getSession({ headers: await headers() }))?.user) }

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const date = String(body.date || '').trim()
  const groupNumber = Number(body.group)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(groupNumber) || groupNumber < 1) return NextResponse.json({ error: 'Invalid group or date' }, { status: 400 })
  return NextResponse.json(await createGuideShare(date, groupNumber, session.user.id), { status: 201 })
}

export async function DELETE(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const token = String(body.token || '').trim()
  if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  await revokeShare(token)
  return NextResponse.json({ ok: true })
}