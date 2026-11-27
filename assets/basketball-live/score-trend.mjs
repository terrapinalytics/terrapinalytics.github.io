const HALF = 20 * 60;
const OVERTIME = 5 * 60;
const KILLSHOT_POINTS = 10;
const periodLength = period => period <= 2 ? HALF : OVERTIME;
const periodStart = period => period <= 2 ? (period-1)*HALF : 2*HALF+(period-3)*OVERTIME;
export const periodLabel = period => period <= 2 ? period+'H' : period === 3 ? 'OT' : (period-2)+'OT';

export function clockSeconds(clock) {
  const [minute,second] = String(clock ?? '').split(':');
  if (second !== undefined && /^\d+$/.test(minute) && /^\d+(\.\d+)?$/.test(second)) {
    return Number(minute)*60+Number(second);
  }
  return /^\d+(\.\d+)?$/.test(minute) ? Number(minute) : null;
}

function gameTime(period,remaining) {
  return periodStart(period)+Math.max(0,periodLength(period)-remaining);
}

export function gameElapsed(competition, plays=[]) {
  const {status = {}, competitors = []} = competition;
  const last = plays.at(-1);
  const period = Number(status.period) || Number(last?.period?.number) || 1;
  if (status.type?.completed) {
    const finalPeriod = Math.max(2,period,...competitors.map(side=>side.linescores?.length ?? 0));
    return periodStart(finalPeriod)+periodLength(finalPeriod);
  }
  if (status.type?.name === 'STATUS_HALFTIME') return HALF;
  const remaining = clockSeconds(status.displayClock);
  const recorded = clockSeconds(last?.clock?.displayValue);
  return Math.max(
    remaining == null ? 0 : gameTime(period,remaining),
    recorded == null ? 0 : gameTime(Number(last.period?.number) || period,recorded)
  );
}

const playScore = (play,side) => {
  const score = play[side.homeAway+'Score'];
  return score != null && /^\d+$/.test(String(score)) ? Number(score) : null;
};

function scoringRuns(points) {
  const runs = [];
  let team = -1;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [a,b] = points[i].scores.map((score,k)=>score-points[i-1].scores[k]);
    const scoringTeam = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : -1;
    if (scoringTeam !== team) {
      team = scoringTeam;
      total = 0;
    }
    if (team === -1) continue;

    const qualified = total >= KILLSHOT_POINTS;
    total += a+b;
    if (total < KILLSHOT_POINTS) continue;

    const {time,scores,period,clock} = points[i];
    const run = {team,points:total,end:time,scores,period,clock};
    if (qualified) runs[runs.length-1] = run;
    else runs.push(run);
  }
  return runs;
}

export function scoreTrend(plays,sides,status) {
  const recent = plays.at(-1);
  const period = Number(status.period) || Number(recent?.period?.number) || 1;
  const timeLeft = clockSeconds(status.displayClock);
  const counters = sides.map(()=>({fouls:0,timeoutsRemaining:4}));
  const timeouts = sides.map(()=>[]);
  const byTeam = new Map(sides.map(({team},i)=>[String(team.id),i]));
  const points = [{time:0,scores:[0,0]}];
  let latest = 0;

  for (const play of plays) {
    const playPeriod = Number(play.period?.number);
    const team = byTeam.get(String(play.team?.id));
    const type = String(play.type?.text ?? '').toLowerCase().replace(/[^a-z]/g,'');
    if (team !== undefined) {
      if (playPeriod === period && type.includes('foul') && !type.includes('drawn')) counters[team].fouls++;
      if (playPeriod > 0 && playPeriod <= period && type.includes('timeout') && !/official|media|tv/.test(type)) {
        const full = type === 'regulartimeout' || type === 'fulltimeout' || /60.second|full timeout/i.test(play.text ?? '');
        timeouts[team].push({period:playPeriod,full});
      }
    }

    const remaining = clockSeconds(play.clock?.displayValue);
    if (!playPeriod || remaining == null) continue;
    latest = Math.max(latest,gameTime(playPeriod,remaining));
    const scores = sides.map(side=>playScore(play,side));
    if (scores.some(score=>score===null)) continue;
    const previous = points.at(-1).scores;
    if (scores.every((score,i)=>score===previous[i])) continue;
    points.push({time:latest,scores,period:playPeriod,clock:play.clock.displayValue});
  }
  const runs = scoringRuns(points);

  // Three 30s and one 60s. At most two 30s survive halftime; each OT adds one timeout.
  timeouts.forEach((used,i) => {
    const firstHalfShort = used.filter(t=>t.period===1 && !t.full).length;
    const expired = Number(period>1 && firstHalfShort===0);
    const extra = Math.max(0,period-2-Number(period>2 && (timeLeft===OVERTIME ||
      (timeLeft==null && Number(recent?.period?.number)<period))));
    counters[i].timeoutsRemaining = Math.max(0,4-expired+extra-used.length);
  });

  const end = periodStart(Math.max(2,period))+periodLength(Math.max(2,period));
  const elapsed = Math.min(end,Math.max(latest,timeLeft == null ? 0 : gameTime(period,timeLeft),
    status.type?.completed ? end : 0));
  if (elapsed > points.at(-1).time) points.push({time:elapsed,scores:points.at(-1).scores});
  return {points,runs,end,period,counters};
}

export function trendSnapshot(points,time) {
  const latest = points.at(-1).time;
  const elapsed = Math.max(0,Math.min(latest,time));
  const period = elapsed <= 2*HALF ? Math.max(1,Math.ceil(elapsed/HALF))
    : 2+Math.ceil((elapsed-2*HALF)/OVERTIME);
  const remaining = Math.max(0,Math.ceil(periodLength(period)-(elapsed-periodStart(period))));
  const clock = Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
  const scores = points.findLast(point=>point.time<=elapsed).scores;
  return {elapsed,remaining,clock,period,scores};
}
