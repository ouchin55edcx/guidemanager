import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fetchGuides, groupForDate, saveAssignmentsForDate, saveGuide } from '@/lib/group-ops'
import { getShare, readShareCookie, shareStatus } from '@/lib/shares'

async function resolveShare(token: string) {
  const share = await getShare(token)
  if (!share) return { error: NextResponse.json({ error: 'Link not found' }, { status: 404 }) }
  if (shareStatus(share) !== 'active') return { error: NextResponse.json({ error: 'Link expired or revoked' }, { status: 403 }) }
  return { share }
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolveShare(token)
  if (resolved.error) return resolved.error
  const share = resolved.share!
  if (readShareCookie(request) !== share.token) return NextResponse.json({ error: 'PIN required' }, { status: 401 })

  const date = String(share.date).slice(0, 10)
  const [globalRows, guides] = await Promise.all([
    db.execute(sql`SELECT booking_id AS id, traveler, phone, email, pax, pickup, pickup_time AS "pickupTime", picked_up AS "pickedUp", travel_date FROM bookings WHERE travel_date = ${date}::date ORDER BY created_at ASC`),
    fetchGuides(date),
  ])
  const g = await groupForDate(date)
  const assignmentRows = await db.execute(sql`SELECT cb.booking_id, c.name FROM collection_bookings cb JOIN booking_collections c ON c.id = cb.collection_id WHERE c.group_id = ${g.id} AND c.name LIKE 'Group %'`)
  const assignments = Object.fromEntries(assignmentRows.rows.map(row => [row.booking_id, Number(String(row.name).replace('Group ', ''))]))
  return NextResponse.json({
    share: { date, role: String(share.role || 'owner'), groupNumber: share.group_number ? Number(share.group_number) : null, expiresAt: share.expires_at },
    bookings: globalRows.rows,
    assignments,
    guides,
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolveShare(token)
  if (resolved.error) return resolved.error
  const share = resolved.share!
  if (readShareCookie(request) !== share.token) return NextResponse.json({ error: 'PIN required' }, { status: 401 })

  const date = String(share.date).slice(0, 10)
  const body = await request.json()
  if (body.action === 'saveAssignments') {
    const assignments = body.assignments || {}
    await saveAssignmentsForDate(date, assignments)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'saveGuide') {
    const groupNumber = Number(body.group)
    if (!Number.isInteger(groupNumber) || groupNumber < 1) return NextResponse.json({ error: 'Invalid group' }, { status: 400 })
    await saveGuide(date, groupNumber, String(body.guide || ''))
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}