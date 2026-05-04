const config = require('./config');
const storage = require('./storage');
const { promoEmbed } = require('./embeds');

const WEEKDAY_TIMES = ['18:00', '21:00', '00:00'];
const WEEKEND_TIMES = ['12:00', '15:00', '18:00'];

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function utcTimeKey(date = new Date()) {
  return date.toISOString().slice(11, 16);
}

function dayOfWeek(date = new Date()) {
  return date.getUTCDay();
}

function isWeekend(date = new Date()) {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

function chooseDailyPromoTime(db, date = new Date()) {
  const dateKey = utcDateKey(date);
  if (!db.promoPlans[dateKey]) {
    const pick = WEEKDAY_TIMES[Math.floor(Math.random() * WEEKDAY_TIMES.length)];
    db.promoPlans[dateKey] = pick;
  }
  return db.promoPlans[dateKey];
}

function duePromoTimes(db, date = new Date()) {
  if (isWeekend(date)) return WEEKEND_TIMES;
  return [chooseDailyPromoTime(db, date)];
}

function alreadyPromoted(db, eventId, dateKey, timeKey) {
  return db.promoLogs.some((log) => log.eventId === eventId && log.dateKey === dateKey && log.timeKey === timeKey);
}

async function promoteEvent(client, event, reason = 'scheduled') {
  const channel = await client.channels.fetch(config.promoChannelId);
  const message = await channel.send({ embeds: [promoEmbed(event)] });
  storage.update((db) => {
    db.promoLogs.push({
      eventId: event.id,
      reason,
      messageId: message.id,
      channelId: config.promoChannelId,
      dateKey: utcDateKey(),
      timeKey: utcTimeKey(),
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

  for (const event of db.events) createNextWeeklyInstanceIfNeeded(db, event, now);
  storage.write(db);

  const currentDb = storage.read();
  if (currentDb.settings.promoPaused) return;

  const dateKey = utcDateKey(now);
  const timeKey = utcTimeKey(now);
  const dueTimes = duePromoTimes(currentDb, now);
  storage.write(currentDb);

  if (!dueTimes.includes(timeKey)) return;

  const activeEvents = currentDb.events
    .filter((e) => e.status === 'scheduled' && !e.promoPaused)
    .filter((e) => new Date(e.eventDateTimeUtc) >= now)
    .sort((a, b) => new Date(a.eventDateTimeUtc) - new Date(b.eventDateTimeUtc));

  const event = activeEvents[0];
  if (!event) return;
  if (alreadyPromoted(currentDb, event.id, dateKey, timeKey)) return;

  await promoteEvent(client, event, 'scheduled');
}

function startScheduler(client) {
  setInterval(() => tick(client).catch(console.error), 60 * 1000);
  setTimeout(() => tick(client).catch(console.error), 5000);
}

module.exports = { startScheduler, promoteEvent, WEEKDAY_TIMES, WEEKEND_TIMES };
