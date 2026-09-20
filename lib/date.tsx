'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'travel.selectedDate'

function today() { return new Date().toISOString().slice(0, 10) }
function readStored() {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(STORAGE_KEY) } catch { return null }
}

const DateContext = createContext<{ date: string; setDate: (value: string) => void }>({ date: today(), setDate: () => {} })

export function DateProvider({ children }: { children: React.ReactNode }) {
  const [date, setDate] = useState(today())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStored()
    if (stored) setDate(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(STORAGE_KEY, date) } catch { /* ignore */ }
  }, [date, hydrated])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY && event.newValue) setDate(event.newValue) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return <DateContext.Provider value={{ date, setDate }}>{children}</DateContext.Provider>
}

export function useDate() { return useContext(DateContext) }