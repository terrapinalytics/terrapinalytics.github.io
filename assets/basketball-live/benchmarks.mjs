import {gameElapsed} from './score-trend.mjs?v=6';
import {rate,fmt,line,unpack,clockLabel} from './metrics.mjs?v=5';

const percent = n => n == null ? '—' : fmt(n)+'%';
const type = e => e.competitions?.[0]?.status?.type;
const shot = (makes,attempts,separator='–') => ({
  text:line(makes,attempts).replace('–',separator),pair:[makes,attempts]
});
const countAndRate = pair => ({
  text:[fmt(pair[0],0),percent(rate(pair))],pair
});
export const descriptors = [
  ['eFG%', ['2P','3P','3P Rate'], ({stats:s}) =>
    [shot(s.twoM,s.twoA),shot(s.threeM,s.threeA),{
      text:percent(rate([s.threeA,s.fga])),pair:[s.threeA,s.fga]
    }]],
  ['Turnover %', ['Steal','Non-steal'], ({stats:s,opponent:o,pairs}) => {
    const steals = s.to != null && o.stl != null && o.stl <= s.to ? o.stl : null;
    const other = steals == null ? null : s.to-steals;
    return [steals,other].map(count=>countAndRate([count,pairs[1][1]]));
  }],
  ['OReb%', ['ORB','DRB'], ({stats:s,opponent:o,pairs}) => [
    countAndRate(pairs[2]),
    countAndRate([s.drb,s.drb == null || o.orb == null ? null : s.drb+o.orb])
  ]],
  ['Free throw rate', ['FTA/FGA','FT','FD/100'], ({stats:s,opponent:o,pairs}) => {
    const pair = [o.pf,pairs[1][1]];
    return [shot(s.fta,s.fga,'/'),shot(s.ftm,s.fta),{text:fmt(rate(pair)),pair}];
  }]
];

export const threePointRateColumn = 2;
export const shootingStats = s => {
  const pair = [s.threeA,s.fga];
  return [shot(s.twoM,s.twoA),shot(s.threeM,s.threeA),{text:percent(rate(pair)),pair},shot(s.ftm,s.fta)];
};
function pool(total,pairs) {
  pairs.forEach(([n,d],i) => {
    if (n == null || !(d > 0)) return;
    total[i] ??= [0,0];
    total[i][0] += n;
    total[i][1] += d;
  });
}

export const seasonCounts = ['min','pts','orb','drb','to','ast','stl','blk','pf'];
function collectSeason(sample, stats, pairs) {
  pool(sample.rates,pairs);
  const shots = shootingStats(stats).map(shot=>shot.pair);
  pool(sample.shooting,shots);
  pool(sample.shootingGames,shots.map(([made,attempted])=>
    made != null && attempted != null ? [1,1] : []));
  const counts = seasonCounts.map(key => {
    const value = stats[key];
    if (value == null || value === '' || value === '-') return [];
    const [first,seconds] = String(value).split(':').map(Number);
    const number = first + (seconds ?? 0)/60;
    return Number.isFinite(number) ? [number,1] : [];
  });
  pool(sample.counts,counts);
}

export async function seasonRates(teamId,event,calendar,finalGame) {
  const ids = [...new Set(calendar.events.filter(e => type(e)?.completed && e.id !== event.id &&
    Date.parse(e.date) < Date.parse(event.date)).map(e => e.id))];
  const factors = [], details = descriptors.map(()=>[]), players = new Map();
  const teamSeason = {rates:[],shooting:[],shootingGames:[],counts:[]};
  let count = 0;
  for (let i=0;i<ids.length;i+=5) {
    const results = await Promise.allSettled(ids.slice(i,i+5).map(id=>finalGame(id,teamId)));
    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const data = unpack(result.value,teamId);
      if (!data || !data.pairs.some(pair=>rate(pair)!=null)) {
        return;
      }
      count++;
      pool(factors,data.pairs);
      descriptors.forEach(([, ,rows],k)=>pool(details[k],rows(data).map(row=>row.pair)));
      const [efg,to,or,ftr] = data.pairs;
      const competition = result.value.header?.competitions?.[0];
      const min = competition ? clockLabel(gameElapsed(competition,result.value.plays)) : null;
      collectSeason(teamSeason,{...data.stats,min},[efg,to,or,descriptors[2][2](data)[1].pair,ftr,[],[data.stats.pts,to[1]]]);
      for (const player of data.players) {
        if (player.id == null) continue;
        if (!players.has(player.id)) players.set(player.id,{rates:[],shooting:[],shootingGames:[],counts:[]});
        collectSeason(players.get(player.id),player.stats,player.pairs);
      }
    });
  }
  return {count,total:ids.length,factors,details,players:Object.fromEntries(players),teamSeason};
}

