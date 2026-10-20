import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"
import { timingSafeEqual } from "node:crypto"

// Bookings live under "bookings/<id>", the apartment list under "config/apartments".
const ID = /^[A-Za-z0-9_-]{1,80}$/
const PAY = ["unpaid", "prepaid", "paid"]

function store() {
  return getStore({ name: "komunal-calendar", consistency: "strong" })
}

function authorized(req: Request): boolean {
  const expected = (Netlify.env.get("CALENDAR_PIN") || "").trim()
  const given = (req.headers.get("x-pin") || "").replace(/\s+/g, "")
  if (!expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : ""
}
function numOrEmpty(v: unknown): number | "" {
  return typeof v === "number" && Number.isFinite(v) ? v : ""
}
const DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanBooking(d: any) {
  const b = {
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
  if (!b.apt || !DATE.test(b.checkin) || !DATE.test(b.checkout) || b.checkout <= b.checkin) return null
  return b
}

export default async (req: Request, context: Context) => {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
  const s = store()
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "")
  const [kind, id] = path.split("/")

  if (req.method === "GET" && kind === "state") {
    const { blobs } = await s.list({ prefix: "bookings/" })
    const bookings = (
      await Promise.all(
        blobs.map(async ({ key }) => {
          const data = await s.get(key, { type: "json" })
          return data ? { ...data, id: key.slice("bookings/".length) } : null
        }),
      )
    ).filter(Boolean)
    const cfg: any = await s.get("config/apartments", { type: "json" })
    return Response.json({ bookings, apartments: cfg?.names ?? null })
  }

  if (kind === "bookings" && id && ID.test(id)) {
    if (req.method === "PUT") {
      const b = cleanBooking(await req.json().catch(() => null))
      if (!b) return Response.json({ error: "invalid booking" }, { status: 400 })
      await s.setJSON(`bookings/${id}`, b)
      return Response.json({ ok: true, id })
    }
    if (req.method === "DELETE") {
      await s.delete(`bookings/${id}`)
      return new Response(null, { status: 204 })
    }
  }

  if (kind === "config" && id === "apartments" && req.method === "PUT") {
    const body: any = await req.json().catch(() => null)
    const names = Array.isArray(body?.names)
      ? body.names.map((n: unknown) => str(n, 200).trim()).filter(Boolean)
      : []
    if (!names.length) return Response.json({ error: "invalid list" }, { status: 400 })
    await s.setJSON("config/apartments", { names })
    return Response.json({ ok: true })
  }

  return Response.json({ error: "not found" }, { status: 404 })
}

export const config: Config = {
  path: "/api/*",
}
