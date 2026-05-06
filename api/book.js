/* ============================================================
   # SERVERLESS FUNCTION — POST /api/book
   Route:   /api/book
   Purpose: Proxies Cal.com POST /v2/bookings so the
            API key never touches the client.
   Body:    { eventTypeId, start, attendee, metadata }
   Returns: Cal.com booking confirmation object
   ============================================================ */

const CAL_BASE    = "https://api.cal.com/v2";
const CAL_VERSION = "2024-08-13";

module.exports = async function handler(req, res) {

  // # CORS ─────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // # METHOD GUARD ──────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // # INPUT VALIDATION ──────────────────────────────────────────────────────
  const { eventTypeId, start, attendee, metadata } = req.body ?? {};

  if (!eventTypeId || !start || !attendee?.name || !attendee?.email) {
    return res.status(400).json({
      error:    "Missing required booking fields",
      required: ["eventTypeId", "start", "attendee.name", "attendee.email"],
    });
  }

  // # BUILD CAL.COM PAYLOAD ─────────────────────────────────────────────────
  // Cal.com v2 booking schema.
  // metadata is a free-form object — Cal.com stores it on the booking
  // and it appears in the dashboard notes/detail view.
  const payload = {
    eventTypeId: Number(eventTypeId),
    start,                                     // UTC ISO string from /slots response
    attendee: {
      name:     attendee.name,
      email:    attendee.email,
      timeZone: attendee.timeZone ?? "America/New_York",
    },
    metadata: metadata ?? {},
  };

  // # CALL CAL.COM ──────────────────────────────────────────────────────────
  let calRes;
  try {
    calRes = await fetch(`${CAL_BASE}/bookings`, {
      method:  "POST",
      headers: {
        "Authorization":   `Bearer ${process.env.CAL_API_KEY}`,
        "cal-api-version": CAL_VERSION,
        "Content-Type":    "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    console.error("[book] Network error reaching Cal.com:", networkErr.message);
    return res.status(502).json({ error: "Could not reach Cal.com" });
  }

  // # HANDLE CAL.COM ERRORS ─────────────────────────────────────────────────
  const data = await calRes.json().catch(() => ({}));

  if (!calRes.ok) {
    console.error(`[book] Cal.com returned ${calRes.status}:`, data);
    return res.status(calRes.status).json({
      error:  data?.message ?? "Booking failed",
      detail: data,
    });
  }

  // # RETURN BOOKING CONFIRMATION ───────────────────────────────────────────
  // Pass the full Cal.com response through — includes uid, status, etc.
  return res.status(200).json(data);
};