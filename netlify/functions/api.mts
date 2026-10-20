import type { Config, Context } from "@netlify/functions"
import { timingSafeEqual } from "node:crypto"
import {
  ID, cleanBooking, deleteBooking, getApartments, listBookings, saveBooking, setApartments,
} from "../lib/calendar.mts"

function authorized(req: Request): boolean {
  const expected = (Netlify.env.get("CALENDAR_PIN") || "").trim()
  const given = (req.headers.get("x-pin") || "").replace(/\s+/g, "")
  if (!expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async (req: Request, context: Context) => {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "")
  const [kind, id] = path.split("/")

  if (req.method === "GET" && kind === "state") {
    return Response.json({ bookings: await listBookings(), apartments: await getApartments() })
  }

  if (kind === "bookings" && id && ID.test(id)) {
    if (req.method === "PUT") {
      const b = cleanBooking(await req.json().catch(() => null))
      if (!b) return Response.json({ error: "invalid booking" }, { status: 400 })
      await saveBooking(id, b)
      return Response.json({ ok: true, id })
    }
    if (req.method === "DELETE") {
      await deleteBooking(id)
      return new Response(null, { status: 204 })
    }
  }

  if (kind === "config" && id === "apartments" && req.method === "PUT") {
    const body: any = await req.json().catch(() => null)
    const names = Array.isArray(body?.names)
      ? body.names.map((n: unknown) => (typeof n === "string" ? n.slice(0, 200).trim() : "")).filter(Boolean)
      : []
    if (!names.length) return Response.json({ error: "invalid list" }, { status: 400 })
    await setApartments(names)
    return Response.json({ ok: true })
  }

  return Response.json({ error: "not found" }, { status: 404 })
}

export const config: Config = {
  path: "/api/*",
}
