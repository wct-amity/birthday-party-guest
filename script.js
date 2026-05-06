/* ============================================================
   WCTKD Birthday Landing Page — script.js

   Flow:
     1. Load config.json → populate page, build location + card grids
     2. Guest clicks location → fetch slots from /api/slots → render week
     3. Guest clicks time slot → show footer confirmation bar
     4. Guest selects invitation card → enable submit button
     5. Guest submits form → POST to /api/book → show confirmation screen
   ============================================================ */

"use strict";


// ─── # CONFIGURATION & CONSTANTS ─────────────────────────────────────────────

const TIMEZONE = "America/New_York";
const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];   // Mon–Sat grid
const REQUIRED = ["childName", "childAge", "parentName", "phone", "email"];


// ─── # STATE ─────────────────────────────────────────────────────────────────

let CONFIG      = null;   // parsed config.json
let activeLoc   = null;   // selected location key, e.g. "amity"
let activeSlot  = null;   // { iso, dayKey, timeLabel, dateLabel }
let activeCard  = null;   // card id string, e.g. "nunchaku"
let weekOffset  = 0;      // 0 = current week, 1 = next week, …
let weekSlots   = {};     // { "YYYY-MM-DD": ["ISO", "ISO", …] }


// ─── # INITIALISATION ────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  CONFIG = await loadConfig();
  populatePage(CONFIG);
  buildLocGrid(CONFIG.locations);
  buildCardGrid(CONFIG.cards);
  bindFormListeners();
});

async function loadConfig() {
  const res = await fetch("config.json");
  if (!res.ok) throw new Error("Could not load config.json");
  return res.json();
}


// ─── # PAGE POPULATION ───────────────────────────────────────────────────────

function populatePage(cfg) {
  document.title = cfg.site.pageTitle;

  setAttr("logoImg",   "src", cfg.images.logo);
  setAttr("bannerImg", "src", cfg.images.banner);

  setText("tagline",     cfg.site.tagline);
  setText("mainHeading", cfg.site.heading);
  setText("introText",   cfg.site.intro);
  setText("formHeading", cfg.site.formHeading);
  setText("formNote",    cfg.site.formNote);
}


// ─── # LOCATION GRID ─────────────────────────────────────────────────────────

function buildLocGrid(locations) {
  const grid = document.getElementById("locGrid");
  grid.innerHTML = "";

  Object.entries(locations).forEach(([key, loc]) => {
    const available = !!loc.calEventTypeId;
    const btn       = document.createElement("button");

    btn.className      = "loc-btn";
    btn.dataset.locKey = key;
    btn.disabled       = !available;
    btn.innerHTML = `
      <div class="loc-name">${loc.label}</div>
      <div class="loc-addr">${available ? loc.addr : "Coming soon"}</div>
    `;

    if (!available) {
      btn.style.opacity = "0.45";
      btn.style.cursor  = "default";
    }

    btn.addEventListener("click", () => { if (available) selectLocation(key); });
    grid.appendChild(btn);
  });
}


// ─── # LOCATION SELECTION ────────────────────────────────────────────────────

async function selectLocation(key) {
  if (activeLoc === key) return;   // already selected — do nothing

  activeLoc    = key;
  weekOffset   = 0;
  activeSlot   = null;
  weekSlots    = {};

  // Highlight active button
  document.querySelectorAll(".loc-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.locKey === key)
  );

  // Show times panel in loading state while we fetch
  document.getElementById("timesWrap").classList.add("visible");
  document.getElementById("daysHeader").innerHTML = "";
  document.getElementById("timesGrid").innerHTML  =
    '<div style="padding:20px 0;font-size:12px;color:#aaa;text-align:center;">Loading available times…</div>';

  hideFooter();
  await loadAndRenderWeek();
}


// ─── # WEEK NAVIGATION — called from HTML onclick ────────────────────────────

async function shiftWeek(delta) {
  weekOffset += delta;
  activeSlot  = null;
  hideFooter();
  await loadAndRenderWeek();
}


