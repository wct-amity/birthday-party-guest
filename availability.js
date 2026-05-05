// ============================================================
//  /api/availability.js
//  Fetches real available time slots from Cal.com for a given
//  eventTypeId and date range (Mon–Sat of a given week).
//  Called by the frontend renderWeek() — never exposes API key.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventTypeId, startTime, endTime } = req.query;

  if (!eventTypeId || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required params: eventTypeId, startTime, endTime' });
  }

  const API_KEY = process.env.API;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const calUrl = new URL('https://api.cal.com/v2/slots/available');
    calUrl.searchParams.set('eventTypeId', eventTypeId);
    calUrl.searchParams.set('startTime', startTime);
    calUrl.searchParams.set('endTime', endTime);

    const calRes = await fetch(calUrl.toString(), {
      headers: {
        'Authorization':    `Bearer ${API_KEY}`,
        'Content-Type':     'application/json',
      },
    });

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error('Cal.com API error:', calRes.status, errText);
      return res.status(502).json({ error: 'Cal.com API error', detail: errText });
    }

    const calData = await calRes.json();

    // calData.data.slots is an object keyed by "YYYY-MM-DD"
    // Each key holds an array of { time: ISO string, available: boolean }
    // We transform this into a clean structure for the frontend:
    // { "2025-05-05": ["3:00 PM", "3:30 PM"], ... }

    const rawSlots = calData?.data?.slots || {};
    const formatted = {};

    Object.entries(rawSlots).forEach(([dateKey, slotArr]) => {
      formatted[dateKey] = slotArr
        .filter(s => s.available !== false)
        .map(s => isoTo12Hr(s.time));
    });

    return res.status(200).json({ success: true, slots: formatted });

  } catch (err) {
    console.error('Availability handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


// ============================================================
//  UTILITY — convert ISO timestamp to 12-hr display string
//  "2025-05-05T15:00:00.000Z" → "3:00 PM"  (uses ET offset)
// ============================================================

function isoTo12Hr(isoString) {
  const date = new Date(isoString);

  // Cal.com returns times in UTC. Display in Eastern Time.
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
    timeZone: 'America/New_York',
  });

  return formatter.format(date); // e.g. "3:00 PM"
}