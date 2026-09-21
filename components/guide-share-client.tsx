'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Car, Check, List, Mail, Map as MapIcon, MapPin, MessageCircle, Navigation, Save, Settings, ShieldAlert } from 'lucide-react'

type Booking = { id: string; traveler?: string; phone?: string; email?: string; pax: number; pickup: string; pickupTime?: string; pickedUp?: boolean }
type Point = { lat: number; lng: number; booking: Booking }
type Templates = { whatsapp: string; emailSubject: string; emailBody: string }

function coords(value: string) {
  const text = decodeURIComponent(String(value || '')).replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/&amp;/g, '&')
  const patterns = [/\/maps\/place\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /(?:query|ll|center)=(-?\d+(?:\.\d+)?)[,%20]+(-?\d+(?:\.\d+)?)/i]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const lat = Number(match[1]); const lng = Number(match[2])
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return null
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)) }

export default function GuideShareClient({ token, mapToken }: { token: string; mapToken: string }) {
  const mapRef = useRef<HTMLDivElement>(null); const map = useRef<mapboxgl.Map | null>(null)
  const [phase, setPhase] = useState<'loading' | 'pin' | 'locked' | 'ready'>('loading')
  const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [view, setView] = useState<'map' | 'list' | 'setup'>('map')
  const [routeBusy, setRouteBusy] = useState(false)
  const [route, setRoute] = useState<{ distance: number; duration: number } | null>(null)
  const [data, setData] = useState<{ date: string; groupNumber: number; expiresAt: string; guide: { guide: string; guidePhone: string }; bookings: Booking[]; templates: Templates } | null>(null)
  const [templates, setTemplates] = useState<Templates | null>(null)

  async function load() {
    const response = await fetch(`/api/guide-share/${token}`)
    if (response.status === 401) { setPhase('pin'); return }
    if (!response.ok) { setPhase('locked'); setError('This link is expired, revoked, or locked.'); return }
    const result = await response.json(); setData({ ...result.share, guide: result.guide, bookings: result.bookings || [], templates: result.templates }); setPhase('ready')
  }
  useEffect(() => { void load() }, [token])

  async function verify() {
    if (pin.length < 4 || busy) return
    setBusy(true); setError('')
    const response = await fetch('/api/guide-share/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const result = await response.json(); setBusy(false)
    if (!result.ok) { setError(result.reason || 'Wrong PIN'); if (response.status === 403) setPhase('locked'); else setPin(''); return }
    void load()
  }

  useEffect(() => {
    if (phase !== 'ready' || !data || !mapRef.current || map.current) return
    if (!mapToken.startsWith('pk.')) { setError('Map is unavailable.'); return }
    mapboxgl.accessToken = mapToken
    map.current = new mapboxgl.Map({ container: mapRef.current, style: 'mapbox://styles/mapbox/dark-v11', center: [-7.5898, 31.6295], zoom: 11 })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.current.on('load', () => setMapReady(true))
    return () => { setMapReady(false); map.current?.remove(); map.current = null }
  }, [phase, data, mapToken])

  useEffect(() => {
    if (phase !== 'ready' || !data || !map.current || !mapReady || view !== 'map') return
    const markers: mapboxgl.Marker[] = []; const points: { lat: number; lng: number }[] = []
    data.bookings.forEach(booking => {
      const point = coords(booking.pickup); if (!point) return; points.push(point)
      const element = document.createElement('button'); element.textContent = String(booking.pax); element.setAttribute('aria-label', `Pickup ${booking.traveler || booking.id}`); element.style.cssText = 'width:38px;height:38px;border-radius:50%;border:3px solid white;background:#37b6a4;box-shadow:0 2px 8px #0008;font-weight:800;cursor:pointer'
      const phone = booking.phone ? `<a href="tel:${escapeHtml(booking.phone)}" style="color:#0f766e;font-weight:700">${escapeHtml(booking.phone)}</a>` : 'No phone'
      const popup = new mapboxgl.Popup({ closeOnClick: true }).setHTML(`<div style="min-width:230px"><strong>${escapeHtml(booking.traveler || booking.id)}</strong><hr style="margin:6px 0;border:0;border-top:1px solid #ddd"/><b>Phone:</b> ${phone}<br/><b>Pax:</b> ${booking.pax}${booking.pickupTime ? `<br/><b>Pickup time:</b> ${escapeHtml(booking.pickupTime)}` : ''}<br/><b>Pickup:</b> ${escapeHtml(booking.pickup || 'No pickup location')}<br/><a href="https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;color:#0f766e;font-weight:700">Open in Google Maps</a></div>`)
      markers.push(new mapboxgl.Marker(element).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map.current!))
    })
    if (points.length > 1) { const bounds = new mapboxgl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat])); map.current.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 500 }) }
    return () => markers.forEach(marker => marker.remove())
  }, [phase, data, mapReady, view])
  useEffect(() => { if (view === 'map') window.setTimeout(() => map.current?.resize(), 80) }, [view])

  function bookingPoints() { return (data?.bookings || []).map(booking => { const point = coords(booking.pickup); return point ? { ...point, booking } : null }).filter(Boolean) as Point[] }
  function orderedPoints() {
    const remaining = bookingPoints(); const ordered: Point[] = []
    if (!remaining.length) return ordered
    ordered.push(remaining.shift()!)
    while (remaining.length) {
      const current = ordered[ordered.length - 1]
      let nearestIndex = 0; let nearestDistance = Number.POSITIVE_INFINITY
      remaining.forEach((candidate, index) => { const distance = (candidate.lat - current.lat) ** 2 + (candidate.lng - current.lng) ** 2; if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index } })
      ordered.push(remaining.splice(nearestIndex, 1)[0])
    }
    return ordered
  }
  async function showRoute() {
    const points = orderedPoints(); if (points.length < 2 || routeBusy || !map.current) return
    setRouteBusy(true)
    const coordinates = points.map(point => `${point.lng},${point.lat}`).join(';')
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?alternatives=false&geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(mapToken)}`)
    const result = await response.json(); const trip = result.routes?.[0]
    if (trip && map.current.isStyleLoaded()) {
      const geojson = { type: 'Feature', properties: {}, geometry: trip.geometry }
      if (map.current.getLayer('guide-route-line')) map.current.removeLayer('guide-route-line')
      if (map.current.getSource('guide-route')) map.current.removeSource('guide-route')
      map.current.addSource('guide-route', { type: 'geojson', data: geojson })
      map.current.addLayer({ id: 'guide-route-line', type: 'line', source: 'guide-route', paint: { 'line-color': '#2dd4bf', 'line-width': 5, 'line-opacity': 0.9 } })
      setRoute({ distance: trip.distance, duration: trip.duration })
    } else setError('Could not calculate a driving route.')
    setRouteBusy(false)
  }
  function clearRoute() { if (map.current?.getLayer('guide-route-line')) map.current.removeLayer('guide-route-line'); if (map.current?.getSource('guide-route')) map.current.removeSource('guide-route'); setRoute(null) }
  function openMaps(point: Point) { window.open(`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`, '_blank', 'noopener,noreferrer') }
  function fill(template: string, booking: Booking) { return template.replace(/\{(client_name|guide_name|pickup_time|pax)\}/g, (_, key: 'client_name' | 'guide_name' | 'pickup_time' | 'pax') => ({ client_name: booking.traveler || '', guide_name: data?.guide.guide || '', pickup_time: booking.pickupTime || 'votre heure de prise en charge', pax: String(booking.pax) }[key] || '')) }
  function sendWhatsApp(booking: Booking) { if (booking.phone) window.open(`https://wa.me/${booking.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(fill((templates || data!.templates).whatsapp, booking))}`, '_blank', 'noopener,noreferrer') }
  function sendEmail(booking: Booking) { if (booking.email) window.location.href = `mailto:${encodeURIComponent(booking.email)}?subject=${encodeURIComponent(fill((templates || data!.templates).emailSubject, booking))}&body=${encodeURIComponent(fill((templates || data!.templates).emailBody, booking))}` }
  async function confirmPickup(booking: Booking) { if (booking.pickedUp) return; setData(current => current && { ...current, bookings: current.bookings.map(item => item.id === booking.id ? { ...item, pickedUp: true } : item) }); await fetch(`/api/guide-share/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirmPickup', id: booking.id }) }) }
  async function saveTemplateSettings() { if (!templates) return; const response = await fetch(`/api/guide-share/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveTemplates', ...templates }) }); if (response.ok) setData(current => current && { ...current, templates }) }

  if (phase !== 'ready') return <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><div className="w-full max-w-sm text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldAlert className="size-6" /></div>{phase === 'loading' && <p className="mt-4 text-sm text-muted-foreground">Checking guide link…</p>}{phase === 'locked' && <><h1 className="mt-4 text-xl font-semibold">Link unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error || 'Ask the owner for a fresh guide link.'}</p></>}{phase === 'pin' && <><h1 className="mt-4 text-xl font-semibold">Guide pickup link</h1><p className="mt-2 text-sm text-muted-foreground">Enter the 4–6 digit PIN from the owner.</p><div className="my-5 flex justify-center gap-2">{Array.from({ length: Math.max(4, pin.length) }).map((_, index) => <span key={index} className={`size-3 rounded-full ${index < pin.length ? 'bg-primary' : 'bg-border'}`} />)}</div>{error && <p className="mb-3 text-sm text-destructive">{error}</p>}<div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9].map(digit => <button key={digit} type="button" onClick={() => setPin(current => current.length < 6 ? current + digit : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold">{digit}</button>)}<button type="button" onClick={() => setPin(current => current.slice(0, -1))} className="h-14 rounded-2xl text-2xl text-muted-foreground">⌫</button><button type="button" onClick={() => setPin(current => current.length < 6 ? current + '0' : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold">0</button><button type="button" onClick={verify} disabled={pin.length < 4 || busy} className="h-14 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40">{busy ? '…' : 'GO'}</button></div></>}</div></main>

  if (!data) return null
  const points = bookingPoints()
  const totalPax = data.bookings.reduce((sum, booking) => sum + Number(booking.pax || 0), 0)
  return <main className="fixed inset-0 bg-[#101214] text-white">
    <div ref={mapRef} className={`absolute inset-0 transition-opacity ${view === 'map' ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
    {view === 'setup' && <section className="absolute inset-0 overflow-y-auto px-3 pb-24 pt-24"><div className="mx-auto max-w-md space-y-3"><article className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300">Step 1 · Guide info</p><h2 className="mt-2 text-lg font-semibold">{data.guide.guide || 'Guide'}</h2><a className="mt-1 block text-sm text-teal-300" href={data.guide.guidePhone ? `tel:${data.guide.guidePhone}` : undefined}>{data.guide.guidePhone || 'No phone number saved'}</a></article><article className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300">Step 2 · WhatsApp template</p><textarea value={(templates || data.templates).whatsapp} onChange={e => setTemplates(current => ({ ...(current || data.templates), whatsapp: e.target.value }))} className="mt-3 min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none" /><p className="mt-2 text-[11px] leading-5 text-white/55">Available: {'{client_name}'}, {'{guide_name}'}, {'{pickup_time}'}, {'{pax}'}</p></article><article className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300">Step 3 · Email template</p><input value={(templates || data.templates).emailSubject} onChange={e => setTemplates(current => ({ ...(current || data.templates), emailSubject: e.target.value }))} placeholder="Subject" className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none" /><textarea value={(templates || data.templates).emailBody} onChange={e => setTemplates(current => ({ ...(current || data.templates), emailBody: e.target.value }))} className="mt-2 min-h-36 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none" /><p className="mt-2 text-[11px] leading-5 text-white/55">Available: {'{client_name}'}, {'{guide_name}'}, {'{pickup_time}'}, {'{pax}'}</p></article><button type="button" onClick={() => void saveTemplateSettings()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-400 font-semibold text-black"><Save className="size-4" /> Save shared templates</button></div></section>}
    {view === 'list' && <section className="absolute inset-0 overflow-y-auto px-3 pb-24 pt-24"><div className="mx-auto max-w-md space-y-2">{data.bookings.map((booking, index) => { const point = points.find(item => item.booking.id === booking.id); return <article key={booking.id} className={`rounded-2xl border p-4 ${booking.pickedUp ? 'border-emerald-400/50 bg-emerald-400/15' : 'border-white/10 bg-white/[.06]'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-teal-300">Stop {index + 1}</p><h2 className="truncate font-semibold">{booking.traveler || booking.id} {booking.pickedUp && <Check className="inline size-4 text-emerald-300" />}</h2><p className="mt-1 text-xs text-white/65">{booking.pax} pax{booking.pickupTime ? ` · Pickup ${booking.pickupTime}` : ''}</p></div>{point && <button type="button" onClick={() => { setView('map'); window.setTimeout(() => map.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 }), 120) }} className="shrink-0 rounded-xl bg-teal-500/20 p-3 text-teal-200" aria-label={`Show stop ${index + 1} on map`}><MapPin className="size-5" /></button>}</div><div className="mt-2 flex flex-wrap gap-2">{booking.phone && <a href={`tel:${booking.phone}`} className="text-xs text-teal-300">{booking.phone}</a>}{booking.email && <a href={`mailto:${booking.email}`} className="truncate text-xs text-teal-300">{booking.email}</a>}</div><p className="mt-1 text-xs leading-5 text-white/65">{booking.pickup || 'No pickup location'}</p><div className="mt-3 flex flex-wrap gap-2">{booking.phone && <button type="button" onClick={() => sendWhatsApp(booking)} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[#25d366] px-3 text-xs font-semibold text-black"><MessageCircle className="size-4" /> Send WhatsApp</button>}{booking.email && <button type="button" onClick={() => sendEmail(booking)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-semibold"><Mail className="size-4" /> Send Email</button>}<button type="button" onClick={() => void confirmPickup(booking)} disabled={booking.pickedUp} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-emerald-300/40 px-3 text-xs font-semibold text-emerald-200 disabled:opacity-80"><Check className="size-4" /> {booking.pickedUp ? 'Picked up' : 'Confirm pickup'}</button></div>{point && <button type="button" onClick={() => openMaps(point)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/85"><Navigation className="size-4" /> Navigate to stop</button>}</article>})}</div></section>}
    <div className="pointer-events-none absolute inset-0 z-10">
      <header className="pointer-events-auto absolute inset-x-3 top-3 mx-auto max-w-md rounded-2xl border border-white/15 bg-black/65 px-4 py-3 backdrop-blur-md"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300">Guide pickups</p><h1 className="truncate text-base font-semibold">Group {data.groupNumber} · {data.guide.guide || 'Pickup team'}</h1><p className="text-xs text-white/65">{totalPax} pax · {data.bookings.length} stops</p></div><button type="button" onClick={() => { setTemplates(data.templates); setView('setup') }} aria-label="Guide setup and templates" className="rounded-xl p-2 text-teal-300"><Settings className="size-5" /></button></div>{view === 'map' && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void showRoute()} disabled={routeBusy || points.length < 2} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 text-xs font-semibold disabled:opacity-40"><Car className="size-4" /> {routeBusy ? 'Calculating…' : route ? 'Recalculate route' : 'Show route'}</button>{route && <button type="button" onClick={clearRoute} className="rounded-xl border border-white/10 px-3 text-xs text-white/70">Clear</button>}</div>}{route && view === 'map' && <p className="mt-2 text-center text-xs text-teal-200">{(route.distance / 1000).toFixed(1)} km · ~{Math.max(1, Math.round(route.duration / 60))} min</p>}</header>
      {view === 'map' && <p className="absolute inset-x-0 bottom-20 px-6 text-center text-[11px] text-white/70" style={{ textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>Tap a pin for details</p>}
      <nav className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto flex max-w-md rounded-2xl border border-white/15 bg-black/80 p-1.5 shadow-2xl backdrop-blur-md"><button type="button" onClick={() => setView('map')} className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${view === 'map' ? 'bg-teal-400 text-black' : 'text-white/65'}`}><MapIcon className="size-4" /> Map</button><button type="button" onClick={() => setView('list')} className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${view === 'list' ? 'bg-teal-400 text-black' : 'text-white/65'}`}><List className="size-4" /> Bookings <span className="rounded-full bg-white/15 px-1.5 text-xs">{data.bookings.length}</span></button><button type="button" onClick={() => { setTemplates(data.templates); setView('setup') }} className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${view === 'setup' ? 'bg-teal-400 text-black' : 'text-white/65'}`}><Settings className="size-4" /> Setup</button></nav>
    </div>
  </main>
}
