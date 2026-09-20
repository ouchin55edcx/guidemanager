import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

let bootstrap: Promise<void> | null = null
export function ensureTables() {
  if (!bootstrap) bootstrap = db.execute(sql`
    CREATE TABLE IF NOT EXISTS share_links (
      id BIGSERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      date TEXT NOT NULL,
      group_number INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      revoked BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS group_guides (
      date TEXT NOT NULL,
      group_number INTEGER NOT NULL,
      guide TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (date, group_number)
    );
  `).then(() => undefined)
  return bootstrap
}

export async function groupForDate(date: string) {
  const result = await db.execute(sql`INSERT INTO travel_groups (travel_date) VALUES (${date}::date) ON CONFLICT (travel_date) DO UPDATE SET travel_date = EXCLUDED.travel_date RETURNING id, travel_date`)
  return result.rows[0] as { id: number; travel_date: string }
}

export async function fetchGuides(date: string): Promise<Record<number, string>> {
  const result = await db.execute(sql`SELECT group_number, guide FROM group_guides WHERE date = ${date} ORDER BY group_number ASC`)
  return Object.fromEntries(result.rows.map(row => [Number(row.group_number), String(row.guide || '')]))
}

export async function saveGuide(date: string, group: number, guide: string) {
  await db.execute(sql`INSERT INTO group_guides (date, group_number, guide) VALUES (${date}, ${group}, ${String(guide || '').trim()}) ON CONFLICT (date, group_number) DO UPDATE SET guide = EXCLUDED.guide, updated_at = now()`)
}

export async function saveAssignmentsForDate(date: string, assignments: Record<string, number> | null | undefined) {
  const g = await groupForDate(date)
  await db.execute(sql`DELETE FROM booking_collections WHERE group_id = ${g.id} AND name LIKE 'Group %'`)
  for (let i = 1; i <= 20; i++) {
    const created = await db.execute(sql`INSERT INTO booking_collections (group_id, name) VALUES (${g.id}, ${`Group ${i}`}) RETURNING id`)
    const collectionId = (created.rows[0] as { id: number }).id
    for (const [bookingId, groupNumber] of Object.entries(assignments || {})) {
      if (Number(groupNumber) === i) {
        await db.execute(sql`INSERT INTO collection_bookings (collection_id, booking_id, traveler, phone, email, pax, pickup) SELECT ${collectionId}, booking_id, traveler, phone, email, pax, pickup FROM bookings WHERE booking_id = ${bookingId} AND travel_date = ${date}::date ON CONFLICT DO NOTHING`)
      }
    }
  }
}