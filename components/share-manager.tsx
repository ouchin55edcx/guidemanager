'use client'

import { useEffect, useState } from 'react'
import { Check, Clipboard, ShieldX } from 'lucide-react'

type Share = { token: string; date: string; createdAt: string; expiresAt: string; status: string; url: string }

export default function ShareManager({ date }: { date: string }) {
  const [shares, setShares] = useState<Share[]>([])
  const [created, setCreated] = useState<{ url: string; pin: string; date: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function load() {
    const res = await fetch('/api/share')
    if (!res.ok) return
    const data = await res.json()
    setShares((data.shares || []).filter((share: Share) => share.date === date))
  }
  useEffect(() => { void load() }, [date])

  function flash(key: string) { setCopied(key); setTimeout(() => setCopied(''), 1600) }
  async function copy(text: string, key: string) { try { await navigator.clipboard.writeText(text); flash(key) } catch { /* ignore */ } }
  async function generate() {
    setBusy(true)
    const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) return
    const fullUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${data.url}`
    setCreated({ url: fullUrl, pin: data.pin, date: data.date })
    setOpen(true)
    void load()
  }
  async function revoke(token: string) {
    await fetch('/api/share', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    void load()
  }

  const statusTone: Record<string, string> = { active: 'text-emerald-600', expired: 'text-muted-foreground', revoked: 'text-destructive', locked: 'text-destructive' }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Owner share link</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">PIN-protected full management access for {date}. Expires after 24h; revoke anytime.</p>
        </div>
        <button type="button" onClick={generate} disabled={busy} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Generating…' : 'Generate link'}</button>
      </div>

      {open && created && created.date === date && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Share this</p>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">Dismiss</button>
          </div>
          <p className="mt-2 break-all text-sm">{created.url}</p>
          <p className="mt-1 text-sm"><strong>PIN:</strong> <span className="font-mono text-lg font-bold tracking-widest">{created.pin}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(created.url, `url-${created.pin}`)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{copied === `url-${created.pin}` ? <Check className="size-3" /> : <Clipboard className="size-3" />}Copy link</button>
            <button type="button" onClick={() => copy(`Link: ${created.url}\nPIN: ${created.pin}`, `both-${created.pin}`)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs">{copied === `both-${created.pin}` ? <Check className="size-3" /> : <Clipboard className="size-3" />}Copy link + PIN</button>
          </div>
        </div>
      )}

      {shares.length > 0 && (
        <div className="mt-3 space-y-2">
          {shares.map(share => (
            <div key={share.token} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-all text-xs">{share.url}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Created {new Date(share.createdAt).toLocaleString()} · expires {new Date(share.expiresAt).toLocaleDateString()} · <span className={`font-medium ${statusTone[share.status] || ''}`}>{share.status}</span></p>
              </div>
              <button type="button" onClick={() => copy(`${window.location.origin}${share.url}`, share.token)} className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs">{copied === share.token ? <Check className="size-3" /> : <Clipboard className="size-3" />}</button>
              {share.status !== 'revoked' && <button type="button" onClick={() => revoke(share.token)} className="shrink-0 rounded-lg border border-destructive/40 px-2 py-1.5 text-xs text-destructive"><ShieldX className="size-3" /></button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}