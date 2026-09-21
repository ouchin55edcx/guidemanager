'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, ShieldAlert } from 'lucide-react'

type Booking = { id: string; traveler?: string; phone?: string; pax: number; pickup: string }

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
  const [data, setData] = useState<{ date: string; groupNumber: number; expiresAt: string; guide: string; bookings: Booking[] } | null>(null)

  async function load() {
    const response = await fetch(`/api/guide-share/${token}`)
    if (response.status === 401) { setPhase('pin'); return }
    if (!response.ok) { setPhase('locked'); setError('This link is expired, revoked, or locked.'); return }
    const result = await response.json(); setData({ ...result.share, guide: result.guide, bookings: result.bookings || [] }); setPhase('ready')
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
    return () => { map.current?.remove(); map.current = null }
  }, [phase, data, mapToken])

  useEffect(() => {
    if (phase !== 'ready' || !data || !map.current) return
    const markers: mapboxgl.Marker[] = []; const points: { lat: number; lng: number }[] = []
    data.bookings.forEach(booking => {
      const point = coords(booking.pickup); if (!point) return; points.push(point)
      const element = document.createElement('button'); element.textContent = String(booking.pax); element.setAttribute('aria-label', `Pickup ${booking.traveler || booking.id}`); element.style.cssText = 'width:38px;height:38px;border-radius:50%;border:3px solid white;background:#37b6a4;box-shadow:0 2px 8px #0008;font-weight:800;cursor:pointer'
      const popup = new mapboxgl.Popup({ closeOnClick: true }).setHTML(`<div style="min-width:190px"><strong>${escapeHtml(booking.traveler || booking.id)}</strong><br/>${booking.phone ? escapeHtml(booking.phone) : 'No phone'}<br/>${booking.pax} pax</div>`)
      markers.push(new mapboxgl.Marker(element).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map.current!))
    })
    if (points.length > 1) { const bounds = new mapboxgl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat])); map.current.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 500 }) }
    return () => markers.forEach(marker => marker.remove())
  }, [phase, data])

  if (phase !== 'ready') return <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><div className="w-full max-w-sm text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldAlert className="size-6" /></div>{phase === 'loading' && <p className="mt-4 text-sm text-muted-foreground">Checking guide link…</p>}{phase === 'locked' && <><h1 className="mt-4 text-xl font-semibold">Link unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error || 'Ask the owner for a fresh guide link.'}</p></>}{phase === 'pin' && <><h1 className="mt-4 text-xl font-semibold">Guide pickup link</h1><p className="mt-2 text-sm text-muted-foreground">Enter the 4–6 digit PIN from the owner.</p><div className="my-5 flex justify-center gap-2">{Array.from({ length: Math.max(4, pin.length) }).map((_, index) => <span key={index} className={`size-3 rounded-full ${index < pin.length ? 'bg-primary' : 'bg-border'}`} />)}</div>{error && <p className="mb-3 text-sm text-destructive">{error}</p>}<div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9].map(digit => <button key={digit} type="button" onClick={() => setPin(current => current.length < 6 ? current + digit : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold">{digit}</button>)}<button type="button" onClick={() => setPin(current => current.slice(0, -1))} className="h-14 rounded-2xl text-2xl text-muted-foreground">⌫</button><button type="button" onClick={() => setPin(current => current.length < 6 ? current + '0' : current)} className="h-14 rounded-2xl border border-border bg-card text-xl font-semibold">0</button><button type="button" onClick={verify} disabled={pin.length < 4 || busy} className="h-14 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40">{busy ? '…' : 'GO'}</button></div></>}</div></main>

  if (!data) return null
  return <main className="fixed inset-0 bg-black text-white"><div ref={mapRef} className="absolute inset-0" /><div className="pointer-events-none absolute inset-0 z-10"><header className="pointer-events-auto absolute inset-x-3 top-3 rounded-2xl border border-white/15 bg-black/65 p-4 backdrop-blur-md"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-teal-300">Guide pickups</p><div className="mt-1 flex items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">Group {data.groupNumber}</h1><p className="text-sm text-white/70">{data.guide || 'Pickup team'} · {data.bookings.reduce((sum, booking) => sum + Number(booking.pax || 0), 0)} pax · {data.bookings.length} pickups</p></div><MapPin className="size-5 shrink-0 text-teal-300" /></div><p className="mt-2 text-[11px] text-white/60">Only this group's pickups are visible. Tap a pin for phone and details.</p></header></div></main>
}
