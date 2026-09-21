import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { GUIDE_SHARE_COOKIE, getShare, shareStatus } from '@/lib/shares'
import { ensureTables, fetchGuides } from '@/lib/group-ops'

function cookieValue(request: Request) {
  const value = request.headers.get('cookie') || ''
  const part = value.split(';').map(item => item.trim()).find(item => item.startsWith(`${GUIDE_SHARE_COOKIE}=`))
  return part ? decodeURIComponent(part.slice(GUIDE_SHARE_COOKIE.length + 1)) : null
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await getShare(token)
  if (!share || share.role !== 'guide' || shareStatus(share) !== 'active' || cookieValue(request) !== token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTables()
  const date = String(share.date).slice(0, 10)
  const groupNumber = Number(share.group_number)
  const [bookings, guides] = await Promise.all([
    db.execute(sql`SELECT booking_id AS id, traveler, phone, pax, pickup FROM bookings WHERE travel_date = ${date}::date AND booking_id IN (SELECT cb.booking_id FROM collection_bookings cb JOIN booking_collections c ON c.id = cb.collection_id JOIN travel_groups tg ON tg.id = c.group_id WHERE tg.travel_date = ${date}::date AND c.name = ${`Group ${groupNumber}`}) ORDER BY created_at ASC`),
    fetchGuides(date),
  ])
  return NextResponse.json({ share: { date, groupNumber, expiresAt: share.expires_at }, guide: guides[groupNumber] || '', bookings: bookings.rows })
}