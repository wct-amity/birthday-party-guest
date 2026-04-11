/* ====================================
   WCTKD Birthday Landing Page — Script
   All settings live in config.json
   ==================================== */

// ============================================================
//  STATE
// ============================================================

let CONFIG          = null;
let currentLocation = null;
let weekOffset      = 0;
let selectedCard    = null;


// ============================================================
//  INIT — fetch config then boot the page
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/config.json');
    CONFIG = await res.json();
  } catch (err) {
    console.error('Failed to load config.json:', err);
    return;
  }
  applyStaticContent();
  renderCardGrid();
});

// Inject all text/image content from config into the DOM
function applyStaticContent() {
  const s = CONFIG.site;
  const i = CONFIG.images;

  document.title                                     = s.pageTitle;
  document.getElementById('tagline').textContent     = s.tagline;
  document.getElementById('mainHeading').textContent = s.heading;
  document.getElementById('introText').textContent   = s.intro;
  document.getElementById('formHeading').textContent = s.formHeading;
  document.getElementById('formNote').textContent    = s.formNote;

  const logo   = document.getElementById('logoImg');
  const banner = document.getElementById('bannerImg');
  logo.src     = i.logo;
  logo.alt     = 'World Champion Taekwondo';
  banner.src   = i.banner;

  // Location buttons — built from config
  const locGrid = document.getElementById('locGrid');
  locGrid.innerHTML = '';
  Object.entries(CONFIG.locations).forEach(([id, loc]) => {
    const div = document.createElement('div');
    div.className = 'loc-btn';
    div.onclick   = () => selectLoc(id, div);
    div.innerHTML = `<div class="loc-name">${loc.label}</div>
                     <div class="loc-addr">${loc.addr.replace(',', ',<br>')}</div>`;
    locGrid.appendChild(div);
  });
}


// ============================================================
//  NAME SLOT
// ============================================================

function updateName(value) {
  const slot = document.getElementById('nameSlot');
  slot.textContent = value.trim() !== '' ? value : '\u00a0'.repeat(8);
}


// ============================================================
//  LOCATION SELECTION
// ============================================================

function selectLoc(id, el) {
  currentLocation = id;
  document.querySelectorAll('.loc-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  weekOffset = 0;
  renderWeek();
  document.getElementById('timesWrap').classList.add('visible');
  clearTimeSelection();
}


// ============================================================
//  WEEK NAVIGATION
// ============================================================

function shiftWeek(delta) {
  const next = weekOffset + delta;
  if (next < 0) return;
  weekOffset = next;
  renderWeek();
  clearTimeSelection();
}

function getMonday(offset) {
  const today = new Date();
  const dow   = today.getDay();
  const diff  = dow === 0 ? -6 : 1 - dow;
  const mon   = new Date(today);
  mon.setDate(today.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function renderWeek() {
  const mon       = getMonday(weekOffset);
  const now       = new Date();
  const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const JS_DAYS   = [1, 2, 3, 4, 5, 6];
  const schedule  = CONFIG.schedules[currentLocation] || {};

  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  document.getElementById('weekRange').textContent = `${fmt(mon)} – ${fmt(sat)}`;
  document.getElementById('prevWeekBtn').disabled  = weekOffset === 0;

  const hdr = document.getElementById('daysHeader');
  hdr.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const col = document.createElement('div');
    col.className = 'day-col';
    col.innerHTML = `<div class="day-label">${DAY_NAMES[i]}</div>
                     <div class="day-date">${d.getMonth()+1}/${d.getDate()}</div>`;
    hdr.appendChild(col);
  }

  const grid = document.getElementById('timesGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d     = new Date(mon); d.setDate(mon.getDate() + i);
    const slots = schedule[String(JS_DAYS[i])] || [];
    const col   = document.createElement('div');
    col.className = 'time-col';

    slots.forEach(timeStr => {
      const isPast = d.toDateString() === now.toDateString() || slotDateTime(d, timeStr) <= now;
      const btn    = document.createElement('button');
      btn.className   = 'time-btn' + (isPast ? ' past' : '');
      btn.textContent = timeStr;
      btn.disabled    = isPast;
      if (!isPast) {
        const dayLabel = d.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        });
        btn.onclick = () => selectTime(btn, dayLabel, timeStr);
      }
      col.appendChild(btn);
    });

    grid.appendChild(col);
  }
}

