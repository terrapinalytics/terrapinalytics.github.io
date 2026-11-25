export const feedOrigin = 'https://terrapinalytics-basketball-feed.terrapinalytics.workers.dev';
const easternDate = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York'});
export const easternDay = date => easternDate.format(date);

export function gameOnDay(events, now) {
  const day = easternDay(now);
  return events.find(({date,competitions}) => {
    const tip = new Date(date);
    const status = competitions?.[0]?.status?.type;
    return Number.isFinite(tip.getTime()) && easternDay(tip) === day &&
      ['pre','in','post'].includes(status?.state) && !/postponed|cancel|suspend/i.test(status.name ?? '');
  });
}

export function nextEasternMidnight(now) {
  const day = easternDay(now);
  let low = now, high = now + 26 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (easternDay(middle) === day) low = middle;
    else high = middle;
  }
  return high;
}
