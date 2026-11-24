const HALF = 20 * 60;
const OVERTIME = 5 * 60;
const MIN_RUN = 8;
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

const playScore = (play,side) => {
  const score = play[side.homeAway+'Score'];
  return score != null && /^\d+$/.test(String(score)) ? Number(score) : null;
};

export function scoreTrend(plays,sides,status) {
  const recent = plays.at(-1);
  const period = Number(status.period) || Number(recent?.period?.number) || 1;
  const timeLeft = clockSeconds(status.displayClock);
  const counters = sides.map(()=>({fouls:0,timeoutsRemaining:4}));
  const timeouts = sides.map(()=>[]);
  const byTeam = new Map(sides.map(({team},i)=>[String(team.id),i]));
  const points = [{time:0,scores:[0,0]}], runs = [];
  let run, latest = 0;
  const finishRun = () => {
    if (run?.points >= MIN_RUN) runs.push(run);
    run = null;
  };

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
    const delta = scores.map((score,i)=>score-previous[i]);
    if (delta.every(change=>change===0)) continue;
    points.push({time:latest,scores});
    const scorer = delta.findIndex(change=>change>0);
    if (scorer < 0 || delta[1-scorer] !== 0) {
      finishRun();
      continue;
    }
    if (run?.team !== scorer) {
      finishRun();
      run = {team:scorer,points:0,start:latest};
    }
    run.points += delta[scorer];
    run.end = latest;
    run.score = scores[scorer];
    run.period = playPeriod;
    run.clock = play.clock.displayValue;
  }
  finishRun();

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
