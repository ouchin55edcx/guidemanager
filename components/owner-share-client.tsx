'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ChevronDown, Clipboard, Home, Layers, Map as MapIcon, ShieldAlert, Users } from 'lucide-react'
import { groupColor } from '@/lib/colors'

type Booking = { id: string; traveler?: string; phone?: string; email?: string | null; pax: number; pickup: string; pickedUp?: boolean }
type Assigned = Record<string, number>

function coords(value: string) { const s = decodeURIComponent(String(value || '')).replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'); const patterns = [/\/maps\/place\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /(?:query|ll|center)=(-?\d+(?:\.\d+)?)[,%20]+(-?\d+(?:\.\d+)?)/i]; for (const pattern of patterns) { const m = s.match(pattern); if (!m) continue; const lat = Number(m[1]); const lng = Number(m[2]); if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng } } return null }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)) }
function total(items: Booking[]) { return items.reduce((sum, item) => sum + Number(item.pax || 0), 0) }
function bookingBlock(booking: Booking) { return `Lead traveler: ${booking.traveler || '—'}\nPhone: ${booking.phone || ''}\nEmail: ${booking.email || ''}\nPax: ${booking.pax}\nPick up location: ${booking.pickup || ''}` }

type Tab = 'overview' | 'groups' | 'unassigned' | 'map'

export default function OwnerShareClient({ token, mapToken }: { token: string; mapToken: string }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [phase, setPhase] = useState<'loading' | 'pin' | 'locked' | 'ready'>('loading')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [busy, setBusy] = useState(false)
  const [share, setShare] = useState<{ date: string } | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [assigned, setAssigned] = useState<Assigned>({})
  const [guides, setGuides] = useState<Record<number, string>>({})
  const [tab, setTab] = useState<Tab>('overview')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [mapMode, setMapMode] = useState<'all' | number>('all')
  const [mapUnassignedOnly, setMapUnassignedOnly] = useState(false)
  const [incompleteOnly, setIncompleteOnly] = useState(false)
  const [noGuideOnly, setNoGuideOnly] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [saved, setSaved] = useState('')

  const groups = useMemo(() => [...new Set(Object.values(assigned).filter(Boolean))].sort((a, b) => a - b), [assigned])
  const groupPax = (number: number) => total(bookings.filter(b => assigned[b.id] === number))
  const visibleGroups = useMemo(() => groups.filter(number => (!incompleteOnly || groupPax(number) < 17) && (!noGuideOnly || !guides[number]?.trim())), [groups, bookings, assigned, guides, incompleteOnly, noGuideOnly])
  const unassigned = bookings.filter(b => !assigned[b.id])
  const totalPax = total(bookings)
  const unassignedPax = total(unassigned)

  function flash(message: string) { setSaved(message); setTimeout(() => { setSaved('') }, 1800) }

  async function loadData() {
    const res = await fetch(`/api/share/${token}`)
    if (res.status === 401) { setPhase('pin'); return }
    if (res.status === 403 || res.status === 404) { setPhase('locked'); setPinError('This link is expired, revoked, or locked.'); return }
    if (!res.ok) { setPhase('pin'); return }
    const data = await res.json()
    setShare(data.share)
    setBookings(data.bookings || [])
    setAssigned(data.assignments || {})
    setGuides(data.guides || {})
    setPhase('ready')
  }

  useEffect(() => { void loadData() }, [token])

  async function verifyPin() {
    if (pin.length < 4 || busy) return
    setBusy(true); setPinError('')
    const res = await fetch('/api/share/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const data = await res.json()
    setBusy(false)
    if (!data.ok) {
      if (res.status === 403 || data.reason === 'Too many attempts') { setPinError(data.reason || 'Link locked'); setPhase('locked') }
      else { setPinError(data.reason || 'Wrong PIN'); setPin('') }
      return
    }
    void loadData()
  }

  function saveAssignments(next: Assigned) {
    const previous = assigned
    setAssigned(next)
    fetch(`/api/share/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveAssignments', assignments: next }) })
      .then(res => { if (!res.ok) { setAssigned(previous); flash('Save failed') } else flash('Saved') })
      .catch(() => { setAssigned(previous); flash('Save failed') })
  }
  function moveBooking(id: string, to: string) {
    const next = { ...assigned }
    if (to === '') delete next[id]
    else next[id] = Number(to)
    saveAssignments(next)
  }
  function assignMany(ids: string[], to: string) {
    if (!to) return
    const next = { ...assigned }
    for (const id of ids) next[id] = Number(to)
    saveAssignments(next)
    setPicked([])
  }
  function saveGuide(group: number, value: string) {
    setGuides(current => ({ ...current, [group]: value }))
    fetch(`/api/share/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveGuide', group, guide: value }) })
      .then(res => { if (res.ok) flash('Guide saved') })
  }
  function togglePicked(id: string) { setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  function groupCopyText(number: number) {
    const items = bookings.filter(b => assigned[b.id] === number)
    const guide = guides[number] || ''
    return `GROUP ${number} -   ${total(items)} PAX  -   : ${guide}\n\n${'-'.repeat(70)}\n\n${items.map(bookingBlock).join('\n\n')}`
  }
  function copyGroup(number: number) { void navigator.clipboard.writeText(groupCopyText(number)); flash(`Copied group ${number}`) }

  useEffect(() => {
    if (phase !== 'ready' || tab !== 'map') return
    if (!mapRef.current) return
    if (map.current) { setTimeout(() => map.current?.resize(), 60); return }
    const cleanToken = mapToken.trim()
    if (!cleanToken || !cleanToken.startsWith('pk.')) { flash('Map token missing'); return }
    mapboxgl.accessToken = cleanToken
    map.current = new mapboxgl.Map({ container: mapRef.current, style: 'mapbox://styles/mapbox/dark-v11', center: [-7.5898, 31.6295], zoom: 11 })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    return () => { map.current?.remove(); map.current = null }
  }, [phase, tab, token])

  useEffect(() => {
    if (phase !== 'ready' || tab !== 'map' || !map.current) return
    const markers: mapboxgl.Marker[] = []
    const visible = bookings.filter(b => (mapUnassignedOnly ? !assigned[b.id] : mapMode === 'all' || assigned[b.id] === mapMode))
    visible.forEach(b => {
      const point = coords(b.pickup)
      if (!point) return
      const color = assigned[b.id] ? groupColor(assigned[b.id]) : '#f59e0b'
      const element = document.createElement('button')
      element.textContent = String(b.pax)
      element.setAttribute('aria-label', `Select ${b.traveler || b.id}`)
      element.style.cssText = `width:32px;height:32px;border-radius:50%;border:3px solid white;background:${color};box-shadow:0 2px 8px #0008;font-weight:800;cursor:pointer;font-size:13px`
      const popup = new mapboxgl.Popup({ closeOnClick: true }).setHTML(`<div style="min-width:180px"><strong>${escapeHtml(b.traveler || b.id)}</strong><br/>${b.pax} pax${assigned[b.id] ? `<br/>Group ${assigned[b.id]}` : '<br/>Unassigned'}</div>`)
      const marker = new mapboxgl.Marker(element).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map.current!)
      markers.push(marker)
    })
    const points = visible.map(b => coords(b.pickup)).filter(Boolean) as { lat: number; lng: number }[]
    if (points.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      points.forEach(p => bounds.extend([p.lng, p.lat]))
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 500 })
    }
    return () => markers.forEach(marker => marker.remove())
  }, [bookings, assigned, mapMode, mapUnassignedOnly, phase, tab])

  if (phase !== 'ready') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
        {phase === 'loading' && <p className="text-sm text-muted-foreground">Checking link…</p>}
        {phase === 'pin' && (
          <div className="w-full max-w-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldAlert className="size-6" /></div>
              <h1 className="mt-4 text-xl font-semibold">Owner verify</h1>
              <p className="mt-1 text-sm text-muted-foreground">Enter the PIN to verify & manage all groups.</p>
            </div>
            <div className="mb-4 flex justify-center gap-2">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => <span key={index} className={`size-3 rounded-full ${index < pin.length ? 'bg-primary' : 'bg-border'}`} />)}
            </div>
            {pinError && <p className="mb-3 text-center text-sm text-destructive">{pinError}</p>}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => <button key={digit} type="button" onClick={() => setPin(current => current.length < 6 ? current + digit : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold active:scale-95">{digit}</button>)}
              <button type="button" onClick={() => setPin(current => current.slice(0, -1))} className="h-14 rounded-2xl text-2xl text-muted-foreground active:scale-95" aria-label="Delete digit">⌫</button>
              <button type="button" onClick={() => setPin(current => current.length < 6 ? current + '0' : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold active:scale-95">0</button>
              <button type="button" onClick={verifyPin} disabled={pin.length < 4 || busy} className="h-14 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40 active:scale-95">{busy ? '…' : 'GO'}</button>
            </div>
          </div>
        )}
        {phase === 'locked' && (
          <div className="max-w-sm text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive"><ShieldAlert className="size-6" /></div>
            <h1 className="mt-4 text-xl font-semibold">Link unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">{pinError || 'This link is expired, revoked, or locked. Ask the owner to generate a fresh link.'}</p>
          </div>
        )}
      </main>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof Home; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'groups', label: 'Groups', icon: Layers, badge: groups.length },
    { id: 'unassigned', label: 'Unassigned', icon: Users, badge: unassigned.length },
    { id: 'map', label: 'Map', icon: MapIcon },
  ]
  const bottomNav = (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map(item => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${tab === item.id ? 'text-primary' : 'text-muted-foreground'}`}>
            <item.icon className="size-5" />
            <span>{item.label}</span>
            {item.badge ? <span className="absolute right-3 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{item.badge}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  )

  if (tab === 'map') {
    return (
      <main className="fixed inset-0 z-0 bg-black text-foreground">
        <div ref={mapRef} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/60 py-1.5 pl-3 pr-2 backdrop-blur-md">
              <span className="truncate font-mono text-xs font-semibold text-white">{share?.date}</span>
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{groups.length} groups</span>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1.5 backdrop-blur-md" title="Legend">
              {groups.slice(0, 6).map(number => <span key={number} className="size-3 rounded-full ring-1 ring-white/30" style={{ background: groupColor(number) }} title={`Group ${number}`} />)}
              <span className="ml-0.5 size-3 rounded-full bg-amber-500 ring-1 ring-white/30" title="Unassigned" />
            </div>
          </div>
          <div className="pointer-events-auto absolute inset-x-3 top-14 z-10">
            <button type="button" onClick={() => setMapUnassignedOnly(value => !value)} className={`mb-2 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-semibold backdrop-blur-md ${mapUnassignedOnly ? 'bg-primary text-primary-foreground' : 'text-white'}`}>Unassigned only</button>
            <label className="block">
              <span className="sr-only">Filter map by group</span>
              <select value={mapMode === 'all' ? 'all' : String(mapMode)} onChange={e => setMapMode(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-11 w-full rounded-xl border border-white/15 bg-black/60 px-3 text-xs font-medium text-white backdrop-blur-md">
                <option value="all">All groups</option>
                {groups.map(number => <option key={number} value={number} className="bg-black text-white">Group {number} — {guides[number] || 'No guide'} — {groupPax(number)} pax · {bookings.filter(b => assigned[b.id] === number).length} bookings</option>)}
              </select>
            </label>
          </div>
          <p className="absolute inset-x-0 bottom-24 z-10 px-6 text-center text-[11px] text-white/70" style={{ textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>Markers colored by group · unassigned in amber · tap a pin for details</p>
        </div>
        {bottomNav}
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Owner · Verify & manage</p>
              <h1 className="text-lg font-semibold">{share?.date}</h1>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">{groups.length} groups</span>
          </div>
        </header>

        <div className="flex-1 p-4">
          {saved && <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{saved}</p>}

          {tab === 'overview' && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[{ label: 'Bookings', value: bookings.length }, { label: 'Total pax', value: totalPax }, { label: 'Groups', value: groups.length }, { label: 'Unassigned', value: `${unassigned.length} · ${unassignedPax} pax` }].map(stat => (
                  <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setTab('groups')} className="h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">Groups</button>
                <button type="button" onClick={() => setTab('unassigned')} className="h-12 rounded-xl border border-border text-sm font-medium">Unassigned</button>
                <button type="button" onClick={() => setTab('map')} className="h-12 rounded-xl border border-border text-sm font-medium">Map</button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group summary</p>
                {groups.map(number => (
                  <button key={number} type="button" onClick={() => { setExpanded(number); setTab('groups') }} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: groupColor(number) }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{guides[number] || `Group ${number}`}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{groupPax(number)} pax · {bookings.filter(b => assigned[b.id] === number).length} bookings</span>
                  </button>
                ))}
                {groups.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No groups yet.</p>}
              </div>
            </section>
          )}

          {tab === 'groups' && (
            <section className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setIncompleteOnly(value => !value)} className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${incompleteOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>Incomplete only</button>
                <button type="button" onClick={() => setNoGuideOnly(value => !value)} className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${noGuideOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>No guide assigned</button>
              </div>
              {visibleGroups.map(number => {
                const items = bookings.filter(b => assigned[b.id] === number)
                const open = expanded === number
                return (
                  <div key={number} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div role="button" tabIndex={0} onClick={() => setExpanded(open ? null : number)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(open ? null : number) }} className="w-full p-4 text-left">
                      <div className="flex items-center gap-3">
                        <span className="size-3 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: groupColor(number) }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">Group {number}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{groupPax(number)}/17 pax · {items.length} bookings</p>
                        </div>
                        <button type="button" onClick={e => { e.stopPropagation(); copyGroup(number) }} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground active:scale-95" aria-label={`Copy group ${number}`}><Clipboard className="size-4" /></button>
                        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                      </div>
                      <label className="mt-3 block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Guide</span>
                        <input value={guides[number] || ''} onChange={e => setGuides(current => ({ ...current, [number]: e.target.value }))} onBlur={e => saveGuide(number, e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} enterKeyHint="done" placeholder="No guide assigned" aria-label={`Guide for group ${number}`} className="mt-1 h-11 w-full rounded-lg bg-background/60 px-3 text-base font-medium outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-2 focus:ring-primary/40" />
                      </label>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, groupPax(number) / 17 * 100)}%`, background: groupColor(number) }} /></div>
                    </div>
                    {open && (
                      <div className="space-y-2 border-t border-border/70 bg-background/40 px-4 py-3">
                        {items.map(booking => (
                          <div key={booking.id} className={`rounded-xl border border-border/70 p-3 ${booking.pickedUp ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'bg-card'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{booking.pickedUp && <span className="mr-1 text-emerald-600">✓</span>}{booking.traveler || booking.id}</p>
                                <p className="truncate font-mono text-[10px] text-muted-foreground">{booking.id} · {booking.phone || 'no phone'}</p>
                              </div>
                              <span className="shrink-0 text-xs font-bold">{booking.pickedUp ? 'Picked up' : `${booking.pax} pax`}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <a href={booking.pickup} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[11px] text-primary underline">Open pickup</a>
                              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Move to<select value={String(assigned[booking.id])} onChange={e => moveBooking(booking.id, e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs"><option value="">— Unassign —</option>{groups.map(target => <option key={target} value={target}>Group {target}</option>)}</select></label>
                            </div>
                          </div>
                        ))}
                        <p className="pt-1 text-center text-[11px] text-muted-foreground">{items.length} bookings · {groupPax(number)} pax</p>
                      </div>
                    )}
                  </div>
                )
              })}
              {visibleGroups.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{groups.length === 0 ? 'No groups yet. Assign bookings to a group first.' : 'No groups match these filters.'}</p>}
            </section>
          )}

          {tab === 'unassigned' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{unassigned.length} unassigned · {unassignedPax} pax</p>
                <button type="button" onClick={() => setPicked([])} className="text-xs text-primary">Clear {picked.length ? `(${picked.length} selected)` : 'selection'}</button>
              </div>
              {picked.length > 0 && (
                <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
                  <span className="min-w-0 flex-1 text-xs font-medium">{picked.length} selected · {total(bookings.filter(b => picked.includes(b.id)))} pax</span>
                  <select aria-label="Assign selected to group" defaultValue="" onChange={e => { if (e.currentTarget.value) { assignMany(picked, e.currentTarget.value); e.currentTarget.value = '' } }} className="h-9 rounded-lg border border-input bg-background px-2 text-xs"><option value="" disabled>Assign to…</option>{groups.map(number => <option key={number} value={number}>Group {number}</option>)}</select>
                </div>
              )}
              {unassigned.map(booking => (
                <div key={booking.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  <button type="button" onClick={() => togglePicked(booking.id)} aria-pressed={picked.includes(booking.id)} className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${picked.includes(booking.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}>{picked.includes(booking.id) ? '✓' : ''}</button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{booking.traveler || booking.id}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{booking.id} · {booking.phone || 'no phone'} · {booking.pax} pax</p>
                  </div>
                  <select aria-label={`Assign ${booking.id}`} value="" onChange={e => { if (e.currentTarget.value) moveBooking(booking.id, e.currentTarget.value); e.currentTarget.value = '' }} className="h-8 rounded-lg border border-input bg-background px-1.5 text-[10px]"><option value="">Assign…</option>{groups.map(number => <option key={number} value={number}>Group {number}</option>)}</select>
                </div>
              ))}
              {unassigned.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">All bookings are grouped.</p>}
            </section>
          )}
        </div>

        {bottomNav}
      </div>
    </main>
  )
}