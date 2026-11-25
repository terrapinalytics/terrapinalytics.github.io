import {assembleBox,clockLabel,playerLines} from './metrics.mjs?v=4';
import {clockSeconds} from './score-trend.mjs?v=3';

const halfSeconds = 20*60;
const blank = () => ({fgm:0,fga:0,twoM:0,twoA:0,threeM:0,threeA:0,ftm:0,fta:0,
  pts:0,orb:0,drb:0,to:0,ast:0,stl:0,blk:0,pf:0});

function halfTeam(game,id) {
  const roster = playerLines(game,id,true);
  return {
    stats:blank(),
    players:new Map(roster.map(player=>[player.id,{...player,stats:blank(),seconds:0,appeared:false}])),
    lineup:new Set(roster.filter(player=>player.starter).map(player=>player.id)),
    complete:true
  };
}

function add(team,player,key,value=1) {
  team.stats[key] += value;
  if (player) {
    player.stats[key] += value;
    player.appeared = true;
  }
}

function record(team,play) {
  const [actor,helper] = (play.participants ?? []).map(p=>team.players.get(String(p.athlete?.id)));
  const kind = (play.type?.text ?? '').toLowerCase().replace(/[^a-z]/g,'');
  const size = Number(play.pointsAttempted);
  if (play.shootingPlay && [1,2,3].includes(size)) {
    if (size===1) add(team,actor,'fta');
    else {
      add(team,actor,'fga');
      add(team,actor,size===2?'twoA':'threeA');
    }
    if (!play.scoringPlay) return;
    add(team,actor,'pts',size);
    if (size===1) add(team,actor,'ftm');
    else {
      add(team,actor,'fgm');
      add(team,actor,size===2?'twoM':'threeM');
      if (helper || /\bassists?\b/i.test(play.text ?? '')) add(team,helper,'ast');
    }
  } else if (kind==='offensiverebound') add(team,actor,'orb');
  else if (kind==='defensiverebound') add(team,actor,'drb');
  else if (kind.includes('turnover') || play.shortDescription==='Turnover') add(team,actor,'to');
  else if (kind==='steal') add(team,actor,'stl');
  else if (kind==='blockshot' || kind==='block') add(team,actor,'blk');
  else if (kind.includes('foul') && !kind.includes('drawn')) add(team,actor,'pf');
  else if (kind==='substitution' && actor) {
    const action = play.text?.match(/subbing (in|out)\b/i)?.[1]?.toLowerCase();
    if (action==='in') team.lineup.add(actor.id);
    else if (action==='out') team.lineup.delete(actor.id);
  }
}

function accrue(team,seconds) {
  if (seconds<=0) return;
  if (team.lineup.size!==5) team.complete = false;
  for (const id of team.lineup) team.players.get(id).seconds += seconds;
}

export function halfBoxes(game,competition) {
  const ids = competition.competitors.map(({team})=>String(team.id));
  const plays = game.plays ?? [];
  const status = competition.status ?? {};
  const latestPeriod = Math.max(Number(status.period)||0,...plays.map(play=>Number(play.period?.number)||0));
  const lineups = new Map();
  const halves = new Map();
  for (const period of [1,2]) {
    if (!plays.some(play=>Number(play.period?.number)===period)) break;
    const teams = new Map(ids.map(id=>[id,halfTeam(game,id)]));
    for (const [id,team] of teams) {
      if (lineups.has(id)) team.lineup = lineups.get(id);
    }
    let elapsed = 0;
    for (const play of plays) {
      if (Number(play.period?.number)!==period) continue;
      const time = clockSeconds(play.clock?.displayValue);
      if (time!=null && time<=halfSeconds && time>=0) {
        const next = Math.max(elapsed,halfSeconds-time);
        for (const team of teams.values()) accrue(team,next-elapsed);
        elapsed = next;
      }
      const team = teams.get(String(play.team?.id));
      if (team) record(team,play);
    }
    const reportedClock = clockSeconds(status.displayClock);
    const endpoint = status.type?.completed || latestPeriod>period || status.type?.name==='STATUS_HALFTIME' ? halfSeconds
      : reportedClock==null ? elapsed : Math.max(elapsed,Math.min(halfSeconds,halfSeconds-reportedClock));
    const players = new Map();
    for (const [id,team] of teams) {
      accrue(team,endpoint-elapsed);
      lineups.set(id,team.lineup);
      team.stats.min = clockLabel(endpoint*5);
      players.set(id,[...team.players.values()].filter(p=>p.appeared || p.seconds>0).map(p=>({
        ...p,stats:{...p.stats,min:team.complete ? clockLabel(p.seconds) : null}
      })));
    }
    halves.set(period,new Map(ids.map((id,i)=>{
      const other = ids[1-i];
      return [id,assembleBox(teams.get(id).stats,teams.get(other).stats,players.get(id),players.get(other))];
    })));
  }
  return halves;
}
