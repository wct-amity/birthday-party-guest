/* ====================================
   WCTKD — Cal.com Booking Endpoint
   POST /api/book
   API key stored in .env as: API=...
   ==================================== */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name, email, phone,
    childName, childAge,
    location, eventTypeId,
    date, time, cardType
  } = req.body;

  if (!name || !email || !eventTypeId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const startISO = toISO(date, time);
  if (!startISO) {
    return res.status(400).json({ error: 'Could not parse date/time' });
  }

  try {
    const calRes = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'cal-api-version': '2024-08-13',
        'Authorization':   `Bearer ${process.env.API}`
      },
      body: JSON.stringify({
        eventTypeId,
        start: startISO,
        attendee: {
          name,
          email,
          timeZone: 'America/New_York',
          language: 'en',
          ...(phone && { phoneNumber: phone })
        },
        bookingFieldsResponses: {
          childName: `${childName}, age ${childAge}`,
          cardType,
          notes: `Location: ${location} | ${date} at ${time}`
        }
      })
    });

    const data = await calRes.json();

    if (!calRes.ok) {
      console.error('Cal.com error:', data);
      return res.status(500).json({ error: 'Booking failed', detail: data });
    }

    return res.status(200).json({
      success:   true,
      bookingId: data.data?.uid,
      status:    data.data?.status
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// "Monday, April 14, 2026" + "3:00 PM" → "2026-04-14T15:00:00"
function toISO(dateStr, timeStr) {
  try {
    const dt = new Date(`${dateStr} ${timeStr}`);
    if (isNaN(dt)) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` +
           `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
  } catch {
    return null;
  }
}