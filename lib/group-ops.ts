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
      guide_phone TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (date, group_number)
    );
    ALTER TABLE group_guides ADD COLUMN IF NOT EXISTS guide_phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE share_links ADD COLUMN IF NOT EXISTS owner_id TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_up BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_time TEXT;
    CREATE TABLE IF NOT EXISTS message_templates (
      workspace_id TEXT PRIMARY KEY,
      whatsapp TEXT NOT NULL DEFAULT 'Bonjour {client_name}, je suis {guide_name}, votre guide pour aujourd’hui. Je passerai vous chercher à {pickup_time} à votre emplacement. À bientôt !',
      email_subject TEXT NOT NULL DEFAULT 'Votre prise en charge aujourd’hui',
      email_body TEXT NOT NULL DEFAULT 'Bonjour {client_name},\n\nJe suis {guide_name}, votre guide pour aujourd’hui. Je passerai vous chercher à {pickup_time} à votre emplacement.\n\nÀ bientôt !\n\nNombre de voyageurs : {pax}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `).then(() => undefined)
  return bootstrap
}

export const defaultTemplates = {
  whatsapp: 'Bonjour {client_name}, je suis {guide_name}, votre guide pour aujourd’hui. Je passerai vous chercher à {pickup_time} à votre emplacement. À bientôt !',
  emailSubject: 'Votre prise en charge aujourd’hui',
  emailBody: 'Bonjour {client_name},\n\nJe suis {guide_name}, votre guide pour aujourd’hui. Je passerai vous chercher à {pickup_time} à votre emplacement.\n\nÀ bientôt !\n\nNombre de voyageurs : {pax}',
}

export async function fetchTemplates(workspaceId: string) {
  await ensureTables()
  await db.execute(sql`INSERT INTO message_templates (workspace_id) VALUES (${workspaceId}) ON CONFLICT (workspace_id) DO NOTHING`)
  const result = await db.execute(sql`SELECT whatsapp, email_subject AS "emailSubject", email_body AS "emailBody" FROM message_templates WHERE workspace_id = ${workspaceId}`)
  const row = result.rows[0] as typeof defaultTemplates | undefined
  return row || defaultTemplates
}

export async function saveTemplates(workspaceId: string, templates: { whatsapp: string; emailSubject: string; emailBody: string }) {
  await ensureTables()
  await db.execute(sql`INSERT INTO message_templates (workspace_id, whatsapp, email_subject, email_body, updated_at) VALUES (${workspaceId}, ${templates.whatsapp}, ${templates.emailSubject}, ${templates.emailBody}, now()) ON CONFLICT (workspace_id) DO UPDATE SET whatsapp = EXCLUDED.whatsapp, email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, updated_at = now()`)
}

export async function groupForDate(date: string) {
  const result = await db.execute(sql`INSERT INTO travel_groups (travel_date) VALUES (${date}::date) ON CONFLICT (travel_date) DO UPDATE SET travel_date = EXCLUDED.travel_date RETURNING id, travel_date`)
  return result.rows[0] as { id: number; travel_date: string }
}

export async function fetchGuides(date: string): Promise<Record<number, string>> {
  const result = await db.execute(sql`SELECT group_number, guide FROM group_guides WHERE date = ${date} ORDER BY group_number ASC`)
  return Object.fromEntries(result.rows.map(row => [Number(row.group_number), String(row.guide || '')]))
}

export async function fetchGuideContact(date: string, group: number) {
  const result = await db.execute(sql`SELECT guide, guide_phone AS "guidePhone" FROM group_guides WHERE date = ${date} AND group_number = ${group}`)
  return (result.rows[0] || { guide: '', guidePhone: '' }) as { guide: string; guidePhone: string }
}

export async function saveGuide(date: string, group: number, guide: string, guidePhone = '') {
  await db.execute(sql`INSERT INTO group_guides (date, group_number, guide, guide_phone) VALUES (${date}, ${group}, ${String(guide || '').trim()}, ${String(guidePhone || '').trim()}) ON CONFLICT (date, group_number) DO UPDATE SET guide = EXCLUDED.guide, guide_phone = COALESCE(NULLIF(EXCLUDED.guide_phone, ''), group_guides.guide_phone), updated_at = now()`)
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