/* ============================================================
   # SERVERLESS FUNCTION — GET /api/slots
   Route:   /api/slots
   Purpose: Proxies Cal.com GET /v2/slots/available so the
            API key never touches the client.
   Params:  ?eventTypeId=NUMBER&startTime=ISO&endTime=ISO
   Returns: { slots: { "YYYY-MM-DD": ["ISO", "ISO", ...] } }
   ============================================================ */

const CAL_BASE    = "https://api.cal.com/v2";
const CAL_VERSION = "2024-08-13";
const TIMEZONE    = "America/New_York";

module.exports = async function handler(req, res) {

  // # CORS ─────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // # METHOD GUARD ──────────────────────────────────────────────────────────
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // # INPUT VALIDATION ──────────────────────────────────────────────────────
  const { eventTypeId, startTime, endTime } = req.query;

  if (!eventTypeId || !startTime || !endTime) {
    return res.status(400).json({
      error:    "Missing required query params",
      required: ["eventTypeId", "startTime", "endTime"],
    });
  }

  if (isNaN(Number(eventTypeId))) {
    return res.status(400).json({ error: "eventTypeId must be a number" });
  }

  // # CALL CAL.COM ──────────────────────────────────────────────────────────
  // We forward timeZone so Cal.com returns date keys in ET (America/New_York),
  // matching what the frontend uses to build the week grid.
  const params = new URLSearchParams({ startTime, endTime, eventTypeId, timeZone: TIMEZONE });
  const calURL = `${CAL_BASE}/slots/available?${params}`;

  let calRes;
  try {
    calRes = await fetch(calURL, {
      headers: {
        "Authorization":   `Bearer ${process.env.CAL_API_KEY}`,
        "cal-api-version": CAL_VERSION,
      },
    });
  } catch (networkErr) {
    console.error("[slots] Network error reaching Cal.com:", networkErr.message);
    return res.status(502).json({ error: "Could not reach Cal.com" });
  }

  // # HANDLE CAL.COM ERRORS ─────────────────────────────────────────────────
  if (!calRes.ok) {
    const body = await calRes.text();
    console.error(`[slots] Cal.com returned ${calRes.status}:`, body);
    return res.status(calRes.status).json({ error: "Cal.com error", detail: body });
  }

  // # PARSE & NORMALIZE ─────────────────────────────────────────────────────
  // Cal.com returns:  { status, data: { slots: { "YYYY-MM-DD": [{ time: "ISO" }] } } }
  // We normalize to:                  { slots: { "YYYY-MM-DD": ["ISO", "ISO", ...] } }
  const json      = await calRes.json();
  const rawSlots  = json?.data?.slots ?? {};
  const normalized = {};

  for (const [dateKey, entries] of Object.entries(rawSlots)) {
    normalized[dateKey] = entries.map(e => (typeof e === "string" ? e : e.time));
  }

  return res.status(200).json({ slots: normalized });
};