// ─── # SLOT FETCHING ─────────────────────────────────────────────────────────

async function loadAndRenderWeek() {
  const monday  = getMondayOfWeek(weekOffset);
  const saturday = addDays(monday, 5);

  // Disable Prev when already at the earliest bookable week
  document.getElementById("prevWeekBtn").disabled = (weekOffset <= 0);

  // Update the week range label, e.g. "Jun 16 – Jun 21"
  document.getElementById("weekRange").textContent =
    `${fmtShort(monday)} – ${fmtShort(saturday)}`;

  // Guard: if this location has no Cal.com event type yet, bail gracefully
  const calEventTypeId = CONFIG.locations[activeLoc]?.calEventTypeId;
  if (!calEventTypeId) {
    document.getElementById("timesGrid").innerHTML =
      '<div style="padding:20px 0;font-size:12px;color:#aaa;text-align:center;">Online booking coming soon for this location.</div>';
    return;
  }

  try {
    weekSlots = await fetchSlots(
      calEventTypeId,
      monday.toISOString(),
      endOfDay(saturday).toISOString()
    );
    renderWeek(monday);
  } catch (err) {
    console.error("[loadAndRenderWeek]", err);
    document.getElementById("timesGrid").innerHTML =
      '<div style="padding:20px 0;font-size:12px;color:#c00;text-align:center;">Could not load times — please try again.</div>';
  }
}

async function fetchSlots(eventTypeId, startTime, endTime) {

  // # REQUEST ─────────────────────────────────────────────────────────────
  // Our serverless proxy adds the API key and the timeZone param before
  // forwarding to Cal.com, so date keys in the response will be in ET.
  const params = new URLSearchParams({ eventTypeId, startTime, endTime });
  const res    = await fetch(`/api/slots?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Slots API returned HTTP ${res.status}`);
  }

  // # RETURN ───────────────────────────────────────────────────────────────
  // Shape: { slots: { "YYYY-MM-DD": ["ISO", "ISO", …] } }
  const json = await res.json();
  return json.slots ?? {};
}


// ─── # WEEK RENDERING ────────────────────────────────────────────────────────

function renderWeek(monday) {
  const daysHeader = document.getElementById("daysHeader");
  const timesGrid  = document.getElementById("timesGrid");
  const todayKey   = toDateKey(new Date());   // "YYYY-MM-DD" in ET, for past-day check

  daysHeader.innerHTML = "";
  timesGrid.innerHTML  = "";

  for (let i = 0; i < 6; i++) {              // Mon (i=0) → Sat (i=5)
    const day    = addDays(monday, i);
    const dayKey = toDateKey(day);
    const slots  = weekSlots[dayKey] ?? [];
    const isPast = dayKey < todayKey;

    // ── Day header ───────────────────────────────────────────────────────
    const colHead = document.createElement("div");
    colHead.className = "day-col";
    colHead.innerHTML = `
      <div class="day-label">${DAY_ABBR[i]}</div>
      <div class="day-date">${day.getMonth() + 1}/${day.getDate()}</div>
    `;
    daysHeader.appendChild(colHead);

    // ── Time slot column ─────────────────────────────────────────────────
    const colTime = document.createElement("div");
    colTime.className = "time-col";

    if (isPast || slots.length === 0) {
      // No slots for this day — show a quiet dash
      const dash = document.createElement("span");
      dash.style.cssText = "font-size:9px;color:#ccc;text-align:center;display:block;padding-top:6px;";
      dash.textContent   = "—";
      colTime.appendChild(dash);
    } else {
      slots.forEach(iso => {
        const label = fmtTime(iso);
        const btn   = document.createElement("button");
        btn.className   = "time-btn";
        btn.textContent = label;

        // Restore selected state when re-rendering after week nav
        if (activeSlot?.iso === iso) btn.classList.add("selected");

        btn.addEventListener("click", () => {
          document.querySelectorAll(".time-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          handleSlotClick(iso, dayKey, label, day);
        });

        colTime.appendChild(btn);
      });
    }

    timesGrid.appendChild(colTime);
  }
}


// ─── # SLOT SELECTION ────────────────────────────────────────────────────────

function handleSlotClick(iso, dayKey, timeLabel, dayDate) {
  activeSlot = {
    iso,
    dayKey,
    timeLabel,
    dateLabel: fmtFullDate(dayDate),
  };
  showFooter();
  updateSubmitState();
}


// ─── # FOOTER CONFIRMATION BAR ───────────────────────────────────────────────

function showFooter() {
  if (!activeSlot || !activeLoc) return;

  const loc = CONFIG.locations[activeLoc];
  setText("fDay",  activeSlot.dateLabel);
  setText("fTime", activeSlot.timeLabel);
  setText("fLoc",  loc.name);
  setText("fAddr", loc.addr);

  document.getElementById("footerBar").classList.add("visible");
}

function hideFooter() {
  document.getElementById("footerBar").classList.remove("visible");
  updateSubmitState();
}


// ─── # INVITATION CARD GRID ──────────────────────────────────────────────────

function buildCardGrid(cards) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";

  cards.forEach(card => {
    const btn = document.createElement("button");
    btn.className      = "card-btn";
    btn.dataset.cardId = card.id;
    btn.title          = card.label;
    btn.innerHTML      = `<img src="${card.src}" alt="${card.label}">`;

    btn.addEventListener("click", () => {
      activeCard = card.id;
      document.querySelectorAll(".card-btn").forEach(b =>
        b.classList.toggle("selected", b.dataset.cardId === card.id)
      );
      updateSubmitState();
    });

    grid.appendChild(btn);
  });
}


