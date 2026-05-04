const config = require('./config');
const storage = require('./storage');
const { promoEmbed } = require('./embeds');

const WEEKDAY_TIMES = ['18:00', '21:00', '00:00'];
const WEEKEND_TIMES = ['12:00', '15:00', '18:00'];
const UK_TIME_ZONE = 'Europe/London';

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getUkParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const value = (type) => parts.find((part) => part.type === type)?.value;

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: weekdayMap[value('weekday')],
    hour: value('hour') === '24' ? 0 : Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function ukDateKey(date = new Date()) {
  const parts = getUkParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function ukTimeKey(date = new Date()) {
  const parts = getUkParts(date);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function ukDayOfWeek(date = new Date()) {
  return getUkParts(date).weekday;
}

function isWeekendUk(date = new Date()) {
  const day = ukDayOfWeek(date);
  return day === 0 || day === 6;
}

function getUkOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIME_ZONE,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);

  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  return hours * 60 + Math.sign(hours) * minutes;
}

function ukLocalToUtcDate(year, month, day, hour = 0, minute = 0) {
  const guessedUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMinutes = getUkOffsetMinutes(guessedUtc);
  return new Date(guessedUtc.getTime() - offsetMinutes * 60 * 1000);
}

function addDaysToUkDateParts(parts, daysToAdd) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() + daysToAdd);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function upcomingWeekendRange(now = new Date()) {
  const parts = getUkParts(now);
  let daysUntilSaturday;

  if (parts.weekday === 6) {
    daysUntilSaturday = 0;
  } else if (parts.weekday === 0) {
    daysUntilSaturday = -1;
  } else {
    daysUntilSaturday = 6 - parts.weekday;
  }

  const saturday = addDaysToUkDateParts(parts, daysUntilSaturday);
  const monday = addDaysToUkDateParts(saturday, 2);

  return {
    start: ukLocalToUtcDate(saturday.year, saturday.month, saturday.day, 0, 0),
    end: ukLocalToUtcDate(monday.year, monday.month, monday.day, 0, 0),
  };
}

function weekendEvents(db, now = new Date()) {
  const range = upcomingWeekendRange(now);

  return db.events
    .filter((event) => event.status === 'scheduled' && !event.promoPaused)
    .filter((event) => {
      const eventDate = new Date(event.eventDateTimeUtc);
      return eventDate >= now && eventDate >= range.start && eventDate < range.end;
    })
    .sort((a, b) => new Date(a.eventDateTimeUtc) - new Date(b.eventDateTimeUtc))
    .slice(0, 3);
}

function weekendEventsForEvent(db, event, now = new Date()) {
  const range = upcomingWeekendRange(new Date(event.eventDateTimeUtc));

  return db.events
    .filter((candidate) => candidate.status === 'scheduled' && !candidate.promoPaused)
    .filter((candidate) => candidate.id !== event.id)
    .filter((candidate) => {
      const candidateDate = new Date(candidate.eventDateTimeUtc);
      return candidateDate >= now && candidateDate >= range.start && candidateDate < range.end;
    })
    .sort((a, b) => new Date(a.eventDateTimeUtc) - new Date(b.eventDateTimeUtc));
}

function promoSlotsForDate(date = new Date()) {
  return isWeekendUk(date) ? WEEKEND_TIMES : WEEKDAY_TIMES;
}

function eventSignature(events, slots) {
  const eventIds = events.map((event) => event.id).join(',');
  return `${slots.join(',')}::${eventIds}`;
}

function getDailyPromoPlan(db, events, date = new Date()) {
  const dateKey = ukDateKey(date);
  const slots = promoSlotsForDate(date);
  const signature = eventSignature(events, slots);

  if (!db.promoPlans) db.promoPlans = {};

  const existingPlan = db.promoPlans[dateKey];

  if (
    existingPlan &&
    typeof existingPlan === 'object' &&
    existingPlan.signature === signature &&
    existingPlan.timeToEventId
  ) {
    return existingPlan;
  }

  const shuffledSlots = shuffle(slots);
  const shuffledEvents = shuffle(events);
  const timeToEventId = {};

  shuffledEvents.forEach((event, index) => {
    const slot = shuffledSlots[index];
    if (slot) timeToEventId[slot] = event.id;
  });

  const plan = {
    dateKey,
    signature,
    timeToEventId,
    createdAt: new Date().toISOString(),
  };

  db.promoPlans[dateKey] = plan;
  return plan;
}

function alreadyPromoted(db, eventId, dateKey, timeKey) {
  return db.promoLogs.some((log) => log.eventId === eventId && log.dateKey === dateKey && log.timeKey === timeKey);
}

async function promoteEvent(client, event, reason = 'scheduled', otherEvents = null) {
  const db = storage.read();
  const eventsToMention = Array.isArray(otherEvents)
    ? otherEvents
    : weekendEventsForEvent(db, event);

  const channel = await client.channels.fetch(config.promoChannelId);
  const message = await channel.send({ embeds: [promoEmbed(event, eventsToMention)] });

  storage.update((state) => {
    state.promoLogs.push({
      eventId: event.id,
      reason,
      messageId: message.id,
      channelId: config.promoChannelId,
      dateKey: ukDateKey(),
      timeKey: ukTimeKey(),
      postedAt: new Date().toISOString(),
    });
  });

  return message;
}

function createNextWeeklyInstanceIfNeeded(db, event, now = new Date()) {
  if (!event.repeatWeekly || event.status !== 'scheduled') return;

  const eventDate = new Date(event.eventDateTimeUtc);
  if (eventDate > now) return;

  event.status = 'completed';
  event.updatedAt = new Date().toISOString();

  const next = { ...event };
  next.id = storage.makeId('evt');
  next.status = 'scheduled';
  next.createdAt = new Date().toISOString();
  next.updatedAt = new Date().toISOString();

  const nextDate = new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  while (nextDate <= now) nextDate.setUTCDate(nextDate.getUTCDate() + 7);

  next.eventDateTimeUtc = nextDate.toISOString();
  db.events.push(next);
}

async function tick(client) {
  const now = new Date();
  const db = storage.read();

  for (const event of db.events) {
    createNextWeeklyInstanceIfNeeded(db, event, now);
  }

  storage.write(db);

  const currentDb = storage.read();
  if (currentDb.settings.promoPaused) return;

  const dateKey = ukDateKey(now);
  const timeKey = ukTimeKey(now);

  const events = weekendEvents(currentDb, now);
  if (!events.length) return;

  const plan = getDailyPromoPlan(currentDb, events, now);
  storage.write(currentDb);

  const eventIdForThisSlot = plan.timeToEventId[timeKey];
  if (!eventIdForThisSlot) return;

  const event = events.find((candidate) => candidate.id === eventIdForThisSlot);
  if (!event) return;

  if (alreadyPromoted(currentDb, event.id, dateKey, timeKey)) return;

  const otherEvents = events.filter((candidate) => candidate.id !== event.id);
  await promoteEvent(client, event, 'scheduled', otherEvents);
}

function startScheduler(client) {
  setInterval(() => tick(client).catch(console.error), 60 * 1000);
  setTimeout(() => tick(client).catch(console.error), 5000);
}

module.exports = { startScheduler, promoteEvent, WEEKDAY_TIMES, WEEKEND_TIMES };