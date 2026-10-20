import { getStore } from "@netlify/blobs"

// Shared data layer for the web API (api.mts) and the MCP connector (mcp.mts).
// Bookings live under "bookings/<id>", the apartment list under "config/apartments".

// Keep in sync with DEFAULT_APTS in web/index.html: used when config/apartments is absent.
export const DEFAULT_APTS = [
  "Lumi", "Hard rok", "Нейфтчиляр мать моя", "Lola", "Black", "Dva brata 138", "Хатка пухатка",
  "Желтая", "Изумруд", "Slav13 -147 fazil", "B13 fahri 58", "Fontan square ploshad", "Akva rustam 45",
  "B1-6 -12 calil", "Bayil 8 floor", "P10", "B1-11-42 tarlan", "Slav 12 idris 135", "Bayil 9 floor", "P16",
]
export const SOURCES = ["", "Booking", "Airbnb", "Напрямую", "Знакомые", "Sutochno.ru", "Другое"]
export const PAY = ["unpaid", "prepaid", "paid"]
export const ID = /^[A-Za-z0-9_-]{1,80}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type Booking = {
  apt: string
  guest: string
  checkin: string
  checkout: string
  people: number | ""
  phone: string
  source: string
  price: number | ""
  pay: string
  notes: string
  updatedAt: number
}
export type StoredBooking = Booking & { id: string }

export function store() {
  return getStore({ name: "komunal-calendar", consistency: "strong" })
}

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : ""
}
function numOrEmpty(v: unknown): number | "" {
  return typeof v === "number" && Number.isFinite(v) ? v : ""
}

export function isValidDate(s: string): boolean {
  if (!DATE.test(s)) return false
  const d = new Date(s + "T00:00:00Z")
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function nights(b: { checkin: string; checkout: string }): number {
  return Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 864e5)
}

export function cleanBooking(d: any): Booking | null {
  const b: Booking = {
    apt: str(d?.apt, 200),
    guest: str(d?.guest, 200).trim() || "Без имени",
    checkin: str(d?.checkin, 10),
    checkout: str(d?.checkout, 10),
    people: numOrEmpty(d?.people),
    phone: str(d?.phone, 100),
    source: str(d?.source, 50),
    price: numOrEmpty(d?.price),
    pay: PAY.includes(d?.pay) ? d.pay : "unpaid",
    notes: str(d?.notes, 5000),
    updatedAt: Date.now(),
  }
  if (!b.apt || !isValidDate(b.checkin) || !isValidDate(b.checkout) || b.checkout <= b.checkin) return null
  return b
}

export async function listBookings(): Promise<StoredBooking[]> {
  const s = store()
  const { blobs } = await s.list({ prefix: "bookings/" })
  const all = await Promise.all(
    blobs.map(async ({ key }) => {
      const data: any = await s.get(key, { type: "json" })
      return data ? ({ ...data, id: key.slice("bookings/".length) } as StoredBooking) : null
    }),
  )
  return all.filter((b): b is StoredBooking => !!b && !!b.apt && !!b.checkin && !!b.checkout)
}

export async function getBooking(id: string): Promise<StoredBooking | null> {
  if (!ID.test(id)) return null
  const data: any = await store().get(`bookings/${id}`, { type: "json" })
  return data ? { ...data, id } : null
}

export async function saveBooking(id: string, b: Booking): Promise<void> {
  await store().setJSON(`bookings/${id}`, b)
}

export async function deleteBooking(id: string): Promise<void> {
  await store().delete(`bookings/${id}`)
}

export async function getApartments(): Promise<string[] | null> {
  const cfg: any = await store().get("config/apartments", { type: "json" })
  return Array.isArray(cfg?.names) && cfg.names.length ? cfg.names : null
}

export async function setApartments(names: string[]): Promise<void> {
  await store().setJSON("config/apartments", { names })
}

export async function apartmentsOrDefault(): Promise<string[]> {
  return (await getApartments()) ?? DEFAULT_APTS.slice()
}

export function overlapping(all: StoredBooking[], b: { apt: string; checkin: string; checkout: string }, exceptId?: string) {
  return all.filter((x) => x.id !== exceptId && x.apt === b.apt && b.checkin < x.checkout && x.checkin < b.checkout)
}

// A short latin slug from the apartment and check-in date, e.g. "lumi-20261020", made unique.
export function newBookingId(all: StoredBooking[], apt: string, checkin: string): string {
  const base = (apt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "apt") +
    "-" + checkin.replace(/-/g, "")
  const taken = new Set(all.map((b) => b.id))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}