// ─── # FORM — VALIDATION & NAME HEADING ──────────────────────────────────────

// Attach input listeners so the submit button state updates as the user types
function bindFormListeners() {
  REQUIRED.forEach(id =>
    document.getElementById(id)?.addEventListener("input", updateSubmitState)
  );
}

// Called from <input oninput="updateName(this.value)"> in index.html
function updateName(value) {
  const name = value.trim() || "_____";
  document.getElementById("formHeading").innerHTML =
    `Schedule a lesson for <span class="name-slot">${name}</span>!`;
}

function validateForm() {
  for (const id of REQUIRED) {
    const el = document.getElementById(id);
    if (!el?.value.trim()) {
      el.style.borderColor = "#c00";
      el.focus();
      setTimeout(() => { el.style.borderColor = ""; }, 1800);
      return false;
    }
  }
  return true;
}


// ─── # SUBMIT BUTTON STATE ───────────────────────────────────────────────────

function updateSubmitState() {
  const formFilled = REQUIRED.every(id =>
    document.getElementById(id)?.value.trim() !== ""
  );
  const btn = document.getElementById("schedBtn");
  if (btn) btn.disabled = !(activeSlot && activeCard && formFilled);
}


// ─── # BOOKING SUBMISSION — called from HTML onclick ─────────────────────────

async function scheduleLesson() {
  if (!validateForm()) return;
  if (!activeSlot)     return;
  if (!activeCard)     return;

  const btn = document.getElementById("schedBtn");
  btn.disabled = true;
  btn.innerHTML = 'Booking… <span class="sched-btn-sub">Please wait…</span>';

  // # BUILD PAYLOAD ─────────────────────────────────────────────────────────
  // metadata fields appear in the booking detail view inside Cal.com,
  // giving your masters visibility into each guest's info at a glance.
  const loc     = CONFIG.locations[activeLoc];
  const cardObj = CONFIG.cards.find(c => c.id === activeCard);

  const payload = {
    eventTypeId: loc.calEventTypeId,
    start:       activeSlot.iso,               // UTC ISO — what Cal.com expects

    attendee: {
      name:     document.getElementById("parentName").value.trim(),
      email:    document.getElementById("email").value.trim(),
      timeZone: TIMEZONE,
    },

    metadata: {
      childName:      document.getElementById("childName").value.trim(),
      childAge:       document.getElementById("childAge").value.trim(),
      phone:          document.getElementById("phone").value.trim(),
      invitationCard: cardObj?.label ?? activeCard,
      location:       loc.name,
    },
  };

  // # SUBMIT ────────────────────────────────────────────────────────────────
  try {
    const res = await fetch("/api/book", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }

    showConfirmation();

  } catch (err) {
    console.error("[scheduleLesson]", err);
    alert(`Something went wrong: ${err.message}\n\nPlease try again or call us directly.`);
    btn.disabled = false;
    btn.innerHTML = 'Schedule Lesson! <span class="sched-btn-sub">A confirmation email will be sent.</span>';
  }
}