function slotDateTime(date, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const dt = new Date(date);
  dt.setHours(h, m, 0, 0);
  return dt;
}


// ============================================================
//  TIME SELECTION
// ============================================================

function selectTime(el, day, startTime) {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');

  const loc = CONFIG.locations[currentLocation];
  const dur = CONFIG.site.lessonDurationMins;
  document.getElementById('fDay').textContent  = day;
  document.getElementById('fTime').textContent = `${startTime} – ${addMinutes(startTime, dur)}`;
  document.getElementById('fLoc').textContent  = loc.name;
  document.getElementById('fAddr').textContent = loc.addr;

  document.getElementById('footerBar').classList.add('visible');
  updateSubmitBtn();
}

function clearTimeSelection() {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('footerBar').classList.remove('visible');
}


// ============================================================
//  INVITATION CARD SELECTOR
// ============================================================

function renderCardGrid() {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';
  CONFIG.cards.forEach(card => {
    const btn = document.createElement('button');
    btn.className  = 'card-btn';
    btn.dataset.id = card.id;
    btn.title      = card.label;
    btn.innerHTML  = `<img src="${card.src}" alt="${card.label}">`;
    btn.onclick    = () => selectCard(card.id);
    grid.appendChild(btn);
  });
}

function selectCard(id) {
  selectedCard = id;
  document.querySelectorAll('.card-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.id === id);
  });
  updateSubmitBtn();
}

function updateSubmitBtn() {
  const hasTime = document.getElementById('footerBar').classList.contains('visible');
  document.getElementById('schedBtn').disabled = !(selectedCard && hasTime);
}


// ============================================================
//  CAL.COM — silent booking via backend
// ============================================================

async function scheduleLesson() {
  if (!selectedCard) return;

  const name        = document.getElementById('parentName').value.trim();
  const email       = document.getElementById('email').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const childName   = document.getElementById('childName').value.trim();
  const childAge    = document.getElementById('childAge').value.trim();
  const date        = document.getElementById('fDay').textContent;
  const time        = document.getElementById('fTime').textContent.split(' – ')[0];
  const cardType    = CONFIG.cards.find(c => c.id === selectedCard)?.label || selectedCard;
  const eventTypeId = CONFIG.locations[currentLocation]?.calEventTypeId;

  if (!name || !email) {
    alert('Please fill in your name and email before scheduling.');
    return;
  }

  const btn = document.getElementById('schedBtn');
  btn.disabled    = true;
  btn.textContent = 'Booking…';

  try {
    const res = await fetch('/api/book', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, phone, childName, childAge,
        location: currentLocation,
        eventTypeId,
        date, time, cardType
      })
    });

    const data = await res.json();

    if (data.success) {
      showConfirmation(childName || name, date, time);
    } else {
      alert('Something went wrong. Please call us to book directly.');
      btn.disabled    = false;
      btn.textContent = 'Schedule Lesson!';
    }
  } catch {
    alert('Connection error. Please try again.');
    btn.disabled    = false;
    btn.textContent = 'Schedule Lesson!';
  }
}


// ============================================================
//  SUCCESS SCREEN
// ============================================================

function showConfirmation(name, date, time) {
  const loc = CONFIG.locations[currentLocation];
  document.querySelector('.page').innerHTML = `
    <div class="confirm-wrap">
      <div class="confirm-icon">✓</div>
      <h2 class="confirm-heading">You're booked!</h2>
      <p class="confirm-sub">A confirmation email is on its way.</p>
      <div class="confirm-card">
        <div class="confirm-row"><span>Who</span><strong>${name}</strong></div>
        <div class="confirm-row"><span>When</span><strong>${date} at ${time}</strong></div>
        <div class="confirm-row"><span>Where</span><strong>${loc.name}</strong></div>
        <div class="confirm-row"><span>Address</span><strong>${loc.addr}</strong></div>
      </div>
      <p class="confirm-note">Remember to bring your invitation card and comfortable clothes. See you on the mat! 🥋</p>
    </div>
  `;
}


// ============================================================
//  UTILITY — add minutes to a 12-hr time string
// ============================================================

function addMinutes(timeStr, mins) {
  const [time, period] = timeStr.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  m += mins;
  h += Math.floor(m / 60);
  m  = m % 60;
  const newPeriod = h >= 12 ? 'PM' : 'AM';
  const displayH  = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  const displayM  = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${displayM} ${newPeriod}`;
}