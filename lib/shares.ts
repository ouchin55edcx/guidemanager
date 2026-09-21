import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { ensureTables } from '@/lib/group-ops'

const SHARE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ATTEMPTS = 2

export const SHARE_COOKIE = 'ms_owner_share'
export const GUIDE_SHARE_COOKIE = 'ms_guide_share'

export function generateToken() { return randomBytes(24).toString('base64url') }
export function generatePin() { return String(10000 + Math.floor(Math.random() * 90000)) }
function hashPin(pin: string) { return createHash('sha256').update(pin).digest('hex') }
function pinMatches(pin: string, hash: string) {
  const a = Buffer.from(hashPin(pin), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function createOwnerShare(date: string) {
  await ensureTables()
  const token = generateToken()
  const pin = generatePin()
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS)
  await db.execute(sql`INSERT INTO share_links (token, pin_hash, role, date, expires_at) VALUES (${token}, ${hashPin(pin)}, 'owner', ${date}, ${expiresAt})`)
  return { token, pin, date, expiresAt: expiresAt.toISOString(), url: `/share/${token}` }
}

export async function createGuideShare(date: string, groupNumber: number) {
  await ensureTables()
  const token = generateToken()
  const pin = generatePin()
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS)
  await db.execute(sql`INSERT INTO share_links (token, pin_hash, role, date, group_number, expires_at) VALUES (${token}, ${hashPin(pin)}, 'guide', ${date}, ${groupNumber}, ${expiresAt})`)
  return { token, pin, date, groupNumber, expiresAt: expiresAt.toISOString(), url: `/g/${token}` }
}

export type ShareStatus = 'active' | 'expired' | 'revoked' | 'locked'

export function shareStatus(share: Record<string, any>): ShareStatus {
  if (share.revoked) return 'revoked'
  if (Number(share.attempts) >= MAX_ATTEMPTS) return 'locked'
  if (new Date(share.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

export async function getShare(token: string) {
  await ensureTables()
  const result = await db.execute(sql`SELECT * FROM share_links WHERE token = ${token} LIMIT 1`)
  return result.rows[0] as (Record<string, any> & { token: string }) | undefined
}

export async function verifySharePin(token: string, pin: string): Promise<{ ok: true; share: Record<string, any> } | { ok: false; reason: string }> {
  const share = await getShare(token)
  if (!share) return { ok: false, reason: 'Link not found' }
  const status = shareStatus(share)
  if (status !== 'active') return { ok: false, reason: status === 'locked' ? 'Too many attempts' : 'Link expired or revoked' }
  if (!pinMatches(String(pin || '').trim(), String(share.pin_hash))) {
    const attempts = Number(share.attempts) + 1
    await db.execute(sql`UPDATE share_links SET attempts = ${attempts} WHERE token = ${token}`)
    if (attempts >= MAX_ATTEMPTS) await db.execute(sql`UPDATE share_links SET revoked = true WHERE token = ${token}`)
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? 'Too many attempts' : 'Wrong PIN' }
  }
  return { ok: true, share }
}

export async function revokeShare(token: string) {
  await ensureTables()
  await db.execute(sql`UPDATE share_links SET revoked = true WHERE token = ${token}`)
}

export async function listShares() {
  await ensureTables()
  const result = await db.execute(sql`SELECT token, role, date, created_at, expires_at, revoked, attempts FROM share_links WHERE role = 'owner' ORDER BY created_at DESC`)
  return result.rows
}

export function readShareCookie(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const part = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${SHARE_COOKIE}=`))
  return part ? decodeURIComponent(part.slice(SHARE_COOKIE.length + 1)) : null
}