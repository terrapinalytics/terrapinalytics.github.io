const number = v => v == null || !/^\d+$/.test(String(v)) ? null : Number(v);
const pair = v => /^\d+-\d+$/.test(v ?? '') ? v.split('-').map(Number) : [null, null];
const sum = (...values) => values.includes(null) ? null : values.reduce((a,b) => a+b,0);
const scale = (value, weight) => value === null || weight === null ? null : value * weight;
const minus = (a,b) => sum(a,scale(b,-1));
export const rate = ([n,d]) => n != null && d > 0 ? 100*n/d : null;
export const fmt = (n, digits=1) => n == null ? '—' : n.toFixed(digits);
export const line = (m,a) => m == null || a == null ? '—' : m+'–'+a;
export function parse(get) {
  const [fgm,fga] = pair(get('fieldGoalsMade-fieldGoalsAttempted'));
  const [threeM,threeA] = pair(get('threePointFieldGoalsMade-threePointFieldGoalsAttempted'));
  const [ftm,fta] = pair(get('freeThrowsMade-freeThrowsAttempted'));
  return {fgm,fga,threeM,threeA,ftm,fta,twoM:minus(fgm,threeM),twoA:minus(fga,threeA),
    orb:number(get('offensiveRebounds')),drb:number(get('defensiveRebounds')),
    to:number(get('totalTurnovers') ?? get('turnovers')),pts:number(get('points')),
    min:get('minutes'),ast:number(get('assists')),stl:number(get('steals')),
    blk:number(get('blocks')),pf:number(get('fouls'))};
}

const effectiveMakes = s => sum(s.fgm,scale(s.threeM,.5));
const used = s => sum(s.fga,s.to,scale(s.fta,.475));
export function teamPairs(s, opponent) {
  return [[effectiveMakes(s),s.fga],[s.to,minus(used(s),s.orb)],
    [s.orb,sum(s.orb,opponent.drb)],[s.fta,s.fga]];
}
function minutes(value) {
  if (/^\d+:\d{2}$/.test(value ?? '')) {
    const [m, seconds] = value.split(':').map(Number);
    return m + seconds / 60;
  }
  return /^\d+(\.\d+)?$/.test(value ?? '') ? Number(value) : null;
}

function playerLines(game, teamId) {
  const groups = game.boxscore?.players?.find(t => String(t.team.id) === teamId)?.statistics ?? [];
  return groups.flatMap(g => g.athletes.filter(p => !p.didNotPlay && p.stats?.length).map(p => ({
    id:p.athlete.id,name:p.athlete.displayName,shortName:p.athlete.shortName,
    position:p.athlete.position?.abbreviation,
    stats:parse(key => p.stats[g.keys.indexOf(key)])
  })));
}

function reboundTotals(players) {
  if (!players.length) return {minutes:null,orb:null,drb:null};
  return {
    // Live box scores can contain a dash for a player who just entered.
    minutes:players.reduce((total,p) => total+(minutes(p.stats.min) ?? 0),0),
    orb:sum(...players.map(p => p.stats.orb)),
    drb:sum(...players.map(p => p.stats.drb))
  };
}

function playerPairs(s, own, other) {
  const played = minutes(s.min);
  const share = own.minutes > 0 && played != null ? played * 5 / own.minutes : null;
  return [[effectiveMakes(s),s.fga],[s.to,used(s)],
    [s.orb,scale(sum(own.orb,other.drb),share)],
    [s.drb,scale(sum(own.drb,other.orb),share)],
    [s.fta,s.fga]];
}
export function unpack(game, teamId) {
  const sides = game.boxscore?.teams ?? [];
  const own = sides.find(t => String(t.team.id) === teamId);
  const other = sides.find(t => String(t.team.id) !== teamId);
  if (!own || !other) return null;
  const totals = t => {
    const stats = new Map(t.statistics.map(s => [s.name,s.displayValue]));
    return parse(key => stats.get(key));
  };
  const s = totals(own), opponent = totals(other);
  const pairs = teamPairs(s,opponent);
  const players = playerLines(game,teamId);
  const ownRebounds = reboundTotals(players);
  const otherRebounds = reboundTotals(playerLines(game,String(other.team.id)));
  for (const player of players) player.pairs = playerPairs(player.stats,ownRebounds,otherRebounds);
  players.sort((a,b) => (minutes(b.stats.min) ?? -1) - (minutes(a.stats.min) ?? -1));
  return {stats:s,opponent,pairs,players};
}