// ─── # CONFIRMATION SCREEN ───────────────────────────────────────────────────

function showConfirmation() {

  // Capture form values before we replace the DOM
  const childName  = document.getElementById("childName").value.trim();
  const childAge   = document.getElementById("childAge").value.trim();
  const parentName = document.getElementById("parentName").value.trim();
  const email      = document.getElementById("email").value.trim();
  const phone      = document.getElementById("phone").value.trim();
  const loc        = CONFIG.locations[activeLoc];
  const cardObj    = CONFIG.cards.find(c => c.id === activeCard);

  document.querySelector(".page").innerHTML = `
    <div class="confirm-wrap">
      <div class="confirm-icon">&#10003;</div>
      <div class="confirm-heading">You're booked!</div>
      <div class="confirm-sub">A confirmation has been sent to ${email}.</div>

      <div class="confirm-card">
        <div class="confirm-row">
          <span>Student</span>
          <strong>${childName}, age ${childAge}</strong>
        </div>
        <div class="confirm-row">
          <span>Parent / Guardian</span>
          <strong>${parentName}</strong>
        </div>
        <div class="confirm-row">
          <span>Phone</span>
          <strong>${phone}</strong>
        </div>
        <div class="confirm-row">
          <span>Date</span>
          <strong>${activeSlot.dateLabel}</strong>
        </div>
        <div class="confirm-row">
          <span>Time</span>
          <strong>${activeSlot.timeLabel}</strong>
        </div>
        <div class="confirm-row">
          <span>Location</span>
          <strong>${loc.name}</strong>
        </div>
        <div class="confirm-row">
          <span>Address</span>
          <strong>${loc.addr}</strong>
        </div>
        <div class="confirm-row">
          <span>Invitation Card</span>
          <strong>${cardObj?.label ?? activeCard}</strong>
        </div>
      </div>

      <p class="confirm-note">
        Don't forget to bring your invitation card and comfortable clothing.<br>
        We look forward to seeing you on the mat!
      </p>
    </div>
  `;
}


// ─── # DATE / TIME UTILITIES ─────────────────────────────────────────────────

// Returns the Monday of the week at weekOffset, as a local Date object
function getMondayOfWeek(offsetWeeks = 0) {
  const now       = new Date();
  const dow       = now.getDay();                    // 0 = Sun, 1 = Mon, …
  const daysToMon = dow === 0 ? 6 : dow - 1;        // steps back to reach Monday
  const monday    = new Date(now);
  monday.setDate(now.getDate() - daysToMon + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Returns a new Date with n days added
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Returns a new Date set to 23:59:59.999 on the same calendar day
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Returns "YYYY-MM-DD" for a Date, evaluated in ET
// Used to key into the slots object returned by Cal.com
function toDateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// "3:00 PM" — converts a UTC ISO string to a 12h ET time string
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour:     "numeric",
    minute:   "2-digit",
    hour12:   true,
    timeZone: TIMEZONE,
  });
}

// "Monday, June 16" — used in the footer and confirmation screen
function fmtFullDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });
}

// "Jun 16" — used in the week range label
function fmtShort(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


// ─── # DOM HELPERS ───────────────────────────────────────────────────────────

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}